import { BUILDINGS, levelDef, MAX_LEVEL, type BuildingType } from '../data/buildings';
import { RESOURCE_IDS, type ResourceCost, type Resources } from '../data/resources';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId, QueueItemId, TimeMs } from '../types/ids';
import { advanceInPlace, startNextConstruction, type GameEvent } from './advance';
import {
  buildCost,
  buildingAt,
  buildingCount,
  canAfford,
  canHatch,
  constructionDuration,
  currentObjective,
  eggCost,
  eggDuration,
  getBuilding,
  idleVillagers,
  isObjectiveComplete,
  nearRay,
  nest,
  nestDef,
  pendingUpgrade,
  population,
  housing,
  queuedBuildAt,
  upgradeCost,
  workerSlots,
  workersOf,
} from './selectors';
import { cloneState, nextId, type GameState } from './state';

export type Command =
  | { type: 'build'; buildingType: BuildingType; q: number; r: number }
  | { type: 'upgrade'; buildingId: BuildingId }
  | { type: 'cancel'; queueItemId: QueueItemId }
  | { type: 'assignWorkers'; buildingId: BuildingId; count: number }
  | { type: 'hatchEgg' }
  | { type: 'claimObjective' }
  /** Debug panel only. Will be rejected by the server in milestone 2. */
  | { type: 'debugGrant'; resources: Partial<Resources> };

export const COMMAND_ERRORS = [
  'unknownTile',
  'tileNotAllowed',
  'tileOccupied',
  'notBuildable',
  'notEnoughResources',
  'queueFull',
  'buildingLimit',
  'nestLevelTooLow',
  'maxLevel',
  'alreadyUpgrading',
  'unknownBuilding',
  'unknownQueueItem',
  'notAProducer',
  'tooManyWorkers',
  'noIdleKiwi',
  'invalidCount',
  'eggInProgress',
  'housingFull',
  'objectiveIncomplete',
  'noObjective',
] as const;
export type CommandError = (typeof COMMAND_ERRORS)[number];

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError; state: GameState; events: GameEvent[] };

export interface CommandContext {
  now: TimeMs;
  /** The face map (regenerated from the seed); needed to validate placement. */
  map: FaceMap;
}

class CommandFailure extends Error {
  constructor(readonly code: CommandError) {
    super(code);
  }
}

const fail = (code: CommandError): never => {
  throw new CommandFailure(code);
};

function pay(s: GameState, cost: ResourceCost): void {
  if (!canAfford(s.resources, cost)) fail('notEnoughResources');
  for (const id of RESOURCE_IDS) s.resources[id] -= cost[id] ?? 0;
}

function refund(s: GameState, cost: ResourceCost): void {
  for (const id of RESOURCE_IDS) s.resources[id] += cost[id] ?? 0;
}

function queueHasRoom(s: GameState): void {
  if (s.queue.length >= (nestDef(s).queueSize ?? 1)) fail('queueFull');
}

/**
 * Validates and applies a player command. The state is first advanced to `now`, so the command
 * always applies to an up-to-date state. Never mutates the input.
 */
export function applyCommand(state: GameState, cmd: Command, ctx: CommandContext): CommandResult {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  advanceInPlace(s, ctx.now, events);
  const advanced = cloneState(s);
  try {
    execute(s, cmd, ctx, events);
    return { ok: true, state: s, events };
  } catch (e) {
    if (e instanceof CommandFailure) return { ok: false, error: e.code, state: advanced, events };
    throw e;
  }
}

/** Dry run: the error a command would produce, or null if it would succeed. */
export function validateCommand(
  state: GameState,
  cmd: Command,
  ctx: CommandContext,
): CommandError | null {
  const r = applyCommand(state, cmd, ctx);
  return r.ok ? null : r.error;
}

function execute(s: GameState, cmd: Command, ctx: CommandContext, events: GameEvent[]): void {
  const now = ctx.now;
  switch (cmd.type) {
    case 'build': {
      const def = BUILDINGS[cmd.buildingType];
      if (!def || !def.buildable) fail('notBuildable');
      const tile = getTile(ctx.map, { q: cmd.q, r: cmd.r });
      if (!tile) return fail('unknownTile');
      if (!def.allowedTiles.includes(tile.type)) fail('tileNotAllowed');
      if (buildingAt(s, cmd.q, cmd.r) || queuedBuildAt(s, cmd.q, cmd.r)) fail('tileOccupied');
      if (nest(s).level < def.levels[0]!.requiresNestLevel) fail('nestLevelTooLow');
      if (buildingCount(s) >= (nestDef(s).maxBuildings ?? 0)) fail('buildingLimit');
      queueHasRoom(s);
      const cost = buildCost(s, cmd.buildingType);
      const durationMs = constructionDuration(
        s,
        cmd.buildingType,
        1,
        true,
        nearRay(ctx.map, cmd.q, cmd.r),
      );
      pay(s, cost);
      s.queue.push({
        id: nextId(s, 'q') as QueueItemId,
        kind: 'build',
        buildingType: cmd.buildingType,
        q: cmd.q,
        r: cmd.r,
        buildingId: null,
        targetLevel: 1,
        richness: tile.richness,
        durationMs,
        startedAt: null,
        paid: cost,
        orderedAt: now,
      });
      startNextConstruction(s, now, events);
      return;
    }
    case 'upgrade': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      if (b.level >= MAX_LEVEL) fail('maxLevel');
      if (pendingUpgrade(s, b.id)) fail('alreadyUpgrading');
      const target = b.level + 1;
      const def = levelDef(b.type, target)!;
      // The Nest gates the others; the Nest itself only needs its current level.
      if (b.type !== 'nest' && nest(s).level < def.requiresNestLevel) fail('nestLevelTooLow');
      queueHasRoom(s);
      const cost = upgradeCost(b.type, target);
      const durationMs = constructionDuration(s, b.type, target, false, nearRay(ctx.map, b.q, b.r));
      pay(s, cost);
      s.queue.push({
        id: nextId(s, 'q') as QueueItemId,
        kind: 'upgrade',
        buildingType: b.type,
        q: b.q,
        r: b.r,
        buildingId: b.id,
        targetLevel: target,
        richness: b.richness,
        durationMs,
        startedAt: null,
        paid: cost,
        orderedAt: now,
      });
      startNextConstruction(s, now, events);
      return;
    }
    case 'cancel': {
      const index = s.queue.findIndex((i) => i.id === cmd.queueItemId);
      if (index < 0) return fail('unknownQueueItem');
      const [item] = s.queue.splice(index, 1);
      refund(s, item!.paid);
      for (const v of s.villagers) {
        if (v.job.kind === 'build' && v.job.queueItemId === item!.id) {
          const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
          v.job =
            back && workersOf(s, back.id).length < workerSlots(back)
              ? { kind: 'work', buildingId: back.id }
              : { kind: 'idle' };
        }
      }
      startNextConstruction(s, now, events);
      return;
    }
    case 'assignWorkers': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      const slots = workerSlots(b);
      if (slots === 0) fail('notAProducer');
      if (!Number.isInteger(cmd.count) || cmd.count < 0) fail('invalidCount');
      if (cmd.count > slots) fail('tooManyWorkers');
      const current = workersOf(s, b.id);
      if (cmd.count > current.length) {
        const idle = idleVillagers(s);
        const needed = cmd.count - current.length;
        if (idle.length < needed) fail('noIdleKiwi');
        for (const v of idle.slice(0, needed)) v.job = { kind: 'work', buildingId: b.id };
      } else {
        for (const v of current.slice(cmd.count)) v.job = { kind: 'idle' };
      }
      return;
    }
    case 'hatchEgg': {
      if (s.egg) fail('eggInProgress');
      if (!canHatch(s) || population(s) >= housing(s)) fail('housingFull');
      pay(s, eggCost(s));
      s.egg = { startedAt: now, readyAt: now + eggDuration(s) };
      return;
    }
    case 'claimObjective': {
      const obj = currentObjective(s);
      if (!obj) return fail('noObjective');
      if (!isObjectiveComplete(s, obj)) fail('objectiveIncomplete');
      refund(s, obj.reward);
      s.objectiveIndex++;
      return;
    }
    case 'debugGrant': {
      refund(s, cmd.resources);
      return;
    }
  }
}
