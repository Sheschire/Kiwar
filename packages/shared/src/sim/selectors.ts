import {
  BUILDINGS,
  DEMOLITION,
  levelDef,
  MAX_LEVEL,
  maxLevelOf,
  RAY_BUILD_SPEEDUP,
  type BuildingLevelDef,
  type BuildingType,
} from '../data/buildings';
import { climateOf } from '../data/biomes';
import { PATHS } from '../data/territory';
import { THREATS } from '../data/threats';
import { HATCHING } from '../data/hatching';
import { OBJECTIVES, type ObjectiveDef } from '../data/objectives';
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
import { faceMapOf, harvestOf, type Harvest } from './territory';
import { regenBonus, workforce } from './kiwis';
import { seasonEffects } from '../data/cycles';
import { consumption } from './needs';
import { seasonOf } from './calendar';

export const HOUR_MS = 3_600_000;

export function getBuilding(state: GameState, id: BuildingId | string): Building | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function buildingAt(state: GameState, q: number, r: number): Building | undefined {
  return state.buildings.find((b) => b.q === q && b.r === r);
}

export function queuedBuildAt(state: GameState, q: number, r: number): QueueItem | undefined {
  return state.queue.find((i) => i.kind === 'build' && i.q === q && i.r === r);
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
  return { pulp: storage, fiber: storage, seeds: storage, juice: storage };
}

/**
 * Whether the colony storage of a resource is full (harvesting then pauses). A full stock the
 * kiwis eat faster than it is produced is not full: harvesting goes on and the stock shrinks.
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
  return total;
}

/** Net change of every stock per hour: production minus what the kiwis eat. */
export function netRates(state: GameState): Resources {
  const full = storageFullCheck(state);
  const prod = productionRates(state);
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
export function productionRates(state: GameState): Resources {
  const total = emptyResources();
  const full = storageFullCheck(state);
  for (const b of state.buildings) {
    const r = buildingRates(state, b, full);
    for (const id of RESOURCE_IDS) total[id] += r[id];
  }
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
  return PATHS.base + PATHS.perNestLevel * nest(state).level;
}

/** Buildings counted against the Nest cap (camps are outside it). */
export function buildingCount(state: GameState): number {
  return (
    state.buildings.filter((b) => b.type !== 'nest' && b.type !== 'camp').length +
    state.queue.filter((i) => i.kind === 'build').length
  );
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
  const speed = rayBonus ? RAY_BUILD_SPEEDUP : 1;
  return Math.max(1000, Math.round((base * Math.sqrt(copies) * speed) / 1000) * 1000);
}

/** The upgrade or repair queued for a building, if any. */
export function pendingUpgrade(state: GameState, buildingId: BuildingId): QueueItem | undefined {
  return state.queue.find((i) => i.kind !== 'build' && i.buildingId === buildingId);
}

/** Price of mending a damaged building: a share of its current level. */
export function repairCost(b: Building): ResourceCost {
  return scaleCost(levelDef(b.type, b.level)?.cost ?? {}, THREATS.repairCost);
}

export function repairDuration(b: Building): number {
  const base = levelDef(b.type, b.level)?.durationMs ?? 0;
  return Math.max(5000, Math.round((base * THREATS.repairTime) / 1000) * 1000);
}

export function isMaxLevel(b: Building): boolean {
  return b.level >= Math.min(MAX_LEVEL, maxLevelOf(b.type));
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

export function currentObjective(state: GameState): ObjectiveDef | undefined {
  return OBJECTIVES[state.objectiveIndex];
}

export function objectiveProgress(
  state: GameState,
  def: ObjectiveDef,
): { current: number; target: number } {
  const c = def.condition;
  switch (c.kind) {
    case 'building': {
      const n = state.buildings.filter(
        (b) => b.type === c.building && b.level >= c.minLevel,
      ).length;
      return { current: Math.min(n, c.count), target: c.count };
    }
    case 'population':
      return { current: Math.min(population(state), c.count), target: c.count };
    case 'workers':
      return { current: Math.min(totalWorkers(state), c.count), target: c.count };
  }
}

export function isObjectiveComplete(state: GameState, def: ObjectiveDef): boolean {
  const p = objectiveProgress(state, def);
  return p.current >= p.target;
}
