import { nightWork, techEffects } from './research';
import { levelDef, type BuildingType } from '../data/buildings';
import { BIOMES, climateOf, type BiomeId } from '../data/biomes';
import type { ResourceId } from '../data/resources';
import {
  BANKS,
  CAMPS,
  CATCHMENT_RADIUS,
  DEPOSITS,
  HARVESTS,
  LOGISTICS,
  PATHS,
} from '../data/territory';
import { TILES, type TileType } from '../data/tiles';
import { hexDisk, hexKey, hexNeighbors, parseHexKey, type Hex, type HexKey } from '../hex/hex';
import { generateFace, getTile, type FaceMap, type Tile } from '../worldgen/generateFace';
import type { BuildingId, TimeMs } from '../types/ids';
import type { Building, GameState } from './state';
import { coveredKeys, occupancy } from './footprint';
import { seasonEffects, seasonHarvest, seasonRegen, type Season } from '../data/cycles';
import { calendarAt, isNight, seasonOf } from './calendar';
import { TITAN, type TerraformTile } from '../data/titan';
import { CANALS } from '../data/canals';

const HOUR_MS = 3_600_000;
const EPS = 1e-6;

// ---------------------------------------------------------------------------------------------
// Face map cache: the simulation needs the map (deposits, walking costs). It is regenerated
// from the seed, deterministically, and kept for the few faces a process works with.

const mapCache = new Map<string, FaceMap>();

type MapSource = Pick<GameState, 'seed' | 'face' | 'params'> & {
  terraform?: Readonly<Record<string, TerraformTile>>;
};

const terraformKeys = new WeakMap<object, { n: number; key: string }>();

/** Stable signature of the reshaped tiles (empty when none: the generated map). */
export function terraformKey(state: {
  terraform?: Readonly<Record<string, TerraformTile>>;
}): string {
  const t = state.terraform;
  if (!t) return '';
  // Asked many times per tick: cached on the object (the simulation replaces it when a tile is
  // reshaped; the count catches a change made in place).
  const n = Object.keys(t).length;
  if (n === 0) return '';
  const cached = terraformKeys.get(t);
  if (cached && cached.n === n) return cached.key;
  const key = Object.keys(t)
    .sort()
    .map((k) => `${k}=${t[k]}`)
    .join(';');
  terraformKeys.set(t, { n, key });
  return key;
}

const pathKeys = new WeakMap<readonly string[], { n: number; key: string }>();

/**
 * Stable signature of a list of paths (sorted). Cached on the array: a state's paths are
 * replaced or only appended to, so the length tells when it went stale.
 */
export function pathsKey(paths: readonly string[]): string {
  const cached = pathKeys.get(paths);
  if (cached && cached.n === paths.length) return cached.key;
  const key = [...paths].sort().join(';');
  pathKeys.set(paths, { n: paths.length, key });
  return key;
}

/**
 * The face of a colony: generated from the seed, with the tiles its Kikiwiwis reshaped
 * (chantier 08). The single source of the map for the simulation, the server and the client.
 */
export function faceMapOf(state: MapSource): FaceMap {
  const base = `${state.seed}|${state.face}|${state.params.radius}|${state.params.biome}`;
  const tf = terraformKey(state);
  const key = tf ? `${base}|${tf}` : base;
  let map = mapCache.get(key);
  if (!map) {
    map = tf
      ? applyTerraform(
          faceMapOf({ seed: state.seed, face: state.face, params: state.params }),
          state.terraform!,
        )
      : generateFace(state.seed, state.face, state.params);
    if (mapCache.size >= 12) mapCache.delete(mapCache.keys().next().value!);
    mapCache.set(key, map);
  }
  return map;
}

/**
 * The generated map with reshaped tiles: a spring is juice, a terrace no longer floods. A canal
 * (chantier 45) is juice too, and in a flooding biome the flesh around it floods like a river's.
 */
export function applyTerraform(
  base: FaceMap,
  terraform: Readonly<Record<string, TerraformTile>>,
): FaceMap {
  const floods = canalFloods(base, terraform);
  const tiles = base.tiles.map((t) => {
    const key = hexKey(t);
    const kind = terraform[key];
    if (!kind) return floods.has(key) ? { ...t, flood: true as const } : t;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { flood, ...dry } = t;
    if (kind === 'spring')
      return { ...dry, type: 'juice' as const, height: TILES.juice.baseHeight };
    if (kind === 'canal')
      return {
        ...dry,
        type: 'juice' as const,
        height: TILES.juice.baseHeight,
        canal: true as const,
      };
    if (kind === 'terrace') return { ...dry, height: t.height + TITAN.terraceRise };
    return {
      ...t,
      type: 'flesh' as const,
      height: Math.max(TILES.flesh.baseHeight, t.height * 0.85),
    };
  });
  return { ...base, tiles };
}

/**
 * Flesh tiles a set of canals makes floodable (chantier 45): like the generator's rule (flesh
 * next to juice, off the heart), in a biome that floods, unless a titan raised them.
 */
export function canalFloods(
  base: FaceMap,
  terraform: Readonly<Record<string, TerraformTile>>,
  extra: readonly string[] = [],
): Set<string> {
  const out = new Set<string>();
  if (BIOMES[base.params.biome].floods === null) return out;
  const canals = Object.keys(terraform).filter((k) => terraform[k] === 'canal');
  for (const k of [...canals, ...extra])
    for (const n of hexNeighbors(parseHexKey(k))) {
      const nk = hexKey(n);
      const t = getTile(base, n);
      if (!t || t.type !== 'flesh' || t.flood || t.rho >= 0.92 || terraform[nk]) continue;
      if (extra.includes(nk)) continue;
      out.add(nk);
    }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Deposits

export interface TileDeposit {
  resource: ResourceId;
  /** Full stock and regrowth per hour, richness included. */
  cap: number;
  regen: number;
}

/** Deposit of a tile alone; `bank`: it lies on a fertile bank (`isBank`, chantier 45). */
export function tileDeposit(
  tile: Tile | undefined,
  biome: BiomeId = 'classic',
  bank = false,
): TileDeposit | null {
  const def = tile ? DEPOSITS[tile.type] : undefined;
  if (!tile || !def) return null;
  const { stock, regen } = BIOMES[biome].deposits;
  const canal = tile.canal ? CANALS.deposit : 1;
  return {
    resource: def.resource,
    cap: def.stock * tile.richness * (stock[def.resource] ?? 1) * canal,
    regen:
      def.regen * tile.richness * (regen[def.resource] ?? 1) * (bank ? BANKS.regen : 1) * canal,
  };
}

/** Chantier 45: a flesh or grove tile next to juice (river, spring or canal) is a fertile bank. */
export function isBank(map: FaceMap, tile: Tile | undefined): boolean {
  if (!tile || !BANKS.tiles.includes(tile.type)) return false;
  return hexNeighbors(tile).some((n) => getTile(map, n)?.type === 'juice');
}

/** Deposit of a tile on its map (fertile banks included). */
export function mapTileDeposit(map: FaceMap, tile: Tile | undefined): TileDeposit | null {
  return tileDeposit(tile, map.params.biome, isBank(map, tile));
}

const depositCache = new WeakMap<FaceMap, Map<string, TileDeposit | null>>();

/** Deposit of a tile by its key (cached per map: maps never change once made). */
function depositAtKey(map: FaceMap, key: string): TileDeposit | null {
  let deposits = depositCache.get(map);
  if (!deposits) {
    deposits = new Map();
    depositCache.set(map, deposits);
  }
  let dep = deposits.get(key);
  if (dep === undefined) {
    const i = map.index.get(key as HexKey);
    dep = mapTileDeposit(map, i === undefined ? undefined : map.tiles[i]);
    deposits.set(key, dep);
  }
  return dep;
}

/** A floodable tile is under water during its biome's flood season (lagoons in spring). */
export function isFlooded(tile: Tile | undefined, biome: BiomeId, season: Season): boolean {
  return !!tile?.flood && BIOMES[biome].floods === season;
}

/**
 * Current stock of a deposit nobody harvests (it regrows on its own up to full, at the pace of
 * the season it was last seen in: `rebaseFreeDeposits` runs at every season change).
 */
export function freeDepositStock(state: GameState, map: FaceMap, key: string, at: TimeMs): number {
  const dep = depositAtKey(map, key);
  if (!dep) return 0;
  const d = state.deposits[key];
  if (!d) return dep.cap;
  const season = calendarAt(state.calendarStart, d.at).season;
  const regen = dep.regen * seasonRegen(season, dep.resource, map.params.biome);
  return Math.min(dep.cap, d.stock + (regen * Math.max(0, at - d.at)) / HOUR_MS);
}

/** Season change: free deposits record their stock, then regrow at the new season's pace. */
export function rebaseFreeDeposits(state: GameState, map: FaceMap, at: TimeMs): void {
  for (const k of Object.keys(state.deposits)) {
    const dep = depositAtKey(map, k);
    const stock = freeDepositStock(state, map, k, at);
    if (!dep || stock >= dep.cap - EPS) delete state.deposits[k];
    else state.deposits[k] = { stock, at };
  }
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
  const season = seasonOf(state);
  // Chantier 35: every tile of a footprint is built over.
  const occupied = coveredKeys(state);
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
      const tile = getTile(map, h);
      if (tile?.type !== type || isFlooded(tile, map.params.biome, season)) continue;
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

/**
 * Walking cost of a tile type (Infinity if kiwis cannot walk there). Paths are kept clear of
 * snow; elsewhere winter slows kiwis down and buries the groves.
 */
export function tileWalkCost(
  type: TileType,
  path: boolean,
  season: Season,
  biome: BiomeId = 'classic',
  flooded = false,
): number {
  const def = TILES[type];
  if (!def.walkable || flooded) return Infinity;
  if (path) return Math.min(PATHS.walkCost, def.walkCost);
  const fx = seasonEffects(season, biome);
  if (fx.blocked.includes(type)) return Infinity;
  return def.walkCost * fx.walk;
}

/** Walking cost of a tile (Infinity if kiwis cannot walk there). */
export function walkCost(
  map: FaceMap,
  paths: ReadonlySet<string>,
  h: Hex,
  season: Season = 'spring',
  blocked?: ReadonlySet<string>,
): number {
  const tile = getTile(map, h);
  if (!tile) return Infinity;
  // Chantier 35: kiwis walk around big buildings (they go in by the anchor).
  if (blocked?.has(hexKey(h))) return Infinity;
  const biome = map.params.biome;
  return tileWalkCost(
    tile.type,
    paths.has(hexKey(h)),
    season,
    biome,
    isFlooded(tile, biome, season),
  );
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
  return walkDistances(
    state,
    map,
    state.buildings.filter(isDepot).map((b) => hexKey(b)),
  );
}

/**
 * Walking distance from every tile to the nearest of `sources` (hex keys), with the current
 * season's walking costs. Memoized on the sources, the paths and the season.
 */
export function walkDistances(
  state: GameState,
  map: FaceMap,
  sources: readonly string[],
): Map<string, number> {
  const season = seasonOf(state);
  const occ = occupancy(state);
  const key = `${state.seed}|${state.face}|${state.params.radius}|${state.params.biome}|${terraformKey(state)}|${season}|${sources.join(';')}|${pathsKey(state.paths)}|${occ.blockedKey}`;
  const cached = distanceCache.get(key);
  if (cached) return cached;
  const paths = pathSet(state);
  const dist = new Map<string, number>();
  const open = new Map<string, number>();
  for (const d of sources) open.set(d, 0);
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
    const here = walkCost(map, paths, h, season);
    for (const n of hexNeighbors(h)) {
      const nk = hexKey(n);
      if (dist.has(nk)) continue;
      const c = walkCost(map, paths, n, season, occ.blocked);
      if (c === Infinity) continue;
      const nd = best + (here + c) / 2;
      if (nd < (open.get(nk) ?? Infinity)) open.set(nk, nd);
    }
  }
  if (distanceCache.size >= 64) distanceCache.delete(distanceCache.keys().next().value!);
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
  return distanceIn(depotDistances(state, map), h);
}

/** Distance of a building's tile in a distance map (unwalkable sites are reached from shore). */
export function distanceIn(dist: Map<string, number>, h: Hex): number {
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

/** The depot a building's kiwis carry to (the nearest by walk), and the walk. */
export function nearestDepotOf(
  state: GameState,
  map: FaceMap,
  h: Hex,
): { building: Building; distance: number } | null {
  let best: { building: Building; distance: number } | null = null;
  for (const b of state.buildings) {
    if (!isDepot(b)) continue;
    const distance = distanceIn(walkDistances(state, map, [hexKey(b)]), h);
    if (!best || distance < best.distance) best = { building: b, distance };
  }
  return best;
}

export interface LogisticsChange {
  buildingId: BuildingId;
  type: BuildingType;
  before: number;
  after: number;
}

/**
 * Chantier 12: how a path stroke (tiles added, or erased) changes the logistics efficiency of
 * every producer, biggest changes first. Same distances as the harvest.
 */
export function pathLogisticsChanges(
  state: GameState,
  map: FaceMap,
  keys: readonly string[],
  erase: boolean,
): LogisticsChange[] {
  const paths = new Set(state.paths);
  for (const k of keys) {
    if (erase) paths.delete(k);
    else paths.add(k);
  }
  const after: GameState = { ...state, paths: [...paths] };
  const out: LogisticsChange[] = [];
  for (const b of state.buildings) {
    if (!harvestedTileType(map, b)) continue;
    const before = logisticsEfficiency(depotDistance(state, map, b));
    const next = logisticsEfficiency(depotDistance(after, map, b));
    if (Math.abs(next - before) >= 0.005)
      out.push({ buildingId: b.id, type: b.type, before, after: next });
  }
  return out.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
}

// ---------------------------------------------------------------------------------------------
// Harvest flows

export type HarvestStatus = 'ok' | 'depleted' | 'storageFull' | 'idle' | 'flooded';

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
  /** Time of day × season multiplier on the work (night, autumn pulp, frozen wells). */
  cycle: number;
  status: HarvestStatus;
}

/** Work multiplier of the hour and the season for a resource (night, season harvest). */
export function cycleHarvest(state: GameState, resource: ResourceId): number {
  const work = isNight(state) ? nightWork(state) : 1;
  return work * seasonHarvest(seasonOf(state), resource, state.params.biome);
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
  const cycle = cycleHarvest(state, resource);
  const tech = techEffects(state).harvest[resource];
  const demand =
    slots > 0 ? (baseHarvest(b, resource) * workers * efficiency * cycle * tech) / slots : 0;
  const pool = poolCapacity(map, b.pool?.tiles ?? []);
  const cap = pool.cap;
  const season = seasonOf(state);
  const regen = pool.regen * regenMultiplier * seasonRegen(season, resource, map.params.biome);
  const stock = Math.min(cap, b.pool?.stock ?? cap);
  let harvest = demand;
  let status: HarvestStatus = 'ok';
  if (isFlooded(getTile(map, b), map.params.biome, season)) {
    harvest = 0;
    status = 'flooded';
  } else if (demand <= 0) {
    harvest = 0;
    status = 'idle';
  } else if (storageFull(resource)) {
    harvest = 0;
    status = 'storageFull';
  } else if (stock <= EPS && demand > regen) {
    harvest = regen;
    status = 'depleted';
  }
  const climate = climateOf(state.face, state.params.biome)[resource];
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
    cycle,
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
  const key = hexKey(h);
  const dep = depositAtKey(map, key);
  if (!dep) return null;
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

/** Chantier 16: a deposit tile in reach of a planned producer that another building keeps. */
export interface TakenTile {
  key: string;
  owner: BuildingId;
  /** `claimed`: harvested by an older producer; `built`: a building stands on it. */
  reason: 'claimed' | 'built';
}

/**
 * Chantier 16: the catchment a producer of `type` placed on `h` would have — the deposit tiles
 * it would harvest (same rules as `computeClaims`), the ones in reach that other buildings
 * keep, and the deposit it would start with.
 */
export function catchmentPlan(
  state: GameState,
  map: FaceMap,
  type: Building['type'],
  h: Hex,
  level = 1,
): { tiles: string[]; taken: TakenTile[]; cap: number; regen: number } {
  const probe: Building = {
    id: '__probe' as BuildingId,
    type,
    q: h.q,
    r: h.r,
    level,
    richness: 1,
    builtAt: state.now,
  };
  const tileType = harvestedTileType(map, probe);
  if (!tileType) return { tiles: [], taken: [], cap: 0, regen: 0 };
  const claims = computeClaims({ ...state, buildings: [...state.buildings, probe] }, map);
  const tiles = claims.get(probe.id) ?? [];
  const own = new Set(tiles);
  const claimedBy = new Map<string, BuildingId>();
  for (const [id, keys] of claims) if (id !== probe.id) for (const k of keys) claimedBy.set(k, id);
  const standing = new Map<string, BuildingId>();
  for (const [k, o] of occupancy(state).tiles) if (!o.site) standing.set(k, o.id as BuildingId);
  const season = seasonOf(state);
  const taken: TakenTile[] = [];
  for (const x of hexDisk(h, catchmentRadius(probe))) {
    const key = hexKey(x);
    if (own.has(key)) continue;
    const tile = getTile(map, x);
    if (tile?.type !== tileType || isFlooded(tile, map.params.biome, season)) continue;
    const claimer = claimedBy.get(key);
    const builder = standing.get(key);
    if (claimer) taken.push({ key, owner: claimer, reason: 'claimed' });
    else if (builder) taken.push({ key, owner: builder, reason: 'built' });
  }
  return { tiles, taken, ...poolCapacity(map, tiles) };
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
