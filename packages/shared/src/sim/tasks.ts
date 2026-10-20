import { TASKS } from '../data/jobs';
import type { BuildingId, TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { builderSpeed } from './kiwis';
import { getBuilding, nest } from './selectors';
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
  else if (v.job.kind === 'stardust' || v.job.kind === 'build') home = v.job.returnTo;
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

/** Fills every automatic task, highest priority first. */
export function dispatchTasks(state: GameState, at: TimeMs, events: GameEvent[]): void {
  startConstructions(state, at, events);
}
