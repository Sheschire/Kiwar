import { dustReserve } from './sky';
import {
  beautyOf,
  buildCost,
  CABARET,
  FIREWORKS,
  fireworksLock,
  footprintOf,
  MORALE,
  stardustOf,
  buildLock,
  canAfford,
  hexDistance,
  LEISURE,
  levelDef,
  nest,
  scaleCost,
  siteError,
  type BuildingType,
  type Command,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';

/** At most this many campfires (each copy is dearer). */
const MAX_FIRES = 4;
/** Chantier 44: the games and decorations the bot builds, in its order. */
const GAMES = ['swing', 'skittles', 'skipPond', 'slide'] as const;
const DECORS = ['mayorStatue', 'fountain', 'lanterns', 'flowerBed', 'vineArch'] as const;

/**
 * Chantier 43: the Town Hall once the Library stands (the mayor speaks at night, see `bot.ts`),
 * then campfires where the most beds lack a leisure — only with twice the price in stock.
 * Chantier 44: then one game of each kind, decorations up to the beauty cap, the cabaret and
 * the fireworks cannon.
 */
export function villageDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (nest(state).level < 3 || !has('library')) return null;
  const spare = (type: BuildingType) =>
    canAfford(state.resources, scaleCost(buildCost(state, type), 2));
  // Never a command that always fails (it would stop every later decision).
  if (!has('townHall'))
    return spare('townHall') && !buildLock(state, 'townHall') ? build('townHall') : null;
  return (
    campfireDecision(state, map, spare) ??
    gameDecision(state, map, spare, has) ??
    decorDecision(state, map, spare, has) ??
    eveningDecision(state, map, spare, has)
  );
}

/** Where a leisure of `radius` reaches the most beds (at least 4), or null. */
function bestLeisureTile(
  state: GameState,
  map: FaceMap,
  type: BuildingType,
  radius: number,
  homes: { b: { q: number; r: number }; beds: number }[],
): { q: number; r: number; rot: number } | null {
  let best: { q: number; r: number; rot: number } | null = null;
  let bestScore = 0;
  const rots = footprintOf(type) === 1 ? [0] : [0, 1, 2, 3, 4, 5];
  for (const t of map.tiles) {
    const beds = homes.reduce((s, h) => s + (hexDistance(t, h.b) <= radius ? h.beds : 0), 0);
    if (beds < 4 || beds <= bestScore) continue;
    const rot = rots.find((r) => siteError(state, map, type, t, r) === null);
    if (rot === undefined) continue;
    best = { q: t.q, r: t.r, rot };
    bestScore = beds;
  }
  return best;
}

const homesOf = (state: GameState) =>
  state.buildings
    .map((b) => ({ b, beds: levelDef(b.type, b.level)?.housing ?? 0 }))
    .filter((h) => h.beds > 0);

const queued = (state: GameState, type: BuildingType) =>
  state.queue.some((i) => i.kind === 'build' && i.buildingType === type);

function campfireDecision(
  state: GameState,
  map: FaceMap,
  spare: (type: BuildingType) => boolean,
): Command | null {
  const fires = state.buildings.filter((b) => b.type === 'campfire');
  if (fires.length >= MAX_FIRES || queued(state, 'campfire')) return null;
  if (!spare('campfire') || buildLock(state, 'campfire')) return null;
  const radius = LEISURE.campfire?.radius ?? 0;
  const homes = homesOf(state).filter((h) => !fires.some((f) => hexDistance(f, h.b) <= radius));
  if (homes.length === 0) return null;
  const best = bestLeisureTile(state, map, 'campfire', radius, homes);
  return best ? { type: 'build', buildingType: 'campfire', q: best.q, r: best.r } : null;
}

/** Chantier 44: one game of each kind where it reaches the most beds. */
function gameDecision(
  state: GameState,
  map: FaceMap,
  spare: (type: BuildingType) => boolean,
  has: (type: BuildingType) => boolean,
): Command | null {
  for (const type of GAMES) {
    if (has(type) || queued(state, type) || buildLock(state, type) || !spare(type)) continue;
    const best = bestLeisureTile(state, map, type, LEISURE[type]!.radius, homesOf(state));
    if (best) return { type: 'build', buildingType: type, q: best.q, r: best.r };
  }
  return null;
}

/** Chantier 44: decorations until the beauty is full, near the Nest (two of each at most). */
function decorDecision(
  state: GameState,
  map: FaceMap,
  spare: (type: BuildingType) => boolean,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (beautyOf(state) >= MORALE.beauty) return null;
  if (DECORS.some((t) => queued(state, t))) return null;
  const home = nest(state);
  for (const type of DECORS) {
    if (type === 'mayorStatue' && has(type)) continue;
    if (state.buildings.filter((b) => b.type === type).length >= 2) continue;
    if (buildLock(state, type) || !spare(type)) continue;
    const t = map.tiles
      .filter((x) => hexDistance(x, home) >= 2 && hexDistance(x, home) <= 5)
      .find((x) => siteError(state, map, type, x) === null);
    if (t) return { type: 'build', buildingType: type, q: t.q, r: t.r };
  }
  return null;
}

/** Chantier 44: the cabaret where it reaches the most beds, then the fireworks cannon. */
function eveningDecision(
  state: GameState,
  map: FaceMap,
  spare: (type: BuildingType) => boolean,
  has: (type: BuildingType) => boolean,
): Command | null {
  for (const type of ['cabaret', 'fireworks'] as const) {
    if (has(type) || queued(state, type) || buildLock(state, type) || !spare(type)) continue;
    const radius = type === 'cabaret' ? CABARET.radius : 4;
    const best = bestLeisureTile(state, map, type, radius, homesOf(state));
    if (best) return { type: 'build', buildingType: type, q: best.q, r: best.r, rot: best.rot };
  }
  return null;
}

/**
 * Chantier 44: at night, when the stock holds three times its price, the bot fires the finest
 * show its stardust allows above its reserve (the monuments and the Kikiwiwi come first).
 */
export function fireworksDecision(state: GameState): Command | null {
  for (const pattern of ['kiwiBird', 'kiwiFruit', 'bouquet'] as const) {
    const def = FIREWORKS[pattern];
    if (fireworksLock(state, pattern)) continue;
    if (!canAfford(state.resources, scaleCost(def.cost, 3))) continue;
    if (def.stardust > 0 && stardustOf(state) < dustReserve(state) + def.stardust) continue;
    return { type: 'fireFireworks', pattern };
  }
  return null;
}
