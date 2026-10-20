import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { BuildingId, VillagerId } from '../types/ids';
import { buildingResource, workerPower } from './kiwis';
import { researchPerHour, researchPower } from './research';
import {
  buildingHarvest,
  buildingRates,
  storageFullCheck,
  workerSlots,
  workersOf,
} from './selectors';
import { calendarOf } from './calendar';
import { isManualWorkplace } from '../data/buildings';
import type { Building, GameState, Villager } from './state';

/** What a workplace produces: a resource, or research points (the Library). */
export type PostKind = ResourceId | 'research';

/** What a building's workers produce (null: not a workplace). */
export function postKind(state: GameState, b: Building): PostKind | null {
  if (workerSlots(b) === 0) return null;
  if (b.type === 'library') return 'research';
  return buildingResource(state, b);
}

/** How much a kiwi brings to a kind of post (1 for an average newborn). */
export function kindPower(v: Villager, kind: PostKind): number {
  return kind === 'research' ? researchPower(v) : workerPower(v, kind);
}

/** Average power of the colony's kiwis at a kind of post (Kikiwiwis aside). */
export function averagePower(state: GameState, kind: PostKind): number {
  const kiwis = state.villagers.filter((v) => !v.kikiwiwi);
  if (kiwis.length === 0) return 1;
  return kiwis.reduce((sum, v) => sum + kindPower(v, kind), 0) / kiwis.length;
}

/**
 * Affinity of a kiwi with a kind of post: its power there compared with the colony's average
 * (above 1: better than most at this job).
 */
export function affinity(state: GameState, v: Villager, kind: PostKind): number {
  return kindPower(v, kind) / averagePower(state, kind);
}

/** The worker who would step aside for a newcomer in a full building: the least skilled. */
export function weakestWorker(
  state: GameState,
  b: Building,
  except?: VillagerId,
): Villager | undefined {
  const kind = postKind(state, b);
  const workers = workersOf(state, b.id).filter((v) => v.id !== except);
  if (!kind) return workers[workers.length - 1];
  let weakest: { v: Villager; p: number } | undefined;
  for (const v of workers) {
    const p = kindPower(v, kind);
    if (!weakest || p < weakest.p) weakest = { v, p };
  }
  return weakest?.v;
}

/** One workplace as seen from a kiwi's sheet ("Assign to…"). */
export interface KiwiPost {
  buildingId: BuildingId;
  type: BuildingType;
  level: number;
  kind: PostKind;
  workers: number;
  slots: number;
  /** This kiwi's power at this post. */
  power: number;
  /** Its power compared with the colony's average there. */
  affinity: number;
  /** The kiwi already works here. */
  current: boolean;
  /** Full: the kiwi would swap places with this worker. */
  swapWith: { id: VillagerId; name: string } | null;
  /** The post where this kiwi's affinity is the best. */
  ideal: boolean;
}

/** Every workplace this kiwi could take, best affinity first (same order on ties). */
export function kiwiPosts(state: GameState, v: Villager): KiwiPost[] {
  const posts: KiwiPost[] = [];
  const average = new Map<PostKind, number>();
  for (const b of state.buildings) {
    const kind = postKind(state, b);
    if (!kind) continue;
    if (!average.has(kind)) average.set(kind, averagePower(state, kind));
    const workers = workersOf(state, b.id);
    const slots = workerSlots(b);
    const current = workers.some((x) => x.id === v.id);
    const swap = !current && workers.length >= slots ? weakestWorker(state, b) : undefined;
    const power = kindPower(v, kind);
    posts.push({
      buildingId: b.id,
      type: b.type,
      level: b.level,
      kind,
      workers: workers.length,
      slots,
      power,
      affinity: power / average.get(kind)!,
      current,
      swapWith: swap ? { id: swap.id, name: swap.name } : null,
      ideal: false,
    });
  }
  posts.sort((a, b) => b.affinity - a.affinity);
  if (posts[0]) posts[0].ideal = true;
  return posts;
}

/** Status of a whole line of the job board. */
export type BoardStatus = 'ok' | 'full' | 'depleted' | 'night' | 'empty';

/** One line of the job board: every workplace producing the same thing. */
export interface BoardRow {
  kind: PostKind;
  workers: number;
  slots: number;
  /** Output per hour of these workplaces (research points for the Library). */
  perHour: number;
  status: BoardStatus;
  buildings: { building: Building; workers: Villager[]; slots: number }[];
}

export interface JobBoard {
  rows: BoardRow[];
  /** Kiwis without a post (idle, Kikiwiwis aside). */
  unassigned: Villager[];
  /** Free places in workplaces the kiwis join on their own (the Library aside). */
  freeSlots: number;
  guards: Villager[];
  builders: Villager[];
}

const KIND_ORDER: PostKind[] = ['pulp', 'fiber', 'seeds', 'juice', 'research'];

/** Head counts only (cheap, for the top bar): workers and places by kind, kiwis without a post. */
export function staffing(state: GameState): {
  byKind: Partial<Record<PostKind, { workers: number; slots: number }>>;
  unassigned: number;
  freeSlots: number;
} {
  const byKind: Partial<Record<PostKind, { workers: number; slots: number }>> = {};
  let freeSlots = 0;
  for (const b of state.buildings) {
    const kind = postKind(state, b);
    if (!kind) continue;
    const workers = workersOf(state, b.id).length;
    const slots = workerSlots(b);
    if (!isManualWorkplace(b.type)) freeSlots += Math.max(0, slots - workers);
    const row = (byKind[kind] ??= { workers: 0, slots: 0 });
    row.workers += workers;
    row.slots += slots;
  }
  const unassigned = state.villagers.filter((v) => v.job.kind === 'idle' && !v.kikiwiwi).length;
  return { byKind, unassigned, freeSlots };
}

/** Who works where, by resource: the "Posts" tab and the top bar's "N without a post". */
export function jobBoard(state: GameState): JobBoard {
  const full = storageFullCheck(state);
  const night = calendarOf(state).night;
  const rows = new Map<PostKind, BoardRow>();
  let freeSlots = 0;
  for (const b of state.buildings) {
    const kind = postKind(state, b);
    if (!kind) continue;
    const workers = workersOf(state, b.id);
    const slots = workerSlots(b);
    if (!isManualWorkplace(b.type)) freeSlots += Math.max(0, slots - workers.length);
    let row = rows.get(kind);
    if (!row) {
      row = { kind, workers: 0, slots: 0, perHour: 0, status: 'ok', buildings: [] };
      rows.set(kind, row);
    }
    row.workers += workers.length;
    row.slots += slots;
    row.buildings.push({ building: b, workers, slots });
    if (kind !== 'research') row.perHour += buildingRates(state, b, full)[kind];
  }
  for (const row of rows.values()) {
    if (row.kind === 'research') row.perHour = researchPerHour(state);
    const harvests = row.buildings.map((x) => buildingHarvest(state, x.building, full));
    if (row.kind !== 'research' && full(row.kind)) row.status = 'full';
    else if (row.workers === 0) row.status = 'empty';
    else if (harvests.length > 0 && harvests.every((h) => h?.status === 'depleted'))
      row.status = 'depleted';
    else if (night && row.kind !== 'research') row.status = 'night';
  }
  return {
    rows: KIND_ORDER.filter((k) => rows.has(k)).map((k) => rows.get(k)!),
    unassigned: state.villagers.filter((v) => v.job.kind === 'idle' && !v.kikiwiwi),
    freeSlots,
    guards: state.villagers.filter((v) => v.job.kind === 'guard'),
    builders: state.villagers.filter((v) => v.job.kind === 'build'),
  };
}
