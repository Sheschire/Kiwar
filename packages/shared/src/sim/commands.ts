import { BUILDINGS, levelDef, MAX_LEVEL, maxLevelOf, type BuildingType } from '../data/buildings';
import { CAMPS, PATHS } from '../data/territory';
import { TILES } from '../data/tiles';
import { hexKey } from '../hex/hex';
import { emptyResources, RESOURCE_IDS, type ResourceCost, type Resources } from '../data/resources';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import { KIWI, KIWI_NAME_MAX, STAT_IDS, type StatId } from '../data/kiwis';
import {
  advanceInPlace,
  autoAssign,
  bestIdleFor,
  idleByPower,
  startNextConstruction,
  type GameEvent,
} from './advance';
import { buildingResource, hasSkill, trainingCost, trainingDuration, workerPower } from './kiwis';
import { CLASSES, SKILLS, type ClassId, type SkillId } from '../data/classes';
import { faceMapOf, isFlooded, releasePool, syncPools, terraformKey } from './territory';
import { seasonOf } from './calendar';
import { buildLock, siteError } from './describe';
import {
  buildCost,
  buildingAt,
  buildingHarvest,
  canAfford,
  canHatch,
  constructionDuration,
  currentObjective,
  demolitionRefund,
  eggCost,
  eggDuration,
  getBuilding,
  isObjectiveComplete,
  nearRay,
  nest,
  nestDef,
  pathLimit,
  pendingUpgrade,
  population,
  housing,
  queuedBuildAt,
  repairCost,
  repairDuration,
  upgradeCost,
  workerSlots,
  workersOf,
} from './selectors';
import { cloneState, nextId, type GameState, type MissionKind } from './state';
import { weakestWorker } from './posts';
import { PASSAGE_TECHS, TECHS, type TechId } from '../data/research';
import { ageOf, hasTech, researchTick, techEffects, techStatus } from './research';
import { KIKIWIWI } from '../data/kikiwiwi';
import {
  infusionDuration,
  infusionRisk,
  kikiwiwiCap,
  kikiwiwiCount,
  kikiwiwiWeak,
} from './kikiwiwi';
import { SHELTER } from '../data/threats';
import { forecastWave } from './threats';
import {
  crewOf,
  forecastExpedition,
  isLaunchpadBusy,
  launch,
  launchpadOf,
  maxCrew,
  minCrew,
  shipCargo,
} from './expeditions';
import { cargoWeight, sendShipment } from './deliveries';
import { OBSTACLES, OBSTACLE_RULES } from '../data/obstacles';
import { clearDuration, obstacleAt } from './obstacles';
import { TITAN_WORK_IDS, type TitanWork } from '../data/titan';
import { canReshape, terraformLeft, titanAt, titanCost } from './titan';

export type Command =
  | { type: 'build'; buildingType: BuildingType; q: number; r: number }
  | { type: 'upgrade'; buildingId: BuildingId }
  | { type: 'cancel'; queueItemId: QueueItemId }
  | { type: 'assignWorkers'; buildingId: BuildingId; count: number }
  /**
   * Chantier 09: moves this very kiwi to a workplace (null: it rests). In a full building it
   * swaps places with `replace`, or with the least skilled worker there.
   */
  | {
      type: 'assignKiwi';
      villagerId: VillagerId;
      buildingId: BuildingId | null;
      replace?: VillagerId;
    }
  /** Chantier 09: the lock (never moved automatically) and the builder priority of a kiwi. */
  | { type: 'setKiwiFlags'; villagerId: VillagerId; locked?: boolean; builderPriority?: boolean }
  | { type: 'hatchEgg' }
  | { type: 'claimObjective' }
  | {
      type: 'launchExpedition';
      launchpadId: BuildingId;
      targetId: string;
      /** The kiwis to board (or a head count, picked automatically). */
      crew: number | VillagerId[];
      provisions: { pulp: number; juice: number };
      /** Raid (default: fight and loot) or reconnaissance (chantier 07). */
      mission?: MissionKind;
    }
  /** Multiplayer: the launchpad's ship carries a free gift of resources to an ally. */
  | {
      type: 'sendCargo';
      launchpadId: BuildingId;
      friendId: string;
      resources: Partial<Resources>;
    }
  /** Paint paths on walkable tiles (one gesture); tiles that already have one are skipped. */
  | { type: 'buildPath'; tiles: { q: number; r: number }[] }
  | { type: 'removePath'; tiles: { q: number; r: number }[] }
  /** Set up a gathering camp on a resource tile (instant, free, outside the building cap). */
  | { type: 'gather'; q: number; r: number }
  /**
   * Tear down any building but the Nest, instantly, for a partial refund (see DEMOLITION). Its
   * kiwis go back to work elsewhere. `dismantle` is the former camp-only name, kept as an alias.
   */
  | { type: 'demolish'; buildingId: BuildingId }
  | { type: 'dismantle'; buildingId: BuildingId }
  /** Give a kiwi a new name (trimmed, 1–KIWI_NAME_MAX characters). */
  | { type: 'renameVillager'; villagerId: VillagerId; name: string }
  /** Place a stat point earned on an even level. */
  | { type: 'spendStatPoint'; villagerId: VillagerId; stat: StatId }
  /** Send a kiwi to the School to learn a class (or change class, for a higher price). */
  | { type: 'train'; villagerId: VillagerId; schoolId: BuildingId; classId: ClassId }
  /** Use an active skill (mage's Rain, mayor's Speech). */
  | { type: 'useSkill'; villagerId: VillagerId; skill: SkillId }
  /** Debug panel only. Will be rejected by the server in milestone 2. */
  /** Chantier 06: everybody into the Nest for the coming wave (no one hurt, no harvest). */
  | { type: 'shelter' }
  /** Mends a building damaged by predators (queued like a construction). */
  | { type: 'repair'; buildingId: BuildingId }
  /** Posts exactly these kiwis on the rampart (the others go back to work). */
  | { type: 'setGarrison'; villagerIds: VillagerId[] }
  /** Chantier 08: a kiwi goes into the vat of the laboratory against nature. */
  | { type: 'transform'; villagerId: VillagerId; labId: BuildingId }
  /** Chantier 08: a Kikiwiwi smashes the obstacle on a tile, or reshapes it. */
  | { type: 'titanWork'; villagerId: VillagerId; q: number; r: number; work: TitanWork }
  /** Chantier 08: a builder clears the stump on this tile (queued like a construction). */
  | { type: 'clearObstacle'; q: number; r: number }
  /** Chantier 08: the technology the researchers work on (null: bank the points). */
  | { type: 'setResearch'; tech: TechId | null }
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
  'notALaunchpad',
  'launchpadBusy',
  'launchpadDamaged',
  'unknownTarget',
  'crewTooSmall',
  'crewTooLarge',
  'overloaded',
  'pathNotAllowed',
  'pathLimit',
  'campLimit',
  'notDemolishable',
  'upgradeInProgress',
  'housingNeeded',
  'unknownVillager',
  'invalidName',
  'noStatPoint',
  'statMaxed',
  'invalidCrew',
  'notASchool',
  'classLocked',
  'levelTooLow',
  'alreadyThisClass',
  'kiwiBusy',
  'mayorExists',
  'schoolFull',
  'skillLocked',
  'skillCooling',
  'notHere',
  'flooded',
  'noWaveSoon',
  'alreadySheltered',
  'notDamaged',
  'alreadyRepairing',
  'notOnRampart',
  'turretLimit',
  'unknownTech',
  'techDone',
  'techAgeLocked',
  'libraryTooLow',
  'ageTooLow',
  'passageMissing',
  'monumentExists',
  'unknownFriend',
  'emptyCargo',
  'obstacle',
  'noObstacle',
  'needsKikiwiwi',
  'alreadyClearing',
  'techMissing',
  'labExists',
  'notALab',
  'labBusy',
  'kikiwiwiLimit',
  'alreadyKikiwiwi',
  'oneKikiwiwi',
  'notAKikiwiwi',
  'kikiwiwiWeak',
  'notReshapable',
  'terraformLimit',
  'titanAtWork',
  'kikiwiwiNoWork',
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

function uniqueTiles(tiles: readonly { q: number; r: number }[]): { q: number; r: number }[] {
  const seen = new Map<string, { q: number; r: number }>();
  for (const t of tiles) seen.set(hexKey(t), { q: t.q, r: t.r });
  return [...seen.values()];
}

function scaleRaw(cost: ResourceCost, k: number): ResourceCost {
  const out: ResourceCost = {};
  for (const id of RESOURCE_IDS) if (cost[id]) out[id] = cost[id]! * k;
  return out;
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
  // Reshaped tiles (chantier 08): the colony's own map, whatever map the caller holds.
  if (terraformKey(s)) ctx = { ...ctx, map: faceMapOf(s) };
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
      // The tile, then everything that does not depend on it (shared with the building tree).
      const site = siteError(s, ctx.map, cmd.buildingType, tile);
      if (site) fail(site);
      const lock = buildLock(s, cmd.buildingType);
      if (lock) fail(lock);
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
      // The site replaces any path on the tile.
      s.paths = s.paths.filter((k) => k !== hexKey(cmd));
      startNextConstruction(s, now, events);
      return;
    }
    case 'upgrade': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      if (b.level >= Math.min(MAX_LEVEL, maxLevelOf(b.type))) fail('maxLevel');
      // Levels 4–6 wait for the ages; each monument level for its passage technology.
      if ((levelDef(b.type, b.level + 1)!.requiresAge ?? 0) > ageOf(s)) fail('ageTooLow');
      if (b.type === 'monument' && !hasTech(s, PASSAGE_TECHS[b.level + 1]!)) fail('passageMissing');
      const pending = pendingUpgrade(s, b.id);
      if (pending) fail(pending.kind === 'repair' ? 'alreadyRepairing' : 'alreadyUpgrading');
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
    case 'titanWork': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (!v.kikiwiwi) fail('notAKikiwiwi');
      if (v.job.kind !== 'idle' && v.job.kind !== 'guard') fail('kiwiBusy');
      if (kikiwiwiWeak(s)) fail('kikiwiwiWeak');
      if (!TITAN_WORK_IDS.includes(cmd.work)) fail('invalidCount');
      if (!getTile(ctx.map, cmd)) return fail('unknownTile');
      if (titanAt(s, cmd.q, cmd.r)) fail('titanAtWork');
      if (cmd.work === 'smash') {
        if (!obstacleAt(s, cmd.q, cmd.r)) fail('noObstacle');
        if (s.queue.some((i) => i.kind === 'clear' && i.q === cmd.q && i.r === cmd.r))
          fail('alreadyClearing');
      } else {
        if (!techEffects(s).terraform) fail('techMissing');
        if (!canReshape(s, ctx.map, cmd.work, cmd.q, cmd.r)) fail('notReshapable');
        if (terraformLeft(s) <= 0) fail('terraformLimit');
      }
      const cost = titanCost(s, cmd.work, cmd.q, cmd.r)!;
      pay(s, { juice: cost.juice });
      if (cmd.work !== 'smash') s.paths = s.paths.filter((k) => k !== hexKey(cmd));
      v.job = { kind: 'titan', work: cmd.work, q: cmd.q, r: cmd.r, until: now + cost.durationMs };
      return;
    }
    case 'clearObstacle': {
      const o = obstacleAt(s, cmd.q, cmd.r);
      if (!o) return fail('noObstacle');
      if (OBSTACLES[o.kind].clearedBy !== 'kiwis') fail('needsKikiwiwi');
      if (
        s.queue.some((i) => i.kind === 'clear' && i.q === o.q && i.r === o.r) ||
        titanAt(s, o.q, o.r)
      )
        fail('alreadyClearing');
      queueHasRoom(s);
      const cost = { ...OBSTACLE_RULES.clearCost };
      pay(s, cost);
      s.queue.push({
        id: nextId(s, 'q') as QueueItemId,
        kind: 'clear',
        buildingType: 'camp',
        q: o.q,
        r: o.r,
        buildingId: null,
        targetLevel: 0,
        richness: 1,
        durationMs: clearDuration(s),
        startedAt: null,
        paid: cost,
        orderedAt: now,
      });
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
        const idle = idleByPower(s, b);
        const needed = cmd.count - current.length;
        if (idle.length < needed) fail('noIdleKiwi');
        for (const v of idle.slice(0, needed)) v.job = { kind: 'work', buildingId: b.id };
      } else {
        // The least skilled ones step back.
        const resource = buildingResource(s, b);
        const ranked = resource
          ? current
              .map((v, i) => ({ v, i, p: workerPower(v, resource) }))
              .sort((a, c) => c.p - a.p || a.i - c.i)
              .map((x) => x.v)
          : current;
        for (const v of ranked.slice(cmd.count)) v.job = { kind: 'idle' };
      }
      return;
    }
    case 'assignKiwi': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (v.job.kind !== 'idle' && v.job.kind !== 'work' && v.job.kind !== 'guard')
        fail('kiwiBusy');
      if (cmd.buildingId === null) {
        v.job = { kind: 'idle' };
        return;
      }
      if (v.kikiwiwi) fail('kikiwiwiNoWork');
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      const slots = workerSlots(b);
      if (slots === 0) fail('notAProducer');
      if (v.job.kind === 'work' && v.job.buildingId === b.id) return;
      let other: (typeof s.villagers)[number] | undefined;
      if (cmd.replace !== undefined) {
        other = workersOf(s, b.id).find((x) => x.id === cmd.replace);
        if (!other) fail('unknownVillager');
      } else if (workersOf(s, b.id).length >= slots) {
        other = weakestWorker(s, b);
      }
      const previous = v.job;
      v.job = { kind: 'work', buildingId: b.id };
      if (other) {
        // The swapped kiwi takes the newcomer's former workplace, or looks for work.
        if (previous.kind === 'work') other.job = { kind: 'work', buildingId: previous.buildingId };
        else {
          other.job = { kind: 'idle' };
          autoAssign(s, other);
        }
      }
      return;
    }
    case 'setKiwiFlags': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (cmd.builderPriority && v.kikiwiwi) fail('kikiwiwiNoWork');
      if (cmd.locked === true) v.locked = true;
      else if (cmd.locked === false) delete v.locked;
      if (cmd.builderPriority === true) v.builderPriority = true;
      else if (cmd.builderPriority === false) delete v.builderPriority;
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
    case 'launchExpedition': {
      const pad = launchpadOf(s, cmd.launchpadId);
      if (!pad) return fail('notALaunchpad');
      if (isLaunchpadBusy(s, pad.id)) fail('launchpadBusy');
      if (pad.damaged) fail('launchpadDamaged');
      if (!s.targets.some((t) => t.id === cmd.targetId)) fail('unknownTarget');
      const { pulp, juice } = cmd.provisions;
      if (
        (typeof cmd.crew === 'number' && !Number.isInteger(cmd.crew)) ||
        ![pulp, juice].every((v) => Number.isFinite(v) && v >= 0)
      ) {
        fail('invalidCount');
      }
      const crew = crewOf(s, cmd.crew);
      if (!crew) return fail('invalidCrew');
      const size = typeof cmd.crew === 'number' ? cmd.crew : crew.length;
      if (size < minCrew(cmd.mission)) fail('crewTooSmall');
      if (size > maxCrew(s, pad, cmd.mission)) fail('crewTooLarge');
      if (crew.filter((v) => v.kikiwiwi).length > KIKIWIWI.perShip) fail('oneKikiwiwi');
      const forecast = forecastExpedition(s, cmd)!;
      if (forecast.weight > forecast.cargo + 1e-9) fail('overloaded');
      if (!canAfford(s.resources, { pulp, juice })) fail('notEnoughResources');
      launch(s, cmd, now, nextId(s, 'x'));
      return;
    }
    case 'sendCargo': {
      const pad = launchpadOf(s, cmd.launchpadId);
      if (!pad) return fail('notALaunchpad');
      if (isLaunchpadBusy(s, pad.id)) fail('launchpadBusy');
      if (pad.damaged) fail('launchpadDamaged');
      const friend = s.friends.find((f) => f.id === cmd.friendId);
      if (!friend) return fail('unknownFriend');
      const load = emptyResources();
      for (const r of RESOURCE_IDS) {
        const v = cmd.resources[r] ?? 0;
        if (!Number.isFinite(v) || v < 0) fail('invalidCount');
        load[r] = Math.floor(v);
      }
      if (RESOURCE_IDS.every((r) => load[r] === 0)) fail('emptyCargo');
      if (cargoWeight(load) > shipCargo(pad) + 1e-9) fail('overloaded');
      if (!canAfford(s.resources, load)) fail('notEnoughResources');
      sendShipment(s, pad.id, friend, pad, load, now, nextId(s, 'x'));
      return;
    }
    case 'buildPath': {
      const tiles = uniqueTiles(cmd.tiles);
      if (tiles.length === 0 || tiles.length > PATHS.maxPerCommand) fail('invalidCount');
      const existing = new Set(s.paths);
      const added: string[] = [];
      for (const h of tiles) {
        const key = hexKey(h);
        if (existing.has(key)) continue;
        const tile = getTile(ctx.map, h);
        if (!tile) return fail('unknownTile');
        if (!TILES[tile.type].walkable) fail('pathNotAllowed');
        if (buildingAt(s, h.q, h.r) || queuedBuildAt(s, h.q, h.r)) fail('tileOccupied');
        if (obstacleAt(s, h.q, h.r)) fail('obstacle');
        if (titanAt(s, h.q, h.r)) fail('titanAtWork');
        added.push(key);
      }
      if (s.paths.length + added.length > pathLimit(s)) fail('pathLimit');
      pay(s, scaleRaw(PATHS.cost, added.length));
      s.paths.push(...added);
      return;
    }
    case 'removePath': {
      const remove = new Set<string>(uniqueTiles(cmd.tiles).map((h) => hexKey(h)));
      if (remove.size === 0 || remove.size > PATHS.maxPerCommand) fail('invalidCount');
      s.paths = s.paths.filter((k) => !remove.has(k));
      return;
    }
    case 'gather': {
      const tile = getTile(ctx.map, { q: cmd.q, r: cmd.r });
      if (!tile) return fail('unknownTile');
      if (!CAMPS.tiles.includes(tile.type)) fail('tileNotAllowed');
      if (buildingAt(s, cmd.q, cmd.r) || queuedBuildAt(s, cmd.q, cmd.r)) fail('tileOccupied');
      if (obstacleAt(s, cmd.q, cmd.r)) fail('obstacle');
      if (titanAt(s, cmd.q, cmd.r)) fail('titanAtWork');
      if (isFlooded(tile, ctx.map.params.biome, seasonOf(s))) fail('flooded');
      if (s.buildings.filter((b) => b.type === 'camp').length >= CAMPS.max) fail('campLimit');
      const id = nextId(s, 'b') as BuildingId;
      s.buildings.push({
        id,
        type: 'camp',
        q: cmd.q,
        r: cmd.r,
        level: 1,
        richness: tile.richness,
        builtAt: now,
      });
      s.paths = s.paths.filter((k) => k !== hexKey(cmd));
      syncPools(s, ctx.map, now);
      const idle = bestIdleFor(s, getBuilding(s, id)!);
      if (idle) idle.job = { kind: 'work', buildingId: id };
      return;
    }
    case 'demolish':
    case 'dismantle': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      if (b.type === 'nest' || b.type === 'monument') fail('notDemolishable');
      if (pendingUpgrade(s, b.id)) fail('upgradeInProgress');
      if (b.type === 'launchpad' && isLaunchpadBusy(s, b.id)) fail('launchpadBusy');
      const housingLeft = housing(s) - (levelDef(b.type, b.level)?.housing ?? 0);
      if (housingLeft < population(s)) fail('housingNeeded');
      refund(s, demolitionRefund(s, b));
      releasePool(s, ctx.map, b, now);
      s.buildings = s.buildings.filter((x) => x.id !== b.id);
      syncPools(s, ctx.map, now);
      for (const v of s.villagers) {
        if (v.job.kind === 'build' && v.job.returnTo === b.id) v.job.returnTo = null;
      }
      for (const v of s.villagers) {
        if (v.job.kind === 'work' && v.job.buildingId === b.id) {
          v.job = { kind: 'idle' };
          autoAssign(s, v);
        }
        // Trainees of a demolished School (or kiwis in its vat) get their fee back.
        if (
          (v.job.kind === 'train' && v.job.schoolId === b.id) ||
          (v.job.kind === 'transform' && v.job.labId === b.id)
        ) {
          refund(s, v.job.paid);
          v.job = { kind: 'idle' };
          autoAssign(s, v);
        }
      }
      return;
    }
    case 'renameVillager': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      const name = cleanKiwiName(cmd.name);
      if (!name) return fail('invalidName');
      v.name = name;
      return;
    }
    case 'spendStatPoint': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (!STAT_IDS.includes(cmd.stat)) fail('invalidCount');
      if (v.statPoints <= 0) fail('noStatPoint');
      if (v.stats[cmd.stat] >= KIWI.stat.cap) fail('statMaxed');
      v.stats[cmd.stat]++;
      v.statPoints--;
      return;
    }
    case 'train': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      const school = getBuilding(s, cmd.schoolId);
      if (!school || school.type !== 'school') return fail('notASchool');
      const def = CLASSES[cmd.classId];
      if (!def) return fail('classLocked');
      if (school.level < def.schoolLevel) fail('classLocked');
      if (v.level < def.minLevel) fail('levelTooLow');
      if (v.classId === cmd.classId) fail('alreadyThisClass');
      if (v.job.kind !== 'idle' && v.job.kind !== 'work') fail('kiwiBusy');
      if (
        def.unique &&
        s.villagers.some(
          (x) =>
            x.id !== v.id &&
            (x.classId === cmd.classId ||
              (x.job.kind === 'train' && x.job.classId === cmd.classId)),
        )
      ) {
        fail('mayorExists');
      }
      const lvl = levelDef('school', school.level)!;
      const trainees = s.villagers.filter(
        (x) => x.job.kind === 'train' && x.job.schoolId === school.id,
      ).length;
      if (trainees >= (lvl.trainingSlots ?? 0)) fail('schoolFull');
      const cost = trainingCost(v, cmd.classId);
      pay(s, cost);
      v.job = {
        kind: 'train',
        schoolId: school.id,
        classId: cmd.classId,
        until: now + trainingDuration(school, cmd.classId),
        paid: cost,
      };
      return;
    }
    case 'transform': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      const lab = getBuilding(s, cmd.labId);
      if (!lab || lab.type !== 'lab') return fail('notALab');
      if (v.kikiwiwi) fail('alreadyKikiwiwi');
      if (v.level < KIKIWIWI.minLevel) fail('levelTooLow');
      if (v.job.kind !== 'idle' && v.job.kind !== 'work') fail('kiwiBusy');
      if (s.villagers.some((x) => x.job.kind === 'transform' && x.job.labId === lab.id))
        fail('labBusy');
      if (kikiwiwiCount(s) >= kikiwiwiCap(s)) fail('kikiwiwiLimit');
      const cost = { ...KIKIWIWI.cost };
      pay(s, cost);
      v.job = {
        kind: 'transform',
        labId: lab.id,
        until: now + infusionDuration(lab),
        risk: infusionRisk(s, v, lab),
        paid: cost,
      };
      return;
    }
    case 'useSkill': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      const def = v.classId ? CLASSES[v.classId].skills.find((x) => x.id === cmd.skill) : undefined;
      if (!def?.cooldownMs || !hasSkill(v, cmd.skill)) return fail('skillLocked');
      if ((v.skillReadyAt[cmd.skill] ?? 0) > now) fail('skillCooling');
      if (v.job.kind === 'expedition' || v.job.kind === 'train' || v.job.kind === 'transform')
        fail('kiwiBusy');
      if (cmd.skill === 'rain') {
        const b = v.job.kind === 'work' ? getBuilding(s, v.job.buildingId) : undefined;
        const h = b?.pool ? buildingHarvest(s, b) : null;
        if (!b?.pool || !h) return fail('notHere');
        b.pool.stock = Math.min(h.cap, h.stock + SKILLS.rainRefill * h.cap);
      } else if (cmd.skill === 'speech') {
        const k = hasSkill(v, 'festival') ? SKILLS.festivalMultiplier : 1;
        s.speechUntil = now + SKILLS.speechMs * k;
      }
      v.skillReadyAt[cmd.skill] = now + def.cooldownMs;
      return;
    }
    case 'shelter': {
      const f = forecastWave(s);
      if (!f) return fail('noWaveSoon');
      if (f.sheltered) fail('alreadySheltered');
      if (!f.canShelter) fail('noWaveSoon');
      s.threats.shelterUntil = f.wave.at + SHELTER.afterMs;
      return;
    }
    case 'repair': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      if (!b.damaged) fail('notDamaged');
      if (pendingUpgrade(s, b.id)) fail('alreadyRepairing');
      queueHasRoom(s);
      const cost = repairCost(b);
      pay(s, cost);
      s.queue.push({
        id: nextId(s, 'q') as QueueItemId,
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
        orderedAt: now,
      });
      startNextConstruction(s, now, events);
      return;
    }
    case 'setGarrison': {
      const ids = new Set(cmd.villagerIds);
      if (ids.size !== cmd.villagerIds.length) fail('invalidCrew');
      for (const id of ids) {
        const v = s.villagers.find((x) => x.id === id);
        if (!v) return fail('unknownVillager');
        if (v.job.kind !== 'idle' && v.job.kind !== 'work' && v.job.kind !== 'guard')
          fail('kiwiBusy');
      }
      for (const v of s.villagers) {
        if (ids.has(v.id)) v.job = { kind: 'guard' };
        else if (v.job.kind === 'guard') {
          v.job = { kind: 'idle' };
          autoAssign(s, v);
        }
      }
      return;
    }
    case 'setResearch': {
      if (cmd.tech === null) {
        s.research.current = null;
        return;
      }
      if (!TECHS[cmd.tech]) return fail('unknownTech');
      const status = techStatus(s, cmd.tech);
      if (status === 'done') fail('techDone');
      if (status === 'age') fail('techAgeLocked');
      if (status === 'library') fail('libraryTooLow');
      s.research.current = cmd.tech;
      // Banked points may already pay for it.
      researchTick(s, now, events);
      return;
    }
    case 'debugGrant': {
      refund(s, cmd.resources);
      return;
    }
  }
}

/** A valid kiwi name (spaces collapsed, no control characters), or null. */
export function cleanKiwiName(raw: string): string | null {
  const name = raw
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length === 0 || [...name].length > KIWI_NAME_MAX) return null;
  return name;
}
