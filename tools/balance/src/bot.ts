import {
  activeItem,
  advance,
  applyCommand,
  BUILDINGS,
  buildCost,
  buildingAt,
  buildingHarvest,
  buildingRates,
  buildingCount,
  canAfford,
  canHatch,
  capacity,
  CLASSES,
  hasSkill,
  KIWI,
  type ClassId,
  catchmentPreview,
  consumption,
  currentObjective,
  HUNGER_SCALE,
  depotDistance,
  eggCost,
  emptyResources,
  generateFace,
  HARVESTS,
  hexDistance,
  housing,
  idleVillagers,
  isObjectiveComplete,
  logisticsEfficiency,
  maxLevelNow,
  nest,
  nestDef,
  newGame,
  OBJECTIVES,
  pendingUpgrade,
  population,
  queuedBuildAt,
  RESOURCE_IDS,
  forecastWave,
  garrisonOf,
  guardPower,
  isRampart,
  isTurret,
  repairCost,
  turretCount,
  turretLimit,
  upgradeCost,
  workersOf,
  workerSlots,
  type BiomeId,
  type BuildingType,
  type Command,
  type Face,
  type FaceMap,
  type GameState,
  type ResourceId,
  type Tile,
  type VillagerId,
} from '@kiwar/shared';

export const MILESTONES = [
  'tutorial',
  'pop10',
  'nest2',
  'nest3',
  'allLevel3',
  'kiwi5',
  'kiwi10',
  'mayor',
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
  };
}

const PRODUCERS: Record<ResourceId, BuildingType> = {
  pulp: 'pulpery',
  fiber: 'fiberWorkshop',
  seeds: 'seedQuarry',
  juice: 'juiceWell',
};
/** Relative needs of the economy (roughly the mix of upgrade costs). */
const NEED: Record<ResourceId, number> = { pulp: 1, fiber: 1, seeds: 0.18, juice: 0.32 };

const BUILD_ORDER: BuildingType[] = [
  'pulpery',
  'fiberWorkshop',
  'juiceWell',
  'seedQuarry',
  'hut',
  'warehouse',
];

/**
 * Best free tile for a building. Producers: the most deposit regrowth in reach (now and at
 * level 3), weighted by logistics. Others: rays and the heart first (no deposit lost), close
 * to the producers for warehouses, close to the heart otherwise.
 */
function bestTile(state: GameState, map: FaceMap, type: BuildingType): Tile | null {
  let best: Tile | null = null;
  let bestScore = -Infinity;
  const producers = state.buildings.filter((b) => HARVESTS[b.type]);
  // Huts: each producer's walk to its nearest home today.
  const homes = state.buildings.filter((b) => b.type === 'hut' || b.type === 'nest');
  const homeWalk = producers.map((p) => Math.min(...homes.map((h) => hexDistance(p, h))));
  for (const t of map.tiles) {
    if (!BUILDINGS[type].allowedTiles.includes(t.type)) continue;
    if (buildingAt(state, t.q, t.r) || queuedBuildAt(state, t.q, t.r)) continue;
    if (t.q === 0 && t.r === 0) continue;
    if (isTurret(type) && !isRampart(map, t.q, t.r)) continue;
    // A sensible player keeps clear of the floodable shores (lagoons).
    if (t.flood) continue;
    let score: number;
    if (HARVESTS[type]) {
      const now = catchmentPreview(state, map, type, t, 1).regen;
      const later = catchmentPreview(state, map, type, t, 3).regen;
      score = (now + 0.5 * later) * logisticsEfficiency(depotDistance(state, map, t));
    } else if (type === 'hut' && producers.length > 0) {
      // Huts go where kiwis work far from any bed (chantier 04: the walk to bed costs work).
      let walk = 0;
      for (let i = 0; i < producers.length; i++)
        walk += Math.min(hexDistance(producers[i]!, t), homeWalk[i]!);
      score = (t.type === 'flesh' ? -1 : 0) - walk * 0.3;
    } else {
      const spare = t.type === 'flesh' ? -1 : 0;
      const near =
        type === 'warehouse' && producers.length > 0
          ? -producers.reduce((sum, b) => sum + hexDistance(b, t), 0) / producers.length
          : -t.rho * 5;
      score = spare + near * 0.3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
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
function decide(state: GameState, map: FaceMap): Command[] {
  const cmds: Command[] = [];
  const obj = currentObjective(state);
  if (obj && isObjectiveComplete(state, obj)) cmds.push({ type: 'claimObjective' });

  // Place earned stat points: Dexterity for everyone (harvest), Charisma for the mayor.
  for (const v of state.villagers) {
    if (v.statPoints <= 0) continue;
    const stat =
      v.classId === 'mayor' ? 'charisma' : v.classId === 'builder' ? 'strength' : 'dexterity';
    if (v.stats[stat] < KIWI.stat.cap)
      cmds.push({ type: 'spendStatPoint', villagerId: v.id, stat });
  }
  // The mayor speaks whenever it can.
  const mayor = state.villagers.find((v) => v.classId === 'mayor');
  if (mayor && hasSkill(mayor, 'speech') && (mayor.skillReadyAt.speech ?? 0) <= state.now)
    cmds.push({ type: 'useSkill', villagerId: mayor.id, skill: 'speech' });

  // Keep everyone busy.
  let idle = idleVillagers(state).length;
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

  // Chantier 06: post guards just before a wave, shelter from a heavy defeat.
  cmds.push(...defenseOrders(state));

  // Hatch only kiwis the colony can feed (chantier 04).
  if (canHatch(state) && canAfford(state.resources, eggCost(state)) && canFeedOneMore(state))
    cmds.push({ type: 'hatchEgg' });

  const queueRoom = state.queue.length < (nestDef(state).queueSize ?? 1);
  if (!queueRoom) return cmds;

  const has = (type: BuildingType) =>
    state.buildings.some((b) => b.type === type) ||
    state.queue.some((i) => i.buildingType === type);
  const build = (type: BuildingType): Command | null => {
    const tile = bestTile(state, map, type);
    return tile ? { type: 'build', buildingType: type, q: tile.q, r: tile.r } : null;
  };

  // 0. Repairs first: a damaged building works at half pace.
  for (const b of state.buildings) {
    if (b.damaged && !pendingUpgrade(state, b.id) && canAfford(state.resources, repairCost(b)))
      return [...cmds, { type: 'repair', buildingId: b.id }];
  }

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
      hut.level < maxLevelNow(state, hut.type) &&
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
  const rpg = rpgDecision(state, map, build, has);
  if (rpg) return [...cmds, rpg];

  // 3. Nest upgrade whenever affordable.
  const n = nest(state);
  if (
    n.level < maxLevelNow(state, n.type) &&
    !pendingUpgrade(state, n.id) &&
    canAfford(state.resources, upgradeCost('nest', n.level + 1))
  ) {
    return [...cmds, { type: 'upgrade', buildingId: n.id }];
  }

  // 4. Storage when something is nearly full.
  const cap = capacity(state);
  const nearlyFull = RESOURCE_IDS.some((id) => state.resources[id] > cap[id] * 0.9);
  if (nearlyFull && !state.queue.some((i) => i.buildingType === 'warehouse')) {
    const wh = state.buildings
      .filter((b) => b.type === 'warehouse')
      .sort((a, b) => a.level - b.level)[0];
    if (wh && wh.level < maxLevelNow(state, wh.type) && !pendingUpgrade(state, wh.id))
      return [...cmds, { type: 'upgrade', buildingId: wh.id }];
  }

  // 5. Upgrade the producer of the bottleneck resource (lowest production, full storage
  // ignored: a full resource is not a bottleneck).
  // What is left after the meals: food comes first when the kiwis eat it all.
  const rates = emptyResources();
  for (const b of state.buildings) {
    const r = buildingRates(state, b, () => false);
    for (const id of RESOURCE_IDS) rates[id] += r[id];
  }
  const eaten = consumption(state);
  for (const id of RESOURCE_IDS) rates[id] = Math.max(0, rates[id] - eaten[id] * 1.3);
  for (const id of RESOURCE_IDS)
    if (state.resources[id] >= capacity(state)[id] * 0.95) rates[id] = Infinity;
  const order = [...RESOURCE_IDS].sort((a, b) => rates[a] / NEED[a] - rates[b] / NEED[b]);
  for (const res of order) {
    if (rates[res] === Infinity) continue;
    const type = PRODUCERS[res];
    // Upgrading a producer whose deposits are exhausted does not help: open a new site.
    const candidates = state.buildings
      .filter(
        (b) =>
          b.type === type &&
          b.level < maxLevelNow(state, b.type) &&
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
    if (b.level < maxLevelNow(state, b.type) && !pendingUpgrade(state, b.id))
      cmds.push({ type: 'upgrade', buildingId: b.id });
  }
  return cmds;
}

/** How long before a strike the bot posts its guards (they stop harvesting meanwhile). */
const GUARD_LEAD_MS = 40 * 60_000;

/**
 * Garrison and shelter: just before a wave, post the kiwis that close the gap on each side
 * (bats first: only mages and scouts reach them), relieve them afterwards; take shelter when
 * the forecast still expects deaths or several kiwis hurt.
 */
function defenseOrders(state: GameState): Command[] {
  const f = forecastWave(state);
  const posted = garrisonOf(state).map((v) => v.id);
  const want: VillagerId[] = [];
  if (f && f.wave.at - state.now <= GUARD_LEAD_MS) {
    const need = {
      ground: f.threat.ground * 1.15 - (f.defense.ground - f.defense.garrison.ground),
      air: f.threat.air * 1.15 - (f.defense.air - f.defense.garrison.air),
    };
    const pool = state.villagers
      .filter((v) => v.job.kind === 'work' || v.job.kind === 'idle' || v.job.kind === 'guard')
      .map((v) => ({ id: v.id, p: guardPower(v) }));
    const max = Math.floor(state.villagers.length / 2);
    for (const side of ['air', 'ground'] as const) {
      pool.sort((a, b) => b.p[side] - a.p[side]);
      for (const k of pool) {
        if (need[side] <= 0 || want.length >= max) break;
        if (k.p[side] <= 0 || want.includes(k.id)) continue;
        want.push(k.id);
        need.ground -= k.p.ground;
        need.air -= k.p.air;
      }
    }
  }
  const out: Command[] = [];
  const same = want.length === posted.length && want.every((id) => posted.includes(id));
  if (!same) out.push({ type: 'setGarrison', villagerIds: want });
  if (f?.canShelter && !f.expected.victory && (f.expected.deaths > 0 || f.expected.injured >= 2))
    out.push({ type: 'shelter' });
  return out;
}

/** One turret of each model after the Nest 2; more, and better ones, after a lost wave. */
function turretDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
): Command | null {
  if (nest(state).level < 2) return null;
  const turrets = state.buildings.filter((b) => isTurret(b.type));
  const queued = state.queue.some((i) => isTurret(i.buildingType));
  if (queued) return null;
  const affordable = (c: Command | null): Command | null => {
    if (!c) return null;
    if (c.type === 'build')
      return canAfford(state.resources, buildCost(state, c.buildingType)) ? c : null;
    if (c.type === 'upgrade') {
      const b = state.buildings.find((x) => x.id === c.buildingId)!;
      return canAfford(state.resources, upgradeCost(b.type, b.level + 1)) ? c : null;
    }
    return c;
  };
  for (const type of ['seedTurret', 'skyTurret'] as const) {
    if (!turrets.some((b) => b.type === type) && turretCount(state) < turretLimit(state))
      return affordable(build(type));
  }
  const last = state.threats.reports.at(-1);
  if (!last || last.victory) return null;
  // Strengthen the side that broke.
  const type =
    last.threat.air - last.defense.air > last.threat.ground - last.defense.ground
      ? 'skyTurret'
      : 'seedTurret';
  const weakest = turrets
    .filter(
      (b) =>
        b.type === type && b.level < maxLevelNow(state, b.type) && !pendingUpgrade(state, b.id),
    )
    .sort((a, b) => a.level - b.level)[0];
  if (weakest && weakest.level < nest(state).level)
    return affordable({ type: 'upgrade', buildingId: weakest.id });
  if (turretCount(state) < turretLimit(state)) return affordable(build(type));
  return null;
}

/** Whether production (gross, by day) covers the meals of one more kiwi, with a margin. */
function canFeedOneMore(state: GameState): boolean {
  const rates = emptyResources();
  for (const b of state.buildings) {
    const r = buildingRates(state, b, () => false);
    for (const id of RESOURCE_IDS) rates[id] += r[id];
  }
  const eaten = consumption(state);
  const n = Math.max(1, state.villagers.length);
  return (['pulp', 'juice'] as const).every(
    (id) => rates[id] >= (eaten[id] * (n + 1) * 1.2) / n || eaten[id] === 0,
  );
}

/**
 * The School comes after the Nest 2 (never before the bottleneck economy is in place); the
 * most charismatic experienced kiwi becomes mayor, the strongest one a builder.
 */
function rpgDecision(
  state: GameState,
  map: FaceMap,
  build: (type: BuildingType) => Command | null,
  has: (type: BuildingType) => boolean,
): Command | null {
  if (nest(state).level < 2) return null;
  if (!has('school')) {
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return null;
    if (!canAfford(state.resources, buildCost(state, 'school'))) return null;
    return build('school');
  }
  const school = state.buildings.find((b) => b.type === 'school');
  if (!school) return null;
  const free = state.villagers.filter((v) => v.job.kind === 'idle' || v.job.kind === 'work');
  const pick = (classId: ClassId, score: (v: (typeof free)[number]) => number) => {
    if (
      state.villagers.some(
        (v) => v.classId === classId || (v.job.kind === 'train' && v.job.classId === classId),
      )
    )
      return null;
    const candidates = free
      .filter((v) => !v.classId && v.level >= CLASSES[classId].minLevel)
      .sort((a, b) => score(b) - score(a));
    const v = candidates[0];
    if (!v) return null;
    const cmd: Command = { type: 'train', villagerId: v.id, schoolId: school.id, classId };
    return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
  };
  return pick('mayor', (v) => v.stats.charisma) ?? pick('builder', (v) => v.stats.strength) ?? null;
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
    'allLevel3',
    // Economy buildings (the bot does not play expeditions yet).
    (['nest', ...BUILD_ORDER] as BuildingType[]).every((type) =>
      state.buildings.some((b) => b.type === type && b.level >= 3),
    ),
  );
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
  const map = generateFace(opts.seed, opts.face, state.params);
  const times = Object.fromEntries(MILESTONES.map((m) => [m, null])) as Record<
    Milestone,
    number | null
  >;
  const step = opts.stepMs ?? 30_000;
  let now = start;
  let maxHunger = 0;
  let wavesLost = 0;
  let wavesSeen = 0;
  while (now - start < opts.horizonMs) {
    state = advance(state, now).state;
    maxHunger = Math.max(maxHunger, state.hunger);
    // Count the waves lost since the last look (reports keep the last few).
    if (state.threats.waves > wavesSeen) {
      const fresh = state.threats.reports.slice(-(state.threats.waves - wavesSeen));
      wavesLost += fresh.filter((r) => !r.victory).length;
      wavesSeen = state.threats.waves;
    }
    // Apply every possible decision at this instant (first one wins per category).
    for (let guard = 0; guard < 12; guard++) {
      const cmds = decide(state, map);
      let applied = false;
      for (const cmd of cmds) {
        const next = try_(state, map, now, cmd);
        if (next) {
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
    const active = activeItem(state);
    const nextEvent = Math.min(
      active ? active.startedAt! + active.durationMs : Infinity,
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
    },
  };
}
