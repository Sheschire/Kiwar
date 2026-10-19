import { levelDef } from '../data/buildings';
import { FACE_PROFILES } from '../data/faceProfiles';
import type { ResourceId } from '../data/resources';
import { CAMPS, CATCHMENT_RADIUS, DEPOSITS, HARVESTS, LOGISTICS, PATHS } from '../data/territory';
import { TILES, type TileType } from '../data/tiles';
import { hexDisk, hexKey, hexNeighbors, parseHexKey, type Hex } from '../hex/hex';
import { generateFace, getTile, type FaceMap, type Tile } from '../worldgen/generateFace';
import type { BuildingId, TimeMs } from '../types/ids';
import type { Building, GameState } from './state';

const HOUR_MS = 3_600_000;
const EPS = 1e-6;

// ---------------------------------------------------------------------------------------------
// Face map cache: the simulation needs the map (deposits, walking costs). It is regenerated
// from the seed, deterministically, and kept for the few faces a process works with.

const mapCache = new Map<string, FaceMap>();

export function faceMapOf(state: Pick<GameState, 'seed' | 'face' | 'params'>): FaceMap {
  const key = `${state.seed}|${state.face}|${state.params.radius}`;
  let map = mapCache.get(key);
  if (!map) {
    map = generateFace(state.seed, state.face, state.params);
    if (mapCache.size >= 8) mapCache.delete(mapCache.keys().next().value!);
    mapCache.set(key, map);
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Deposits

export interface TileDeposit {
  resource: ResourceId;
  /** Full stock and regrowth per hour, richness included. */
  cap: number;
  regen: number;
}

export function tileDeposit(tile: Tile | undefined): TileDeposit | null {
  const def = tile ? DEPOSITS[tile.type] : undefined;
  if (!tile || !def) return null;
  return {
    resource: def.resource,
    cap: def.stock * tile.richness,
    regen: def.regen * tile.richness,
  };
}

function depositAtKey(map: FaceMap, key: string): TileDeposit | null {
  return tileDeposit(getTile(map, parseHexKey(key)));
}

/** Current stock of a deposit nobody harvests (it regrows on its own up to full). */
export function freeDepositStock(state: GameState, map: FaceMap, key: string, at: TimeMs): number {
  const dep = depositAtKey(map, key);
  if (!dep) return 0;
  const d = state.deposits[key];
  if (!d) return dep.cap;
  return Math.min(dep.cap, d.stock + (dep.regen * Math.max(0, at - d.at)) / HOUR_MS);
}

/** Tile type a building harvests, if any. */
export function harvestedTileType(map: FaceMap, b: Building): TileType | null {
  if (b.type === 'camp') return getTile(map, b)?.type ?? null;
  return HARVESTS[b.type] ?? null;
}

export function catchmentRadius(b: Building): number {
  return b.type === 'camp' ? 0 : (CATCHMENT_RADIUS[b.level - 1] ?? 1);
}

/**
 * Which deposit tiles each producer harvests. Tiles go to the oldest building first; tiles
 * covered by another building are built over and cannot be harvested.
 */
export function computeClaims(state: GameState, map: FaceMap): Map<BuildingId, string[]> {
  const occupied = new Set(state.buildings.map((b) => hexKey(b)));
  const claimed = new Set<string>();
  const out = new Map<BuildingId, string[]>();
  for (const b of state.buildings) {
    const type = harvestedTileType(map, b);
    if (!type) continue;
    const own = hexKey(b);
    const tiles: string[] = [];
    for (const h of hexDisk(b, catchmentRadius(b))) {
      const key = hexKey(h);
      if (claimed.has(key) || (key !== own && occupied.has(key))) continue;
      if (getTile(map, h)?.type !== type) continue;
      claimed.add(key);
      tiles.push(key);
    }
    out.set(b.id, tiles);
  }
  return out;
}

export function poolCapacity(
  map: FaceMap,
  tiles: readonly string[],
): { cap: number; regen: number } {
  let cap = 0;
  let regen = 0;
  for (const k of tiles) {
    const d = depositAtKey(map, k);
    if (d) {
      cap += d.cap;
      regen += d.regen;
    }
  }
  return { cap, regen };
}

/** Gives the tiles of a pool back to the land, each with the pool's fill ratio. */
function releaseTiles(
  state: GameState,
  map: FaceMap,
  tiles: readonly string[],
  ratio: number,
  at: TimeMs,
): void {
  for (const k of tiles) {
    const dep = depositAtKey(map, k);
    if (!dep) continue;
    const stock = dep.cap * ratio;
    if (stock < dep.cap - EPS) state.deposits[k] = { stock, at };
    else delete state.deposits[k];
  }
}

function fillRatio(map: FaceMap, b: Building): number {
  if (!b.pool) return 1;
  const { cap } = poolCapacity(map, b.pool.tiles);
  return cap > 0 ? Math.min(1, Math.max(0, b.pool.stock / cap)) : 1;
}

/** Called before a building disappears: its deposits keep their depletion. */
export function releasePool(state: GameState, map: FaceMap, b: Building, at: TimeMs): void {
  if (!b.pool) return;
  releaseTiles(state, map, b.pool.tiles, fillRatio(map, b), at);
  delete b.pool;
}

/**
 * Re-evaluates catchments after a layout change (new building, upgrade, removal). Tiles that
 * change hands keep their stock: depletion follows the land, not the building.
 */
export function syncPools(state: GameState, map: FaceMap, at: TimeMs): void {
  const claims = computeClaims(state, map);
  const changed: { b: Building; kept: string[]; added: string[]; ratio: number }[] = [];
  // Release first, so that a tile can move from one building to another in one pass.
  for (const b of state.buildings) {
    const next = claims.get(b.id);
    if (!next) {
      if (b.pool) releasePool(state, map, b, at);
      continue;
    }
    const prev = b.pool?.tiles;
    if (prev && prev.length === next.length && prev.every((k, i) => k === next[i])) continue;
    const ratio = fillRatio(map, b);
    const nextSet = new Set(next);
    const prevSet = new Set(prev ?? []);
    const removed = (prev ?? []).filter((k) => !nextSet.has(k));
    releaseTiles(state, map, removed, ratio, at);
    changed.push({
      b,
      kept: next.filter((k) => prevSet.has(k)),
      added: next.filter((k) => !prevSet.has(k)),
      ratio,
    });
  }
  for (const { b, kept, added, ratio } of changed) {
    let stock = poolCapacity(map, kept).cap * ratio;
    for (const k of added) {
      stock += freeDepositStock(state, map, k, at);
      delete state.deposits[k];
    }
    b.pool = { stock, tiles: claims.get(b.id)! };
  }
  // Forget free deposits that have grown back.
  for (const k of Object.keys(state.deposits)) {
    const dep = depositAtKey(map, k);
    if (!dep || freeDepositStock(state, map, k, at) >= dep.cap - EPS) delete state.deposits[k];
  }
}

// ---------------------------------------------------------------------------------------------
// Logistics

export function pathSet(state: GameState): Set<string> {
  return new Set(state.paths);
}

/** Walking cost of a tile (Infinity if kiwis cannot walk there). */
export function walkCost(map: FaceMap, paths: ReadonlySet<string>, h: Hex): number {
  const tile = getTile(map, h);
  if (!tile || !TILES[tile.type].walkable) return Infinity;
  return paths.has(hexKey(h))
    ? Math.min(PATHS.walkCost, TILES[tile.type].walkCost)
    : TILES[tile.type].walkCost;
}

export function isDepot(b: Building): boolean {
  return b.type === 'nest' || b.type === 'warehouse';
}

const distanceCache = new Map<string, Map<string, number>>();

/**
 * Walking distance from every tile to the nearest depot (Dijkstra; a step costs the mean of the
 * two tiles' walking costs). Memoized on the layout.
 */
export function depotDistances(state: GameState, map: FaceMap): Map<string, number> {
  const depots = state.buildings.filter(isDepot).map((b) => hexKey(b));
  const key = `${state.seed}|${state.face}|${state.params.radius}|${depots.join(';')}|${[...state.paths].sort().join(';')}`;
  const cached = distanceCache.get(key);
  if (cached) return cached;
  const paths = pathSet(state);
  const dist = new Map<string, number>();
  const open = new Map<string, number>();
  for (const d of depots) open.set(d, 0);
  while (open.size > 0) {
    let bestKey = '';
    let best = Infinity;
    for (const [k, v] of open) {
      if (v < best) {
        best = v;
        bestKey = k;
      }
    }
    open.delete(bestKey);
    dist.set(bestKey, best);
    const h = parseHexKey(bestKey);
    const here = walkCost(map, paths, h);
    for (const n of hexNeighbors(h)) {
      const nk = hexKey(n);
      if (dist.has(nk)) continue;
      const c = walkCost(map, paths, n);
      if (c === Infinity) continue;
      const nd = best + (here + c) / 2;
      if (nd < (open.get(nk) ?? Infinity)) open.set(nk, nd);
    }
  }
  if (distanceCache.size >= 16) distanceCache.delete(distanceCache.keys().next().value!);
  distanceCache.set(key, dist);
  return dist;
}

export function logisticsEfficiency(distance: number): number {
  const { cycleS, stepS, refDistance, min, max } = LOGISTICS;
  if (!Number.isFinite(distance)) return min;
  return Math.min(max, Math.max(min, (cycleS + stepS * refDistance) / (cycleS + stepS * distance)));
}

/** Walking distance from a building to the nearest depot. */
export function depotDistance(state: GameState, map: FaceMap, h: Hex): number {
  const dist = depotDistances(state, map);
  const own = dist.get(hexKey(h));
  if (own !== undefined) return own;
  // Unwalkable site (a well in the juice): reached from the shore.
  let best = Infinity;
  for (const n of hexNeighbors(h)) {
    const d = dist.get(hexKey(n));
    if (d !== undefined) best = Math.min(best, d + LOGISTICS.shoreCost);
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Harvest flows

export type HarvestStatus = 'ok' | 'depleted' | 'storageFull' | 'idle';

export interface Harvest {
  resource: ResourceId;
  /** Raw harvest per hour the staff could achieve (before climate). */
  demand: number;
  /** Raw harvest per hour actually taken from the deposits. */
  harvest: number;
  /** Output per hour added to the colony stock (climate included). */
  output: number;
  stock: number;
  cap: number;
  regen: number;
  distance: number;
  efficiency: number;
  status: HarvestStatus;
}

/** Harvest per hour at full staffing, before logistics and climate. */
export function baseHarvest(b: Building, resource: ResourceId): number {
  if (b.type === 'camp') return CAMPS.rates[resource];
  return levelDef(b.type, b.level)?.production?.[resource] ?? 0;
}

export function harvestOf(
  state: GameState,
  map: FaceMap,
  b: Building,
  /** Summed power of the staff (one average kiwi = 1). */
  workers: number,
  storageFull: (id: ResourceId) => boolean,
  /** Regrowth multiplier (mages working there). */
  regenMultiplier = 1,
): Harvest | null {
  const type = harvestedTileType(map, b);
  const dep = type ? DEPOSITS[type] : undefined;
  if (!dep) return null;
  const slots = levelDef(b.type, b.level)?.workerSlots ?? 0;
  const resource = dep.resource;
  const distance = depotDistance(state, map, b);
  const efficiency = logisticsEfficiency(distance);
  const demand = slots > 0 ? (baseHarvest(b, resource) * workers * efficiency) / slots : 0;
  const pool = poolCapacity(map, b.pool?.tiles ?? []);
  const cap = pool.cap;
  const regen = pool.regen * regenMultiplier;
  const stock = Math.min(cap, b.pool?.stock ?? cap);
  let harvest = demand;
  let status: HarvestStatus = 'ok';
  if (demand <= 0) {
    harvest = 0;
    status = 'idle';
  } else if (storageFull(resource)) {
    harvest = 0;
    status = 'storageFull';
  } else if (stock <= EPS && demand > regen) {
    harvest = regen;
    status = 'depleted';
  }
  const climate = FACE_PROFILES[state.face].yieldMultiplier[resource];
  return {
    resource,
    demand,
    harvest,
    output: harvest * climate,
    stock,
    cap,
    regen,
    distance,
    efficiency,
    status,
  };
}

/** Time (ms from now) until this pool runs dry, or Infinity. */
export function timeToDepletion(h: Harvest): number {
  if (h.status !== 'ok' || h.harvest <= h.regen) return Infinity;
  return (h.stock / (h.harvest - h.regen)) * HOUR_MS;
}

// ---------------------------------------------------------------------------------------------
// Views for the UI

export interface TileDepositState extends TileDeposit {
  stock: number;
  /** Building harvesting this tile, if any. */
  owner: BuildingId | null;
}

export function tileDepositState(
  state: GameState,
  map: FaceMap,
  h: Hex,
  at: TimeMs = state.now,
): TileDepositState | null {
  const dep = tileDeposit(getTile(map, h));
  if (!dep) return null;
  const key = hexKey(h);
  for (const b of state.buildings) {
    if (b.pool?.tiles.includes(key))
      return { ...dep, stock: dep.cap * fillRatio(map, b), owner: b.id };
  }
  return { ...dep, stock: freeDepositStock(state, map, key, at), owner: null };
}

/**
 * What a new producer of `type` placed on `h` would harvest (tiles still free for it at the
 * given level), to compare sites before building.
 */
export function catchmentPreview(
  state: GameState,
  map: FaceMap,
  type: Building['type'],
  h: Hex,
  level = 1,
): { tiles: number; cap: number; regen: number } {
  const probe: Building = {
    id: '__probe' as BuildingId,
    type,
    q: h.q,
    r: h.r,
    level,
    richness: 1,
    builtAt: state.now,
  };
  const claims = computeClaims({ ...state, buildings: [...state.buildings, probe] }, map);
  const tiles = claims.get(probe.id) ?? [];
  return { tiles: tiles.length, ...poolCapacity(map, tiles) };
}

/** Fill ratio (0–1) of every deposit that is not full, by hex key (for the terrain tint). */
export function depletedTiles(state: GameState, map: FaceMap): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of state.buildings) {
    if (!b.pool) continue;
    const ratio = fillRatio(map, b);
    if (ratio < 1 - EPS) for (const k of b.pool.tiles) out.set(k, ratio);
  }
  for (const k of Object.keys(state.deposits)) {
    const dep = depositAtKey(map, k);
    if (!dep) continue;
    const ratio = freeDepositStock(state, map, k, state.now) / dep.cap;
    if (ratio < 1 - EPS) out.set(k, ratio);
  }
  return out;
}
