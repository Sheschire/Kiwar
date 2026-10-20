import {
  nextConstructionEnd,
  HOUR_MS,
  advance,
  applyCommand,
  buildCost,
  buildingHarvest,
  buildingCount,
  canAfford,
  canHatch,
  capacity,
  hasSkill,
  KIWI,
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
} from '@kiwar/shared';
import { ageDecision } from './bot/ages';
import { campOrder } from './bot/camps';
import { expeditionOrder, launchpadOrder } from './bot/expeditions';
import { pathOrder } from './bot/paths';
import { defenseOrders, turretDecision } from './bot/defense';
import {
  PRODUCERS,
  BUILD_ORDER,
  bottlenecks,
  bestTile,
  upgradeOk,
  canFeedOneMore,
} from './bot/economy';
import { rpgDecision } from './bot/rpg';
import { cometOrders } from './bot/sky';
import { titanOrders, labDecision } from './bot/titans';

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
  'recon',
  'raidWon',
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
    predatorDeaths?: number;
    meteors?: number;
    /** Chantier 13: comets passed, stardust picked in all and left at the end. */
    comets?: number;
    dustPicked?: number;
    stardust?: number;
    /** Chantier 18: path tiles at the end, camps set up during the run. */
    paths?: number;
    camps?: number;
    /** Chantier 18: reconnaissance missions and raids back home, raids won, kiwis lost on
     *  expeditions, loot brought back (all resources, raw units). */
    recons?: number;
    raids?: number;
    raidsWon?: number;
    expeditionDeaths?: number;
    loot?: number;
  };
}

function try_(state: GameState, map: FaceMap, now: number, cmd: Command): GameState | null {
  const r = applyCommand(state, cmd, { now, map });
  return r.ok ? r.state : null;
}

/**
 * A simple, reasonable player: follows the tutorial, keeps every kiwi busy, hatches eggs,
 * builds one of each producer, then upgrades the bottleneck resource, adds housing and storage
 * when needed and upgrades the Nest as soon as possible.
 */
function decide(state: GameState, map: FaceMap, play: Play): Command[] {
  const cmds: Command[] = [];
  const obj = currentObjective(state);
  if (obj && isObjectiveComplete(state, obj)) cmds.push({ type: 'claimObjective' });

  // Place earned stat points: Dexterity for everyone (harvest), Charisma for the mayor.
  for (const v of state.villagers) {
    if (v.statPoints <= 0) continue;
    const stat =
      v.classId === 'mayor'
        ? 'charisma'
        : v.classId === 'builder' || v.classId === 'warrior'
          ? 'strength'
          : v.classId === 'scout'
            ? 'agility'
            : 'dexterity';
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

  // Chantier 18: reconnaissance and raids (before the Kikiwiwi goes back to the rampart).
  // Looked at every half hour of game time (the plans are costly to weigh).
  if (play.expeditions && state.now >= play.expeditionsAt) {
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

  // Chantier 06: post guards just before a wave, shelter from a heavy defeat.
  cmds.push(...defenseOrders(state));

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

  const queueRoom = state.queue.length < (nestDef(state).queueSize ?? 1);
  if (!queueRoom) return cmds;

  const has = (type: BuildingType) =>
    state.buildings.some((b) => b.type === type) ||
    state.queue.some((i) => i.buildingType === type);
  const build = (type: BuildingType): Command | null => {
    const tile = bestTile(state, map, type);
    return tile ? { type: 'build', buildingType: type, q: tile.q, r: tile.r } : null;
  };

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
  const turret = turretDecision(state, build);
  if (turret) return [...cmds, turret];

  // 2b. RPG (chantier 03): a School once the Nest is level 2, then a mayor and a builder.
  const rpg = rpgDecision(state, map, build, has, play.expeditions);
  if (rpg) return [...cmds, rpg];

  // 2c. Research and ages (chantier 08): Library, researchers, technologies, the monument.
  const ages = ageDecision(state, map, build, has);
  if (ages === 'save') return cmds;
  if (ages) return [...cmds, ages];

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

  // 4. Storage when something is nearly full.
  const cap = capacity(state);
  const nearlyFull = RESOURCE_IDS.some((id) => state.resources[id] > cap[id] * 0.9);
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
export const MECHANICS = ['paths', 'camps', 'expeditions'] as const;
export type Mechanic = (typeof MECHANICS)[number];
interface Play extends Record<Mechanic, boolean> {
  /** Next look at the paths and at the expeditions. */
  pathsAt: number;
  expeditionsAt: number;
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
  };
  const times = Object.fromEntries(MILESTONES.map((m) => [m, null])) as Record<
    Milestone,
    number | null
  >;
  const step = opts.stepMs ?? 30_000;
  let now = start;
  let maxHunger = 0;
  let wavesLost = 0;
  let wavesSeen = 0;
  let dustPicked = 0;
  let campsSet = 0;
  const trips = { recons: 0, raids: 0, raidsWon: 0, loot: 0 };
  const counted = new Set<string>();
  while (now - start < opts.horizonMs) {
    const dustBefore = state.stardust;
    state = advance(state, now).state;
    dustPicked += Math.max(0, state.stardust - dustBefore);
    map = faceMapOf(state);
    maxHunger = Math.max(maxHunger, state.hunger);
    for (const e of state.expeditions) {
      if (e.status !== 'done' || counted.has(e.id) || !e.result) continue;
      counted.add(e.id);
      if (e.result.aborted) continue;
      if (e.mission === 'recon') {
        trips.recons++;
        if (times.recon === null) times.recon = e.returnAt - start;
        continue;
      }
      trips.raids++;
      if (e.result.victory) {
        trips.raidsWon++;
        if (times.raidWon === null) times.raidWon = e.returnAt - start;
      }
      trips.loot += RESOURCE_IDS.reduce((sum, id) => sum + e.result!.loot[id], 0);
    }
    // Count the waves lost since the last look (reports keep the last few).
    if (state.threats.waves > wavesSeen) {
      const fresh = state.threats.reports.slice(-(state.threats.waves - wavesSeen));
      wavesLost += fresh.filter((r) => !r.victory).length;
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
          state = next;
          applied = true;
          break;
        }
      }
      if (!applied) break;
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
      predatorDeaths: state.memorial.filter((m) => m.cause === 'predator').length,
      meteors: state.sky.falls,
      comets: state.comets.passes,
      dustPicked: Math.round(dustPicked / STARDUST_SCALE),
      stardust: stardustOf(state),
      paths: state.paths.length,
      camps: campsSet,
      ...trips,
      expeditionDeaths: state.memorial.filter(
        (m) => m.cause === 'battle' || m.cause === 'starvation',
      ).length,
    },
  };
}
