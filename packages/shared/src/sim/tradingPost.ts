import {
  FRUIT_IDS,
  NECTAR_SCALE,
  POST,
  POST_MODULE_TYPES,
  fruitOfId,
  type FruitId,
  type PostModuleType,
} from '../data/orchard';
import { hexKey } from '../hex/hex';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import type { CommandError } from './commands';
import { meteorIronOf } from './iron';
import { nectarOf } from './orchard';
import { wornOut } from './pineapple';
import { siteSpotError, smallMap, type SmallMap } from './sites';
import type { GameState, PostModule, TradingPost, Villager } from './state';

/**
 * Chantier 54: our trading posts in the orchard (chantier 55: one per fruit). A small map apart
 * from the face (the mechanics of the kiwais, `sim/sites.ts`): its own modules, never in
 * `state.buildings`. Kiwis left there (job `post`, its `fruit`) gather the fruit's good in the
 * stalls into its store, which a ship calling at the post brings home. Nothing hidden: it
 * resolves on the client as well as on the server (its attacks read the hidden garrisons).
 */

/** The fruit a post stands on (its parcel's id names it). */
export function fruitOfPost(post: Pick<TradingPost, 'drupelet'>): FruitId {
  return fruitOfId(post.drupelet) ?? 'raspberry';
}

/** The post on a fruit, standing or a ruin (null: none founded). */
export function postOf(state: Pick<GameState, 'orchard'>, fruit: FruitId): TradingPost | null {
  return state.orchard.posts[fruit] ?? null;
}

/** Every post founded, with its fruit (in the order of `FRUIT_IDS`). */
export function postsOf(
  state: Pick<GameState, 'orchard'>,
): { fruit: FruitId; post: TradingPost }[] {
  const out: { fruit: FruitId; post: TradingPost }[] = [];
  for (const fruit of FRUIT_IDS) {
    const post = state.orchard.posts[fruit];
    if (post) out.push({ fruit, post });
  }
  return out;
}

/** The post's small map (its seed is public: the parcel it stands on). */
export function postMapOf(state: Pick<GameState, 'orchard'>, post: TradingPost): SmallMap {
  return smallMap(`${state.orchard.seed}/post/${post.drupelet}`, POST.radius, POST.rocks);
}

/** The post on a fruit, when it stands and works (founded, not a ruin). */
export function workingPost(
  state: GameState,
  fruit: FruitId = 'raspberry',
  at: TimeMs = state.now,
): TradingPost | null {
  const p = postOf(state, fruit);
  return p && !p.ruined && p.readyAt <= at ? p : null;
}

/** The fruit of a kiwi staying at a post (old saves: the raspberry). */
export function postFruitOf(v: Villager): FruitId | null {
  return v.job.kind === 'post' ? (v.job.fruit ?? 'raspberry') : null;
}

/** Kiwis staying at the post of a fruit. */
export function postKiwis(state: GameState, fruit: FruitId = 'raspberry'): Villager[] {
  return state.villagers.filter((v) => postFruitOf(v) === fruit);
}

/** Kiwis staying at any post. */
export function allPostKiwis(state: GameState): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'post');
}

function ready(m: PostModule, at: TimeMs): boolean {
  return m.readyAt <= at && !m.broken;
}

/** Kiwis the post houses: two in the post itself, two more in each hut. */
export function postHousing(post: TradingPost, at: TimeMs): number {
  return (
    2 +
    post.modules
      .filter((m) => m.type === 'hut' && ready(m, at))
      .reduce((a, m) => a + (POST.modules[m.type].housing ?? 0), 0)
  );
}

/** Kiwis at a post still able to work and fight (the bromelain wears the pineapple's out). */
export function postFit(state: GameState, fruit: FruitId, at: TimeMs = state.now): Villager[] {
  return postKiwis(state, fruit).filter((v) => !wornOut(v, at));
}

/** Kiwis at work in the stalls (two places each). */
export function stallWorkers(state: GameState, post: TradingPost, at: TimeMs): number {
  const places = post.modules
    .filter((m) => m.type === 'stall' && ready(m, at))
    .reduce((a, m) => a + (POST.modules[m.type].workSlots ?? 0), 0);
  return Math.min(places, postFit(state, fruitOfPost(post), at).length);
}

/** Levels of the palisades standing (the post's defence). */
export function postFort(post: TradingPost, at: TimeMs): number {
  return post.modules
    .filter((m) => m.type === 'palisade' && ready(m, at))
    .reduce((a, m) => a + (POST.modules[m.type].fort ?? 0), 0);
}

export function postStoreCap(): number {
  return POST.storeCap * NECTAR_SCALE;
}

/** Raw units per ms gathered into a post's store now (an integer; 0 when full). */
export function postRate(state: GameState, fruit: FruitId): number {
  const post = workingPost(state, fruit);
  if (!post || post.store >= postStoreCap()) return 0;
  const n = stallWorkers(state, post, state.now);
  if (n <= 0) return 0;
  return Math.max(1, Math.round((POST.perHour * NECTAR_SCALE * n) / 3_600_000));
}

/** The rates of every post's store (for `computeFlows`). */
export function postRates(state: GameState): { fruit: FruitId; rate: number }[] {
  const out: { fruit: FruitId; rate: number }[] = [];
  for (const fruit of FRUIT_IDS) {
    const rate = postRate(state, fruit);
    if (rate > 0) out.push({ fruit, rate });
  }
  return out;
}

/** The raspberry post's nectar rate (chantier 54). */
export function postNectarRate(state: GameState): number {
  return postRate(state, 'raspberry');
}

export function accruePost(
  s: GameState,
  rates: readonly { fruit: FruitId; rate: number }[],
  dtMs: number,
): void {
  for (const { fruit, rate } of rates) {
    const post = s.orchard.posts[fruit];
    if (!post || rate <= 0) continue;
    post.store = Math.min(postStoreCap(), post.store + rate * dtMs);
  }
}

/** The store's whole units. */
export function postStore(post: TradingPost): number {
  return Math.floor(post.store / NECTAR_SCALE + 1e-9);
}

/** Next time something changes at a post by itself (founded, a module assembled). */
export function nextPostEvent(s: GameState): TimeMs {
  let at = Infinity;
  const later = (t: TimeMs) => {
    if (t > s.now && t < at) at = t;
  };
  for (const { post } of postsOf(s)) {
    later(post.readyAt);
    for (const m of post.modules) later(m.readyAt);
  }
  // Chantier 55: a kiwi at the pineapple worn out stops working.
  for (const v of s.villagers) if (v.job.kind === 'post' && v.job.wornAt) later(v.job.wornAt);
  return at;
}

export function postTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const { post } of postsOf(s)) {
    if (post.readyAt === at) events.push({ type: 'postReady', at, drupelet: post.drupelet });
    for (const m of post.modules)
      if (m.readyAt === at)
        events.push({ type: 'postModuleReady', at, moduleType: m.type, drupelet: post.drupelet });
  }
  for (const v of s.villagers)
    if (v.job.kind === 'post' && v.job.wornAt === at)
      events.push({ type: 'postKiwiWorn', at, villagerId: v.id });
}

/** Founds the post on a parcel (a ship has arrived with its cost paid at launch). */
export function foundPost(s: GameState, drupelet: string, at: TimeMs): void {
  const fruit = fruitOfId(drupelet) ?? 'raspberry';
  const old = s.orchard.posts[fruit];
  const post: TradingPost = {
    drupelet,
    since: at,
    readyAt: at + POST.buildMs,
    // A ruin rises again with what was left of it (its modules, mended).
    modules: old?.ruined
      ? old.modules.map((m) => ({ ...m, broken: false, readyAt: at + POST.buildMs }))
      : [],
    store: 0,
    attacks: old?.attacks ?? 0,
    attack: null,
    reports: old?.reports ?? [],
  };
  for (const m of post.modules) delete m.broken;
  s.orchard.posts = { ...s.orchard.posts, [fruit]: post };
}

/** What founding (or raising a ruin) costs now on a fruit. */
export function postCost(
  state: GameState,
  fruit: FruitId = 'raspberry',
): { nectar: number; crystal: number; iron: number } {
  const k = postOf(state, fruit)?.ruined ? POST.rebuild : 1;
  return {
    nectar: Math.ceil(POST.cost.nectar * k),
    crystal: Math.ceil(POST.cost.crystal * k),
    iron: Math.ceil(POST.cost.iron * k),
  };
}

export type PostModuleLock = Extract<
  CommandError,
  | 'noPost'
  | 'postNotReady'
  | 'moduleLimit'
  | 'unknownModule'
  | 'unknownTile'
  | 'tileNotAllowed'
  | 'tileOccupied'
  | 'notEnoughNectar'
  | 'notEnoughIron'
>;

/** Why this module cannot be set on a post's map there now. */
export function postModuleLock(
  state: GameState,
  fruit: FruitId,
  type: PostModuleType,
  h: { q: number; r: number },
): PostModuleLock | null {
  const post = postOf(state, fruit);
  if (!post || post.ruined) return 'noPost';
  if (post.readyAt > state.now) return 'postNotReady';
  if (!POST_MODULE_TYPES.includes(type)) return 'unknownModule';
  if (post.modules.length >= POST.maxModules) return 'moduleLimit';
  const spot = siteSpotError(postMapOf(state, post), post.modules, h);
  if (spot === 'offSite') return 'unknownTile';
  if (spot === 'rock' || spot === 'pad') return 'tileNotAllowed';
  if (spot) return spot;
  const def = POST.modules[type];
  if (nectarOf(state) < def.nectar) return 'notEnoughNectar';
  if (meteorIronOf(state) < def.iron) return 'notEnoughIron';
  return null;
}

/** Sets a module (paid by the command); assembled by the kiwis there, or sent ready-made. */
export function addPostModule(
  s: GameState,
  fruit: FruitId,
  type: PostModuleType,
  h: { q: number; r: number },
  id: string,
): PostModule {
  const m: PostModule = {
    id,
    type,
    q: h.q,
    r: h.r,
    readyAt: s.now + POST.modules[type].durationMs,
  };
  s.orchard.posts[fruit]!.modules.push(m);
  return m;
}

/** The post holding a module (null: none). */
export function postOfModule(state: Pick<GameState, 'orchard'>, id: string): TradingPost | null {
  return postsOf(state).find(({ post }) => post.modules.some((m) => m.id === id))?.post ?? null;
}

/** Takes a module down (a quarter of its nectar back); never a hut someone sleeps in. */
export function removePostModuleLock(state: GameState, id: string): CommandError | null {
  const post = postOfModule(state, id);
  if (!post) return postsOf(state).some(({ post: p }) => !p.ruined) ? 'unknownModule' : 'noPost';
  if (post.ruined) return 'noPost';
  const m = post.modules.find((x) => x.id === id)!;
  if (m.type === 'hut') {
    const left = postHousing({ ...post, modules: post.modules.filter((x) => x !== m) }, state.now);
    if (left < postKiwis(state, fruitOfPost(post)).length) return 'habitatInUse';
  }
  return null;
}

/** The spots of the post's map free for a module. */
export function freePostSpots(state: GameState, post: TradingPost): string[] {
  const map = postMapOf(state, post);
  return map.tiles.filter((t) => !siteSpotError(map, post.modules, t)).map((t) => hexKey(t));
}
