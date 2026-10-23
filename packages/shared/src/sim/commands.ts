import { BLESSINGS, FUEL, STARDUST, STARDUST_SCALE } from '../data/comets';
import { canPickDust, STARDUST_CAP, stardustOf } from './comets';
import {
  borrow,
  canBorrow,
  dispatchTasks,
  sendBackAll,
  startItem,
  waitingForBuilder,
} from './tasks';
import { AUTO_TASKS, type AutoTask } from '../data/jobs';
import { canMine, meteorAt, minersOf } from './sky';
import { BUILDINGS, levelDef, type BuildingType } from '../data/buildings';
import { CAMPS, PATHS } from '../data/territory';
import { TILES } from '../data/tiles';
import { hexKey } from '../hex/hex';
import { emptyResources, RESOURCE_IDS, type ResourceCost, type Resources } from '../data/resources';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import { KIWI, KIWI_NAME_MAX, STAT_IDS, type StatId } from '../data/kiwis';
import { advanceInPlace, autoAssign, bestIdleFor, idleByPower, type GameEvent } from './advance';
import { buildingResource, hasSkill, trainingCost, trainingDuration, workerPower } from './kiwis';
import { CLASSES, SKILLS, type ClassId, type SkillId } from '../data/classes';
import { faceMapOf, isFlooded, releasePool, syncPools, terraformKey } from './territory';
import { seasonOf } from './calendar';
import { ageObjectives, currentObjective, isObjectiveComplete } from './objectives';
import { buildLock, siteError, upgradeLock } from './describe';
import {
  buildCost,
  buildingAt,
  buildingHarvest,
  canAfford,
  canHatch,
  capacity,
  constructionDuration,
  demolitionRefund,
  eggCost,
  eggDuration,
  getBuilding,
  nearRay,
  nestDef,
  pathLimit,
  pendingUpgrade,
  population,
  housing,
  queuedBuildAt,
  repairCost,
  repairDuration,
  reserveCapOf,
  reserveHolders,
  upgradeCost,
  workerSlots,
  workersOf,
} from './selectors';
import {
  cloneState,
  nextId,
  type Building,
  type GameState,
  type MissionKind,
  type Villager,
} from './state';
import {
  assaultLock,
  bridgeheadAt,
  finalLock,
  fortifyLock,
  isSiegeMission,
  startFortify,
  twinTarget,
} from './siege';
import { returnHome, weakestWorker } from './posts';
import { TECHS, type TechId } from '../data/research';
import { researchTick, techEffects, techStatus } from './research';
import { KIKIWIWI } from '../data/kikiwiwi';
import { EXPEDITIONS } from '../data/expeditions';
import {
  infusionDuration,
  infusionRisk,
  kikiwiwiCap,
  kikiwiwiCount,
  kikiwiwiWeak,
} from './kikiwiwi';
import { METEORS, SHELTER } from '../data/threats';
import { forecastWave } from './threats';
import {
  availableCrew,
  cleanFreight,
  crewOf,
  crewWeight,
  forecastExpedition,
  isLaunchpadBusy,
  launch,
  launchpadOf,
  maxCrew,
  minCrew,
  shipCargo,
} from './expeditions';
import { cargoWeight, sendShipment } from './deliveries';
import {
  denRaidForecast,
  denRaiders,
  foundLock,
  isSister,
  raidDen,
  SISTER_FRIEND,
} from './colonies';
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
  /** Chantier 13: `star` pays stardust on top for a likely golden shiny. */
  | { type: 'hatchEgg'; star?: boolean }
  /** Without `id`: the tutorial step; with it, an age objective shown in the notebook. */
  | { type: 'claimObjective'; id?: string }
  | {
      type: 'launchExpedition';
      launchpadId: BuildingId;
      targetId: string;
      /** The kiwis to board (or a head count, picked automatically). */
      crew: number | VillagerId[];
      provisions: { pulp: number; juice: number };
      /** Raid (default: fight and loot) or reconnaissance (chantier 07). */
      mission?: MissionKind;
      /** Chantier 13: burn stardust for a faster, safer trip. */
      fuel?: boolean;
      /** Chantier 19: outer sector of an assault or a reinforcement. */
      sector?: number;
      /** Chantier 19: assault crew members who stay on the bridgehead (at least one). */
      holders?: VillagerId[];
      /** Chantier 19: posted kiwis a reinforcement brings back home. */
      bringBack?: VillagerId[];
      /** Chantier 19: resources the settlers carry to found the colony (mission `found`). */
      freight?: Partial<Resources>;
    }
  /** Multiplayer: the launchpad's ship carries a free gift of resources to an ally. */
  | {
      type: 'sendCargo';
      launchpadId: BuildingId;
      friendId: string;
      resources: Partial<Resources>;
      /** Chantier 19: kiwis moving to our other colony (friend `sister` only). */
      villagerIds?: VillagerId[];
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
  /** Chantier 30: brings a warehouse's reserve back into the stock (as much as fits). */
  | { type: 'collect'; buildingId: BuildingId }
  /** Chantier 30: `collect` on every warehouse. */
  | { type: 'collectAll' }
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
  /** Chantier 19: a Kikiwiwi posted on this bridgehead fortifies it. */
  | { type: 'fortifyBridgehead'; sector: number }
  /** Chantier 19: the guards raid the ferret den on this tile (a colonised face). */
  | { type: 'raidDen'; q: number; r: number }
  /** Chantier 08: a builder clears the stump on this tile (queued like a construction). */
  | { type: 'clearObstacle'; q: number; r: number }
  /** Chantier 08: the technology the researchers work on (null: bank the points). */
  | { type: 'setResearch'; tech: TechId | null }
  /** Chantier 13: exactly these kiwis pick the stardust of a tile (others there go back). */
  | { type: 'collectStardust'; patchId: string; villagerIds: VillagerId[] }
  /** Chantier 13: a blessing bought with stardust (heal, redistribute the stats, +1 in a stat). */
  | { type: 'bless'; villagerId: VillagerId; kind: BlessingKind; stat?: StatId }
  /** Chantier 15: switches a task of the automation on or off. */
  | { type: 'setAutomation'; task: AutoTask; on: boolean }
  /** Chantier 15: this kiwi starts a waiting construction (the manual mode's builder). */
  | { type: 'assignBuilder'; queueItemId: QueueItemId; villagerId: VillagerId }
  /** Chantier 15: exactly these kiwis harvest a meteorite crater (others there go back). */
  | { type: 'collectMeteor'; meteorId: string; villagerIds: VillagerId[] }
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
  'notWarehouse',
  'nothingToCollect',
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
  'unknownPatch',
  'patchFull',
  'stardustFull',
  'notEnoughStardust',
  'notInjured',
  'blessingLimit',
  // Chantier 15
  'onCrater',
  'unknownCrater',
  'craterFull',
  'alreadyStarted',
  'noBuildSlot',
  // Chantier 19: the siege of the twin face.
  'conquered',
  'notASector',
  'sectorUnseen',
  'bridgeheadHere',
  'bridgeheadLimit',
  'noBridgehead',
  'queenUnknown',
  'needBridgeheads',
  'needFortified',
  'invalidHolders',
  'alreadyFortified',
  'fortifying',
  'invalidMission',
  // Chantier 19 (second half): the second colony.
  'notConquered',
  'alreadyFounded',
  'sharedResearch',
  'noDen',
  'noGuards',
  'tooStrong',
] as const;
export type BlessingKind = 'heal' | 'respec' | 'stat';

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

/** Chantier 13: the stardust of an abandoned star technology comes back (up to the cap). */
function refundTechDust(s: GameState, tech: TechId | null): void {
  refundStardust(s, tech ? (TECHS[tech].stardust ?? 0) : 0);
}

/** Stardust points given back (up to the cap). */
function refundStardust(s: GameState, points: number): void {
  if (points > 0) s.stardust = Math.min(STARDUST_CAP, s.stardust + points * STARDUST_SCALE);
}

/** Chantier 13: spends whole stardust points (`notEnoughStardust` otherwise). */
export function payStardust(s: GameState, points: number): void {
  if (points <= 0) return;
  if (stardustOf(s) < points) fail('notEnoughStardust');
  s.stardust -= points * STARDUST_SCALE;
}

function pay(s: GameState, cost: ResourceCost): void {
  if (!canAfford(s.resources, cost)) fail('notEnoughResources');
  for (const id of RESOURCE_IDS) s.resources[id] -= cost[id] ?? 0;
}

/**
 * Chantier 30: moves a warehouse's reserve into the stock, as much as fits under the cap (the
 * rest stays in reserve). Returns the amount moved.
 */
export function collectReserve(s: GameState, b: Building): number {
  if (!b.reserve) return 0;
  const cap = capacity(s);
  let moved = 0;
  for (const id of RESOURCE_IDS) {
    const take = Math.min(b.reserve[id], Math.max(0, cap[id] - s.resources[id]));
    if (take <= 0) continue;
    s.resources[id] += take;
    b.reserve[id] = b.reserve[id] - take < 1e-6 ? 0 : b.reserve[id] - take;
    moved += take;
  }
  return moved;
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
    // Spending can bring a full stock back down: redirected kiwis go home (chantier 09).
    returnHome(s, ctx.now, events);
    // A new site, a freed kiwi, a chosen technology: the automation fills its tasks.
    dispatchTasks(s, ctx.now, events);
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
      return;
    }
    case 'upgrade': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      // Shared with the level badges (chantier 11).
      const lock = upgradeLock(s, b);
      if (lock) fail(lock);
      const target = b.level + 1;
      const cost = upgradeCost(b.type, target);
      const durationMs = constructionDuration(s, b.type, target, false, nearRay(ctx.map, b.q, b.r));
      const dust = levelDef(b.type, target)?.stardust ?? 0;
      payStardust(s, dust);
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
        ...(dust > 0 ? { paidDust: dust } : {}),
        orderedAt: now,
      });
      return;
    }
    case 'cancel': {
      const index = s.queue.findIndex((i) => i.id === cmd.queueItemId);
      if (index < 0) return fail('unknownQueueItem');
      const [item] = s.queue.splice(index, 1);
      refund(s, item!.paid);
      refundStardust(s, item!.paidDust ?? 0);
      for (const v of s.villagers) {
        if (v.job.kind === 'build' && v.job.queueItemId === item!.id) {
          const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
          v.job =
            back && workersOf(s, back.id).length < workerSlots(back)
              ? { kind: 'work', buildingId: back.id }
              : { kind: 'idle' };
        }
      }
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
    case 'raidDen': {
      const o = obstacleAt(s, cmd.q, cmd.r);
      if (!o || o.kind !== 'den') return fail('noDen');
      if (titanAt(s, o.q, o.r)) fail('titanAtWork');
      const f = denRaidForecast(s);
      if (denRaiders(s).length === 0) fail('noGuards');
      if (f.strength < f.power) fail('tooStrong');
      raidDen(s, o.q, o.r, now, events);
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
      // Chantier 15: a kiwi on a crater or on stardust can be moved too.
      if (
        v.job.kind !== 'idle' &&
        v.job.kind !== 'work' &&
        v.job.kind !== 'guard' &&
        v.job.kind !== 'meteor' &&
        v.job.kind !== 'stardust'
      )
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
      // Placed by the player: no former workplace to go back to.
      delete v.homeJob;
      delete v.lent;
      if (other) delete other.homeJob;
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
      if (cmd.star) payStardust(s, BLESSINGS.starEgg);
      // Chantier 31: an egg offered by an objective costs nothing.
      if (s.objectives.giftEggs > 0) s.objectives.giftEggs--;
      else pay(s, eggCost(s));
      s.egg = {
        startedAt: now,
        readyAt: now + eggDuration(s),
        ...(cmd.star ? { star: true } : {}),
      };
      return;
    }
    case 'claimObjective': {
      if (cmd.id === undefined) {
        const obj = currentObjective(s);
        if (!obj) return fail('noObjective');
        if (!isObjectiveComplete(s, obj)) fail('objectiveIncomplete');
        refund(s, obj.reward);
        s.objectiveIndex++;
        return;
      }
      // Chantier 31: an age objective, only while it is shown.
      const obj = ageObjectives(s).find((o) => o.id === cmd.id);
      if (!obj) return fail('noObjective');
      if (!isObjectiveComplete(s, obj)) fail('objectiveIncomplete');
      refund(s, obj.reward);
      refundStardust(s, obj.stardust ?? 0);
      if (obj.egg) s.objectives.giftEggs++;
      s.objectives.claimed.push(obj.id);
      return;
    }
    case 'launchExpedition': {
      const pad = launchpadOf(s, cmd.launchpadId);
      if (!pad) return fail('notALaunchpad');
      if (isLaunchpadBusy(s, pad.id)) fail('launchpadBusy');
      if (pad.damaged) fail('launchpadDamaged');
      if (!s.targets.some((t) => t.id === cmd.targetId)) fail('unknownTarget');
      const mission = cmd.mission ?? 'raid';
      if (mission === 'retreat') fail('invalidMission');
      const onTwin = twinTarget(s)?.id === cmd.targetId;
      if (mission === 'found') {
        const lock = foundLock(s);
        if (lock) fail(lock);
        if (!onTwin) fail('unknownTarget');
      } else if (onTwin && s.siege.conqueredAt > 0) fail('conquered');
      if (mission !== 'found' && cmd.freight) fail('invalidMission');
      if (isSiegeMission(mission) && !onTwin) fail('unknownTarget');
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
      if (cmd.freight) {
        for (const r of RESOURCE_IDS) {
          const v = cmd.freight[r] ?? 0;
          if (!Number.isFinite(v) || v < 0) fail('invalidCount');
        }
      }
      if (size > maxCrew(s, pad, cmd.mission)) fail('crewTooLarge');
      if (crew.filter((v) => v.kikiwiwi).length > KIKIWIWI.perShip) fail('oneKikiwiwi');
      siegeLaunchCheck(s, cmd, crew);
      const forecast = forecastExpedition(s, cmd)!;
      if (forecast.weight > forecast.cargo + 1e-9) fail('overloaded');
      if (forecast.returnWeight > forecast.cargo + 1e-9) fail('overloaded');
      const freight = cleanFreight(cmd.freight ?? {});
      // Chantier 31: the launch costs fibre and juice per kiwi aboard.
      const fee = forecast.launchCost;
      const need = {
        ...freight,
        pulp: freight.pulp + pulp,
        fiber: freight.fiber + fee.fiber,
        juice: freight.juice + juice + fee.juice,
      };
      if (!canAfford(s.resources, need)) fail('notEnoughResources');
      if (cmd.fuel) payStardust(s, FUEL.stardust);
      pay(s, fee);
      launch(s, cmd, now, nextId(s, 'x'));
      return;
    }
    case 'fortifyBridgehead': {
      const lock = fortifyLock(s, cmd.sector);
      if (lock === 'notAKikiwiwi' || lock === 'noBridgehead') return fail(lock);
      if (lock) fail(lock);
      startFortify(s, cmd.sector, now);
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
      // Chantier 19: kiwis may move to our other colony (never to an ally).
      const ids = cmd.villagerIds ?? [];
      if (ids.length > 0 && friend.id !== SISTER_FRIEND) fail('invalidCrew');
      const movers = crewOf(s, ids);
      if (!movers || new Set(ids).size !== ids.length) return fail('invalidCrew');
      const free = new Set(availableCrew(s).map((v) => v.id));
      if (movers.some((v) => !free.has(v.id))) fail('kiwiBusy');
      if (movers.length > free.size - EXPEDITIONS.keepHome) fail('crewTooLarge');
      if (movers.filter((v) => v.kikiwiwi).length > KIKIWIWI.perShip) fail('oneKikiwiwi');
      if (RESOURCE_IDS.every((r) => load[r] === 0) && movers.length === 0) fail('emptyCargo');
      if (cargoWeight(load) + crewWeight(movers) > shipCargo(pad) + 1e-9) fail('overloaded');
      if (!canAfford(s.resources, load)) fail('notEnoughResources');
      sendShipment(s, pad.id, friend, pad, load, now, nextId(s, 'x'), ids);
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
      s.paths = [...s.paths, ...added];
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
      // Chantier 15: a crater is a post of its own, no camp on it.
      if (meteorAt(s, cmd.q, cmd.r)) fail('onCrater');
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
    case 'collect': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      if (reserveCapOf(s, b) <= 0) fail('notWarehouse');
      if (collectReserve(s, b) <= 0) fail('nothingToCollect');
      s.stats.collects++;
      break;
    }
    case 'collectAll': {
      let moved = 0;
      for (const b of reserveHolders(s)) moved += collectReserve(s, b);
      if (moved <= 0) fail('nothingToCollect');
      s.stats.collects++;
      break;
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
      // Chantier 30: its reserve goes back into the stock, even above the cap (nothing lost).
      if (b.reserve) refund(s, b.reserve);
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
          if (v.job.kind === 'transform') refundStardust(s, v.job.paidDust ?? 0);
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
      payStardust(s, KIKIWIWI.stardust);
      pay(s, cost);
      v.job = {
        kind: 'transform',
        labId: lab.id,
        until: now + infusionDuration(lab),
        risk: infusionRisk(s, v, lab),
        paid: cost,
        paidDust: KIKIWIWI.stardust,
      };
      return;
    }
    case 'useSkill': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      const def = v.classId ? CLASSES[v.classId].skills.find((x) => x.id === cmd.skill) : undefined;
      if (!def?.cooldownMs || !hasSkill(v, cmd.skill)) return fail('skillLocked');
      if ((v.skillReadyAt[cmd.skill] ?? 0) > now) fail('skillCooling');
      if (
        v.job.kind === 'expedition' ||
        v.job.kind === 'outpost' ||
        v.job.kind === 'train' ||
        v.job.kind === 'transform'
      )
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
      return;
    }
    case 'bless': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (cmd.kind === 'heal') {
        if (v.job.kind !== 'injured') fail('notInjured');
        payStardust(s, BLESSINGS.heal);
        v.job = { kind: 'idle' };
        autoAssign(s, v);
      } else if (cmd.kind === 'respec') {
        payStardust(s, BLESSINGS.respec);
        for (const id of STAT_IDS) {
          v.statPoints += v.stats[id] - KIWI.stat.min;
          v.stats[id] = KIWI.stat.min;
        }
      } else if (cmd.kind === 'stat') {
        if (!cmd.stat || !STAT_IDS.includes(cmd.stat)) return fail('invalidCount');
        if ((v.blessings ?? 0) >= BLESSINGS.statMax) fail('blessingLimit');
        if (v.stats[cmd.stat] >= KIWI.stat.cap) fail('statMaxed');
        payStardust(s, BLESSINGS.stat);
        v.stats[cmd.stat]++;
        v.blessings = (v.blessings ?? 0) + 1;
      } else return fail('invalidCount');
      return;
    }
    case 'collectStardust': {
      const patch = s.comets.patches.find((p) => p.id === cmd.patchId);
      if (!patch) return fail('unknownPatch');
      const ids = new Set(cmd.villagerIds);
      if (ids.size !== cmd.villagerIds.length) fail('invalidCrew');
      if (ids.size > STARDUST.slots) fail('patchFull');
      const crew: Villager[] = [];
      for (const id of ids) {
        const v = s.villagers.find((x) => x.id === id);
        if (!v) return fail('unknownVillager');
        if (v.kikiwiwi) fail('kikiwiwiNoWork');
        if (!canPickDust(v)) fail('kiwiBusy');
        crew.push(v);
      }
      if (crew.length > 0 && s.stardust >= STARDUST_CAP) fail('stardustFull');
      for (const v of crew) {
        if (v.job.kind === 'stardust' && v.job.patchId === patch.id) continue;
        const returnTo =
          v.job.kind === 'work'
            ? v.job.buildingId
            : v.job.kind === 'stardust'
              ? v.job.returnTo
              : null;
        v.job = { kind: 'stardust', patchId: patch.id, returnTo };
      }
      for (const v of s.villagers) {
        if (v.job.kind !== 'stardust' || v.job.patchId !== patch.id || ids.has(v.id)) continue;
        const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
        if (back && workersOf(s, back.id).length < workerSlots(back)) {
          v.job = { kind: 'work', buildingId: back.id };
        } else {
          v.job = { kind: 'idle' };
          autoAssign(s, v);
        }
      }
      return;
    }
    case 'setAutomation': {
      if (!AUTO_TASKS.includes(cmd.task)) return fail('invalidCount');
      s.automation = { ...s.automation, [cmd.task]: cmd.on };
      return;
    }
    case 'assignBuilder': {
      const item = s.queue.find((i) => i.id === cmd.queueItemId);
      if (!item) return fail('unknownQueueItem');
      if (item.startedAt !== null) fail('alreadyStarted');
      if (!waitingForBuilder(s).includes(item)) fail('noBuildSlot');
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (v.kikiwiwi) fail('kikiwiwiNoWork');
      // The player may take a locked kiwi; anything but a task of higher priority.
      if (v.job.kind !== 'idle' && !canBorrow(s, { ...v, locked: undefined }, 'build'))
        fail('kiwiBusy');
      startItem(s, item, v, now, events);
      return;
    }
    case 'collectMeteor': {
      const m = s.sky.meteors.find((x) => x.id === cmd.meteorId);
      if (!m || m.stock <= 0) return fail('unknownCrater');
      const ids = new Set(cmd.villagerIds);
      if (ids.size !== cmd.villagerIds.length) fail('invalidCrew');
      if (ids.size > METEORS.slots) fail('craterFull');
      for (const id of ids) {
        const v = s.villagers.find((x) => x.id === id);
        if (!v) return fail('unknownVillager');
        if (v.kikiwiwi) fail('kikiwiwiNoWork');
        if (!canMine(v)) fail('kiwiBusy');
        if (v.job.kind === 'meteor' && v.job.meteorId === m.id) continue;
        v.job = { kind: 'meteor', meteorId: m.id, returnTo: borrow(v) };
      }
      sendBackAll(
        s,
        minersOf(s, m.id)
          .filter((v) => !ids.has(v.id))
          .map((v) => [v, v.job.kind === 'meteor' ? v.job.returnTo : null]),
      );
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
        if (ids.has(v.id)) {
          // Posted by the player (chantier 15): stays after the wave, unless the automation
          // had already posted it.
          if (v.job.kind !== 'guard') delete v.lent;
          v.job = { kind: 'guard' };
        } else if (v.job.kind === 'guard') {
          v.job = { kind: 'idle' };
          autoAssign(s, v);
        }
      }
      return;
    }
    case 'setResearch': {
      // Chantier 19: the shared research is chosen at home (the server routes it there).
      if (isSister(s)) fail('sharedResearch');
      const before = s.research.current;
      if (cmd.tech === null) {
        s.research.current = null;
        refundTechDust(s, before);
        return;
      }
      if (!TECHS[cmd.tech]) return fail('unknownTech');
      const status = techStatus(s, cmd.tech);
      if (status === 'done') fail('techDone');
      if (status === 'age') fail('techAgeLocked');
      if (status === 'library') fail('libraryTooLow');
      if (before !== cmd.tech) {
        refundTechDust(s, before);
        payStardust(s, TECHS[cmd.tech].stardust ?? 0);
      }
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

/** Chantier 19: what an assault, a reinforcement or the final assault needs at take-off. */
function siegeLaunchCheck(
  s: GameState,
  cmd: Extract<Command, { type: 'launchExpedition' }>,
  crew: Villager[],
): void {
  const mission = cmd.mission ?? 'raid';
  const ids = new Set(crew.map((v) => v.id));
  if (mission === 'assault') {
    if (cmd.sector === undefined) return fail('notASector');
    const lock = assaultLock(s, cmd.sector);
    if (lock) fail(lock);
    const holders = cmd.holders ?? [];
    if (
      holders.length === 0 ||
      new Set(holders).size !== holders.length ||
      holders.some((id) => !ids.has(id))
    )
      fail('invalidHolders');
  } else if (mission === 'reinforce') {
    const b = cmd.sector === undefined ? undefined : bridgeheadAt(s, cmd.sector);
    if (!b) return fail('noBridgehead');
    const back = cmd.bringBack ?? [];
    if (new Set(back).size !== back.length || back.some((id) => !b.holders.includes(id)))
      fail('invalidHolders');
    if (crew.length + back.length === 0) fail('crewTooSmall');
  } else if (mission === 'final') {
    const lock = finalLock(s);
    if (lock) fail(lock);
  }
  if (mission !== 'assault' && cmd.holders?.length) fail('invalidHolders');
  if (mission !== 'reinforce' && cmd.bringBack?.length) fail('invalidHolders');
}
