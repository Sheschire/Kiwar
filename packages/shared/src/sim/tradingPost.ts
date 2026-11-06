import { NECTAR_SCALE, POST, POST_MODULE_TYPES, type PostModuleType } from '../data/orchard';
import { hexKey } from '../hex/hex';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import type { CommandError } from './commands';
import { meteorIronOf } from './iron';
import { nectarOf } from './orchard';
import { siteSpotError, smallMap, type SmallMap } from './sites';
import type { GameState, PostModule, TradingPost, Villager } from './state';

/**
 * Chantier 54: our trading post on the raspberry. A small map apart from the face (the
 * mechanics of the kiwais, `sim/sites.ts`): its own modules, never in `state.buildings`. Kiwis
 * left there (job `post`) gather nectar in the stalls into its store, which a ship calling at
 * the post brings home. Nothing hidden: it resolves on the client as well as on the server
 * (its attacks, chantier 54 part 4, read the hidden garrisons).
 */

/** The post's small map (its seed is public: the drupelet it stands on). */
export function postMapOf(state: Pick<GameState, 'orchard'>, post: TradingPost): SmallMap {
  return smallMap(`${state.orchard.seed}/post/${post.drupelet}`, POST.radius, POST.rocks);
}

/** The post, when it stands and works (founded, not a ruin). */
export function workingPost(state: GameState, at: TimeMs = state.now): TradingPost | null {
  const p = state.orchard.post;
  return p && !p.ruined && p.readyAt <= at ? p : null;
}

export function postKiwis(state: GameState): Villager[] {
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

/** Kiwis at work in the stalls (two places each). */
export function stallWorkers(state: GameState, post: TradingPost, at: TimeMs): number {
  const places = post.modules
    .filter((m) => m.type === 'stall' && ready(m, at))
    .reduce((a, m) => a + (POST.modules[m.type].workSlots ?? 0), 0);
  return Math.min(places, postKiwis(state).length);
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

/** Raw nectar units per ms gathered into the store now (an integer; 0 when full). */
export function postNectarRate(state: GameState): number {
  const post = workingPost(state);
  if (!post || post.store >= postStoreCap()) return 0;
  const n = stallWorkers(state, post, state.now);
  if (n <= 0) return 0;
  return Math.max(1, Math.round((POST.perHour * NECTAR_SCALE * n) / 3_600_000));
}

export function accruePost(s: GameState, rate: number, dtMs: number): void {
  const post = s.orchard.post;
  if (!post || rate <= 0) return;
  post.store = Math.min(postStoreCap(), post.store + rate * dtMs);
}

/** The store's whole units of nectar. */
export function postStore(post: TradingPost): number {
  return Math.floor(post.store / NECTAR_SCALE + 1e-9);
}

/** Next time something changes at the post by itself (founded, a module assembled). */
export function nextPostEvent(s: GameState): TimeMs {
  const post = s.orchard.post;
  if (!post) return Infinity;
  let at = Infinity;
  const later = (t: TimeMs) => {
    if (t > s.now && t < at) at = t;
  };
  later(post.readyAt);
  for (const m of post.modules) later(m.readyAt);
  return at;
}

export function postTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const post = s.orchard.post;
  if (!post) return;
  if (post.readyAt === at) events.push({ type: 'postReady', at, drupelet: post.drupelet });
  for (const m of post.modules)
    if (m.readyAt === at) events.push({ type: 'postModuleReady', at, moduleType: m.type });
}

/** Founds the post on a drupelet (a ship has arrived with its cost paid at launch). */
export function foundPost(s: GameState, drupelet: string, at: TimeMs): void {
  const old = s.orchard.post;
  s.orchard.post = {
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
  for (const m of s.orchard.post.modules) delete m.broken;
}

/** What founding (or raising a ruin) costs now. */
export function postCost(state: GameState): { nectar: number; crystal: number; iron: number } {
  const k = state.orchard.post?.ruined ? POST.rebuild : 1;
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

/** Why this module cannot be set on the post's map there now. */
export function postModuleLock(
  state: GameState,
  type: PostModuleType,
  h: { q: number; r: number },
): PostModuleLock | null {
  const post = state.orchard.post;
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
  s.orchard.post!.modules.push(m);
  return m;
}

/** Takes a module down (a quarter of its nectar back); never a hut someone sleeps in. */
export function removePostModuleLock(state: GameState, id: string): CommandError | null {
  const post = state.orchard.post;
  if (!post || post.ruined) return 'noPost';
  const m = post.modules.find((x) => x.id === id);
  if (!m) return 'unknownModule';
  if (m.type === 'hut') {
    const left = postHousing({ ...post, modules: post.modules.filter((x) => x !== m) }, state.now);
    if (left < postKiwis(state).length) return 'habitatInUse';
  }
  return null;
}

/** The spots of the post's map free for a module. */
export function freePostSpots(state: GameState, post: TradingPost): string[] {
  const map = postMapOf(state, post);
  return map.tiles.filter((t) => !siteSpotError(map, post.modules, t)).map((t) => hexKey(t));
}
