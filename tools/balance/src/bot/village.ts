import {
  buildCost,
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

/**
 * Chantier 43: the Town Hall once the Library stands (the mayor speaks at night, see `bot.ts`),
 * then campfires where the most beds lack a leisure — only with twice the price in stock.
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
  const fires = state.buildings.filter((b) => b.type === 'campfire');
  if (fires.length >= MAX_FIRES || state.queue.some((i) => i.buildingType === 'campfire'))
    return null;
  if (!spare('campfire') || buildLock(state, 'campfire')) return null;
  const radius = LEISURE.campfire?.radius ?? 0;
  const homes = state.buildings
    .map((b) => ({ b, beds: levelDef(b.type, b.level)?.housing ?? 0 }))
    .filter((h) => h.beds > 0 && !fires.some((f) => hexDistance(f, h.b) <= radius));
  if (homes.length === 0) return null;
  let best: { q: number; r: number } | null = null;
  let bestScore = 0;
  for (const t of map.tiles) {
    const beds = homes.reduce((s, h) => s + (hexDistance(t, h.b) <= radius ? h.beds : 0), 0);
    if (beds < 4 || beds <= bestScore) continue;
    if (siteError(state, map, 'campfire', t) !== null) continue;
    best = t;
    bestScore = beds;
  }
  return best ? { type: 'build', buildingType: 'campfire', q: best.q, r: best.r } : null;
}
