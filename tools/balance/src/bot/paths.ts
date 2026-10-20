import {
  buildingAt,
  buildingHarvest,
  getTile,
  harvestedTileType,
  hexKey,
  hexNeighbors,
  isFlooded,
  nearestDepotOf,
  obstacleAt,
  parseHexKey,
  pathLimit,
  pathLogisticsChanges,
  PATHS,
  queuedBuildAt,
  seasonOf,
  tileWalkCost,
  titanAt,
  TILES,
  type Command,
  type FaceMap,
  type GameState,
  type Hex,
} from '@kiwar/shared';

/** A path must pay back its fiber in this many hours of extra harvest (all resources alike). */
export const PATH_PAYBACK_H = 6;
/** Fiber kept after paving (a path never eats the last fiber of a saving). */
const FIBER_MARGIN = 2;

interface Plan {
  tiles: string[];
  /** Extra harvest per hour (raw units, before the hour of the day). */
  gain: number;
}

/** Whether a path may be laid on this tile today. */
function pavable(state: GameState, map: FaceMap, h: Hex): boolean {
  const tile = getTile(map, h);
  if (!tile || !TILES[tile.type].walkable) return false;
  if (isFlooded(tile, map.params.biome, seasonOf(state))) return false;
  return (
    !buildingAt(state, h.q, h.r) &&
    !queuedBuildAt(state, h.q, h.r) &&
    !obstacleAt(state, h.q, h.r) &&
    !titanAt(state, h.q, h.r)
  );
}

/**
 * The route from a producer to its depot once paved (Dijkstra on the walking cost a path would
 * give each tile; tiles already paved cost a little less so that routes share them).
 */
function route(state: GameState, map: FaceMap, from: Hex, to: Hex): string[] {
  const season = seasonOf(state);
  const paved = new Set(state.paths);
  const goal = hexKey(to);
  const cost = (h: Hex): number => {
    const tile = getTile(map, h);
    if (!tile) return Infinity;
    const k = hexKey(h);
    if (k === goal) return PATHS.walkCost;
    const flooded = isFlooded(tile, map.params.biome, season);
    if (paved.has(k)) return PATHS.walkCost * 0.9;
    if (pavable(state, map, h)) return PATHS.walkCost;
    return tileWalkCost(tile.type, false, season, map.params.biome, flooded);
  };
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const open = new Map<string, number>();
  // A well in the juice is left from its shore.
  const start = hexKey(from);
  const fromTile = getTile(map, from);
  if (fromTile && TILES[fromTile.type].walkable) open.set(start, 0);
  else for (const n of hexNeighbors(from)) if (cost(n) < Infinity) open.set(hexKey(n), 0);
  while (open.size > 0) {
    let k = '';
    let best = Infinity;
    for (const [key, d] of open)
      if (d < best) {
        best = d;
        k = key;
      }
    open.delete(k);
    dist.set(k, best);
    if (k === goal) break;
    const h = parseHexKey(k);
    const here = cost(h);
    for (const n of hexNeighbors(h)) {
      const nk = hexKey(n);
      if (dist.has(nk)) continue;
      const c = cost(n);
      if (c === Infinity) continue;
      const nd = best + (here + c) / 2;
      if (nd < (open.get(nk) ?? Infinity)) {
        open.set(nk, nd);
        prev.set(nk, k);
      }
    }
  }
  if (!dist.has(goal)) return [];
  const out: string[] = [];
  for (let k: string | undefined = prev.get(goal); k; k = prev.get(k)) {
    if (!paved.has(k) && pavable(state, map, parseHexKey(k))) out.push(k);
  }
  return out;
}

/** Extra harvest per hour once `tiles` are paved (every producer, raw units). */
function gainOf(state: GameState, map: FaceMap, tiles: string[]): number {
  let gain = 0;
  for (const c of pathLogisticsChanges(state, map, tiles, false)) {
    const b = state.buildings.find((x) => x.id === c.buildingId)!;
    const h = buildingHarvest(state, b, () => false);
    if (!h || h.status === 'depleted' || h.status === 'flooded' || h.cycle <= 0) continue;
    gain += (h.demand / h.cycle) * (c.after / c.before - 1);
  }
  return gain;
}

/** The best stroke for the current layout: the quickest payback among the producers. */
function bestPlan(state: GameState, map: FaceMap): Plan | null {
  const producers = state.buildings.filter((b) => harvestedTileType(map, b));
  let best: Plan | null = null;
  const room = pathLimit(state) - state.paths.length;
  for (const b of producers) {
    const depot = nearestDepotOf(state, map, b);
    if (!depot) continue;
    const tiles = route(state, map, b, depot.building);
    if (tiles.length === 0 || tiles.length > room || tiles.length > PATHS.maxPerCommand) continue;
    const gain = gainOf(state, map, tiles);
    if (gain <= 0) continue;
    // The best payback first.
    if (!best || tiles.length / gain < best.tiles.length / best.gain) best = { tiles, gain };
  }
  return best;
}

/**
 * Chantier 18: pave the walk of a producer to its depot when the extra harvest pays the fiber
 * back within `PATH_PAYBACK_H` hours. Trampled or storm-swept tiles come back the same way.
 */
export function pathOrder(state: GameState, map: FaceMap): Command | null {
  const plan = bestPlan(state, map);
  if (!plan) return null;
  const fiber = (PATHS.cost.fiber ?? 0) * plan.tiles.length;
  if (fiber / plan.gain > PATH_PAYBACK_H) return null;
  if (state.resources.fiber < fiber * FIBER_MARGIN) return null;
  return { type: 'buildPath', tiles: plan.tiles.map((k) => parseHexKey(k)) };
}
