import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  cloneState,
  idleVillagers,
  jobBoard,
  autoPlace,
  capacity,
  netRates,
  HOUR_MS,
  type GameEvent,
  migrateState,
  SCHEMA_VERSION,
  kiwiPosts,
  validateCommand,
  workerPower,
  workersOf,
  type GameState,
  type VillagerId,
} from '../src';
import { findTile, kiwi as testKiwi, rich, run, setup, T0 } from './helpers';

/** A colony with a pulpery (1 slot) and a fiber workshop (1 slot), every kiwi idle. */
function colony() {
  const { map, state } = setup();
  let s = rich(state);
  const flesh = findTile(map, 'flesh');
  const grove = findTile(map, 'grove');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = run(s, { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r }, T0, map);
  s = advance(s, T0 + 2 * 60 * 60_000).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  const workshop = s.buildings.find((b) => b.type === 'fiberWorkshop')!;
  for (const b of [pulpery, workshop])
    s = run(s, { type: 'assignWorkers', buildingId: b.id, count: 0 }, s.now, map);
  return { map, s, pulpery, workshop };
}

const ids = (s: GameState, buildingId: string) =>
  workersOf(s, buildingId as never).map((v) => v.id);

describe('assigning a given kiwi (chantier 09)', () => {
  it('moves this very kiwi, and rests it', () => {
    const { map, s: start, pulpery } = colony();
    const kiwi = idleVillagers(start)[2]!;
    let s = run(
      start,
      { type: 'assignKiwi', villagerId: kiwi.id, buildingId: pulpery.id },
      start.now,
      map,
    );
    expect(ids(s, pulpery.id)).toEqual([kiwi.id]);
    s = run(s, { type: 'assignKiwi', villagerId: kiwi.id, buildingId: null }, s.now, map);
    expect(ids(s, pulpery.id)).toEqual([]);
    expect(s.villagers.find((v) => v.id === kiwi.id)!.job.kind).toBe('idle');
  });

  it('swaps places with the worker of a full building', () => {
    const { map, s: start, pulpery, workshop } = colony();
    const [a, b] = idleVillagers(start);
    let s = run(start, { type: 'assignKiwi', villagerId: a!.id, buildingId: pulpery.id }, T0, map);
    s = run(s, { type: 'assignKiwi', villagerId: b!.id, buildingId: workshop.id }, s.now, map);
    // b takes the pulpery: a goes to b's former workshop.
    s = run(s, { type: 'assignKiwi', villagerId: b!.id, buildingId: pulpery.id }, s.now, map);
    expect(ids(s, pulpery.id)).toEqual([b!.id]);
    expect(ids(s, workshop.id)).toEqual([a!.id]);
  });

  it('replaces a named worker, who looks for work when the newcomer was idle', () => {
    const { map, s: start, pulpery, workshop } = colony();
    const [a, b] = idleVillagers(start);
    let s = run(start, { type: 'assignKiwi', villagerId: a!.id, buildingId: pulpery.id }, T0, map);
    s = run(
      s,
      { type: 'assignKiwi', villagerId: b!.id, buildingId: pulpery.id, replace: a!.id },
      s.now,
      map,
    );
    expect(ids(s, pulpery.id)).toEqual([b!.id]);
    // a was swapped out with nowhere to go back to: it finds the free workshop on its own.
    expect(ids(s, workshop.id)).toEqual([a!.id]);
  });

  it('refuses unknown kiwis, buildings, non-workplaces and busy kiwis', () => {
    const { map, s, pulpery } = colony();
    const ctx = { now: s.now, map };
    const kiwi = idleVillagers(s)[0]!;
    const nest = s.buildings.find((b) => b.type === 'nest')!;
    expect(
      validateCommand(
        s,
        { type: 'assignKiwi', villagerId: 'nope' as VillagerId, buildingId: pulpery.id },
        ctx,
      ),
    ).toBe('unknownVillager');
    expect(
      validateCommand(
        s,
        { type: 'assignKiwi', villagerId: kiwi.id, buildingId: 'b999' as never },
        ctx,
      ),
    ).toBe('unknownBuilding');
    expect(
      validateCommand(s, { type: 'assignKiwi', villagerId: kiwi.id, buildingId: nest.id }, ctx),
    ).toBe('notAProducer');
    expect(
      validateCommand(
        s,
        {
          type: 'assignKiwi',
          villagerId: kiwi.id,
          buildingId: pulpery.id,
          replace: 'nope' as VillagerId,
        },
        ctx,
      ),
    ).toBe('unknownVillager');
    const busy = cloneState(s);
    busy.villagers[0]!.job = { kind: 'injured', until: s.now + 1000 };
    expect(
      validateCommand(
        busy,
        { type: 'assignKiwi', villagerId: busy.villagers[0]!.id, buildingId: pulpery.id },
        ctx,
      ),
    ).toBe('kiwiBusy');
    const titan = cloneState(s);
    titan.villagers[0]!.kikiwiwi = { since: s.now };
    expect(
      validateCommand(
        titan,
        { type: 'assignKiwi', villagerId: titan.villagers[0]!.id, buildingId: pulpery.id },
        ctx,
      ),
    ).toBe('kikiwiwiNoWork');
  });

  it('lists the posts of a kiwi with its power, the swap and the ideal one', () => {
    const { map, s: start, pulpery, workshop } = colony();
    const [a, b] = idleVillagers(start);
    const s = run(
      start,
      { type: 'assignKiwi', villagerId: a!.id, buildingId: pulpery.id },
      T0,
      map,
    );
    const posts = kiwiPosts(s, b!);
    expect(posts.map((p) => p.buildingId).sort()).toEqual([pulpery.id, workshop.id].sort());
    const pulp = posts.find((p) => p.buildingId === pulpery.id)!;
    expect(pulp.kind).toBe('pulp');
    expect(pulp.power).toBeCloseTo(workerPower(b!, 'pulp'));
    expect(pulp.swapWith?.id).toBe(a!.id);
    expect(posts.find((p) => p.buildingId === workshop.id)!.swapWith).toBeNull();
    expect(posts.filter((p) => p.ideal)).toHaveLength(1);
    expect(posts[0]!.ideal).toBe(true);
    expect(kiwiPosts(s, a!).find((p) => p.buildingId === pulpery.id)!.current).toBe(true);
  });

  it('sums the workers, places and output by resource on the job board', () => {
    const { map, s: start, pulpery, workshop } = colony();
    const [a] = idleVillagers(start);
    const s = run(
      start,
      { type: 'assignKiwi', villagerId: a!.id, buildingId: pulpery.id },
      T0,
      map,
    );
    const board = jobBoard(s);
    expect(board.rows.map((r) => r.kind)).toEqual(['pulp', 'fiber']);
    const pulp = board.rows[0]!;
    expect([pulp.workers, pulp.slots]).toEqual([1, 1]);
    expect(pulp.buildings[0]!.workers.map((v) => v.id)).toEqual([a!.id]);
    // Rich test colonies are over the storage cap: full wins over everything.
    expect(board.rows[1]!.status).toBe('full');
    const poor = { ...s, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    expect(jobBoard(poor).rows[1]!.status).toBe('empty');
    expect(board.unassigned).toHaveLength(s.villagers.length - 1);
    expect(board.freeSlots).toBe(1);
    expect(workshop.id).toBe(board.rows[1]!.buildings[0]!.building.id);
  });
});

describe('kiwi flags (chantier 09)', () => {
  it('sends the priority builder first, then back to its workplace', () => {
    const { map, s: start, pulpery } = colony();
    const [a, b] = idleVillagers(start);
    let s = run(start, { type: 'assignKiwi', villagerId: a!.id, buildingId: pulpery.id }, T0, map);
    s = run(s, { type: 'setKiwiFlags', villagerId: a!.id, builderPriority: true }, s.now, map);
    expect(s.villagers.find((v) => v.id === a!.id)!.builderPriority).toBe(true);
    const flesh = findTile(map, 'flesh', 3);
    s = run(s, { type: 'build', buildingType: 'hut', q: flesh.q, r: flesh.r }, s.now, map);
    // Idle kiwis (b among them) were there, but the priority builder goes.
    const job = s.villagers.find((v) => v.id === a!.id)!.job;
    expect(job).toMatchObject({ kind: 'build', returnTo: pulpery.id });
    expect(s.villagers.find((v) => v.id === b!.id)!.job.kind).not.toBe('build');
    s = advance(s, s.now + 4 * 60 * 60_000).state;
    expect(s.queue).toHaveLength(0);
    expect(ids(s, pulpery.id)).toEqual([a!.id]);
    s = run(s, { type: 'setKiwiFlags', villagerId: a!.id, builderPriority: false }, s.now, map);
    expect(s.villagers.find((v) => v.id === a!.id)).not.toHaveProperty('builderPriority');
  });

  it('never borrows a locked worker for a construction', () => {
    const { map, s: start, pulpery, workshop } = colony();
    let s = start;
    for (const b of [pulpery, workshop])
      s = run(s, { type: 'assignWorkers', buildingId: b.id, count: 1 }, s.now, map);
    // Nobody idle: the builder must be borrowed.
    s = cloneState(s);
    s.villagers = s.villagers.filter((v) => v.job.kind === 'work');
    const [p] = workersOf(s, pulpery.id);
    const [w] = workersOf(s, workshop.id);
    const lockedP = run(s, { type: 'setKiwiFlags', villagerId: p!.id, locked: true }, s.now, map);
    const flesh = findTile(map, 'flesh', 3);
    const build = { type: 'build', buildingType: 'hut', q: flesh.q, r: flesh.r } as const;
    // Both locked: the site goes on without a builder.
    let both = run(lockedP, { type: 'setKiwiFlags', villagerId: w!.id, locked: true }, s.now, map);
    both = run(both, build, s.now, map);
    expect(both.villagers.some((v) => v.job.kind === 'build')).toBe(false);
    // Only one locked: the other one is borrowed.
    const one = run(lockedP, build, s.now, map);
    expect(one.villagers.find((v) => v.id === w!.id)!.job.kind).toBe('build');
    expect(one.villagers.find((v) => v.id === p!.id)!.job.kind).toBe('work');
  });

  it('refuses the builder flag on a Kikiwiwi and unknown kiwis', () => {
    const { map, s: start } = colony();
    const s = cloneState(start);
    s.villagers[0]!.kikiwiwi = { since: s.now };
    const ctx = { now: s.now, map };
    expect(
      validateCommand(
        s,
        { type: 'setKiwiFlags', villagerId: s.villagers[0]!.id, builderPriority: true },
        ctx,
      ),
    ).toBe('kikiwiwiNoWork');
    expect(
      validateCommand(
        s,
        { type: 'setKiwiFlags', villagerId: 'x' as VillagerId, locked: true },
        ctx,
      ),
    ).toBe('unknownVillager');
  });

  it('migrates a v17 save and keeps the flags through a save', () => {
    const { state } = setup();
    const old = JSON.parse(JSON.stringify({ ...state, schemaVersion: 17 }));
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.schemaVersion).toBe(SCHEMA_VERSION);
    const flagged = cloneState(m.state);
    flagged.villagers[0]!.locked = true;
    flagged.villagers[0]!.builderPriority = true;
    flagged.villagers[0]!.homeJob = 'b1' as never;
    const back = migrateState(JSON.parse(JSON.stringify(flagged)));
    expect(back.ok && back.state.villagers[0]).toMatchObject({
      locked: true,
      builderPriority: true,
      homeJob: 'b1',
    });
  });
});

describe('redirection when a stock is full (chantier 09)', () => {
  /** The fiber worker, the pulpery free, fiber close to the cap, the other stocks low. */
  function nearlyFull() {
    const { map, s: start, pulpery, workshop } = colony();
    const [a] = idleVillagers(start);
    let s = run(start, { type: 'assignKiwi', villagerId: a!.id, buildingId: workshop.id }, T0, map);
    // Everybody else rests: nobody but `a` moves.
    s = cloneState(s);
    s.villagers = s.villagers.filter((v) => v.id === a!.id);
    const cap = capacity(s).fiber;
    s.resources = { pulp: 50, fiber: cap - 5, seeds: 50, juice: 50 };
    return { map, s, a: a!, pulpery, workshop, cap };
  }

  it('sends the harvesters of a full stock to a free workplace, and back below 90 %', () => {
    const { map, s: start, a, pulpery, workshop, cap } = nearlyFull();
    const r = advance(start, start.now + HOUR_MS);
    expect(r.events.some((e) => e.type === 'storageFull' && e.resource === 'fiber')).toBe(true);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'kiwisRedirected', resource: 'fiber', count: 1 }),
    );
    let s = r.state;
    const moved = s.villagers.find((v) => v.id === a.id)!;
    expect(moved.job).toEqual({ kind: 'work', buildingId: pulpery.id });
    expect(moved.homeJob).toBe(workshop.id);
    // Spending a little keeps it away (hysteresis), more brings it home.
    s = run(s, { type: 'debugGrant', resources: { fiber: -0.05 * cap } }, s.now, map);
    expect(s.villagers[0]!.job).toEqual({ kind: 'work', buildingId: pulpery.id });
    const back = applyCommand(
      s,
      { type: 'debugGrant', resources: { fiber: -0.1 * cap } },
      { now: s.now, map },
    );
    expect(back.ok).toBe(true);
    s = back.state;
    expect(s.villagers[0]!.job).toEqual({ kind: 'work', buildingId: workshop.id });
    expect(s.villagers[0]).not.toHaveProperty('homeJob');
    expect(back.events.map((e: GameEvent) => e.type)).toContain('kiwisReturned');
  });

  it('never moves a locked kiwi, nor one the player placed afterwards', () => {
    const { map, s: start, a, workshop, pulpery } = nearlyFull();
    const locked = run(start, { type: 'setKiwiFlags', villagerId: a.id, locked: true }, T0, map);
    const s = advance(locked, locked.now + HOUR_MS).state;
    expect(s.villagers[0]!.job).toEqual({ kind: 'work', buildingId: workshop.id });
    // Redirected, then sent back by the player: it stays and forgets its former workplace.
    let r = advance(start, start.now + HOUR_MS).state;
    r = run(r, { type: 'assignKiwi', villagerId: a.id, buildingId: workshop.id }, r.now, map);
    expect(r.villagers[0]).not.toHaveProperty('homeJob');
    r = advance(r, r.now + HOUR_MS).state;
    expect(r.villagers[0]!.job).toEqual({ kind: 'work', buildingId: workshop.id });
    expect(pulpery.id).not.toBe(workshop.id);
  });

  it('brings kiwis home when the eating takes the stock below 90 %, exactly offline', () => {
    const { map, s: built, workshop } = colony();
    const juice = findTile(map, 'juice');
    let start = run(
      built,
      { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r },
      built.now,
      map,
    );
    start = advance(start, start.now + 2 * HOUR_MS).state;
    const well = start.buildings.find((b) => b.type === 'juiceWell')!;
    start = run(start, { type: 'assignWorkers', buildingId: well.id, count: 0 }, start.now, map);
    const [a] = idleVillagers(start);
    // `a` was redirected from the well, nobody draws juice: the colony drinks the stock.
    let s = cloneState(start);
    const kiwi = s.villagers.find((v) => v.id === a!.id)!;
    kiwi.job = { kind: 'work', buildingId: workshop.id };
    kiwi.homeJob = well.id;
    // A few more mouths to feed.
    for (const id of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) s.villagers.push(testKiwi(id));
    s.automation.meteor = false;
    const cap = capacity(s).juice;
    s.resources = { pulp: cap, fiber: 0, seeds: 0, juice: cap * 0.92 };
    s = advance(s, s.now).state;
    expect(netRates(s).juice).toBeLessThan(0);
    const end = s.now + 12 * HOUR_MS;
    const big = advance(s, end);
    const back = big.events.find((e) => e.type === 'kiwisReturned');
    expect(back).toBeDefined();
    expect(big.state.villagers.find((v) => v.id === a!.id)!.job).toEqual({
      kind: 'work',
      buildingId: well.id,
    });
    let stepped = s;
    for (let t = s.now; t <= end; t += 7_919) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    expect(stepped.villagers).toEqual(big.state.villagers);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(stepped.resources[id]).toBeCloseTo(big.state.resources[id], 6);
  });

  it('redirects the same way in one big step or many small ones', () => {
    const { s } = nearlyFull();
    const end = s.now + 3 * HOUR_MS;
    const big = advance(s, end).state;
    let stepped = s;
    for (let t = s.now; t <= end; t += 7_919) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    expect(stepped.villagers).toEqual(big.villagers);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(stepped.resources[id]).toBeCloseTo(big.resources[id], 6);
  });
});

describe('idle kiwis find work by affinity (chantier 09)', () => {
  it('skips a full stock while another workplace has room', () => {
    const { s: start, pulpery, workshop } = colony();
    const s = cloneState(start);
    const v = idleVillagers(s)[0]!;
    s.resources = { pulp: 0, fiber: capacity(s).fiber, seeds: 0, juice: 0 };
    expect(autoPlace(s, v)?.id).toBe(pulpery.id);
    s.resources = { pulp: capacity(s).pulp, fiber: 0, seeds: 0, juice: 0 };
    expect(autoPlace(s, v)?.id).toBe(workshop.id);
  });
});
