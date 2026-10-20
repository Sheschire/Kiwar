import { STARDUST } from '../data/comets';
import { TASKS } from '../data/jobs';
import { METEORS } from '../data/threats';
import { dustPickers, pickRate, STARDUST_CAP } from './comets';
import { minersOf } from './sky';
import type { BuildingId, TimeMs } from '../types/ids';
import { autoAssign, type GameEvent } from './advance';
import { builderSpeed, workerPower } from './kiwis';
import { researchPower } from './research';
import { capacity, getBuilding, nest, workerSlots, workersOf } from './selectors';
import type { ResourceId } from '../data/resources';
import type { GameState, QueueItem, Villager } from './state';

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

/**
 * The builder the automation sends: the fastest "priority builder" at home or at work, else the
 * strongest kiwi it may borrow (idle ones first on ties).
 */
export function pickBuilder(state: GameState): Villager | undefined {
  let priority: Villager | undefined;
  let best: { v: Villager; speed: number; idle: boolean } | undefined;
  for (const v of state.villagers) {
    if (v.kikiwiwi) continue;
    const speed = builderSpeed(v);
    if (v.builderPriority && (v.job.kind === 'idle' || v.job.kind === 'work')) {
      if (!priority || speed > builderSpeed(priority)) priority = v;
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
  item.durationMs = Math.max(1000, Math.round(item.durationMs / builderSpeed(builder)));
  events.push({ type: 'constructionStarted', at, queueItemId: item.id, builderId: builder.id });
}

/** Starts the first waiting constructions while there are places and builders. */
export function startConstructions(state: GameState, at: TimeMs, events: GameEvent[]): void {
  if (!state.automation.build) return;
  for (const item of waitingForBuilder(state)) {
    const builder = pickBuilder(state);
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
 * Fills every automatic task, highest priority first. It runs only after events and commands
 * (never at the start of an `advance` call, whose times differ between one big step and many
 * small ones), so what it reads must only change at events: the stocks reaching their cap
 * are events, a stock leaving it is not (hence the cap test of the craters, not `storageFull`).
 */
export function dispatchTasks(state: GameState, at: TimeMs, events: GameEvent[]): void {
  forgetLent(state);
  startConstructions(state, at, events);
  fillResearch(state);
  fillCraters(state);
  fillStardust(state);
}
