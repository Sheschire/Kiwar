import { galleryRates } from './mines';
import {
  BUILDINGS,
  DEMOLITION,
  isTurret,
  levelDef,
  MAX_LEVEL,
  maxLevelOf,
  RAY_BUILD_SPEEDUP,
  type BuildingLevelDef,
  type BuildingType,
} from '../data/buildings';
import { climateOf } from '../data/biomes';
import { PATHS } from '../data/territory';
import { THREATS, TURRETS } from '../data/threats';
import { LANDING } from '../data/landing';
import { TILES } from '../data/tiles';
import { HATCHING } from '../data/hatching';
import { isVillageLife, standsOverPath } from '../data/needs';
import {
  RESOURCE_IDS,
  emptyResources,
  type ResourceCost,
  type ResourceId,
  type Resources,
} from '../data/resources';
import { hexNeighbors } from '../hex/hex';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId } from '../types/ids';
import type { Building, GameState, QueueItem, Villager } from './state';
import { occupancy } from './footprint';
import { faceMapOf, harvestOf, type Harvest } from './territory';
import { regenBonus, workforce } from './kiwis';
import { seasonEffects } from '../data/cycles';
import { consumption } from './needs';
import { ageOf, techEffects } from './research';
import { seasonOf } from './calendar';
import { meteorRate } from './sky';

export const HOUR_MS = 3_600_000;

export function getBuilding(state: GameState, id: BuildingId | string): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

/** The building covering a tile (chantier 35: any tile of its footprint), if any. */
export function buildingAt(state: GameState, q: number, r: number): Building | undefined {
  const o = occupancy(state).tiles.get(`${q},${r}`);
  return o && !o.site ? state.buildings.find((b) => b.id === o.id) : undefined;
}

/**
 * The construction site holding a tile (a new building's footprint, or the room a cramped
 * building takes for its upgrade), if any.
 */
export function queuedBuildAt(state: GameState, q: number, r: number): QueueItem | undefined {
  const o = occupancy(state).tiles.get(`${q},${r}`);
  return o?.site ? state.queue.find((i) => i.id === o.id) : undefined;
}

/** A building or a site whose tile takes no path (an arch lets one pass under it). */
export function pathBlockedAt(state: GameState, q: number, r: number): boolean {
  const b = buildingAt(state, q, r);
  if (b) return !standsOverPath(b.type);
  const site = queuedBuildAt(state, q, r);
  return site !== undefined && !standsOverPath(site.buildingType);
}

export function nest(state: GameState): Building {
  const n = state.buildings.find((b) => b.type === 'nest');
  if (!n) throw new Error('State has no nest');
  return n;
}

export function nestDef(state: GameState): BuildingLevelDef {
  return levelDef('nest', nest(state).level)!;
}

export function activeItem(state: GameState): QueueItem | undefined {
  const first = state.queue[0];
  return first && first.startedAt !== null ? first : undefined;
}

export function workersOf(state: GameState, buildingId: BuildingId): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'work' && v.job.buildingId === buildingId);
}

export function idleVillagers(state: GameState): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'idle');
}

export function workerSlots(b: Building): number {
  return levelDef(b.type, b.level)?.workerSlots ?? 0;
}

export function totalWorkers(state: GameState): number {
  return state.villagers.filter((v) => v.job.kind === 'work').length;
}

export function population(state: GameState): number {
  return state.villagers.length;
}

export function housing(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + (levelDef(b.type, b.level)?.housing ?? 0), 0);
}

export function capacity(state: GameState): Resources {
  const storage = state.buildings.reduce(
    (sum, b) => sum + (levelDef(b.type, b.level)?.storage ?? 0),
    0,
  );
  const cap = storage * techEffects(state).storage;
  return { pulp: cap, fiber: cap, seeds: cap, juice: cap };
}

// ---------------------------------------------------------------------------------------------
// Chantier 30: warehouse reserves. Once the stock of a resource is full, what the colony keeps
// harvesting goes into the warehouses' reserves, one warehouse after another (oldest first);
// only the player brings it back (`collect`). With every reserve full, harvesting pauses.

/** What a warehouse can keep in reserve, for each resource. */
export function reserveCapOf(state: GameState, b: Building): number {
  return (levelDef(b.type, b.level)?.reserve ?? 0) * techEffects(state).storage;
}

/** What a warehouse keeps in reserve right now. */
export function reserveOf(b: Building): Resources {
  return b.reserve ?? emptyResources();
}

/** Buildings that keep a reserve. */
export function reserveHolders(state: GameState): Building[] {
  return state.buildings.filter((b) => (levelDef(b.type, b.level)?.reserve ?? 0) > 0);
}

/** Every reserve together, and their caps. */
export function reserves(state: GameState): { stock: Resources; cap: Resources } {
  const stock = emptyResources();
  const cap = emptyResources();
  for (const b of reserveHolders(state)) {
    const c = reserveCapOf(state, b);
    for (const id of RESOURCE_IDS) {
      stock[id] += b.reserve?.[id] ?? 0;
      cap[id] += c;
    }
  }
  return { stock, cap };
}

/** Whether `collect` would bring anything back from this warehouse right now. */
export function canCollect(state: GameState, b: Building): boolean {
  if (!b.reserve) return false;
  const cap = capacity(state);
  return RESOURCE_IDS.some((id) => b.reserve![id] > 1e-6 && state.resources[id] < cap[id] - 1e-6);
}

/** The warehouse the overflow of a resource goes to (the first one with room), or null. */
export function reserveTarget(
  state: GameState,
  id: ResourceId,
): { b: Building; room: number } | null {
  for (const b of reserveHolders(state)) {
    const room = reserveCapOf(state, b) - (b.reserve?.[id] ?? 0);
    if (room > 1e-6) return { b, room };
  }
  return null;
}

/**
 * Whether the colony storage of a resource is full (harvesting then pauses): the stock and
 * every reserve. A full stock the kiwis eat faster than it is produced is not full: harvesting
 * goes on and the stock shrinks.
 */
export function storageFullCheck(
  state: GameState,
  /** Production if no storage were full, when the caller already has it. */
  known?: Resources,
): (id: ResourceId) => boolean {
  const cap = capacity(state);
  const eaten = consumption(state);
  let gross: Resources | null = known ?? null;
  return (id) => {
    if (state.resources[id] < cap[id] - 1e-6) return false;
    if (reserveTarget(state, id)) return false;
    if (eaten[id] <= 0) return true;
    gross ??= grossRates(state);
    return gross[id] >= eaten[id];
  };
}

/** Output per hour that needs no workers (the Nest), climate included. */
export function passiveRates(state: GameState, b: Building): Resources {
  const def = levelDef(b.type, b.level);
  const out = emptyResources();
  if (!def?.passiveProduction) return out;
  const climate = climateOf(state.face, state.params.biome);
  for (const id of RESOURCE_IDS) out[id] = (def.passiveProduction[id] ?? 0) * climate[id];
  return out;
}

/** Production per hour if no storage were full. */
function grossRates(state: GameState): Resources {
  const total = emptyResources();
  const never = () => false;
  for (const b of state.buildings) {
    const r = buildingRates(state, b, never);
    for (const id of RESOURCE_IDS) total[id] += r[id];
  }
  // Chantier 15: meteorite craters are posts too.
  for (const m of state.sky.meteors) total[m.resource] += meteorRate(state, m);
  // Chantier 48: the galleries of the depths.
  for (const g of galleryRates(state)) total[g.resource] += g.rate;
  return total;
}

/** Net change of every stock per hour: production minus what the kiwis eat. */
export function netRates(state: GameState): Resources {
  const full = storageFullCheck(state);
  const prod = productionRates(state, full);
  const eaten = consumption(state);
  const out = emptyResources();
  for (const id of RESOURCE_IDS) {
    if (full(id)) continue;
    const net = prod[id] - eaten[id];
    out[id] = net < 0 && state.resources[id] <= 0 ? 0 : net;
  }
  return out;
}

/** Harvest details of a producer (deposit, logistics, status), or null for other buildings. */
export function buildingHarvest(
  state: GameState,
  b: Building,
  full = storageFullCheck(state),
): Harvest | null {
  const workers = workersOf(state, b.id);
  return harvestOf(
    state,
    faceMapOf(state),
    b,
    workforce(state, b, workers),
    full,
    regenBonus(workers),
  );
}

/** Production of one building per hour, with its current staff, deposits and logistics. */
export function buildingRates(
  state: GameState,
  b: Building,
  full = storageFullCheck(state),
): Resources {
  const def = levelDef(b.type, b.level);
  const out = emptyResources();
  if (!def) return out;
  const climate = climateOf(state.face, state.params.biome);
  for (const id of RESOURCE_IDS) out[id] = (def.passiveProduction?.[id] ?? 0) * climate[id];
  const h = buildingHarvest(state, b, full);
  if (h) out[h.resource] += h.output;
  return out;
}

/** Total production per hour. */
export function productionRates(state: GameState, full = storageFullCheck(state)): Resources {
  const total = emptyResources();
  for (const b of state.buildings) {
    const r = buildingRates(state, b, full);
    for (const id of RESOURCE_IDS) total[id] += r[id];
  }
  for (const m of state.sky.meteors)
    if (!full(m.resource)) total[m.resource] += meteorRate(state, m);
  for (const g of galleryRates(state)) if (!full(g.resource)) total[g.resource] += g.rate;
  return total;
}

export function canAfford(resources: Resources, cost: ResourceCost): boolean {
  return RESOURCE_IDS.every((id) => resources[id] + 1e-9 >= (cost[id] ?? 0));
}

export function scaleCost(cost: ResourceCost, k: number): ResourceCost {
  const out: ResourceCost = {};
  for (const id of RESOURCE_IDS) {
    const v = cost[id];
    if (v) out[id] = Math.round((v * k) / 5) * 5 || 5;
  }
  return out;
}

/** Number of copies of a type that exist or are ordered (Nest excluded from the cap). */
export function copiesOf(state: GameState, type: BuildingType): number {
  return (
    state.buildings.filter((b) => b.type === type).length +
    state.queue.filter((i) => i.kind === 'build' && i.buildingType === type).length
  );
}

/** Max number of path tiles (grows with the Nest). */
export function pathLimit(state: GameState): number {
  const level = nest(state).level;
  return (
    PATHS.base +
    PATHS.perNestLevel * Math.min(level, 3) +
    PATHS.perAgeLevel * Math.max(0, level - 3)
  );
}

/** Buildings counted against the Nest cap (camps and turrets are outside it). */
export function buildingCount(state: GameState): number {
  const counted = (t: BuildingType) =>
    t !== 'nest' &&
    t !== 'camp' &&
    t !== 'monument' &&
    t !== 'lab' &&
    t !== 'townHall' &&
    !isVillageLife(t) &&
    t !== 'cabaret' &&
    t !== 'fireworks' &&
    !isTurret(t);
  return (
    state.buildings.filter((b) => counted(b.type)).length +
    state.queue.filter((i) => i.kind === 'build' && counted(i.buildingType)).length
  );
}

/** Turrets built or ordered (both models). */
export function turretCount(state: GameState): number {
  return (
    state.buildings.filter((b) => isTurret(b.type)).length +
    state.queue.filter((i) => i.kind === 'build' && isTurret(i.buildingType)).length
  );
}

export function turretLimit(state: GameState): number {
  const max = TURRETS.max;
  return max[Math.min(nest(state).level, max.length - 1)] ?? 0;
}

/** A rampart tile: skin next to land the kiwis can walk on (turrets stand there). */
export function isRampart(map: FaceMap, q: number, r: number): boolean {
  if (getTile(map, { q, r })?.type !== 'skin') return false;
  return hexNeighbors({ q, r }).some((h) => {
    const t = getTile(map, h);
    return !!t && TILES[t.type].walkable;
  });
}

export function buildCost(state: GameState, type: BuildingType): ResourceCost {
  const def = BUILDINGS[type];
  return scaleCost(def.levels[0]!.cost, def.copyGrowth ** copiesOf(state, type));
}

export function upgradeCost(type: BuildingType, targetLevel: number): ResourceCost {
  return levelDef(type, targetLevel)?.cost ?? {};
}

/**
 * What demolishing a building gives back: a share of its build cost (as paid for this copy, i.e.
 * with the copies that came before it) plus its upgrades. Camps are free, so they refund nothing.
 */
export function demolitionRefund(state: GameState, b: Building): ResourceCost {
  const def = BUILDINGS[b.type];
  const copies = state.buildings.filter((x) => x.type === b.type).length;
  const invested = emptyResources();
  const build = scaleCost(def.levels[0]!.cost, def.copyGrowth ** Math.max(0, copies - 1));
  const parts = [build, ...def.levels.slice(1, b.level).map((l) => l.cost)];
  for (const cost of parts) for (const id of RESOURCE_IDS) invested[id] += cost[id] ?? 0;
  const out: ResourceCost = {};
  for (const id of RESOURCE_IDS) {
    const v = Math.round((invested[id] * DEMOLITION.refund) / 5) * 5;
    if (v > 0) out[id] = v;
  }
  return out;
}

export interface DemolitionPreview {
  refund: ResourceCost;
  /** Kiwis working there (they go back to work elsewhere, or idle). */
  workers: number;
  storageLost: number;
  housingLost: number;
}

export function demolitionPreview(state: GameState, b: Building): DemolitionPreview {
  const def = levelDef(b.type, b.level);
  return {
    refund: demolitionRefund(state, b),
    workers: workersOf(state, b.id).length,
    storageLost: def?.storage ?? 0,
    housingLost: def?.housing ?? 0,
  };
}

/** True when the tile touches (or is) a ray. */
export function nearRay(map: FaceMap, q: number, r: number): boolean {
  const tiles = [{ q, r }, ...hexNeighbors({ q, r })];
  return tiles.some((h) => getTile(map, h)?.type === 'ray');
}

export function constructionDuration(
  state: GameState,
  type: BuildingType,
  level: number,
  isNewCopy: boolean,
  rayBonus: boolean,
): number {
  const def = BUILDINGS[type];
  const base = levelDef(type, level)?.durationMs ?? 0;
  const copies = isNewCopy ? def.copyGrowth ** copiesOf(state, type) : 1;
  const speed = (rayBonus ? RAY_BUILD_SPEEDUP : 1) * techEffects(state).build;
  return Math.max(1000, Math.round((base * Math.sqrt(copies) * speed) / 1000) * 1000);
}

/** The upgrade or repair queued for a building, if any. */
export function pendingUpgrade(state: GameState, buildingId: BuildingId): QueueItem | undefined {
  return state.queue.find((i) => i.kind !== 'build' && i.buildingId === buildingId);
}

/**
 * Price of mending a damaged building: a share of its current level. Chantier 40: a launchpad
 * whose ship was lost rebuilds the ship of that generation.
 */
export function repairCost(b: Building): ResourceCost {
  if (b.shipLost) return scaleCost(LANDING.rebuild.cost, LANDING.rebuild.ship[b.shipLost]);
  return scaleCost(levelDef(b.type, b.level)?.cost ?? {}, THREATS.repairCost);
}

export function repairDuration(b: Building): number {
  if (b.shipLost) return LANDING.rebuild.hours[b.shipLost] * 3_600_000;
  const base = levelDef(b.type, b.level)?.durationMs ?? 0;
  return Math.max(5000, Math.round((base * THREATS.repairTime) / 1000) * 1000);
}

export function isMaxLevel(b: Building): boolean {
  return b.level >= Math.min(MAX_LEVEL, maxLevelOf(b.type));
}

/** Highest level a building type can reach in the colony's current age. */
export function maxLevelNow(state: GameState, type: BuildingType): number {
  const age = ageOf(state);
  const levels = BUILDINGS[type].levels;
  let max = 0;
  while (max < levels.length && (levels[max]!.requiresAge ?? 0) <= age) max++;
  return max;
}

export function eggCost(state: GameState): ResourceCost {
  return HATCHING.cost(population(state));
}

/** Hatching time (shorter in spring). */
export function eggDuration(state: GameState): number {
  const k = seasonEffects(seasonOf(state), state.params.biome).hatching;
  return Math.round(HATCHING.durationMs(population(state)) * k);
}

export function canHatch(state: GameState): boolean {
  return state.egg === null && population(state) < housing(state);
}
