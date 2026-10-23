import { describe, expect, it } from 'vitest';
import {
  advance,
  buildSlots,
  cloneState,
  migrateState,
  SCHEMA_VERSION,
  startedItems,
  waitingForBuilder,
  workersOf,
  TECHS,
  validateCommand,
  applyCommand,
  bestMeteorCrew,
  taskNeeds,
  GARRISON,
  capacity,
  COMETS,
  crewWork,
  cycleHarvest,
  depotDistance,
  faceMapOf,
  logisticsEfficiency,
  meteorRate,
  METEORS,
  minersOf,
  productionRates,
  STARDUST,
  type Command,
  type GameState,
  type TechId,
} from '../src';
import { findTile, rich, run, setup, T0, siteFor } from './helpers';

const HOUR = 3_600_000;

/** A rich colony with a pulpery and a fiber workshop, both staffed. */
function colony() {
  const { map, state } = setup();
  let s = rich(state);
  const flesh = findTile(map, 'flesh');
  const grove = findTile(map, 'grove');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = advance(s, T0 + 2 * HOUR).state;
  s = run(s, { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r }, s.now, map);
  s = advance(s, s.now + 2 * HOUR).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  const workshop = s.buildings.find((b) => b.type === 'fiberWorkshop')!;
  return { map, s, pulpery, workshop };
}

/** Sets the Nest level directly (more construction places). */
function withNest(state: GameState, level: number): GameState {
  const s = cloneState(state);
  s.buildings.find((b) => b.type === 'nest')!.level = level;
  return s;
}

/** Orders huts on the first free flesh tiles. */
function orderHuts(s: GameState, map: ReturnType<typeof setup>['map'], count: number) {
  let placed = 0;
  for (const t of map.tiles.filter((x) => x.type === 'flesh')) {
    if (placed === count) break;
    const cmd = { type: 'build', buildingType: 'hut', q: t.q, r: t.r } as const;
    if (validateCommand(s, cmd, { now: s.now, map })) continue;
    s = run(s, cmd, s.now, map);
    placed++;
  }
  return s;
}

describe('constructions as tasks (chantier 15)', () => {
  it('builds in parallel according to the Nest level (TASKS.buildSlots)', () => {
    const { map, s: start } = colony();
    expect(buildSlots(start)).toBe(1);
    let s = orderHuts(start, map, 2);
    expect(startedItems(s)).toHaveLength(1);
    s = orderHuts(withNest(start, 3), map, 3);
    expect(buildSlots(s)).toBe(2);
    expect(startedItems(s)).toHaveLength(2);
    expect(s.queue[2]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toEqual([]);
    // Every started site has its own builder.
    const builders = s.villagers.filter((v) => v.job.kind === 'build');
    expect(new Set(builders.map((v) => (v.job as { queueItemId: string }).queueItemId)).size).toBe(
      2,
    );
  });

  it('sends the strongest kiwi, borrowed from its post, and sends it back afterwards', () => {
    const { map, s: start, pulpery } = colony();
    const s0 = cloneState(start);
    const worker = workersOf(s0, pulpery.id)[0]!;
    worker.stats.strength = 10;
    let s = orderHuts(s0, map, 1);
    const builder = s.villagers.find((v) => v.job.kind === 'build')!;
    expect(builder.id).toBe(worker.id);
    expect(builder.job).toMatchObject({ returnTo: pulpery.id });
    s = advance(s, s.now + 6 * HOUR).state;
    expect(s.queue).toHaveLength(0);
    expect(s.villagers.find((v) => v.id === worker.id)!.job).toEqual({
      kind: 'work',
      buildingId: pulpery.id,
    });
  });

  it('never starts without a kiwi: the site waits, then starts when one is free', () => {
    const { map, s: start } = colony();
    // Everybody on the rampart: nobody can be borrowed for a construction.
    const all = start.villagers.map((v) => v.id);
    let s = run(start, { type: 'setGarrison', villagerIds: all }, start.now, map);
    s = orderHuts(s, map, 1);
    expect(s.queue[0]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toHaveLength(1);
    // Nothing happens on its own…
    s = advance(s, s.now + 3 * HOUR).state;
    expect(s.queue[0]!.startedAt).toBeNull();
    // …until a kiwi can be borrowed.
    s = run(s, { type: 'setGarrison', villagerIds: all.slice(1) }, s.now, map);
    expect(s.queue[0]!.startedAt).toBe(s.now);
    expect(s.villagers[0]!.job.kind).toBe('build');
  });

  it('waits for the player when the construction task is manual', () => {
    const { map, s: start } = colony();
    const s0 = cloneState(start);
    s0.automation.build = false;
    const s = orderHuts(s0, map, 1);
    expect(s.queue[0]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toHaveLength(1);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s: start } = colony();
    const s0 = orderHuts(withNest(start, 7), map, 4);
    expect(startedItems(s0)).toHaveLength(3);
    const end = s0.now + 12 * HOUR;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now; t < end; t += 7 * 60_000 + 13) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.queue).toEqual(big.queue);
    expect(small.buildings.map((b) => [b.type, b.level])).toEqual(
      big.buildings.map((b) => [b.type, b.level]),
    );
    expect(small.villagers).toEqual(big.villagers);
    expect(small.rng).toEqual(big.rng);
  });

  it('migrates v20 saves with every task in automatic mode', () => {
    const { state } = setup();
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete raw.automation;
    raw.schemaVersion = 20;
    const r = migrateState(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.values(r.state.automation).every(Boolean)).toBe(true);
  });
});

/** A colony with a Nest 2, a pulpery and a Library level 2 (nobody researching). */
function libraryColony() {
  const { map, state } = setup('kiwisu', 'library');
  let s: GameState = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + HOUR).state;
  const flesh = findTile(map, 'flesh');
  const site = findTile(map, 'flesh', 3);
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, s.now, map);
  s = run(
    s,
    { type: 'build', buildingType: 'library', ...siteFor(s, map, 'library', site) },
    s.now,
    map,
  );
  s = advance(s, s.now + HOUR).state;
  const library = s.buildings.find((b) => b.type === 'library')!;
  s = run(rich(s), { type: 'upgrade', buildingId: library.id }, s.now, map);
  s = advance(s, s.now + 2 * HOUR).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  return { map, s: rich(s), library, pulpery };
}

const firstTech = (Object.keys(TECHS) as TechId[]).find(
  (id) => TECHS[id].age === 0 && TECHS[id].libraryLevel <= 2 && !TECHS[id].stardust,
)!;

describe('research as a task (chantier 15)', () => {
  it('a chosen technology sends the kiwis with the most Spirit, who go back once it is done', () => {
    const { map, s: start, library, pulpery } = libraryColony();
    const s0 = cloneState(start);
    // A stock below its cap: a full one would send the pulpery's kiwis elsewhere.
    s0.resources = { pulp: 100, fiber: 100, seeds: 100, juice: 100 };
    const worker = workersOf(s0, pulpery.id)[0]!;
    worker.stats.spirit = 10;
    expect(workersOf(s0, library.id)).toHaveLength(0);
    let s = run(s0, { type: 'setResearch', tech: firstTech }, s0.now, map);
    const researchers = workersOf(s, library.id);
    expect(researchers).toHaveLength(2);
    expect(researchers[0]!.id).toBe(worker.id);
    expect(researchers[0]!.lent).toBe(pulpery.id);
    s = advance(s, s.now + 6 * HOUR).state;
    expect(s.research.done).toContain(firstTech);
    expect(workersOf(s, library.id)).toHaveLength(0);
    expect(s.villagers.find((v) => v.id === worker.id)!.job).toEqual({
      kind: 'work',
      buildingId: pulpery.id,
    });
  });

  it('keeps the kiwis the player placed there, and does nothing in manual mode', () => {
    const { map, s: start, library } = libraryColony();
    let s = run(start, { type: 'assignWorkers', buildingId: library.id, count: 1 }, start.now, map);
    const placed = workersOf(s, library.id)[0]!;
    s = run(s, { type: 'setResearch', tech: firstTech }, s.now, map);
    s = run(s, { type: 'setResearch', tech: null }, s.now, map);
    expect(workersOf(s, library.id).map((v) => v.id)).toEqual([placed.id]);
    const manual = cloneState(start);
    manual.automation.research = false;
    s = run(manual, { type: 'setResearch', tech: firstTech }, manual.now, map);
    expect(workersOf(s, library.id)).toHaveLength(0);
  });

  it('the "+" of the Library takes the kiwi with the most Spirit', () => {
    const { map, s: start, library } = libraryColony();
    const s0 = cloneState(start);
    const idle = s0.villagers.filter((v) => v.job.kind === 'idle');
    expect(idle.length).toBeGreaterThan(1);
    idle[idle.length - 1]!.stats.spirit = 10;
    const s = run(s0, { type: 'assignWorkers', buildingId: library.id, count: 1 }, s0.now, map);
    expect(workersOf(s, library.id)[0]!.id).toBe(idle[idle.length - 1]!.id);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s: start } = libraryColony();
    const s0 = run(start, { type: 'setResearch', tech: firstTech }, start.now, map);
    const end = s0.now + 30 * HOUR;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now; t < end; t += 23 * 60_000 + 7) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.research).toEqual(big.research);
    expect(small.villagers).toEqual(big.villagers);
  });
});

/** The colony with a crater of seeds on a free flesh tile (nobody sent yet). */
function withCrater(stock = 400) {
  const { map, s: start, pulpery, workshop } = colony();
  const s = cloneState(start);
  const tile = map.tiles.find(
    (t) =>
      t.type === 'flesh' &&
      t.rho > 0.3 &&
      !s.buildings.some((b) => b.q === t.q && b.r === t.r) &&
      !s.obstacles.some((o) => o.q === t.q && o.r === t.r),
  )!;
  s.sky.meteors.push({
    id: 'mx',
    q: tile.q,
    r: tile.r,
    resource: 'seeds',
    stock,
    max: stock,
    landedAt: s.now,
    expiresAt: s.now + METEORS.lifeMs,
  });
  s.resources = { pulp: 500, fiber: 500, seeds: 0, juice: 500 };
  return { map, s, pulpery, workshop, tile };
}

describe('the meteorite post (chantier 15)', () => {
  it('fills itself with the most dexterous kiwis, drains the crater, then sends them back', () => {
    const { map, s: s0, pulpery } = withCrater();
    const worker = workersOf(s0, pulpery.id)[0]!;
    worker.stats.dexterity = 10;
    // Any command (or the next event) runs the automation.
    let s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const miners = minersOf(s, 'mx');
    expect(miners).toHaveLength(Math.min(METEORS.slots, s.villagers.length));
    const best = miners.find((v) => v.id === worker.id)!;
    expect(best.job).toMatchObject({ kind: 'meteor', returnTo: pulpery.id });
    const m = s.sky.meteors[0]!;
    const rate = meteorRate(s, m);
    const map2 = faceMapOf(s);
    expect(rate).toBeCloseTo(
      METEORS.rates.seeds *
        crewWork(s, miners, 'seeds') *
        logisticsEfficiency(depotDistance(s, map2, m)) *
        cycleHarvest(s, 'seeds'),
      9,
    );
    expect(productionRates(s).seeds).toBeGreaterThanOrEqual(rate - 1e-9);
    s = advance(s, s.now + 24 * HOUR).state;
    expect(s.sky.meteors[0]!.stock).toBe(0);
    expect(minersOf(s, 'mx')).toHaveLength(0);
    expect(s.villagers.find((v) => v.id === worker.id)!.job).toEqual({
      kind: 'work',
      buildingId: pulpery.id,
    });
  });

  it('sends its miners back when the stock fills up, and waits while it is full', () => {
    const { map, s: s0 } = withCrater(2000);
    s0.resources.seeds = capacity(s0).seeds - 20;
    let s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    expect(minersOf(s, 'mx').length).toBeGreaterThan(0);
    const { state: after, events } = advance(s, s.now + HOUR);
    expect(events.some((e) => e.type === 'storageFull' && e.resource === 'seeds')).toBe(true);
    expect(minersOf(after, 'mx')).toHaveLength(0);
    s = run(after, { type: 'debugGrant', resources: {} }, after.now, map);
    expect(minersOf(s, 'mx')).toHaveLength(0);
  });

  it('is not harvested by nearby producers, and nothing is built on it', () => {
    const { map, s: s0, tile } = withCrater();
    s0.automation.meteor = false;
    const s = advance(s0, s0.now + 6 * HOUR).state;
    expect(s.sky.meteors[0]!.stock).toBe(400);
    const r = applyCommand(
      rich(s),
      { type: 'build', buildingType: 'hut', q: tile.q, r: tile.r },
      { now: s.now, map },
    );
    expect(!r.ok && r.error).toBe('onCrater');
  });

  it('takes the crew the player chooses in manual mode', () => {
    const { map, s: s0 } = withCrater();
    s0.automation.meteor = false;
    const crew = bestMeteorCrew(s0, 'mx');
    expect(crew).toHaveLength(Math.min(METEORS.slots, s0.villagers.length));
    let s = run(s0, { type: 'collectMeteor', meteorId: 'mx', villagerIds: crew }, s0.now, map);
    expect(
      minersOf(s, 'mx')
        .map((v) => v.id)
        .sort(),
    ).toEqual([...crew].sort());
    const err = (cmd: Command) => {
      const r = applyCommand(s, cmd, { now: s.now, map });
      return r.ok ? null : r.error;
    };
    expect(err({ type: 'collectMeteor', meteorId: 'nope', villagerIds: [] })).toBe('unknownCrater');
    const ids = s.villagers.map((v) => v.id);
    if (ids.length > METEORS.slots)
      expect(err({ type: 'collectMeteor', meteorId: 'mx', villagerIds: ids })).toBe('craterFull');
    s = run(s, { type: 'collectMeteor', meteorId: 'mx', villagerIds: [] }, s.now, map);
    expect(minersOf(s, 'mx')).toHaveLength(0);
  });

  it('digs faster with the drill, more in later ages', () => {
    const { map, s: s0 } = withCrater();
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const base = meteorRate(s, s.sky.meteors[0]!);
    const drilled = cloneState(s);
    drilled.research.done = ['meteorDrill'];
    expect(meteorRate(drilled, drilled.sky.meteors[0]!)).toBeCloseTo(base, 9);
    drilled.buildings.push({
      ...drilled.buildings[0]!,
      id: 'bm' as never,
      type: 'monument',
      level: 2,
      q: 99,
      r: 99,
    });
    expect(meteorRate(drilled, drilled.sky.meteors[0]!)).toBeCloseTo(base * METEORS.drill[2]!, 9);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { s: s0 } = withCrater(2000);
    const end = s0.now + 30 * HOUR;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now; t < end; t += 11 * 60_000 + 3) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.sky.meteors[0]!.stock).toBeCloseTo(big.sky.meteors[0]!.stock, 6);
    expect(small.resources.seeds).toBeCloseTo(big.resources.seeds, 6);
  });
});

describe('stardust as a task (chantier 15)', () => {
  it('sends the most dexterous kiwis to the dust as soon as the comet passes', () => {
    const { state } = setup();
    state.automation.meteor = false;
    const s = advance(state, T0 + COMETS.firstMs).state;
    expect(s.comets.patches.length).toBeGreaterThan(0);
    const pickers = s.villagers.filter((v) => v.job.kind === 'stardust');
    expect(pickers.length).toBe(
      Math.min(s.villagers.length, STARDUST.slots * s.comets.patches.length),
    );
    const later = advance(s, s.now + 30 * HOUR).state;
    expect(later.stardust).toBeGreaterThan(0);
    expect(later.villagers.some((v) => v.job.kind === 'stardust')).toBe(false);
  });
});

describe('automatic repairs and garrison (chantier 15)', () => {
  it('a damaged building orders and pays its repairs, before the waiting sites', () => {
    const { map, s: start, pulpery } = colony();
    const s0 = orderHuts(withNest(rich(start), 2), map, 2);
    expect(s0.queue[1]!.startedAt).toBeNull();
    s0.buildings.find((b) => b.id === pulpery.id)!.damaged = true;
    const before = s0.resources.fiber;
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const index = s.queue.findIndex((i) => i.kind === 'repair' && i.buildingId === pulpery.id);
    expect(index).toBe(1);
    expect(s.resources.fiber).toBeLessThan(before);
    const later = advance(s, s.now + 6 * HOUR).state;
    expect(later.buildings.find((b) => b.id === pulpery.id)!.damaged).toBeFalsy();
    // Manual: nothing is ordered.
    const manual = cloneState(s0);
    manual.automation.repair = false;
    const m = run(manual, { type: 'debugGrant', resources: {} }, manual.now, map);
    expect(m.queue.some((i) => i.kind === 'repair')).toBe(false);
  });

  it('posts guards a little before a strike, then sends them back to work', () => {
    const { s: start, pulpery } = colony();
    const s0 = cloneState(start);
    s0.automation.meteor = false;
    s0.automation.stardust = false;
    s0.threats.next = {
      id: 'wx',
      announceAt: s0.now - 1,
      at: s0.now + 2 * HOUR,
      announced: true,
      ground: 30,
      air: 0,
    };
    const worker = workersOf(s0, pulpery.id)[0]!;
    const early = advance(s0, s0.now + HOUR).state;
    expect(early.villagers.some((v) => v.job.kind === 'guard')).toBe(false);
    const posted = advance(early, s0.now + 2 * HOUR - GARRISON.autoLeadMs).state;
    const guards = posted.villagers.filter((v) => v.job.kind === 'guard');
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.length).toBeLessThanOrEqual(Math.floor(posted.villagers.length / 2));
    expect(guards.every((v) => v.lent !== undefined)).toBe(true);
    const after = advance(posted, s0.now + 3 * HOUR).state;
    expect(after.threats.reports.at(-1)?.id).toBe('wx');
    expect(after.villagers.some((v) => v.job.kind === 'guard')).toBe(false);
    const w = after.villagers.find((v) => v.id === worker.id)!;
    if (w.job.kind !== 'injured') expect(w.job.kind).toBe('work');
    // Same result in one big step.
    const big = advance(s0, s0.now + 3 * HOUR).state;
    expect(big.villagers).toEqual(after.villagers);
  });
});

describe('the Automation panel (chantier 15)', () => {
  it('switches a task to manual, where the player picks the builder', () => {
    const { map, s: start, workshop } = colony();
    let s = run(start, { type: 'setAutomation', task: 'build', on: false }, start.now, map);
    expect(s.automation.build).toBe(false);
    s = orderHuts(s, map, 2);
    expect(taskNeeds(s).build).toBe(1);
    const item = s.queue[0]!;
    const kiwi = workersOf(s, workshop.id)[0]!;
    const err = (cmd: Command) => {
      const r = applyCommand(s, cmd, { now: s.now, map });
      return r.ok ? null : r.error;
    };
    expect(err({ type: 'assignBuilder', queueItemId: s.queue[1]!.id, villagerId: kiwi.id })).toBe(
      'noBuildSlot',
    );
    s = run(s, { type: 'assignBuilder', queueItemId: item.id, villagerId: kiwi.id }, s.now, map);
    expect(s.queue[0]!.startedAt).toBe(s.now);
    expect(s.villagers.find((v) => v.id === kiwi.id)!.job).toMatchObject({
      kind: 'build',
      returnTo: workshop.id,
    });
    expect(taskNeeds(s).build).toBe(0);
    expect(err({ type: 'assignBuilder', queueItemId: item.id, villagerId: kiwi.id })).toBe(
      'alreadyStarted',
    );
    s = run(s, { type: 'setAutomation', task: 'build', on: true }, s.now, map);
    expect(s.automation.build).toBe(true);
  });
});
