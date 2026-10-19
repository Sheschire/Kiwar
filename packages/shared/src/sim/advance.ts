import { isProducer, type BuildingType } from '../data/buildings';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import {
  activeItem,
  capacity,
  getBuilding,
  HOUR_MS,
  idleVillagers,
  productionRates,
  workerSlots,
  workersOf,
} from './selectors';
import { addVillager, cloneState, nextId, type GameState, type Villager } from './state';

export type GameEvent =
  | {
      type: 'constructionComplete';
      at: TimeMs;
      buildingId: BuildingId;
      buildingType: BuildingType;
      level: number;
      q: number;
      r: number;
    }
  | {
      type: 'constructionStarted';
      at: TimeMs;
      queueItemId: QueueItemId;
      builderId: VillagerId | null;
    }
  | { type: 'hatched'; at: TimeMs; villagerId: VillagerId; name: string }
  | { type: 'storageFull'; at: TimeMs; resource: ResourceId };

export interface AdvanceResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Pure time-based simulation (Ogame model): computes everything that happened between
 * `state.now` and `now` — production, finished constructions, hatched eggs — no matter how long
 * the player was away. It jumps from event to event; between two events every rate is constant,
 * so production is integrated exactly.
 */
export function advance(state: GameState, now: TimeMs): AdvanceResult {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  advanceInPlace(s, now, events);
  return { state: s, events };
}

/** Mutating version used internally (and by command handlers working on a fresh copy). */
export function advanceInPlace(s: GameState, now: TimeMs, events: GameEvent[]): void {
  startNextConstruction(s, s.now, events);
  // Guard against pathological loops; each iteration consumes at least one event.
  for (let guard = 0; guard < 100_000; guard++) {
    const active = activeItem(s);
    const constructionEnd = active ? active.startedAt! + active.durationMs : Infinity;
    const eggEnd = s.egg ? s.egg.readyAt : Infinity;
    const nextEvent = Math.min(constructionEnd, eggEnd);
    const target = Math.min(nextEvent, now);
    if (target > s.now) {
      accrue(s, target - s.now, target, events);
      s.now = target;
    }
    if (nextEvent > now) break;
    if (constructionEnd <= now && constructionEnd === nextEvent) {
      completeConstruction(s, constructionEnd, events);
      startNextConstruction(s, constructionEnd, events);
    }
    if (s.egg && s.egg.readyAt <= now && s.egg.readyAt === nextEvent) {
      hatch(s, s.egg.readyAt, events);
    }
  }
  s.now = Math.max(s.now, now);
}

function accrue(s: GameState, dtMs: number, at: TimeMs, events: GameEvent[]): void {
  const rates = productionRates(s);
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) {
    const before = s.resources[id];
    const gain = (rates[id] * dtMs) / HOUR_MS;
    if (gain <= 0) continue;
    // Never destroy stock above capacity (e.g. rewards), just stop producing.
    const after = before >= cap[id] ? before : Math.min(cap[id], before + gain);
    s.resources[id] = after;
    s.stats.produced[id] += after - before;
    if (before < cap[id] && after >= cap[id]) {
      // Exact time the storage filled up (for the "while you were away" summary).
      const fillMs = ((cap[id] - before) / rates[id]) * HOUR_MS;
      events.push({ type: 'storageFull', at: Math.round(at - dtMs + fillMs), resource: id });
    }
  }
}

/** Starts the head of the queue if nothing is under construction, assigning a builder. */
export function startNextConstruction(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const head = s.queue[0];
  if (!head || head.startedAt !== null) return;
  head.startedAt = at;
  const builder = pickBuilder(s);
  if (builder) {
    const returnTo = builder.job.kind === 'work' ? builder.job.buildingId : null;
    builder.job = { kind: 'build', queueItemId: head.id, returnTo };
  }
  events.push({
    type: 'constructionStarted',
    at,
    queueItemId: head.id,
    builderId: builder?.id ?? null,
  });
}

/** Prefers an idle kiwi; otherwise borrows one from the most staffed workplace. */
function pickBuilder(s: GameState): Villager | undefined {
  const idle = idleVillagers(s)[0];
  if (idle) return idle;
  let best: Villager | undefined;
  let bestCount = 0;
  for (const b of s.buildings) {
    const workers = workersOf(s, b.id);
    if (workers.length > bestCount) {
      bestCount = workers.length;
      best = workers[workers.length - 1];
    }
  }
  return best;
}

function completeConstruction(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const item = s.queue.shift();
  if (!item) return;
  let buildingId: BuildingId;
  if (item.kind === 'build') {
    buildingId = nextId(s, 'b') as BuildingId;
    s.buildings.push({
      id: buildingId,
      type: item.buildingType,
      q: item.q,
      r: item.r,
      level: 1,
      richness: item.richness,
      builtAt: at,
    });
  } else {
    const b = getBuilding(s, item.buildingId!);
    if (!b) return;
    b.level = item.targetLevel;
    buildingId = b.id;
  }
  s.stats.constructionsCompleted++;
  events.push({
    type: 'constructionComplete',
    at,
    buildingId,
    buildingType: item.buildingType,
    level: item.targetLevel,
    q: item.q,
    r: item.r,
  });

  // A brand-new workplace gets an idle kiwi automatically (autonomous villagers).
  if (item.kind === 'build' && isProducer(item.buildingType)) {
    const idle = idleVillagers(s)[0];
    if (idle) idle.job = { kind: 'work', buildingId };
  }

  // Release the builder: back to its previous workplace if there is still room,
  // otherwise it looks for work by itself.
  for (const v of s.villagers) {
    if (v.job.kind !== 'build' || v.job.queueItemId !== item.id) continue;
    const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
    if (back && workersOf(s, back.id).length < workerSlots(back)) {
      v.job = { kind: 'work', buildingId: back.id };
    } else {
      v.job = { kind: 'idle' };
      autoAssign(s, v);
    }
  }
}

function hatch(s: GameState, at: TimeMs, events: GameEvent[]): void {
  s.egg = null;
  const v = addVillager(s, at);
  s.stats.eggsHatched++;
  events.push({ type: 'hatched', at, villagerId: v.id, name: v.name });
  autoAssign(s, v);
}

/**
 * Newborn and freed kiwis look for work on their own: they go to the producing building with
 * a free slot and the lowest staffing ratio. Kiwis idled by the player stay idle.
 */
export function autoAssign(s: GameState, v: Villager): void {
  let best: { id: BuildingId; ratio: number } | null = null;
  for (const b of s.buildings) {
    const slots = workerSlots(b);
    if (slots === 0) continue;
    const count = workersOf(s, b.id).length;
    if (count >= slots) continue;
    const ratio = count / slots;
    if (!best || ratio < best.ratio) best = { id: b.id, ratio };
  }
  if (best) v.job = { kind: 'work', buildingId: best.id };
}

/** Utility for UIs: remaining time of the active construction. */
export function constructionRemaining(s: GameState, now: TimeMs): number {
  const a = activeItem(s);
  if (!a) return 0;
  return Math.max(0, a.startedAt! + a.durationMs - now);
}
