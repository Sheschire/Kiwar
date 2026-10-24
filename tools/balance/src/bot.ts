import {
  civAt,
  civWave,
  CLASSES,
  nextConstructionEnd,
  HOUR_MS,
  advance,
  applyCommand,
  buildCost,
  buildingHarvest,
  buildingCount,
  canAfford,
  canCollect,
  canHatch,
  consumption,
  productionRates,
  storageFullCheck,
  capacity,
  reserveHolders,
  reserves,
  hasSkill,
  KIWI,
  claimableObjective,
  currentObjective,
  HUNGER_SCALE,
  eggCost,
  faceMapOf,
  housing,
  idleVillagers,
  isObjectiveComplete,
  ageOf,
  nest,
  nestDef,
  newGame,
  OBJECTIVES,
  pendingUpgrade,
  population,
  RESOURCE_IDS,
  upgradeCost,
  workersOf,
  workerSlots,
  type BiomeId,
  type BuildingType,
  type Command,
  type Face,
  type FaceMap,
  type GameState,
  STARDUST_SCALE,
  stardustOf,
  deliverToSister,
  syncColonies,
  takeFounding,
  twinTarget,
} from '@kiwar/shared';
import { ageDecision, monumentDecision } from './bot/ages';
import { campOrder } from './bot/camps';
import { expeditionOrder, launchpadOrder } from './bot/expeditions';
import { pathOrder } from './bot/paths';
import { defenseOrders, keepsAmmo, turretDecision } from './bot/defense';
import {
  PRODUCERS,
  BUILD_ORDER,
  bottlenecks,
  bestTile,
  upgradeOk,
  canFeedOneMore,
} from './bot/economy';
import { rpgDecision } from './bot/rpg';
import { forgeBuildDecision, forgeOrder } from './bot/forge';
import { cometOrders } from './bot/sky';
import { titanOrders, labDecision } from './bot/titans';
import { siegeOrder } from './bot/siege';
import { beaconOrder, finalOrder } from './bot/beacons';
import { linkOrder } from './bot/colonies';

export const MILESTONES = [
  'tutorial',
  'pop10',
  'nest2',
  'nest3',
  'allLevel3',
  'kiwi5',
  'kiwi10',
  'mayor',
  'library',
  'stone',
  'iron',
  'industry',
  'lab',
  'kikiwiwi',
  // Chantier 40: the first glimpse (a landing back home), the first beacon, one in the centre.
  'glimpse',
  'landingWon',
  'centreWon',
  // Chantier 42: the queen out of the depths (12 beacons), the conquest; then the second colony.
  'queenOut',
  'conquest',
  'founded',
  'sisterNest3',
  'sisterWave',
] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface RunResult {
  seed: string;
  face: Face;
  biome: BiomeId;
  /** Milliseconds from the start to reach each milestone (null = not reached within the horizon). */
  times: Record<Milestone, number | null>;
  final: {
    population: number;
    buildings: number;
    produced: number;
    /** Kiwis lost to famine, and the longest hunger gauge reached (hours of privation). */
    starved?: number;
    maxHungerH?: number;
    /** Chantier 06: predator waves met and lost, kiwis killed by them, meteorites fallen. */
    waves?: number;
    wavesLost?: number;
    /** Chantier 31: waves that cost anything (loot, damage, wounds, deaths), loot in all. */
    wavesHurt?: number;
    waveLoot?: number;
    predatorDeaths?: number;
    meteors?: number;
    /** Chantier 13: comets passed, stardust picked in all and left at the end. */
    comets?: number;
    dustPicked?: number;
    stardust?: number;
    /** Chantier 18: path tiles at the end, camps set up during the run. */
    paths?: number;
    camps?: number;
    /** Chantier 40: landings, landings won, retreats, ships lost; kiwis lost on expeditions,
     *  loot brought back (all resources, raw units). */
    landings?: number;
    landingsWon?: number;
    retreats?: number;
    shipsLost?: number;
    expeditionDeaths?: number;
    loot?: number;
    /** Chantier 42: final battles fought, attacks on our beacons, those held, guards lost. */
    finals?: number;
    beaconAttacks?: number;
    beaconsHeld?: number;
    guardDeaths?: number;
    /** Chantier 19: kiwis of the second colony at the end. */
    sisterKiwis?: number;
    /**
     * Chantier 30: the longest stretch of the first 24 h without a useful decision (build,
     * upgrade, research, egg, expedition), in minutes; the share of the run the most capped
     * resource spent with its stock and reserves full; production lost meanwhile, as a share of
     * what was produced.
     */
    deadMaxMin?: number;
    /**
     * Chantier 39: age of the alien civilisation at the end, and when we reached the Stone,
     * Iron and Industry ages (null: not reached); its wave factor at the end.
     */
    civAge?: number;
    civAtAges?: (number | null)[];
    civWave?: number;
    /** Chantier 31: when that stretch began (hours of play), for diagnostics. */
    deadAtH?: number;
    capShare?: number;
    lostShare?: number;
  };
}

/** Commands that are a real decision (dead time is the longest stretch without one). */
const USEFUL = new Set<Command['type']>([
  'build',
  'upgrade',
  'setResearch',
  'hatchEgg',
  'launchExpedition',
  // Chantier 31: claiming an objective, sheltering.
  'claimObjective',
  'shelter',
]);
/** Chantier 31: preparing an announced wave is a decision too (bringing the reserves back). */
const WAVE_PREP = new Set<Command['type']>(['collect', 'collectAll', 'setGarrison']);

function try_(state: GameState, map: FaceMap, now: number, cmd: Command): GameState | null {
  const r = applyCommand(state, cmd, { now, map });
  return r.ok ? r.state : null;
}

/**
 * A simple, reasonable player: follows the tutorial, keeps every kiwi busy, hatches eggs,
 * builds one of each producer, then upgrades the bottleneck resource, adds housing and storage
 * when needed and upgrades the Nest as soon as possible.
 */
/** One decision round (exported for diagnostics: what the bot wants to do right now). */
export function decide(state: GameState, map: FaceMap, play: Play): Command[] {
  const cmds = decideAll(state, map, play);
  return play.prepared ? cmds.filter((c) => keepsAmmo(state, c)) : cmds;
}

function decideAll(state: GameState, map: FaceMap, play: Play): Command[] {
  const cmds: Command[] = [];
  // Chantier 30: bring the warehouse reserves back at every visit (only the player can).
  if (reserveHolders(state).some((b) => canCollect(state, b))) cmds.push({ type: 'collectAll' });
  const obj = currentObjective(state);
  if (obj && isObjectiveComplete(state, obj)) cmds.push({ type: 'claimObjective' });
  // Chantier 31: the age objectives, as soon as one is fulfilled.
  const ready = obj ? null : claimableObjective(state);
  if (ready) cmds.push({ type: 'claimObjective', id: ready.id });

  // Place earned stat points: Dexterity for everyone (harvest), the class's stat for a classed
  // kiwi (chantier 37: the lower of two for a master).
  for (const v of state.villagers) {
    if (v.statPoints <= 0) continue;
    const c = v.classId ? CLASSES[v.classId] : null;
    const stat = !c
      ? 'dexterity'
      : c.stat2 && v.stats[c.stat2] < v.stats[c.stat]
        ? c.stat2
        : c.stat;
    if (v.stats[stat] < KIWI.stat.cap)
      cmds.push({ type: 'spendStatPoint', villagerId: v.id, stat });
  }
  // The mayor speaks whenever it can.
  const mayor = state.villagers.find((v) => v.classId === 'mayor');
  if (mayor && hasSkill(mayor, 'speech') && (mayor.skillReadyAt.speech ?? 0) <= state.now)
    cmds.push({ type: 'useSkill', villagerId: mayor.id, skill: 'speech' });

  // Chantier 13: blessings. Since chantier 15 the automation sends the pickers of the
  // stardust, the researchers, the miners of the craters, the garrison and the repairs.
  cmds.push(...cometOrders(state));

  // Chantier 19: the siege of the twin, then the settlers' ship (checked every half hour,
  // or at once while a step leads to the next: standing down, then boarding).
  const besieging = play.siege && !!twinTarget(state) && state.siege.conqueredAt > 0;
  if (besieging && state.now >= play.siegeAt) {
    const siege = siegeOrder(state, map);
    if (siege) cmds.push(siege);
    else play.siegeAt = state.now + HOUR_MS / 2;
  }

  // Chantier 42: the defence of the beacons and the final battle come before new landings.
  if (play.expeditions && !besieging) {
    const defend = beaconOrder(state, map) ?? finalOrder(state, map);
    if (defend) cmds.push(defend);
  }

  // Chantier 18: reconnaissance and raids (before the Kikiwiwi goes back to the rampart).
  // Looked at every half hour of game time (the plans are costly to weigh). The siege keeps
  // the launchpad for itself.
  if (play.expeditions && !besieging && state.now >= play.expeditionsAt) {
    const expedition = expeditionOrder(state, map);
    if (expedition) cmds.push(expedition);
    else play.expeditionsAt = state.now + HOUR_MS / 2;
  }

  // Kikiwiwis (chantier 08): an infusion, the garrison, titan works.
  const titan = titanOrders(state, map);
  if (titan) cmds.push(titan);

  // Keep everyone busy (Kikiwiwis never take a workplace).
  let idle = idleVillagers(state).filter((v) => !v.kikiwiwi).length;
  for (const b of state.buildings) {
    const free = workerSlots(b) - workersOf(state, b.id).length;
    if (free > 0 && idle > 0) {
      const add = Math.min(free, idle);
      cmds.push({
        type: 'assignWorkers',
        buildingId: b.id,
        count: workersOf(state, b.id).length + add,
      });
      idle -= add;
    }
  }

  // Chantier 18: camps on meteorite craters and, with spare kiwis, on the scarcest deposit.
  if (play.camps) {
    const camp = campOrder(state, map);
    if (camp) cmds.push(camp);
  }

  // Chantier 06: post guards just before a wave, shelter from a heavy defeat (chantier 31:
  // only an attentive player prepares).
  if (play.prepared) cmds.push(...defenseOrders(state));

  // Hatch only kiwis the colony can feed (chantier 04).
  if (canHatch(state) && canAfford(state.resources, eggCost(state)) && canFeedOneMore(state))
    cmds.push({ type: 'hatchEgg' });

  // Chantier 18: paths pave the walk to the depot when they pay back quickly (no queue).
  // Looked at once per game hour, like a player checking the map now and then.
  if (play.paths && state.now >= play.pathsAt) {
    const path = pathOrder(state, map);
    if (path) cmds.push(path);
    else play.pathsAt = state.now + HOUR_MS;
  }

  // Chantier 38: pieces for the fighters (no construction queue), looked at once per game hour.
  if (play.forge && state.now >= play.forgeAt) {
    const piece = forgeOrder(state);
    if (piece) cmds.push(piece);
    else play.forgeAt = state.now + HOUR_MS;
  }

  const queueRoom = state.queue.length < (nestDef(state).queueSize ?? 1);
  if (!queueRoom) return cmds;

  const has = (type: BuildingType) =>
    state.buildings.some((b) => b.type === type) ||
    state.queue.some((i) => i.buildingType === type);
  const build = (type: BuildingType): Command | null => {
    const site = bestTile(state, map, type);
    return site ? { type: 'build', buildingType: type, ...site } : null;
  };

  // 0. Chantier 30: the monument as soon as its passage is known (it saves up for it).
  const monument = monumentDecision(state, map, build);
  if (monument === 'save') return cmds;
  if (monument) return [...cmds, monument];

  // 1. One of each building, in order.
  for (const type of BUILD_ORDER) {
    if (!has(type)) {
      const c = build(type);
      if (c && canAfford(state.resources, buildCost(state, type))) return [...cmds, c];
      if (c) return cmds; // save up for it
    }
  }

  // 2. Housing when the population is capped.
  const housingQueued = state.queue.some((i) => i.buildingType === 'hut');
  if (population(state) + (state.egg ? 1 : 0) >= housing(state) && !housingQueued) {
    const hut = state.buildings
      .filter((b) => b.type === 'hut')
      .sort((a, b) => a.level - b.level)[0];
    if (
      hut &&
      upgradeOk(state, hut) &&
      !pendingUpgrade(state, hut.id) &&
      hut.level < nest(state).level + 1
    ) {
      return [...cmds, { type: 'upgrade', buildingId: hut.id }];
    }
    const c = build('hut');
    if (c && buildingCount(state) < (nestDef(state).maxBuildings ?? 0)) return [...cmds, c];
  }

  // 2a. Turrets (chantier 06) once the Nest is level 2.
  const turret = turretDecision(state, build, play.prepared);
  if (turret) return [...cmds, turret];

  // 2b. RPG (chantier 03): a School once the Nest is level 2, then a mayor and a builder.
  const rpg = rpgDecision(state, map, build, has, play.expeditions, play.classes);
  if (rpg) return [...cmds, rpg];

  // 2c. Research and ages (chantier 08): Library, researchers, technologies, the monument.
  const ages = ageDecision(state, map, build, has);
  if (ages === 'save') return cmds;
  if (ages) return [...cmds, ages];

  // 2c''. Chantier 38: the Forge once its technology is known.
  if (play.forge) {
    const forge = forgeBuildDecision(state, build, has);
    if (forge) return [...cmds, forge];
  }

  // 2c'. Chantier 18: a launchpad once the Library stands.
  if (play.expeditions) {
    const pad = launchpadOrder(state, build);
    if (pad) return [...cmds, pad];
  }

  // 2d. The laboratory against nature once its technology is known; stumps in the way.
  const lab = labDecision(state, build, has);
  if (lab) return [...cmds, lab];

  // 3. Nest upgrade whenever affordable.
  const n = nest(state);
  if (
    upgradeOk(state, n) &&
    !pendingUpgrade(state, n.id) &&
    canAfford(state.resources, upgradeCost('nest', n.level + 1))
  ) {
    return [...cmds, { type: 'upgrade', buildingId: n.id }];
  }
  // Chantier 15: save up for the Nest (constructions start faster and in parallel, and an
  // upgrade "whenever affordable" made the Nest 3 a race against the producers' upgrades,
  // won or lost by chance: ±30 % between biomes). After the tutorial, which has its own goals.
  if (!currentObjective(state) && upgradeOk(state, n) && !pendingUpgrade(state, n.id)) return cmds;

  // 4. Storage when something is nearly full (chantier 30: the warehouses' reserves).
  const cap = capacity(state);
  const r = reserves(state);
  const nearlyFull = RESOURCE_IDS.some(
    (id) => state.resources[id] > cap[id] * 0.9 && r.stock[id] > r.cap[id] * 0.75,
  );
  if (nearlyFull && !state.queue.some((i) => i.buildingType === 'warehouse')) {
    const wh = state.buildings
      .filter((b) => b.type === 'warehouse')
      .sort((a, b) => a.level - b.level)[0];
    if (wh && upgradeOk(state, wh) && !pendingUpgrade(state, wh.id))
      return [...cmds, { type: 'upgrade', buildingId: wh.id }];
  }

  // 5. Upgrade the producer of the bottleneck resource (lowest production, full storage
  // ignored: a full resource is not a bottleneck).
  const { rates, order } = bottlenecks(state);
  for (const res of order) {
    if (rates[res] === Infinity) continue;
    const type = PRODUCERS[res];
    // Upgrading a producer whose deposits are exhausted does not help: open a new site.
    const candidates = state.buildings
      .filter(
        (b) =>
          b.type === type &&
          upgradeOk(state, b) &&
          !pendingUpgrade(state, b.id) &&
          buildingHarvest(state, b, () => false)?.status !== 'depleted',
      )
      .sort((a, b) => a.level - b.level);
    const target = candidates[0];
    let cmd: Command | null = null;
    if (target) cmd = { type: 'upgrade', buildingId: target.id };
    else if (buildingCount(state) < (nestDef(state).maxBuildings ?? 0)) cmd = build(type);
    if (!cmd) continue;
    const r = applyCommand(state, cmd, { now: state.now, map });
    if (r.ok) return [...cmds, cmd];
    // Save up for the bottleneck rather than spending on something else.
    if (r.error === 'notEnoughResources' || r.error === 'queueFull') return cmds;
  }
  // 6. Then anything else that is not maxed (huts, warehouses).
  for (const b of state.buildings) {
    if (upgradeOk(state, b) && !pendingUpgrade(state, b.id))
      cmds.push({ type: 'upgrade', buildingId: b.id });
  }
  return cmds;
}

function checkMilestones(
  state: GameState,
  start: number,
  times: Record<Milestone, number | null>,
): void {
  const t = state.now - start;
  const set = (m: Milestone, ok: boolean) => {
    if (ok && times[m] === null) times[m] = t;
  };
  set('tutorial', state.objectiveIndex >= OBJECTIVES.length);
  set('pop10', population(state) >= 10);
  set('nest2', nest(state).level >= 2);
  set('nest3', nest(state).level >= 3);
  set(
    'kiwi5',
    state.villagers.some((v) => v.level >= 5),
  );
  set(
    'kiwi10',
    state.villagers.some((v) => v.level >= 10),
  );
  set(
    'mayor',
    state.villagers.some((v) => v.classId === 'mayor'),
  );
  set(
    'library',
    state.buildings.some((b) => b.type === 'library'),
  );
  set('conquest', state.siege.conqueredAt > 0);
  set('queenOut', !!state.faceViews[twinTarget(state)?.id ?? '']?.queen);
  set('stone', ageOf(state) >= 1);
  set('iron', ageOf(state) >= 2);
  set('industry', ageOf(state) >= 3);
  set(
    'lab',
    state.buildings.some((b) => b.type === 'lab'),
  );
  set(
    'kikiwiwi',
    state.villagers.some((v) => v.kikiwiwi),
  );
  set(
    'allLevel3',
    // Economy buildings (the bot does not play expeditions yet).
    (['nest', ...BUILD_ORDER] as BuildingType[]).every((type) =>
      state.buildings.some((b) => b.type === type && b.level >= 3),
    ),
  );
}

/** Mechanics the bot can be told to leave aside, to measure what each one brings. */
export const MECHANICS = ['paths', 'camps', 'expeditions', 'classes', 'forge'] as const;
export type Mechanic = (typeof MECHANICS)[number];
export interface Play extends Record<Mechanic, boolean> {
  /** Next look at the paths, the expeditions and the Forge's orders. */
  pathsAt: number;
  expeditionsAt: number;
  forgeAt: number;
  /** Chantier 19: the bot besieges the twin and founds the second colony. */
  siege: boolean;
  siegeAt: number;
  /** Chantier 31: an attentive player prepares the announced waves; an occasional one not. */
  prepared: boolean;
}

export interface RunOptions {
  seed: string;
  face: Face;
  /** Biome of the face (default: drawn from the seed). */
  biome?: BiomeId;
  horizonMs: number;
  /** Decision interval when nothing else happens. */
  stepMs?: number;
  /** Diagnostics: called after each decision round. */
  onStep?(state: GameState, map: FaceMap): void;
  /** Keep playing until the horizon even once every milestone is reached. */
  fullHorizon?: boolean;
  /** Mechanics the bot does not use (impact report). */
  without?: readonly Mechanic[];
  /**
   * An occasional player: after `activeMs` of attentive play, the bot only comes back every
   * `sessionEveryMs` (e.g. twice a day) and the colony runs on its own in between.
   */
  activeMs?: number;
  sessionEveryMs?: number;
  /** Chantier 19: leave the siege aside (default: besiege the twin once it opens). */
  noSiege?: boolean;
  /** Chantier 19: called after each round with the second colony, once founded. */
  onSister?(sister: GameState, home: GameState): void;
}

export function runBot(opts: RunOptions): RunResult {
  const start = 1_700_000_000_000;
  let state = newGame({ seed: opts.seed, face: opts.face, now: start, biome: opts.biome });
  // The map follows the tiles the Kikiwiwis reshape (chantier 08).
  let map = faceMapOf(state);
  const play: Play = {
    ...(Object.fromEntries(MECHANICS.map((m) => [m, !opts.without?.includes(m)])) as Record<
      Mechanic,
      boolean
    >),
    pathsAt: 0,
    expeditionsAt: 0,
    forgeAt: 0,
    siege: !opts.noSiege,
    siegeAt: 0,
    prepared: !opts.sessionEveryMs,
  };
  // Chantier 19: the second colony, played with the same rules once founded.
  let sister: GameState | null = null;
  let sisterMap: FaceMap | null = null;
  const sisterPlay: Play = { ...play, siege: false, expeditions: false };
  let sisterWavesSeen = 0;
  const times = Object.fromEntries(MILESTONES.map((m) => [m, null])) as Record<
    Milestone,
    number | null
  >;
  const step = opts.stepMs ?? 30_000;
  let now = start;
  let maxHunger = 0;
  let wavesLost = 0;
  let wavesSeen = 0;
  let wavesHurt = 0;
  let waveLoot = 0;
  let dustPicked = 0;
  let campsSet = 0;
  const trips = { landings: 0, landingsWon: 0, retreats: 0, shipsLost: 0, loot: 0, finals: 0 };
  // Chantier 42: attacks on the beacons (held, fallen, guards lost).
  const attacks = { total: 0, held: 0, dead: 0 };
  const counted = new Set<string>();
  // Chantier 30: dead time, time at the cap, production lost to full reserves.
  const DAY_MS = 24 * HOUR_MS;
  let lastUseful = start;
  let deadMax = 0;
  let deadAt = start;
  const capped = Object.fromEntries(RESOURCE_IDS.map((id) => [id, null])) as Record<
    (typeof RESOURCE_IDS)[number],
    { since: number; rate: number } | null
  >;
  const cappedMs = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])) as Record<
    (typeof RESOURCE_IDS)[number],
    number
  >;
  let lost = 0;
  const civAtAges: (number | null)[] = [null, null, null];
  while (now - start < opts.horizonMs) {
    const dustBefore = state.stardust;
    const stepped = advance(state, now);
    state = stepped.state;
    for (const e of stepped.events) {
      if (e.type === 'beaconAttacked') {
        attacks.total++;
        if (e.held) attacks.held++;
        attacks.dead += e.dead;
      }
      // Chantier 30: an age is dated by its event (an occasional player sees it at the next
      // visit, but it happened while away).
      if (e.type === 'ageReached') {
        const m = (['stone', 'iron', 'industry'] as const)[e.age - 1];
        if (m && times[m] === null) times[m] = e.at - start;
        const twin = state.aliens?.[state.targets.find((t) => t.distance === 0)?.id ?? ''];
        if (m && twin && civAtAges[e.age - 1] === null)
          civAtAges[e.age - 1] = civAt(twin, e.at).age;
      }
      if (e.type !== 'storageFull' || capped[e.resource]) continue;
      const gross = productionRates(state, () => false)[e.resource];
      const rate = Math.max(0, gross - consumption(state)[e.resource]);
      capped[e.resource] = { since: e.at, rate };
    }
    dustPicked += Math.max(0, state.stardust - dustBefore);
    map = faceMapOf(state);
    maxHunger = Math.max(maxHunger, state.hunger);
    for (const e of state.expeditions) {
      if (e.status !== 'done' || counted.has(e.id) || !e.result) continue;
      counted.add(e.id);
      if (e.mission === 'final' && !e.result.aborted) trips.finals++;
      if (e.result.aborted || e.mission !== 'land') continue;
      trips.landings++;
      if (times.glimpse === null && e.result.outcome !== 'defeat')
        times.glimpse = e.arriveAt - start;
      if (e.result.outcome === 'retreat') trips.retreats++;
      if (e.result.outcome === 'defeat') trips.shipsLost++;
      if (e.result.outcome === 'victory') {
        trips.landingsWon++;
        if (times.landingWon === null) times.landingWon = e.arriveAt - start;
        if (times.centreWon === null && e.sector !== undefined && e.sector < 6)
          times.centreWon = e.arriveAt - start;
      }
      trips.loot += RESOURCE_IDS.reduce((sum, id) => sum + e.result!.loot[id], 0);
    }
    // Count the waves lost since the last look (reports keep the last few).
    if (state.threats.waves > wavesSeen) {
      const fresh = state.threats.reports.slice(-(state.threats.waves - wavesSeen));
      wavesLost += fresh.filter((r) => !r.victory).length;
      // Chantier 31: what each wave cost (loot, damage, wounds, deaths).
      for (const r of fresh) {
        const loot = RESOURCE_IDS.reduce((sum, id) => sum + r.loot[id], 0);
        waveLoot += loot;
        if (loot > 0 || r.damaged.length > 0 || r.injured.length > 0 || r.dead.length > 0)
          wavesHurt++;
      }
      wavesSeen = state.threats.waves;
    }
    // Apply every possible decision at this instant (first one wins per category).
    // An occasional player does everything it can in a session.
    const away = !!opts.sessionEveryMs && now - start >= (opts.activeMs ?? 0);
    for (let guard = 0; guard < (away ? 60 : 12); guard++) {
      const cmds = decide(state, map, play);
      let applied = false;
      for (const cmd of cmds) {
        const next = try_(state, map, now, cmd);
        if (next) {
          if (cmd.type === 'gather') campsSet++;
          const prep = WAVE_PREP.has(cmd.type) && !!state.threats.next?.announced;
          if ((USEFUL.has(cmd.type) || prep) && now - start <= DAY_MS) {
            if (now - lastUseful > deadMax) deadAt = lastUseful;
            deadMax = Math.max(deadMax, now - lastUseful);
            lastUseful = now;
          }
          state = next;
          applied = true;
          break;
        }
      }
      if (!applied) break;
    }
    // Chantier 19: the settlers landed; the sister colony lives from then on.
    if (!sister && state.colony.founding) {
      sister = takeFounding(state);
      if (times.founded === null && sister) times.founded = sister.createdAt - start;
    }
    if (sister) {
      sister = advance(sister, now).state;
      sisterMap = faceMapOf(sister);
      for (let guard = 0; guard < 12; guard++) {
        const cmds = decide(sister, sisterMap, sisterPlay);
        let applied = false;
        for (const cmd of cmds) {
          const next = try_(sister, sisterMap, now, cmd);
          if (next) {
            sister = next;
            applied = true;
            break;
          }
        }
        if (!applied) break;
      }
      const link = linkOrder(state, sister);
      if (link) {
        const next = try_(state, map, now, link);
        if (next) state = next;
      }
      deliverToSister(state, sister);
      deliverToSister(sister, state);
      syncColonies(state, sister);
      if (times.sisterNest3 === null && nest(sister).level >= 3) times.sisterNest3 = now - start;
      if (sister.threats.waves > sisterWavesSeen) {
        sisterWavesSeen = sister.threats.waves;
        if (times.sisterWave === null) times.sisterWave = now - start;
      }
      opts.onSister?.(sister, state);
    }
    // A resource leaves the cap once the player spends or brings a reserve back.
    const full = storageFullCheck(state);
    for (const id of RESOURCE_IDS) {
      const c = capped[id];
      if (!c || full(id)) continue;
      cappedMs[id] += now - c.since;
      lost += (c.rate * (now - c.since)) / HOUR_MS;
      capped[id] = null;
    }
    checkMilestones(state, start, times);
    opts.onStep?.(state, map);
    if (!opts.fullHorizon && MILESTONES.every((m) => times[m] !== null)) break;
    if (opts.sessionEveryMs && now - start >= (opts.activeMs ?? 0)) {
      // Away until the next session: the simulation runs offline in one big step.
      now += opts.sessionEveryMs;
      continue;
    }
    // Next decision: the next event, or a fixed step (whichever comes first).
    const nextEvent = Math.min(
      nextConstructionEnd(state),
      state.egg ? state.egg.readyAt : Infinity,
    );
    now = Math.min(now + step, Math.max(now + 1000, nextEvent));
  }
  for (const id of RESOURCE_IDS) {
    const c = capped[id];
    if (!c) continue;
    cappedMs[id] += now - c.since;
    lost += (c.rate * (now - c.since)) / HOUR_MS;
  }
  if (now - start >= DAY_MS && start + DAY_MS - lastUseful > deadMax) {
    deadAt = lastUseful;
    deadMax = start + DAY_MS - lastUseful;
  }
  const elapsed = Math.max(1, now - start);
  const produced = RESOURCE_IDS.reduce((s, id) => s + state.stats.produced[id], 0);
  return {
    seed: opts.seed,
    face: opts.face,
    biome: state.params.biome,
    times,
    final: {
      population: population(state),
      buildings: state.buildings.length,
      produced: Math.round(RESOURCE_IDS.reduce((s, id) => s + state.stats.produced[id], 0)),
      starved: state.memorial.filter((m) => m.cause === 'famine').length,
      maxHungerH: Math.round((maxHunger / HUNGER_SCALE / 3_600_000) * 10) / 10,
      waves: state.threats.waves,
      wavesLost,
      wavesHurt,
      waveLoot: Math.round(waveLoot),
      predatorDeaths: state.memorial.filter((m) => m.cause === 'predator').length,
      meteors: state.sky.falls,
      comets: state.comets.passes,
      dustPicked: Math.round(dustPicked / STARDUST_SCALE),
      stardust: stardustOf(state),
      paths: state.paths.length,
      camps: campsSet,
      ...trips,
      beaconAttacks: attacks.total,
      beaconsHeld: attacks.held,
      guardDeaths: attacks.dead,
      sisterKiwis: sister?.villagers.length,
      expeditionDeaths: state.memorial.filter(
        (m) => m.cause === 'battle' || m.cause === 'starvation',
      ).length,
      deadMaxMin: Math.round(deadMax / 60_000),
      ...civFinal(state),
      civAtAges,
      deadAtH: Math.round(((deadAt - start) / HOUR_MS) * 10) / 10,
      capShare: Math.max(...RESOURCE_IDS.map((id) => cappedMs[id])) / elapsed,
      lostShare: produced > 0 ? lost / produced : 0,
    },
  };
}

/** Chantier 39: the civilisation of the twin at the end of a run. */
function civFinal(state: GameState): { civAge?: number; civWave?: number } {
  const twin = state.aliens?.[state.targets.find((t) => t.distance === 0)?.id ?? ''];
  if (!twin) return {};
  return {
    civAge: civAt(twin, state.now).age,
    civWave: Math.round(civWave(state, state.now, '').factor * 100) / 100,
  };
}
