import {
  activeItem,
  advance,
  applyCommand,
  BUILDINGS,
  buildCost,
  buildingAt,
  buildingCount,
  canAfford,
  canHatch,
  capacity,
  currentObjective,
  eggCost,
  generateFace,
  housing,
  idleVillagers,
  isObjectiveComplete,
  MAX_LEVEL,
  nearRay,
  nest,
  nestDef,
  newGame,
  OBJECTIVES,
  pendingUpgrade,
  population,
  productionRates,
  queuedBuildAt,
  RESOURCE_IDS,
  upgradeCost,
  workersOf,
  workerSlots,
  type BuildingType,
  type Command,
  type Face,
  type FaceMap,
  type GameState,
  type ResourceId,
  type Tile,
} from '@kiwar/shared';

export const MILESTONES = ['tutorial', 'pop10', 'nest2', 'nest3', 'allLevel3'] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface RunResult {
  seed: string;
  face: Face;
  /** Milliseconds from the start to reach each milestone (null = not reached within the horizon). */
  times: Record<Milestone, number | null>;
  final: { population: number; buildings: number; produced: number };
}

const PRODUCERS: Record<ResourceId, BuildingType> = {
  pulp: 'pulpery',
  fiber: 'fiberWorkshop',
  seeds: 'seedQuarry',
  juice: 'juiceWell',
};
const BUILD_ORDER: BuildingType[] = [
  'pulpery',
  'fiberWorkshop',
  'juiceWell',
  'seedQuarry',
  'hut',
  'warehouse',
];

/** Best free tile for a building: rich, near a ray, close to the heart. */
function bestTile(state: GameState, map: FaceMap, type: BuildingType): Tile | null {
  let best: Tile | null = null;
  let bestScore = -Infinity;
  for (const t of map.tiles) {
    if (!BUILDINGS[type].allowedTiles.includes(t.type)) continue;
    if (buildingAt(state, t.q, t.r) || queuedBuildAt(state, t.q, t.r)) continue;
    if (t.q === 0 && t.r === 0) continue;
    const score = t.richness + (nearRay(map, t.q, t.r) ? 0.05 : 0) - t.rho * 0.15;
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

  if (canHatch(state) && canAfford(state.resources, eggCost(state)))
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
      hut.level < MAX_LEVEL &&
      !pendingUpgrade(state, hut.id) &&
      hut.level < nest(state).level + 1
    ) {
      return [...cmds, { type: 'upgrade', buildingId: hut.id }];
    }
    const c = build('hut');
    if (c && buildingCount(state) < (nestDef(state).maxBuildings ?? 0)) return [...cmds, c];
  }

  // 3. Nest upgrade whenever affordable.
  const n = nest(state);
  if (
    n.level < MAX_LEVEL &&
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
    if (wh && wh.level < MAX_LEVEL && !pendingUpgrade(state, wh.id))
      return [...cmds, { type: 'upgrade', buildingId: wh.id }];
  }

  // 5. Upgrade the producer of the bottleneck resource (lowest production).
  const rates = productionRates(state);
  const order = [...RESOURCE_IDS].sort((a, b) => rates[a] - rates[b]);
  for (const res of order) {
    const type = PRODUCERS[res];
    const candidates = state.buildings
      .filter((b) => b.type === type && b.level < MAX_LEVEL && !pendingUpgrade(state, b.id))
      .sort((a, b) => a.level - b.level);
    const target = candidates[0];
    if (target) cmds.push({ type: 'upgrade', buildingId: target.id });
    else if (buildingCount(state) < (nestDef(state).maxBuildings ?? 0)) {
      const c = build(type);
      if (c) cmds.push(c);
    }
  }
  // 6. Then anything else that is not maxed (huts, warehouses).
  for (const b of state.buildings) {
    if (b.level < MAX_LEVEL && !pendingUpgrade(state, b.id))
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
    'allLevel3',
    // Economy buildings (the bot does not play expeditions yet).
    (['nest', ...BUILD_ORDER] as BuildingType[]).every((type) =>
      state.buildings.some((b) => b.type === type && b.level >= MAX_LEVEL),
    ),
  );
}

export interface RunOptions {
  seed: string;
  face: Face;
  horizonMs: number;
  /** Decision interval when nothing else happens. */
  stepMs?: number;
}

export function runBot(opts: RunOptions): RunResult {
  const start = 1_700_000_000_000;
  const map = generateFace(opts.seed, opts.face);
  let state = newGame({ seed: opts.seed, face: opts.face, now: start });
  const times = Object.fromEntries(MILESTONES.map((m) => [m, null])) as Record<
    Milestone,
    number | null
  >;
  const step = opts.stepMs ?? 30_000;
  let now = start;
  while (now - start < opts.horizonMs) {
    state = advance(state, now).state;
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
    if (MILESTONES.every((m) => times[m] !== null)) break;
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
    times,
    final: {
      population: population(state),
      buildings: state.buildings.length,
      produced: Math.round(RESOURCE_IDS.reduce((s, id) => s + state.stats.produced[id], 0)),
    },
  };
}
