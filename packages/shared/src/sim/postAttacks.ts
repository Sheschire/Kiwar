import { postHeld, postSetup, shareOf } from '../battle/fruit';
import { simulateBattle } from '../battle/simulate';
import { LANDING, type LandingOrders } from '../data/landing';
import { FRUIT_DEFS, POST_ATTACK, NECTAR_SCALE, type FruitId } from '../data/orchard';
import { createRng } from '../rng/rng';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import type { AlienUnit } from './civ';
import { removeVillagers, type Odds } from './expeditions';
import { recordBestiary } from './landing';
import {
  attitudeOf,
  fruitOfState,
  guessGarrison,
  parcelNow,
  standingOf,
  type Parcel,
} from './orchard';
import type { GameState, PostAttack, PostReport, TradingPost } from './state';
import { fruitOfPost, postFort, postKiwis, postOf, postStore, postsOf } from './tradingPost';
import { woundFactor } from './mines';

/**
 * Chantier 54: attacks on our trading post. Their time is public (the post's own stream, the same
 * for everyone who looks): an attack is announced `noticeMs` before, by the most hostile clan
 * next to the post (standing is public); without a hostile clan next door, nothing comes. A gift
 * that brings that clan back above hostile calls it off. The strike reads the clan's real
 * garrisons, so it resolves only where the orchard's seed is held. Answers: the palisade, kiwis
 * left at the post, a gift, or bringing everybody home (the post falls to a ruin, never lost).
 */

/** Plans the next attack on each post standing (nothing when one is planned or it is a ruin). */
export function planPostAttack(s: GameState): void {
  for (const { fruit, post } of postsOf(s)) {
    if (post.ruined || post.attack) continue;
    const rng = createRng(`${s.orchard.seed}/post/${post.drupelet}/attack/${post.attacks}`);
    const gap = Math.round(rng.range(POST_ATTACK.intervalMs[0], POST_ATTACK.intervalMs[1]));
    const at = Math.max(s.now, post.readyAt) + gap;
    post.attack = {
      // The raspberry's attacks keep their chantier 54 ids.
      id: fruit === 'raspberry' ? `pa${post.attacks}` : `${fruit}-pa${post.attacks}`,
      clan: null,
      announceAt: at - POST_ATTACK.noticeMs,
      at,
      announced: false,
    };
  }
}

/** The parcels around the post (and its own). */
function aroundPost(s: GameState, post: TradingPost): Parcel[] {
  const map = fruitOfState(s, fruitOfPost(post));
  const d = map.byId.get(post.drupelet)!;
  return [d, ...d.links.map((id) => map.byId.get(id)!)];
}

/** The most hostile clan next to the post at a time (null: nobody hostile next door). */
export function hostileNeighbour(s: GameState, post: TradingPost, at: TimeMs): string | null {
  const clans = [...new Set(aroundPost(s, post).map((d) => d.clan))].filter(
    (c) => attitudeOf(s, c, at) === 'hostile',
  );
  clans.sort((a, b) => standingOf(s, a, at) - standingOf(s, b, at) || a.localeCompare(b));
  return clans[0] ?? null;
}

/** The clan's parcels next to the post the attackers come from. */
function attackersFrom(s: GameState, post: TradingPost, clan: string): Parcel[] {
  return aroundPost(s, post).filter((d) => d.clan === clan);
}

function attackEventOf(s: GameState, a: PostAttack): TimeMs {
  if (!a.announced) return a.announceAt > s.now ? a.announceAt : s.now < a.at ? s.now : Infinity;
  // The strike reads the hidden garrisons.
  return s.orchardSeed !== undefined && a.at > s.now ? a.at : Infinity;
}

export function nextPostAttackEvent(s: GameState): TimeMs {
  let at = Infinity;
  for (const { post } of postsOf(s))
    if (post.attack) at = Math.min(at, attackEventOf(s, post.attack));
  return at;
}

/** An announced attack due that only the server can strike. */
export function postAttackAwaited(s: GameState, now: TimeMs): boolean {
  return (
    s.orchardSeed === undefined &&
    postsOf(s).some(({ post: { attack: a } }) => !!a && a.announced && a.at <= now)
  );
}

export function postAttacksDue(s: GameState, now: TimeMs): TimeMs[] {
  const out: TimeMs[] = [];
  for (const { post } of postsOf(s)) {
    const a = post.attack;
    if (a && a.announced && a.at <= now) out.push(a.at);
  }
  return out;
}

export function postAttackTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const { post } of postsOf(s)) attackTick(s, post, at, events);
}

function attackTick(s: GameState, post: TradingPost, at: TimeMs, events: GameEvent[]): void {
  const a = post.attack;
  if (!a) return;
  if (!a.announced && a.announceAt <= at) {
    const clan = hostileNeighbour(s, post, a.announceAt);
    if (!clan) {
      // Nobody hostile next door: nothing comes this time.
      post.attacks++;
      post.attack = null;
      return;
    }
    a.clan = clan;
    a.announced = true;
    events.push({ type: 'postAttackAnnounced', at, clan, strikeAt: a.at });
    return;
  }
  if (a.announced && a.at === at) {
    post.attacks++;
    post.attack = null;
    if (attitudeOf(s, a.clan!, at) !== 'hostile') {
      events.push({ type: 'postAttackCalmed', at, clan: a.clan! });
      return;
    }
    strikePost(s, post, a, events);
  }
}

/** The beetles that come (truth). */
function attackArmy(s: GameState, post: TradingPost, clan: string, at: TimeMs): AlienUnit[] {
  const seed = s.orchardSeed!;
  const all = attackersFrom(s, post, clan).flatMap((d) => parcelNow(s, seed, d, at).units);
  return mergeUnits(shareOf(all, POST_ATTACK.share));
}

function mergeUnits(units: AlienUnit[]): AlienUnit[] {
  const out = new Map<string, AlienUnit>();
  for (const u of units) {
    const key = `${u.kind}/${u.level}`;
    const old = out.get(key);
    if (old) old.count += u.count;
    else out.set(key, { ...u });
  }
  return [...out.values()];
}

function strikePost(s: GameState, post: TradingPost, a: PostAttack, events: GameEvent[]): void {
  const at = a.at;
  const clan = a.clan!;
  const army = attackArmy(s, post, clan, at);
  const fruit = fruitOfPost(post);
  const guards = postKiwis(s, fruit);
  const setup = postSetup(s, guards, {
    attackers: army,
    orders: POST_ORDERS,
    fort: postFort(post, at),
  });
  const log = simulateBattle(setup, `${s.orchardSeed}/post/${a.id}`);
  const held = postHeld(log);
  const ids = new Set(guards.map((v) => v.id as string));
  const fallen = log.result.fallen.filter((r) => ids.has(r)) as VillagerId[];
  // A post held brings its fallen home wounded; a post fallen loses them (and their gear).
  const dead = held ? [] : fallen;
  const hurt = held ? fallen : [];
  const names = dead.map((id) => guards.find((v) => v.id === id)?.name ?? id);
  removeVillagers(s, dead, 'battle', at, true);
  for (const v of s.villagers)
    if (hurt.includes(v.id))
      v.job = {
        kind: 'injured',
        until: at + Math.round(POST_ATTACK.woundMs * woundFactor(s)),
      };
  let taken = 0;
  if (!held) {
    taken = Math.floor(postStore(post) * POST_ATTACK.loot);
    post.store = Math.max(0, post.store - taken * NECTAR_SCALE);
    post.ruined = true;
    // The survivors come home in the pods.
    for (const v of guards) if (v.job.kind === 'post') v.job = { kind: 'idle' };
  }
  recordBestiary(s, army, at);
  const report: PostReport = {
    id: a.id,
    at,
    clan,
    held,
    power: Math.round(army.reduce((x, u) => x + u.count, 0)),
    dead: names,
    hurt,
    taken,
    log,
  };
  post.reports = [...post.reports, report].slice(-5);
  events.push({
    type: 'postAttacked',
    at,
    clan,
    held,
    dead: names.length,
    hurt: hurt.length,
    taken,
  });
}

/** The orders of the kiwis at the post (they hold, and run to the pods when half are down). */
export const POST_ORDERS: LandingOrders = { ...LANDING.defaultOrders };

export interface PostAttackForecast {
  clan: string;
  units: AlienUnit[];
  odds: Odds;
  trials: boolean[];
}

const trialCache = new Map<string, boolean>();

/**
 * The honest forecast of an announced attack (public): the beetles seen on the clan's drupelets
 * next to the post (a visit's view), or the estimate of their rings; three practice battles at
 * × 0.8, 1 and 1.2 (a nest in the hardest).
 */
export function postAttackForecast(
  s: GameState,
  fruit: FruitId = 'raspberry',
): PostAttackForecast | null {
  const post = postOf(s, fruit);
  const a = post?.attack;
  if (!post || !a?.announced || !a.clan) return null;
  const from = attackersFrom(s, post, a.clan);
  const R = FRUIT_DEFS[fruit];
  const spread = R.powerSpread;
  const armyAt = (k: number) =>
    mergeUnits(
      shareOf(
        from.flatMap((d) => {
          const seen = s.orchard.views[d.id];
          if (seen) return seen.units.map((u) => ({ ...u, count: Math.round(u.count * k) }));
          return guessGarrison(s, d, k, a.at);
        }),
        POST_ATTACK.share,
      ),
    );
  const armies = [armyAt(1 - spread), armyAt(1), armyAt((1 + spread) * R.nestPower)];
  const guards = postKiwis(s, fruit);
  const trials = armies.map((units, i) => {
    const seed = `orchard/post/trial/${a.id}/${i}`;
    const setup = postSetup(s, guards, {
      attackers: units,
      orders: POST_ORDERS,
      fort: postFort(post, a.at),
    });
    const key = JSON.stringify([setup.units, seed]);
    const hit = trialCache.get(key);
    if (hit !== undefined) return hit;
    const held = postHeld(simulateBattle(setup, seed));
    if (trialCache.size > 32) trialCache.delete(trialCache.keys().next().value!);
    trialCache.set(key, held);
    return held;
  });
  const odds: Odds = trials[2] ? 'likely' : trials[0] || trials[1] ? 'uncertain' : 'unlikely';
  return { clan: a.clan, units: armies[1]!, odds, trials };
}
