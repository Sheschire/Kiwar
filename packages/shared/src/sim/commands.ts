import { CRYSTAL, GIANT_SEEDS } from '../data/crystal';
import {
  addCrystal,
  crystalOf,
  lensLock,
  payCrystal,
  payGiantSeeds,
  treeSeedCost,
} from './crystal';
import { doorFortifyCost, doorFortLevel, fortifyDoorLock } from './upwell';
import { DEPTHS } from '../data/depths';
import { canDig, gallerySlots, minersIn, minesOpen } from './mines';
import { giveSpeech, speechLock } from './speech';
import { cabaretOf, fireFireworks, fireworksLock } from './village';
import { FIREWORKS, standsOverPath, type FireworksPattern } from '../data/needs';
import { landingLock } from './landing';
import type { LandingOrders } from '../data/landing';
import { IRON_SCALE } from '../data/iron';
import { addIron, meteorIronOf } from './iron';
import { GEAR_SLOTS, ITEMS, type GearSlot, type ItemId } from '../data/gear';
import { cancelOrder, equip, forgeLock, orderItem, unequip, wearLock } from './forge';
import { BLESSINGS, FUEL, STARDUST, STARDUST_SCALE } from '../data/comets';
import { canPickDust, STARDUST_CAP, stardustOf } from './comets';
import {
  borrow,
  canBorrow,
  dispatchTasks,
  canReassign,
  leaveSite,
  sendBack,
  sendBackAll,
  startItem,
  waitingForBuilder,
} from './tasks';
import { AUTO_TASKS, type AutoTask } from '../data/jobs';
import { canMine, meteorAt, minersOf } from './sky';
import { BUILDINGS, footprintOf, levelDef, type BuildingType } from '../data/buildings';
import { CAMPS, PATHS } from '../data/territory';
import { TILES } from '../data/tiles';
import { hexKey } from '../hex/hex';
import { emptyResources, RESOURCE_IDS, type ResourceCost, type Resources } from '../data/resources';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import { KIWI, KIWI_NAME_MAX, STAT_IDS, type StatId } from '../data/kiwis';
import { advanceInPlace, autoAssign, bestIdleFor, idleByPower, type GameEvent } from './advance';
import {
  buildingResource,
  hasSkill,
  trainingCost,
  trainingDuration,
  trainLock,
  workerPower,
} from './kiwis';
import { CLASSES, classSkills, SKILLS, type ClassId, type SkillId } from '../data/classes';
import { faceMapOf, isFlooded, releasePool, syncPools, terraformKey } from './territory';
import { seasonOf } from './calendar';
import { ageObjectives, currentObjective, isObjectiveComplete } from './objectives';
import { buildLock, extensionFor, siteError, upgradeLock } from './describe';
import { clearPathsUnder, footprintHexes, normalRot } from './footprint';
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
  pathBlockedAt,
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
import { twinTarget } from './siege';
import { fortifyCost, fortifyLock, guardLock, startFortify } from './beacons';
import { finalLock } from './queen';
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
import { METEORS, SHELTER, type SectorId } from '../data/threats';
import type { Posture } from '../data/units';
import { waveAhead } from './threats';
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
import { canalDuration, canalError, fillError } from './canals';
import { CANALS } from '../data/canals';
import { TITAN_WORK_IDS, type TitanWork } from '../data/titan';
import { canReshape, terraformLeft, titanAt, titanCost } from './titan';
import { delveLock, launchDelve, tunnelBusy } from './delves';

export type Command =
  /** Chantier 35: `rot` (0–5) turns a 3-tile footprint (`footprintHexes`); default 0. */
  | { type: 'build'; buildingType: BuildingType; q: number; r: number; rot?: number }
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
  | { type: 'hatchEgg'; star?: boolean; locule?: boolean }
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
      /** Chantier 40: the parcel of a landing (chantier 42: of the beacon a guard goes to). */
      sector?: number;
      /** Chantier 42: guards of that beacon the guard ship brings back home. */
      bringBack?: VillagerId[];
      /** Chantier 19: resources the settlers carry to found the colony (mission `found`). */
      freight?: Partial<Resources>;
      /** Chantier 40: the orders of a landing (mission `land`, parcel in `sector`). */
      orders?: LandingOrders;
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
  /** Use an active skill (mage's Rain). */
  | { type: 'useSkill'; villagerId: VillagerId; skill: SkillId }
  /** Debug panel only. Will be rejected by the server in milestone 2. */
  /** Chantier 06: everybody into the Nest for the coming wave (no one hurt, no harvest). */
  | { type: 'shelter' }
  /** Chantier 43: the mayor gives a speech at the Town Hall (everybody gathers there). */
  | { type: 'giveSpeech' }
  /** Chantier 44: open or close the cabaret (it opens at nightfall when open and paid). */
  | { type: 'setCabaret'; open: boolean }
  /** Chantier 44: fire the fireworks (at night, once a night). */
  | { type: 'fireFireworks'; pattern: FireworksPattern }
  /** Mends a building damaged by predators (queued like a construction). */
  | { type: 'repair'; buildingId: BuildingId }
  /** Posts exactly these kiwis on the rampart (the others go back to work). */
  | { type: 'setGarrison'; villagerIds: VillagerId[] }
  /** Chantier 36: how the garrison fights (cautious near its posts, or bold). */
  | { type: 'setPosture'; posture: Posture }
  /** Chantier 36: a guard defends this sector (null: where it is needed). */
  | { type: 'pinGuard'; villagerId: VillagerId; sector: SectorId | null }
  /** Chantier 08: a kiwi goes into the vat of the laboratory against nature. */
  | { type: 'transform'; villagerId: VillagerId; labId: BuildingId }
  /** Chantier 08: a Kikiwiwi smashes the obstacle on a tile, or reshapes it. */
  | { type: 'titanWork'; villagerId: VillagerId; q: number; r: number; work: TitanWork }
  /** Chantier 42: fortify our beacon on this parcel of a face (two turrets and a stout tower). */
  | { type: 'fortifyBeacon'; targetId: string; sector: number }
  /** Chantier 50: fit a crystal lens on a turret (more range). */
  | { type: 'fitLens'; buildingId: BuildingId }
  /** Chantier 50: the seed turrets fire crystal ammunition (paid at each strike) or seeds. */
  | { type: 'setCrystalAmmo'; on: boolean }
  /** Chantier 48: close (or open) the tunnel door: no delve nor mine while it is closed. */
  | { type: 'setTunnelDoor'; closed: boolean }
  /** Chantier 48: fortify the tunnel door (stronger, two turrets at the door). */
  | { type: 'fortifyTunnel' }
  /** Chantier 48: a crew goes down from the tunnel entrance to a room of the depths. */
  | {
      type: 'delve';
      roomId: string;
      crew: VillagerId[];
      provisions: { pulp: number; juice: number };
      orders: LandingOrders;
      /** Chantier 50: skirt the actinidine lakes (longer to a locule, no acid). */
      skirt?: boolean;
    }
  /** Chantier 19: the guards raid the ferret den on this tile (a colonised face). */
  | { type: 'raidDen'; q: number; r: number }
  /** Chantier 08: a builder clears the stump on this tile (queued like a construction). */
  | { type: 'clearObstacle'; q: number; r: number }
  /** Chantier 45: builders dig a juice canal on this flesh tile, or fill a canal back in. */
  | { type: 'digCanal'; q: number; r: number }
  | { type: 'fillCanal'; q: number; r: number }
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
  /** Chantier 48: exactly these kiwis mine this gallery of the depths. */
  | { type: 'postMiners'; roomId: string; villagerIds: VillagerId[] }
  /** Chantier 38: orders a piece at the Forge (paid at once), or cancels an order (refunded). */
  | { type: 'forgeItem'; item: ItemId }
  | { type: 'cancelForge'; orderId: string }
  /** Chantier 38: puts a piece of the armory on a kiwi, or takes it off (`item: null`). */
  | { type: 'equip'; villagerId: VillagerId; slot: GearSlot; item: ItemId | null }
  | { type: 'debugGrant'; resources: Partial<Resources> };

export const COMMAND_ERRORS = [
  'notGuard',
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
  // Chantier 48: the depths.
  'noTunnel',
  'doorClosed',
  'unknownRoom',
  'roomTaken',
  'roomOutOfReach',
  'delveThere',
  'tunnelBusy',
  'galleryFull',
  // Chantier 50: the locules.
  'layerLocked',
  'notEnoughCrystal',
  'lensFitted',
  'notEnoughGiantSeeds',
  'notATurret',
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
  'statTooLow',
  'rankTooLow',
  'wrongClass',
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
  'techAfter',
  'notFlesh',
  'notByJuice',
  'canalCutsLand',
  'wouldFlood',
  'canalLimit',
  'notACanal',
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
  // Chantier 19: the conquest of the twin face.
  'conquered',
  'notASector',
  'invalidMission',
  // Chantier 42: the beacons' defence.
  'noBeacon',
  'fortifying',
  'alreadyFortified',
  'queenHidden',
  // Chantier 19 (second half): the second colony.
  'notConquered',
  'alreadyFounded',
  'sharedResearch',
  // Chantier 35: buildings on several tiles.
  'cutsLand',
  'cramped',
  'noDen',
  'noGuards',
  'tooStrong',
  // Chantier 38: meteoric iron, the Forge and the gear.
  'notEnoughIron',
  'unknownItem',
  'noForge',
  'forgeExists',
  'tunnelExists',
  'townHallExists',
  'statueExists',
  'cabaretExists',
  'noCabaret',
  'fireworksExists',
  'noFireworks',
  'notNight',
  'fireworksDone',
  'noTownHall',
  'noMayor',
  'speechCooling',
  'waveSoon',
  'forgeQueueFull',
  'unknownOrder',
  'notInArmory',
  'wrongFamily',
  'wrongSlot',
  // Chantier 40: the landing.
  'beaconHere',
  'invalidOrders',
  'landingThere',
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

/**
 * Chantier 13: the stardust of an abandoned star technology comes back (up to the cap), and
 * (chantier 38) its meteoric iron.
 */
function refundTechDust(s: GameState, tech: TechId | null): void {
  refundStardust(s, tech ? (TECHS[tech].stardust ?? 0) : 0);
  addIron(s, tech ? (TECHS[tech].iron ?? 0) : 0);
  // Chantier 50: and its crystal.
  addCrystal(s, tech ? (TECHS[tech].crystal ?? 0) : 0);
}

/** Chantier 38: spends whole units of meteoric iron (`notEnoughIron` otherwise). */
function payIron(s: GameState, units: number): void {
  if (units <= 0) return;
  if (meteorIronOf(s) < units) fail('notEnoughIron');
  s.meteorIron -= units * IRON_SCALE;
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
      const rot = normalRot(cmd.rot);
      const site = siteError(s, ctx.map, cmd.buildingType, tile, rot);
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
      // Chantier 50: a locule tree is a giant seed planted (checked by `buildLock`).
      const seeds = treeSeedCost(s, cmd.buildingType);
      payGiantSeeds(s, seeds);
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
        ...(seeds > 0 ? { paidSeeds: seeds } : {}),
        orderedAt: now,
        ...(footprintOf(cmd.buildingType) > 1 ? { rot } : {}),
      });
      // The site replaces any path on its tiles (the covered ones are refunded, chantier 35).
      // An arch stands over its path: the kiwis walk under it.
      if (!standsOverPath(cmd.buildingType))
        clearPathsUnder(s, footprintHexes(cmd.buildingType, cmd.q, cmd.r, rot));
      return;
    }
    case 'upgrade': {
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      // Shared with the level badges (chantier 11).
      const lock = upgradeLock(s, b, ctx.map);
      if (lock) fail(lock);
      // Chantier 35: a cramped building takes its room now (reserved until the upgrade ends).
      const spread = b.cramped ? extensionFor(s, ctx.map, b) : null;
      const target = b.level + 1;
      const cost = upgradeCost(b.type, target);
      const durationMs = constructionDuration(s, b.type, target, false, nearRay(ctx.map, b.q, b.r));
      const dust = levelDef(b.type, target)?.stardust ?? 0;
      const iron = levelDef(b.type, target)?.iron ?? 0;
      payStardust(s, dust);
      payIron(s, iron);
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
        ...(iron > 0 ? { paidIron: iron } : {}),
        orderedAt: now,
        ...(spread !== null ? { rot: spread } : {}),
      });
      if (spread !== null) clearPathsUnder(s, footprintHexes(b.type, b.q, b.r, spread).slice(1));
      return;
    }
    case 'cancel': {
      const index = s.queue.findIndex((i) => i.id === cmd.queueItemId);
      if (index < 0) return fail('unknownQueueItem');
      const [item] = s.queue.splice(index, 1);
      refund(s, item!.paid);
      refundStardust(s, item!.paidDust ?? 0);
      addIron(s, item!.paidIron ?? 0);
      s.giantSeeds += item!.paidSeeds ?? 0;
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
    case 'digCanal':
    case 'fillCanal': {
      const dig = cmd.type === 'digCanal';
      const error = dig ? canalError(s, ctx.map, cmd.q, cmd.r) : fillError(s, cmd.q, cmd.r);
      if (error) fail(error);
      queueHasRoom(s);
      const cost = { ...CANALS.cost };
      pay(s, cost);
      s.queue.push({
        id: nextId(s, 'q') as QueueItemId,
        kind: dig ? 'canal' : 'fill',
        buildingType: 'camp',
        q: cmd.q,
        r: cmd.r,
        buildingId: null,
        targetLevel: 0,
        richness: 1,
        durationMs: canalDuration(s),
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
      // Chantier 15: a kiwi on a crater or on stardust can be moved too, and a builder (its
      // site waits for another one).
      if (!canReassign(v)) fail('kiwiBusy');
      if (cmd.buildingId === null) {
        leaveSite(s, v, now);
        v.job = { kind: 'idle' };
        return;
      }
      if (v.kikiwiwi) fail('kikiwiwiNoWork');
      const b = getBuilding(s, cmd.buildingId);
      if (!b) return fail('unknownBuilding');
      const slots = workerSlots(b);
      if (slots === 0) fail('notAProducer');
      // Chantier 37: the training camp drills kiwis that have a class.
      if (b.type === 'trainingCamp' && !v.classId) fail('wrongClass');
      if (v.job.kind === 'work' && v.job.buildingId === b.id) return;
      let other: (typeof s.villagers)[number] | undefined;
      if (cmd.replace !== undefined) {
        other = workersOf(s, b.id).find((x) => x.id === cmd.replace);
        if (!other) fail('unknownVillager');
      } else if (workersOf(s, b.id).length >= slots) {
        other = weakestWorker(s, b);
      }
      const previous = v.job;
      leaveSite(s, v, now);
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
      // Chantier 50: a locule egg is a giant seed hatched with it.
      if (cmd.locule) {
        if (s.giantSeeds < GIANT_SEEDS.egg.seeds) fail('notEnoughGiantSeeds');
        payGiantSeeds(s, GIANT_SEEDS.egg.seeds);
      }
      // Chantier 31: an egg offered by an objective costs nothing.
      if (s.objectives.giftEggs > 0) s.objectives.giftEggs--;
      else pay(s, eggCost(s));
      s.egg = {
        startedAt: now,
        readyAt: now + eggDuration(s),
        ...(cmd.star ? { star: true } : {}),
        ...(cmd.locule ? { locule: true } : {}),
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
      // Chantier 40: the landing replaces the raids, the reconnaissance and the siege; the
      // settlers' ship stays.
      const mission = cmd.mission ?? 'land';
      if (!['land', 'found', 'guard', 'final'].includes(mission)) fail('invalidMission');
      const onTwin = twinTarget(s)?.id === cmd.targetId;
      if (mission === 'found') {
        const lock = foundLock(s);
        if (lock) fail(lock);
        if (!onTwin) fail('unknownTarget');
      } else if (onTwin && s.siege.conqueredAt > 0) fail('conquered');
      if (mission !== 'found' && cmd.freight) fail('invalidMission');
      if (mission === 'land') {
        const lock = landingLock(s, cmd.targetId, cmd.sector, cmd.orders);
        if (lock) fail(lock);
      } else if (mission === 'final') {
        // Chantier 42: the final battle against the queen, once she is out.
        if (!onTwin) fail('unknownTarget');
        const lock = finalLock(s, cmd.targetId, cmd.orders);
        if (lock) fail(lock);
      } else if (mission === 'guard') {
        const size = typeof cmd.crew === 'number' ? cmd.crew : cmd.crew.length;
        const lock = guardLock(s, cmd.targetId, cmd.sector, size, cmd.bringBack ?? [], cmd.orders);
        if (lock) fail(lock);
      } else if (cmd.orders) fail('invalidMission');
      if (mission !== 'guard' && cmd.bringBack?.length) fail('invalidMission');
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
      if (size < minCrew(mission)) fail('crewTooSmall');
      if (cmd.freight) {
        for (const r of RESOURCE_IDS) {
          const v = cmd.freight[r] ?? 0;
          if (!Number.isFinite(v) || v < 0) fail('invalidCount');
        }
      }
      if (size > maxCrew(s, pad, mission)) fail('crewTooLarge');
      if (crew.filter((v) => v.kikiwiwi).length > KIKIWIWI.perShip) fail('oneKikiwiwi');
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
    case 'delve': {
      const lock = delveLock(s, cmd.roomId, cmd.crew, cmd.orders);
      if (lock) fail(lock);
      const { pulp, juice } = cmd.provisions;
      if (![pulp, juice].every((v) => Number.isFinite(v) && v >= 0)) fail('invalidCount');
      if (!canAfford(s.resources, { pulp, juice })) fail('notEnoughResources');
      launchDelve(
        s,
        cmd.roomId,
        cmd.crew,
        { pulp, juice },
        cmd.orders,
        now,
        nextId(s, 'x'),
        !!cmd.skirt,
      );
      return;
    }
    case 'fitLens': {
      const b = s.buildings.find((x) => x.id === cmd.buildingId);
      const lock = lensLock(s, b);
      if (lock) fail(lock);
      payCrystal(s, CRYSTAL.lens.crystal);
      b!.lens = true;
      return;
    }
    case 'setCrystalAmmo': {
      if (!techEffects(s).crystalAmmo) fail('techMissing');
      s.threats.crystalAmmo = cmd.on;
      return;
    }
    case 'setTunnelDoor': {
      if (!s.buildings.some((b) => b.type === 'tunnel')) fail('noTunnel');
      s.depths.door.closed = cmd.closed;
      return;
    }
    case 'fortifyTunnel': {
      const lock = fortifyDoorLock(s);
      if (lock) fail(lock);
      const cost = doorFortifyCost(s);
      if (!canAfford(s.resources, cost.resources)) fail('notEnoughResources');
      payIron(s, cost.iron);
      pay(s, cost.resources);
      s.depths.door.fortifying = {
        until: now + DEPTHS.fortify.durationMs,
        level: doorFortLevel(s),
      };
      return;
    }
    case 'fortifyBeacon': {
      if (!s.targets.some((t) => t.id === cmd.targetId)) fail('unknownTarget');
      const lock = fortifyLock(s, cmd.targetId, cmd.sector);
      if (lock) fail(lock);
      const cost = fortifyCost(s);
      if (!canAfford(s.resources, cost.resources)) fail('notEnoughResources');
      payIron(s, cost.iron);
      pay(s, cost.resources);
      startFortify(s, cmd.targetId, cmd.sector, now);
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
        if (pathBlockedAt(s, h.q, h.r)) fail('tileOccupied');
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
      // Chantier 48: not while kiwis are down there.
      if (b.type === 'tunnel' && tunnelBusy(s)) fail('tunnelBusy');
      const housingLeft = housing(s) - (levelDef(b.type, b.level)?.housing ?? 0);
      if (housingLeft < population(s)) fail('housingNeeded');
      refund(s, demolitionRefund(s, b));
      // Chantier 30: its reserve goes back into the stock, even above the cap (nothing lost).
      if (b.reserve) refund(s, b.reserve);
      // Chantier 38: the Forge's orders are refunded (the armory stays).
      if (b.type === 'forge') while (s.forge.orders.length > 0) cancelOrder(s, 0);
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
          const home = v.job.kind === 'train' ? (v.job.returnTo ?? null) : null;
          v.job = { kind: 'idle' };
          sendBack(s, v, home);
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
      // Chantier 37: the training camp promotes and changes classes too.
      if (!school || (school.type !== 'school' && school.type !== 'trainingCamp'))
        return fail('notASchool');
      const def = CLASSES[cmd.classId];
      if (!def) return fail('classLocked');
      const lock = trainLock(s, v, cmd.classId, school);
      if (lock) fail(lock);
      // Any kiwi at home can go, whatever it does (harvest, garrison, crater, stardust, a
      // site); it goes back to its workplace after the course.
      if (
        v.job.kind !== 'idle' &&
        v.job.kind !== 'work' &&
        v.job.kind !== 'guard' &&
        v.job.kind !== 'meteor' &&
        v.job.kind !== 'mine' &&
        v.job.kind !== 'stardust' &&
        v.job.kind !== 'build'
      )
        fail('kiwiBusy');
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
      const lvl = levelDef(school.type, school.level)!;
      const trainees = s.villagers.filter(
        (x) => x.job.kind === 'train' && x.job.schoolId === school.id,
      ).length;
      if (trainees >= (lvl.trainingSlots ?? 0)) fail('schoolFull');
      const cost = trainingCost(v, cmd.classId, school);
      pay(s, cost);
      leaveSite(s, v, now);
      const home = borrow(v);
      delete v.homeJob;
      v.job = {
        kind: 'train',
        schoolId: school.id,
        classId: cmd.classId,
        until: now + trainingDuration(school, cmd.classId),
        paid: cost,
        returnTo: home,
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
      const def = v.classId ? classSkills(v.classId).find((x) => x.id === cmd.skill) : undefined;
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
        // Chantier 37: a druid's Rain is stronger.
        const refill = v.classId === 'druid' ? SKILLS.druidRain : SKILLS.rainRefill;
        b.pool.stock = Math.min(h.cap, h.stock + refill * h.cap);
      }
      v.skillReadyAt[cmd.skill] = now + def.cooldownMs;
      return;
    }
    case 'giveSpeech': {
      const lock = speechLock(s);
      if (lock) return fail(lock);
      giveSpeech(s, now);
      return;
    }
    case 'fireFireworks': {
      const lock = fireworksLock(s, cmd.pattern);
      if (lock) return fail(lock);
      const def = FIREWORKS[cmd.pattern];
      pay(s, def.cost);
      payStardust(s, def.stardust);
      fireFireworks(s, cmd.pattern, now);
      return;
    }
    case 'setCabaret': {
      if (!cabaretOf(s)) return fail('noCabaret');
      s.village = { ...s.village, cabaretOpen: cmd.open };
      return;
    }
    case 'shelter': {
      const f = waveAhead(s);
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
    case 'forgeItem': {
      const lock = forgeLock(s, cmd.item);
      if (lock) fail(lock);
      orderItem(s, cmd.item, nextId(s, 'f'));
      return;
    }
    case 'cancelForge': {
      const index = s.forge.orders.findIndex((o) => o.id === cmd.orderId);
      if (index < 0) return fail('unknownOrder');
      cancelOrder(s, index);
      return;
    }
    case 'equip': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (!GEAR_SLOTS.includes(cmd.slot)) fail('wrongSlot');
      if (v.job.kind === 'expedition' || v.job.kind === 'outpost') fail('kiwiBusy');
      if (cmd.item === null) {
        unequip(s, v, cmd.slot);
        // Taken off by hand: the automation leaves this kiwi alone.
        if (v.gear) v.gear.kept = true;
        else v.gear = { kept: true };
        return;
      }
      if (!ITEMS[cmd.item]) return fail('unknownItem');
      if (ITEMS[cmd.item].slot !== cmd.slot) fail('wrongSlot');
      if (!s.forge.armory[cmd.item]) fail('notInArmory');
      const lock = wearLock(v, cmd.item);
      if (lock) fail(lock);
      equip(s, v, cmd.item, true);
      return;
    }
    case 'collectMeteor': {
      const m = s.sky.meteors.find((x) => x.id === cmd.meteorId);
      if (!m || (m.stock <= 0 && m.iron <= 0)) return fail('unknownCrater');
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
    case 'postMiners': {
      if (!s.depths.galleries[cmd.roomId]) return fail('unknownRoom');
      if (!minesOpen(s)) fail('doorClosed');
      const ids = new Set(cmd.villagerIds);
      if (ids.size !== cmd.villagerIds.length) fail('invalidCrew');
      if (ids.size > gallerySlots(s, cmd.roomId)) fail('galleryFull');
      for (const id of ids) {
        const v = s.villagers.find((x) => x.id === id);
        if (!v) return fail('unknownVillager');
        if (v.kikiwiwi) fail('kikiwiwiNoWork');
        if (!canDig(v)) fail('kiwiBusy');
        if (v.job.kind === 'mine' && v.job.roomId === cmd.roomId) continue;
        v.job = { kind: 'mine', roomId: cmd.roomId, returnTo: borrow(v) };
      }
      sendBackAll(
        s,
        minersIn(s, cmd.roomId)
          .filter((v) => !ids.has(v.id))
          .map((v) => [v, v.job.kind === 'mine' ? v.job.returnTo : null]),
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
    case 'setPosture': {
      s.threats.posture = cmd.posture;
      return;
    }
    case 'pinGuard': {
      const v = s.villagers.find((x) => x.id === cmd.villagerId);
      if (!v) return fail('unknownVillager');
      if (v.job.kind !== 'guard') fail('notGuard');
      const pins = { ...s.threats.pins };
      if (cmd.sector) pins[v.id] = cmd.sector;
      else delete pins[v.id];
      s.threats.pins = pins;
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
      if (status === 'after') fail('techAfter');
      if (before !== cmd.tech) {
        refundTechDust(s, before);
        payStardust(s, TECHS[cmd.tech].stardust ?? 0);
        payIron(s, TECHS[cmd.tech].iron ?? 0);
        const crystal = TECHS[cmd.tech].crystal ?? 0;
        if (crystalOf(s) < crystal) fail('notEnoughCrystal');
        payCrystal(s, crystal);
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
