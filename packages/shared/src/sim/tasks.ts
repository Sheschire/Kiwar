import { STARDUST } from '../data/comets';
import { TASKS, type AutoTask } from '../data/jobs';
import { GARRISON, METEORS, THREATS } from '../data/threats';
import { RESOURCE_IDS } from '../data/resources';
import { defenseOf, guardPower, sectorClash } from './threats';
import { dustPickers, pickRate, STARDUST_CAP } from './comets';
import { minersOf } from './sky';
import type { BuildingId, QueueItemId, TimeMs } from '../types/ids';
import { autoAssign, type GameEvent } from './advance';
import { builderSpeed, repairSpeed, workerPower } from './kiwis';
import { researchPower } from './research';
import {
  canAfford,
  capacity,
  getBuilding,
  nest,
  nestDef,
  pendingUpgrade,
  repairCost,
  repairDuration,
  workerSlots,
  workersOf,
} from './selectors';
import type { ResourceId } from '../data/resources';
import { nextId, type GameState, type QueueItem, type Villager } from './state';

/**
 * Chantier 15: the automation. A task is a one-off need with a number of places and a key stat
 * (construction: Strength, research: Spirit, craters and stardust: Dexterity, garrison). The
 * automation fills it with the best kiwis for that stat, borrowing them from lower tasks or
 * from the harvest; borrowed kiwis remember their workplace and go back when the task ends.
 *
 * `dispatchTasks` only reads the state, whose conditions change at events or commands: it runs
 * at the start of `advance`, after every event and after every command, so offline progress
 * stays exact.
 */

/** Priority of what a kiwi is doing: a task takes kiwis only from lower ones (higher numbers). */
export type TaskLevel = 'garrison' | 'build' | 'research' | 'pick' | 'harvest' | 'idle';
const RANK: Record<TaskLevel, number> = {
  garrison: 0,
  build: 1,
  research: 2,
  pick: 3,
  harvest: 4,
  idle: 5,
};

/** What a kiwi is busy with, as a task level (null: it cannot be moved by the automation). */
export function taskLevel(state: GameState, v: Villager): TaskLevel | null {
  switch (v.job.kind) {
    case 'idle':
      return 'idle';
    case 'work':
      return getBuilding(state, v.job.buildingId)?.type === 'library' ? 'research' : 'harvest';
    case 'stardust':
    case 'meteor':
      return 'pick';
    case 'build':
      return 'build';
    case 'guard':
      return 'garrison';
    default:
      return null;
  }
}

/**
 * The automation may move this kiwi to a task of level `to`: it is doing something of lower
 * priority, is not a Kikiwiwi, and is not locked (a locked kiwi at home can still be taken).
 */
export function canBorrow(state: GameState, v: Villager, to: TaskLevel): boolean {
  if (v.kikiwiwi) return false;
  const level = taskLevel(state, v);
  if (level === null || RANK[level] <= RANK[to]) return false;
  return level === 'idle' || !v.locked;
}

/**
 * Takes a kiwi off what it was doing for a task and returns the workplace it should go back to
 * afterwards (null: none). Its former memories are dropped (the task keeps the new one).
 */
export function borrow(v: Villager): BuildingId | null {
  let home: BuildingId | null = null;
  if (v.lent !== undefined) home = v.lent;
  else if (v.job.kind === 'work') home = v.job.buildingId;
  else if (v.job.kind === 'stardust' || v.job.kind === 'build' || v.job.kind === 'meteor')
    home = v.job.returnTo;
  delete v.lent;
  return home;
}

/** Constructions under way at once with the colony's Nest (1/1/2/2/3/3). */
export function buildSlots(state: GameState): number {
  const slots = TASKS.buildSlots;
  return slots[Math.min(nest(state).level, slots.length - 1)] ?? 1;
}

/** Started constructions (each with its builder). */
export function startedItems(state: GameState): QueueItem[] {
  return state.queue.filter((i) => i.startedAt !== null);
}

/** Time the next started construction ends (Infinity: none). */
export function nextConstructionEnd(state: GameState): TimeMs {
  let next = Infinity;
  for (const i of state.queue)
    if (i.startedAt !== null) next = Math.min(next, i.startedAt + i.durationMs);
  return next;
}

/**
 * Queue items that have a place to start but no builder yet (nobody can be borrowed, or the
 * construction task is manual): the "waiting for a builder" status.
 */
export function waitingForBuilder(state: GameState): QueueItem[] {
  const free = buildSlots(state) - startedItems(state).length;
  if (free <= 0) return [];
  return state.queue.filter((i) => i.startedAt === null).slice(0, free);
}

/** How fast a kiwi works on a queue item (chantier 37: warriors mend faster). */
export function itemSpeed(v: Villager, item?: Pick<QueueItem, 'kind'>): number {
  return item?.kind === 'repair' ? repairSpeed(v) : builderSpeed(v);
}

/**
 * The builder the automation sends: the fastest "priority builder" at home or at work, else the
 * strongest kiwi it may borrow (idle ones first on ties), fastest for this item.
 */
export function pickBuilder(
  state: GameState,
  item?: Pick<QueueItem, 'kind'>,
): Villager | undefined {
  let priority: Villager | undefined;
  let prioritySpeed = 0;
  let best: { v: Villager; speed: number; idle: boolean } | undefined;
  for (const v of state.villagers) {
    if (v.kikiwiwi) continue;
    const speed = itemSpeed(v, item);
    if (v.builderPriority && (v.job.kind === 'idle' || v.job.kind === 'work')) {
      if (!priority || speed > prioritySpeed) {
        priority = v;
        prioritySpeed = speed;
      }
    }
    if (!canBorrow(state, v, 'build')) continue;
    const idle = v.job.kind === 'idle';
    if (
      !best ||
      speed > best.speed + 1e-9 ||
      (Math.abs(speed - best.speed) <= 1e-9 && idle && !best.idle)
    )
      best = { v, speed, idle };
  }
  return priority ?? best?.v;
}

/** Starts a queue item with this builder (its strength and mastery set the pace for good). */
export function startItem(
  state: GameState,
  item: QueueItem,
  builder: Villager,
  at: TimeMs,
  events: GameEvent[],
): void {
  const returnTo = borrow(builder);
  builder.job = { kind: 'build', queueItemId: item.id, returnTo };
  item.startedAt = at;
  item.durationMs = Math.max(1000, Math.round(item.durationMs / itemSpeed(builder, item)));
  events.push({ type: 'constructionStarted', at, queueItemId: item.id, builderId: builder.id });
}

/** Starts the first waiting constructions while there are places and builders. */
export function startConstructions(state: GameState, at: TimeMs, events: GameEvent[]): void {
  if (!state.automation.build) return;
  for (const item of waitingForBuilder(state)) {
    const builder = pickBuilder(state, item);
    if (!builder) return;
    startItem(state, item, builder, at, events);
  }
}

/**
 * A borrowed kiwi goes back to its workplace if it still has room, otherwise it looks for work
 * on its own.
 */
export function sendBack(state: GameState, v: Villager, home: BuildingId | null): void {
  delete v.lent;
  const back = home ? getBuilding(state, home) : undefined;
  if (back && workersOf(state, back.id).length < workerSlots(back)) {
    v.job = { kind: 'work', buildingId: back.id };
  } else {
    v.job = { kind: 'idle' };
    autoAssign(state, v);
  }
}

/**
 * Sends several kiwis back at once: those whose workplace still has room first, so that a kiwi
 * looking for work does not take the place of one coming home.
 */
export function sendBackAll(
  state: GameState,
  list: readonly (readonly [Villager, BuildingId | null])[],
): void {
  const ordered = [...list.filter(([, h]) => h !== null), ...list.filter(([, h]) => h === null)];
  for (const [v, home] of ordered) sendBack(state, v, home);
}

/** The best kiwi the automation may borrow for a task, by a power (idle ones first on ties). */
function bestFor(
  state: GameState,
  to: TaskLevel,
  power: (v: Villager) => number,
  except?: ReadonlySet<string>,
): Villager | undefined {
  let best: { v: Villager; p: number; idle: boolean } | undefined;
  for (const v of state.villagers) {
    if (except?.has(v.id) || !canBorrow(state, v, to)) continue;
    const p = power(v);
    const idle = v.job.kind === 'idle';
    if (!best || p > best.p + 1e-9 || (Math.abs(p - best.p) <= 1e-9 && idle && !best.idle))
      best = { v, p, idle };
  }
  return best?.v;
}

/**
 * Chantier 15: while a technology is chosen, the Library's free places take the kiwis with the
 * most Spirit (borrowed); when nothing is being researched they go back to their workplace.
 * Kiwis placed there by the player stay (they bank points).
 */
export function fillResearch(state: GameState): void {
  if (!state.automation.research) return;
  const libraries = state.buildings.filter((b) => b.type === 'library');
  if (!state.research.current) {
    sendBackAll(
      state,
      state.villagers
        .filter(
          (v) =>
            v.lent !== undefined &&
            v.job.kind === 'work' &&
            libraries.some((b) => b.id === (v.job as { buildingId: BuildingId }).buildingId),
        )
        .map((v) => [v, v.lent ?? null]),
    );
    return;
  }
  for (const b of libraries) {
    let free = workerSlots(b) - workersOf(state, b.id).length;
    while (free-- > 0) {
      const v = bestFor(state, 'research', researchPower);
      if (!v) return;
      const home = borrow(v);
      v.job = { kind: 'work', buildingId: b.id };
      v.lent = home;
    }
  }
}

/**
 * A kiwi keeps `lent` only while it does the task it was borrowed for (research at the Library,
 * the garrison): moved by the player or by anything else, it forgets it.
 */
function forgetLent(state: GameState): void {
  for (const v of state.villagers) {
    if (v.lent === undefined) continue;
    const atLibrary =
      v.job.kind === 'work' && getBuilding(state, v.job.buildingId)?.type === 'library';
    if (!atLibrary && v.job.kind !== 'guard') delete v.lent;
  }
}

/**
 * Chantier 15: a meteorite crater is a temporary post. Its miners go back to their workplace
 * when it is empty or gone (and when its resource's storage fills up: `releaseFullCraters`, at
 * that event); in automatic mode the free places of a crater whose stock is below its cap take
 * the kiwis with the most power for its resource (Dexterity, mastery).
 */
export function fillCraters(state: GameState): void {
  const done: [Villager, BuildingId | null][] = [];
  for (const v of state.villagers) {
    if (v.job.kind !== 'meteor') continue;
    const id = v.job.meteorId;
    const m = state.sky.meteors.find((x) => x.id === id);
    if (!m || m.stock <= 0) done.push([v, v.job.returnTo]);
  }
  sendBackAll(state, done);
  if (!state.automation.meteor) return;
  const cap = capacity(state);
  for (const m of state.sky.meteors) {
    if (m.stock <= 0 || state.resources[m.resource] >= cap[m.resource] - 1e-6) continue;
    let free = METEORS.slots - minersOf(state, m.id).length;
    while (free-- > 0) {
      const v = bestFor(state, 'pick', (x) => workerPower(x, m.resource));
      if (!v) return;
      v.job = { kind: 'meteor', meteorId: m.id, returnTo: borrow(v) };
    }
  }
}

/** A storage just filled up: the miners of its craters go back to work (an `advance` event). */
export function releaseFullCraters(state: GameState, filled: ReadonlySet<ResourceId>): void {
  const done: [Villager, BuildingId | null][] = [];
  for (const v of state.villagers) {
    if (v.job.kind !== 'meteor') continue;
    const id = v.job.meteorId;
    const m = state.sky.meteors.find((x) => x.id === id);
    if (m && filled.has(m.resource)) done.push([v, v.job.returnTo]);
  }
  sendBackAll(state, done);
}

/** Chantier 15: stardust tiles take the kiwis with the most Dexterity (until the stock is full). */
export function fillStardust(state: GameState): void {
  if (!state.automation.stardust || state.stardust >= STARDUST_CAP) return;
  for (const p of state.comets.patches) {
    if (p.stock <= 0) continue;
    let free = STARDUST.slots - dustPickers(state, p.id).length;
    while (free-- > 0) {
      const v = bestFor(state, 'pick', pickRate);
      if (!v) return;
      v.job = { kind: 'stardust', patchId: p.id, returnTo: borrow(v) };
    }
  }
}

/**
 * Chantier 15: a damaged building orders its own repairs (paid as soon as they are affordable
 * and the queue has room); repairs go before the constructions that have not started.
 */
export function orderRepairs(state: GameState, at: TimeMs): void {
  if (!state.automation.repair) return;
  for (const b of state.buildings) {
    if (!b.damaged || pendingUpgrade(state, b.id)) continue;
    if (state.queue.length >= (nestDef(state).queueSize ?? 1)) return;
    const cost = repairCost(b);
    if (!canAfford(state.resources, cost)) continue;
    for (const id of RESOURCE_IDS) state.resources[id] -= cost[id] ?? 0;
    const item: QueueItem = {
      id: nextId(state, 'q') as QueueItemId,
      kind: 'repair',
      buildingType: b.type,
      q: b.q,
      r: b.r,
      buildingId: b.id,
      targetLevel: b.level,
      richness: b.richness,
      durationMs: repairDuration(b),
      startedAt: null,
      paid: cost,
      orderedAt: at,
    };
    const waiting = state.queue.findIndex((i) => i.startedAt === null && i.kind !== 'repair');
    if (waiting < 0) state.queue.push(item);
    else state.queue.splice(waiting, 0, item);
  }
}

/** When the automatic garrison posts its guards before the announced wave (Infinity: none). */
export function autoGarrisonAt(state: GameState): TimeMs {
  const wave = state.threats.next;
  if (!state.automation.garrison || !wave?.announced) return Infinity;
  const at = wave.at - GARRISON.autoLeadMs;
  return at > state.now ? at : Infinity;
}

/**
 * Chantier 15: from `GARRISON.autoLeadMs` before an announced strike, the kiwis that stop the
 * most of what still breaks through (at bad luck) are posted one by one, borrowed from their
 * work; after the strike they go back. Builders stay on their sites; nobody is posted during
 * a shelter (everybody hides).
 */
export function fillGarrison(state: GameState): void {
  const wave = state.threats.next;
  const window =
    !!wave?.announced &&
    state.now >= wave.at - GARRISON.autoLeadMs &&
    state.now < wave.at &&
    state.threats.shelterUntil <= state.now;
  if (!window) {
    // The strike is over (or no wave): the guards the automation posted go back.
    sendBackAll(
      state,
      state.villagers
        .filter((v) => v.job.kind === 'guard' && v.lent !== undefined)
        .map((v) => [v, v.lent ?? null]),
    );
    return;
  }
  if (!state.automation.garrison) return;
  const threat = {
    ground: wave.ground * (1 + THREATS.luck),
    air: wave.air * (1 + THREATS.luck),
  };
  const through = (extra: readonly Villager[]) => {
    const ids = new Set<string>(extra.map((v) => v.id));
    const s: GameState = {
      ...state,
      villagers: state.villagers.map((v) =>
        ids.has(v.id) ? { ...v, job: { kind: 'guard' as const } } : v,
      ),
    };
    const t = sectorClash(threat, defenseOf(s, threat).sectors).through;
    return t.ground + t.air;
  };
  const pool = state.villagers.filter((v) => {
    if (v.job.kind === 'build' || !canBorrow(state, v, 'garrison')) return false;
    const p = guardPower(v, state);
    return p.ground + p.air > 0;
  });
  const max = Math.floor(state.villagers.filter((v) => !v.kikiwiwi).length * GARRISON.autoShare);
  const posted: Villager[] = [];
  let guards = state.villagers.filter((v) => v.job.kind === 'guard').length;
  let left = through(posted);
  while (left > 1e-9 && guards < max) {
    let best: Villager | null = null;
    let bestLeft = left;
    for (const v of pool) {
      if (posted.includes(v)) continue;
      const l = through([...posted, v]);
      if (l < bestLeft - 1e-9) {
        bestLeft = l;
        best = v;
      }
    }
    if (!best) break;
    posted.push(best);
    guards++;
    left = bestLeft;
  }
  for (const v of posted) {
    const home = borrow(v);
    v.job = { kind: 'guard' };
    v.lent = home;
  }
}

/**
 * Fills every automatic task, highest priority first. It runs only after events and commands
 * (never at the start of an `advance` call, whose times differ between one big step and many
 * small ones), so what it reads must only change at events: the stocks reaching their cap
 * are events, a stock leaving it is not (hence the cap test of the craters, not `storageFull`).
 */
export function dispatchTasks(state: GameState, at: TimeMs, events: GameEvent[]): void {
  forgetLent(state);
  fillGarrison(state);
  orderRepairs(state, at);
  startConstructions(state, at, events);
  fillResearch(state);
  fillCraters(state);
  fillStardust(state);
}

/**
 * Chantier 15: what each task waits for right now (the Automation panel's badges): sites with
 * a place and no builder, a chosen technology with nobody at the Library, craters and stardust
 * with nobody on them, damaged buildings without repairs, an imminent strike without guards.
 */
export function taskNeeds(state: GameState): Record<AutoTask, number> {
  const libraries = state.buildings.filter((b) => b.type === 'library');
  const wave = state.threats.next;
  const soon =
    !!wave?.announced &&
    state.now >= wave.at - GARRISON.autoLeadMs &&
    state.now < wave.at &&
    state.threats.shelterUntil <= state.now;
  return {
    build: waitingForBuilder(state).length,
    research:
      state.research.current &&
      libraries.length > 0 &&
      libraries.every((b) => workersOf(state, b.id).length === 0)
        ? 1
        : 0,
    meteor: state.sky.meteors.filter((m) => m.stock > 0 && minersOf(state, m.id).length === 0)
      .length,
    stardust:
      state.stardust >= STARDUST_CAP
        ? 0
        : state.comets.patches.filter((p) => p.stock > 0 && dustPickers(state, p.id).length === 0)
            .length,
    repair: state.buildings.filter((b) => b.damaged && !pendingUpgrade(state, b.id)).length,
    garrison: soon && !state.villagers.some((v) => v.job.kind === 'guard') ? 1 : 0,
    redirect: 0,
  };
}
