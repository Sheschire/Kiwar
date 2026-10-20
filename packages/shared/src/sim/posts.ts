import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { RESOURCE_IDS } from '../data/resources';
import { JOBS } from '../data/jobs';
import type { GameEvent } from './advance';
import { buildingResource, workerPower } from './kiwis';
import { researchPerHour, researchPower } from './research';
import {
  buildingHarvest,
  capacity,
  buildingRates,
  storageFullCheck,
  workerSlots,
  workersOf,
} from './selectors';
import { calendarOf } from './calendar';
import { consumption } from './needs';
import { isManualWorkplace } from '../data/buildings';
import type { Building, GameState, Meteor, Villager } from './state';
import { meteorRate, minersOf } from './sky';
import { METEORS } from '../data/threats';

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
  /** Chantier 13: kiwis picking stardust. */
  pickers: Villager[];
  /** Chantier 15: meteorite craters (temporary posts), with their harvest per hour. */
  meteors: { meteor: Meteor; miners: Villager[]; slots: number; perHour: number }[];
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
    pickers: state.villagers.filter((v) => v.job.kind === 'stardust'),
    meteors: state.sky.meteors
      .filter((m) => m.stock > 0)
      .map((m) => ({
        meteor: m,
        miners: minersOf(state, m.id),
        slots: METEORS.slots,
        perHour: full(m.resource) ? 0 : meteorRate(state, m),
      })),
  };
}

// ---------------------------------------------------------------------------------------------
// Redirection when a stock is full (chantier 09)

/** The stock of a resource is back below the return threshold (redirected kiwis go home). */
export function belowReturn(state: GameState, id: ResourceId): boolean {
  return state.resources[id] <= capacity(state)[id] * JOBS.returnBelow + 1e-6;
}

/** Resources whose redirected kiwis wait for the stock to fall (an advance event). */
export function awaitedResources(state: GameState): Set<ResourceId> {
  const out = new Set<ResourceId>();
  for (const v of state.villagers) {
    if (!v.homeJob || v.job.kind !== 'work') continue;
    const home = state.buildings.find((b) => b.id === v.homeJob);
    const id = home ? buildingResource(state, home) : null;
    if (id) out.add(id);
  }
  return out;
}

/**
 * Free workplaces a kiwi could take on its own: producers (the Library aside) with room,
 * whose stock is not full, best affinity first, the least staffed on ties.
 */
function freePlaceFor(
  state: GameState,
  v: Villager,
  full: (id: ResourceId) => boolean,
  except?: BuildingId,
): Building | undefined {
  let best: { b: Building; score: number; ratio: number } | undefined;
  for (const b of state.buildings) {
    if (b.id === except || isManualWorkplace(b.type)) continue;
    const slots = workerSlots(b);
    const count = workersOf(state, b.id).length;
    if (count >= slots) continue;
    const id = buildingResource(state, b);
    if (!id || full(id)) continue;
    const score = affinity(state, v, id);
    const ratio = count / slots;
    if (!best || score > best.score || (score === best.score && ratio < best.ratio))
      best = { b, score, ratio };
  }
  return best?.b;
}

/**
 * Redirected kiwis go back to their workplace once its stock is below the return threshold
 * (chantier 09). It only depends on the state, whose conditions change at events or commands,
 * so it runs after each of them; a kiwi moved by the player forgets its former workplace.
 */
export function returnHome(state: GameState, at: TimeMs, events: GameEvent[]): void {
  const returned = new Map<ResourceId, number>();
  for (const v of state.villagers) {
    if (!v.homeJob) continue;
    // Builders and kiwis lent to a task (chantier 15) keep the memory until they are back at
    // work; anything else forgets it.
    if (
      v.job.kind === 'build' ||
      v.job.kind === 'meteor' ||
      v.job.kind === 'stardust' ||
      v.lent !== undefined
    )
      continue;
    const home = state.buildings.find((b) => b.id === v.homeJob);
    const id = home ? buildingResource(state, home) : null;
    if (v.job.kind !== 'work' || !home || !id || v.job.buildingId === home.id) {
      delete v.homeJob;
      continue;
    }
    if (!belowReturn(state, id)) continue;
    delete v.homeJob;
    if (workersOf(state, home.id).length >= workerSlots(home)) continue;
    v.job = { kind: 'work', buildingId: home.id };
    returned.set(id, (returned.get(id) ?? 0) + 1);
  }
  for (const [resource, count] of returned)
    events.push({ type: 'kiwisReturned', at, resource, count });
}

/**
 * When a stock fills up (or a workplace opens while it is full), its harvesters leave for the
 * free workplace that suits them best (chantier 09). One stays per building when the colony
 * eats this resource; locked kiwis stay. They remember their workplace to come back to.
 */
export function redirectFull(
  state: GameState,
  at: TimeMs,
  events: GameEvent[],
  only?: ReadonlySet<ResourceId>,
): void {
  const full = storageFullCheck(state);
  const eaten = consumption(state);
  const redirected = new Map<ResourceId, number>();
  for (const id of RESOURCE_IDS) {
    if ((only && !only.has(id)) || !full(id)) continue;
    for (const b of state.buildings) {
      if (isManualWorkplace(b.type) || buildingResource(state, b) !== id) continue;
      const ranked = workersOf(state, b.id)
        .map((v, i) => ({ v, i, p: workerPower(v, id) }))
        .sort((x, y) => y.p - x.p || x.i - y.i)
        .map((x) => x.v);
      // The best one stays to harvest what the colony eats.
      for (const v of ranked.slice(eaten[id] > 0 ? 1 : 0)) {
        if (v.locked) continue;
        const to = freePlaceFor(state, v, full, b.id);
        if (!to) continue;
        v.homeJob ??= b.id;
        v.job = { kind: 'work', buildingId: to.id };
        redirected.set(id, (redirected.get(id) ?? 0) + 1);
      }
    }
  }
  for (const [resource, count] of redirected)
    events.push({ type: 'kiwisRedirected', at, resource, count });
}

/**
 * Where an idle kiwi goes on its own: the free workplace with the best affinity, minus a
 * weight on how staffed it already is; a workplace whose stock is full only as a last resort.
 */
export function autoPlace(state: GameState, v: Villager): Building | undefined {
  const full = storageFullCheck(state);
  let best: { b: Building; score: number; full: boolean } | undefined;
  for (const b of state.buildings) {
    if (isManualWorkplace(b.type)) continue;
    const slots = workerSlots(b);
    if (slots === 0) continue;
    const count = workersOf(state, b.id).length;
    if (count >= slots) continue;
    const id = buildingResource(state, b);
    const isFull = id ? full(id) : false;
    const score = (id ? affinity(state, v, id) : 1) - JOBS.ratioWeight * (count / slots);
    if (!best || (best.full && !isFull) || (best.full === isFull && score > best.score + 1e-9))
      best = { b, score, full: isFull };
  }
  return best?.b;
}
