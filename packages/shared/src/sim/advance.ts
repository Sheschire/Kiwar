import { isProducer, type BuildingType } from '../data/buildings';
import { RESOURCE_IDS, emptyResources, type ResourceId, type Resources } from '../data/resources';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import {
  activeItem,
  buildingHarvest,
  buildingRates,
  capacity,
  getBuilding,
  HOUR_MS,
  idleVillagers,
  storageFullCheck,
  workerSlots,
  workersOf,
} from './selectors';
import { resolveArrival, resolveReturn } from './expeditions';
import type { MasteryId, ShinyColor, StatId } from '../data/kiwis';
import type { ClassId } from '../data/classes';
import { accrueKiwis, builderSpeed, buildingResource, nextKiwiEvent, workerPower } from './kiwis';
import { faceMapOf, rebaseFreeDeposits, syncPools, timeToDepletion } from './territory';
import type { Season } from '../data/cycles';
import { calendarAt, nextCalendarChange } from './calendar';
import {
  addVillager,
  cloneState,
  nextId,
  type Building,
  type Expedition,
  type GameState,
  type Villager,
} from './state';

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
  | {
      type: 'hatched';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      shiny: ShinyColor | null;
    }
  /** `stat`: the point drawn on odd levels (null on even levels: a point to place). */
  | {
      type: 'levelUp';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      level: number;
      stat: StatId | null;
    }
  | { type: 'trained'; at: TimeMs; villagerId: VillagerId; name: string; classId: ClassId }
  | { type: 'speechOver'; at: TimeMs }
  | {
      type: 'masteryUp';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      mastery: MasteryId;
      rank: number;
    }
  | { type: 'storageFull'; at: TimeMs; resource: ResourceId }
  | { type: 'seasonChanged'; at: TimeMs; season: Season }
  | { type: 'expeditionArrived'; at: TimeMs; expeditionId: string; victory: boolean }
  | { type: 'expeditionReturned'; at: TimeMs; expeditionId: string };

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
  const map = faceMapOf(s);
  syncPools(s, map, s.now);
  startNextConstruction(s, s.now, events);
  // Guard against pathological loops; each iteration consumes at least one event.
  for (let guard = 0; guard < 100_000; guard++) {
    const active = activeItem(s);
    const constructionEnd = active ? active.startedAt! + active.durationMs : Infinity;
    const eggEnd = s.egg ? s.egg.readyAt : Infinity;
    const expedition = nextExpeditionEvent(s);
    const flows = computeFlows(s);
    const trainingEnd = nextTrainingEnd(s);
    const speechEnd = s.speechUntil > s.now ? s.speechUntil : Infinity;
    // Nightfall and dawn change work rates (seasons change at dawn).
    const calendarChange = nextCalendarChange(s.calendarStart, s.now);
    const nextEvent = Math.min(
      calendarChange,
      constructionEnd,
      eggEnd,
      expedition?.at ?? Infinity,
      flows.nextChange,
      nextKiwiEvent(s),
      trainingEnd,
      speechEnd,
    );
    const target = Math.min(nextEvent, now);
    if (target > s.now) {
      accrue(s, flows, target - s.now, target, events);
      s.now = target;
    }
    if (nextEvent > now) break;
    if (constructionEnd <= now && constructionEnd === nextEvent) {
      completeConstruction(s, constructionEnd, events);
      syncPools(s, map, constructionEnd);
      startNextConstruction(s, constructionEnd, events);
    }
    if (s.egg && s.egg.readyAt <= now && s.egg.readyAt === nextEvent) {
      hatch(s, s.egg.readyAt, events);
    }
    if (trainingEnd === nextEvent) finishTrainings(s, trainingEnd, events);
    if (speechEnd === nextEvent) events.push({ type: 'speechOver', at: speechEnd });
    if (calendarChange === nextEvent) calendarTick(s, calendarChange, events);
    if (expedition && expedition.at === nextEvent) {
      const e = expedition.expedition;
      if (e.status === 'outbound') {
        resolveArrival(s, e);
        events.push({
          type: 'expeditionArrived',
          at: e.arriveAt,
          expeditionId: e.id,
          victory: e.result!.victory,
        });
      } else {
        resolveReturn(s, e, events);
        for (const v of s.villagers)
          if (v.job.kind === 'idle' && e.crew.includes(v.id)) autoAssign(s, v);
        events.push({ type: 'expeditionReturned', at: e.returnAt, expeditionId: e.id });
      }
    }
  }
  s.now = Math.max(s.now, now);
}

/** Dawn or nightfall: a new season starts at the first dawn of its first day. */
function calendarTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const c = calendarAt(s.calendarStart, at);
  if (!c.night && c.day === 0 && c.sinceDawn === 0) {
    rebaseFreeDeposits(s, faceMapOf(s), at);
    events.push({ type: 'seasonChanged', at, season: c.season });
  }
}

interface Flows {
  rates: Resources;
  pools: { b: Building; delta: number; cap: number }[];
  /** Next time a rate changes on its own (a deposit runs dry, a storage fills up). */
  nextChange: TimeMs;
}

/** Every rate of the colony, constant until `nextChange` or the next game event. */
function computeFlows(s: GameState): Flows {
  const full = storageFullCheck(s);
  const rates = emptyResources();
  const pools: Flows['pools'] = [];
  let next = Infinity;
  for (const b of s.buildings) {
    const r = buildingRates(s, b, full);
    for (const id of RESOURCE_IDS) rates[id] += r[id];
    const h = b.pool ? buildingHarvest(s, b, full) : null;
    if (!h || !b.pool) continue;
    pools.push({ b, delta: h.regen - h.harvest, cap: h.cap });
    const dry = timeToDepletion(h);
    if (dry < Infinity) next = Math.min(next, s.now + Math.max(1, Math.ceil(dry)));
  }
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) {
    if (rates[id] <= 0 || full(id)) continue;
    const fill = ((cap[id] - s.resources[id]) / rates[id]) * HOUR_MS;
    next = Math.min(next, s.now + Math.max(1, Math.ceil(fill)));
  }
  return { rates, pools, nextChange: next };
}

function accrue(s: GameState, flows: Flows, dtMs: number, at: TimeMs, events: GameEvent[]): void {
  const { rates } = flows;
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) {
    const before = s.resources[id];
    const gain = (rates[id] * dtMs) / HOUR_MS;
    if (gain <= 0) continue;
    // Never destroy stock above capacity (e.g. rewards), just stop producing.
    let after = before >= cap[id] ? before : Math.min(cap[id], before + gain);
    if (after < cap[id] && cap[id] - after < 1e-6) after = cap[id];
    s.resources[id] = after;
    s.stats.produced[id] += after - before;
    if (before < cap[id] && after >= cap[id]) {
      // Exact time the storage filled up (for the "while you were away" summary).
      const fillMs = ((cap[id] - before) / rates[id]) * HOUR_MS;
      events.push({ type: 'storageFull', at: Math.round(at - dtMs + fillMs), resource: id });
    }
  }
  for (const p of flows.pools) {
    const stock = p.b.pool!.stock + (p.delta * dtMs) / HOUR_MS;
    p.b.pool!.stock = stock < 1e-6 ? 0 : Math.min(p.cap, stock);
  }
  accrueKiwis(s, dtMs, at, events);
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
    // The builder's strength and mastery set the pace, once and for all.
    head.durationMs = Math.max(1000, Math.round(head.durationMs / builderSpeed(builder)));
  }
  events.push({
    type: 'constructionStarted',
    at,
    queueItemId: head.id,
    builderId: builder?.id ?? null,
  });
}

/** Prefers the best idle builder; otherwise borrows one from the most staffed workplace. */
function pickBuilder(s: GameState): Villager | undefined {
  let idle: Villager | undefined;
  for (const v of idleVillagers(s)) if (!idle || builderSpeed(v) > builderSpeed(idle)) idle = v;
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
    const idle = bestIdleFor(s, getBuilding(s, buildingId)!);
    if (idle) idle.job = { kind: 'work', buildingId };
  }

  // Release the builder: back to its previous workplace if there is still room,
  // otherwise it looks for work by itself.
  for (const v of s.villagers) {
    if (v.job.kind !== 'build' || v.job.queueItemId !== item.id) continue;
    v.history.built++;
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
  events.push({ type: 'hatched', at, villagerId: v.id, name: v.name, shiny: v.shiny });
  autoAssign(s, v);
}

/**
 * Newborn and freed kiwis look for work on their own: they go to the producing building with
 * a free slot and the lowest staffing ratio, where they are the most skilled on ties. Kiwis
 * idled by the player stay idle.
 */
export function autoAssign(s: GameState, v: Villager): void {
  let best: { id: BuildingId; ratio: number; power: number } | null = null;
  for (const b of s.buildings) {
    const slots = workerSlots(b);
    if (slots === 0) continue;
    const count = workersOf(s, b.id).length;
    if (count >= slots) continue;
    const ratio = count / slots;
    const resource = buildingResource(s, b);
    const power = resource ? workerPower(v, resource) : 1;
    if (!best || ratio < best.ratio || (ratio === best.ratio && power > best.power)) {
      best = { id: b.id, ratio, power };
    }
  }
  if (best) v.job = { kind: 'work', buildingId: best.id };
}

/** The idle kiwi that would work best in a building (masters first). */
export function bestIdleFor(s: GameState, b: Building): Villager | undefined {
  return idleByPower(s, b)[0];
}

/** Idle kiwis, best workers for this building first (stable on ties). */
export function idleByPower(s: GameState, b: Building): Villager[] {
  const resource = buildingResource(s, b);
  const idle = idleVillagers(s);
  if (!resource) return idle;
  return idle
    .map((v, i) => ({ v, i, p: workerPower(v, resource) }))
    .sort((a, c) => c.p - a.p || a.i - c.i)
    .map((x) => x.v);
}

function nextTrainingEnd(s: GameState): TimeMs {
  let next = Infinity;
  for (const v of s.villagers) if (v.job.kind === 'train') next = Math.min(next, v.job.until);
  return next;
}

/** Trainees whose course ends at `at` get their class and go back to work. */
function finishTrainings(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'train' || v.job.until !== at) continue;
    v.classId = v.job.classId;
    v.skillReadyAt = {};
    v.job = { kind: 'idle' };
    events.push({ type: 'trained', at, villagerId: v.id, name: v.name, classId: v.classId });
    autoAssign(s, v);
  }
}

function nextExpeditionEvent(s: GameState): { at: TimeMs; expedition: Expedition } | null {
  let best: { at: TimeMs; expedition: Expedition } | null = null;
  for (const e of s.expeditions) {
    const at =
      e.status === 'outbound' ? e.arriveAt : e.status === 'returning' ? e.returnAt : Infinity;
    if (at !== Infinity && (!best || at < best.at)) best = { at, expedition: e };
  }
  return best;
}

/** Utility for UIs: remaining time of the active construction. */
export function constructionRemaining(s: GameState, now: TimeMs): number {
  const a = activeItem(s);
  if (!a) return 0;
  return Math.max(0, a.startedAt! + a.durationMs - now);
}
