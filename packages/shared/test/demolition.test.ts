import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  BUILDABLE_TYPES,
  BUILDINGS,
  buildCost,
  buildingAt,
  buildingHarvest,
  capacity,
  createRng,
  DEMOLITION,
  demolitionPreview,
  demolitionRefund,
  generateFace,
  hexKey,
  HOUR_MS,
  levelDef,
  newGame,
  queuedBuildAt,
  RESOURCE_IDS,
  upgradeCost,
  validateCommand,
  workersOf,
  type Building,
  type Command,
  type FaceMap,
  type GameState,
  type ResourceCost,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const round5 = (v: number) => Math.round(v / 5) * 5;

function freeTile(s: GameState, map: FaceMap, type: Parameters<typeof findTile>[1]) {
  return map.tiles
    .filter((t) => t.type === type && !buildingAt(s, t.q, t.r) && !queuedBuildAt(s, t.q, t.r))
    .sort((a, b) => a.rho - b.rho || a.q - b.q || a.r - b.r)[0];
}

/** Builds a pulpery and lets it finish. */
function withPulpery() {
  const { map, state } = setup();
  const flesh = findTile(map, 'flesh');
  let s = run(
    rich(state),
    { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
    T0,
    map,
  );
  s = advance(s, T0 + 60_000).state;
  const b = s.buildings.find((x) => x.type === 'pulpery')!;
  return { map, s, b };
}

describe('demolition', () => {
  it('refunds a quarter of the build and upgrade costs, rounded to 5', () => {
    const { map, s: start, b } = withPulpery();
    let s = run(start, { type: 'upgrade', buildingId: b.id }, start.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    const built = s.buildings.find((x) => x.id === b.id)!;
    expect(built.level).toBe(2);
    const invested: Record<string, number> = {};
    for (const cost of [BUILDINGS.pulpery.levels[0]!.cost, upgradeCost('pulpery', 2)]) {
      for (const id of RESOURCE_IDS) invested[id] = (invested[id] ?? 0) + (cost[id] ?? 0);
    }
    const expected: ResourceCost = {};
    for (const id of RESOURCE_IDS) {
      const v = round5(invested[id]! * DEMOLITION.refund);
      if (v > 0) expected[id] = v;
    }
    expect(demolitionRefund(s, built)).toEqual(expected);
    const before = s.resources;
    const t = run(s, { type: 'demolish', buildingId: b.id }, s.now, map);
    for (const id of RESOURCE_IDS) {
      expect(t.resources[id]).toBeCloseTo(before[id] + (expected[id] ?? 0), 6);
    }
    expect(t.buildings.some((x) => x.id === b.id)).toBe(false);
  });

  it('refunds the price paid for that copy, and nothing for camps', () => {
    const { map, state } = setup();
    let s = rich(state);
    const a = findTile(map, 'flesh', 0);
    const c = findTile(map, 'flesh', 6);
    s = run(s, { type: 'build', buildingType: 'hut', q: a.q, r: a.r }, T0, map);
    const second = buildCost(s, 'hut');
    s = run(s, { type: 'build', buildingType: 'hut', q: c.q, r: c.r }, T0, map);
    s = advance(s, T0 + HOUR_MS).state;
    const hut = s.buildings.find((x) => x.type === 'hut')!;
    expect(demolitionRefund(s, hut)).toEqual(
      Object.fromEntries(
        Object.entries(second).map(([k, v]) => [k, round5(v! * DEMOLITION.refund)]),
      ),
    );
    const camp = freeTile(s, map, 'flesh')!;
    s = run(s, { type: 'gather', q: camp.q, r: camp.r }, s.now, map);
    expect(
      demolitionRefund(
        s,
        s.buildings.find((x) => x.type === 'camp')!,
      ),
    ).toEqual({});
  });

  it('frees the workers, returns the deposits and keeps the stock above the new capacity', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    const site = findTile(map, 'flesh', 8);
    s = run(s, { type: 'build', buildingType: 'warehouse', q: site.q, r: site.r }, T0, map);
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = advance(s, T0 + HOUR_MS).state;
    const pulpery = s.buildings.find((x) => x.type === 'pulpery')!;
    const warehouse = s.buildings.find((x) => x.type === 'warehouse')!;
    expect(workersOf(s, pulpery.id)).toHaveLength(1);
    const tiles = pulpery.pool!.tiles;
    const preview = demolitionPreview(s, pulpery);
    expect(preview.workers).toBe(1);

    // A drained deposit stays drained once the building is gone.
    const drained: GameState = {
      ...s,
      buildings: s.buildings.map((x) =>
        x.id === pulpery.id ? { ...x, pool: { ...x.pool!, stock: 0 } } : x,
      ),
    };
    let t = run(drained, { type: 'demolish', buildingId: pulpery.id }, s.now, map);
    for (const key of tiles) expect(t.deposits[key]).toEqual({ stock: 0, at: s.now });
    expect(t.villagers.every((v) => v.job.kind !== 'work' || v.job.buildingId !== pulpery.id)).toBe(
      true,
    );

    t = { ...t, resources: { pulp: 800, fiber: 800, seeds: 0, juice: 0 } };
    expect(demolitionPreview(t, warehouse).storageLost).toBe(levelDef('warehouse', 1)!.storage);
    t = run(t, { type: 'demolish', buildingId: warehouse.id }, t.now, map);
    expect(capacity(t).pulp).toBeLessThan(800);
    expect(t.resources.pulp).toBeGreaterThanOrEqual(800);
  });

  it('refuses the Nest, buildings being upgraded and housing still needed', () => {
    const { map, s: start, b } = withPulpery();
    const ctx = { now: start.now, map };
    const nest = start.buildings.find((x) => x.type === 'nest')!;
    expect(validateCommand(start, { type: 'demolish', buildingId: nest.id }, ctx)).toBe(
      'notDemolishable',
    );
    expect(validateCommand(start, { type: 'demolish', buildingId: 'nope' as never }, ctx)).toBe(
      'unknownBuilding',
    );
    const up = run(start, { type: 'upgrade', buildingId: b.id }, start.now, map);
    expect(validateCommand(up, { type: 'demolish', buildingId: b.id }, ctx)).toBe(
      'upgradeInProgress',
    );

    // Fill the Nest and a hut, then the hut is needed.
    let s = start;
    const site = freeTile(s, map, 'flesh')!;
    s = run(s, { type: 'build', buildingType: 'hut', q: site.q, r: site.r }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    s = run(rich(s), { type: 'hatchEgg' }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    s = run(rich(s), { type: 'hatchEgg' }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    expect(s.villagers.length).toBeGreaterThan(levelDef('nest', 1)!.housing!);
    const hut = s.buildings.find((x) => x.type === 'hut')!;
    expect(validateCommand(s, { type: 'demolish', buildingId: hut.id }, { now: s.now, map })).toBe(
      'housingNeeded',
    );
  });

  it('keeps `dismantle` as an alias', () => {
    const { map, s, b } = withPulpery();
    const t = run(s, { type: 'dismantle', buildingId: b.id }, s.now, map);
    expect(t.buildings.some((x) => x.id === b.id)).toBe(false);
  });

  it('gives the same result in one big step or many small ones afterwards', () => {
    const { map, s: start, b } = withPulpery();
    const s = run(start, { type: 'demolish', buildingId: b.id }, start.now, map);
    const big = advance(s, s.now + 2 * HOUR_MS).state;
    let small = s;
    for (let i = 1; i <= 24; i++) small = advance(small, s.now + (i * 2 * HOUR_MS) / 24).state;
    for (const id of RESOURCE_IDS) expect(small.resources[id]).toBeCloseTo(big.resources[id], 4);
  });
});

/** A clumsy random player: builds, upgrades, hatches and camps anywhere, at random. */
function randomColony(seed: string, face: 'kiwisu' | 'kiwino') {
  const map = generateFace(seed, face);
  let s = newGame({ seed, face, now: T0 });
  const rng = createRng(`bot:${seed}`);
  let now = T0;
  for (let step = 0; step < 300; step++) {
    now += rng.int(10_000, 15 * 60_000);
    const kind = rng.pick(['build', 'build', 'upgrade', 'hatch', 'gather', 'assign'] as const);
    let cmd: Command;
    if (kind === 'build') {
      const type = rng.pick(BUILDABLE_TYPES);
      const tiles = map.tiles.filter((t) => BUILDINGS[type].allowedTiles.includes(t.type));
      const t = rng.pick(tiles);
      cmd = { type: 'build', buildingType: type, q: t.q, r: t.r };
    } else if (kind === 'upgrade') {
      cmd = { type: 'upgrade', buildingId: rng.pick(s.buildings).id };
    } else if (kind === 'hatch') {
      cmd = { type: 'hatchEgg' };
    } else if (kind === 'gather') {
      const t = rng.pick(map.tiles);
      cmd = { type: 'gather', q: t.q, r: t.r };
    } else {
      cmd = { type: 'assignWorkers', buildingId: rng.pick(s.buildings).id, count: rng.int(0, 3) };
    }
    const r = applyCommand(s, cmd, { now, map });
    s = r.state;
  }
  return { map, s: advance(s, now + 2 * HOUR_MS).state };
}

function demolishAll(s: GameState, map: FaceMap): GameState {
  for (const item of [...s.queue]) s = run(s, { type: 'cancel', queueItemId: item.id }, s.now, map);
  // Huts last: housing may still be needed by the population.
  const order = (b: Building) => (b.type === 'hut' ? 1 : 0);
  for (const b of [...s.buildings].sort((a, b) => order(a) - order(b))) {
    const r = applyCommand(s, { type: 'demolish', buildingId: b.id }, { now: s.now, map });
    if (r.ok) s = r.state;
  }
  return s;
}

describe('no dead end', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => `dead-end-${i}`);
  it.each(seeds)('a random colony can always get seeds and juice again (%s)', (seed) => {
    const face = seed.endsWith('1') || seed.endsWith('3') ? 'kiwino' : 'kiwisu';
    const { map, s: colony } = randomColony(seed, face);
    expect(colony.buildings.length).toBeGreaterThan(4);
    let s = demolishAll(colony, map);
    expect(s.buildings.filter((b) => b.type !== 'nest' && b.type !== 'hut')).toHaveLength(0);

    // The Nest alone pays for a juice well, then a seed quarry.
    for (const type of ['juiceWell', 'seedQuarry'] as const) {
      const tile = map.tiles
        .filter(
          (t) =>
            BUILDINGS[type].allowedTiles.includes(t.type) &&
            !buildingAt(s, t.q, t.r) &&
            !queuedBuildAt(s, t.q, t.r),
        )
        .sort((a, b) => a.rho - b.rho)[0]!;
      s = advance(s, s.now + 2 * HOUR_MS).state;
      s = run(s, { type: 'build', buildingType: type, q: tile.q, r: tile.r }, s.now, map);
      s = advance(s, s.now + HOUR_MS).state;
      const b = s.buildings.find((x) => x.type === type && hexKey(x) === hexKey(tile))!;
      if (workersOf(s, b.id).length === 0) {
        s = run(s, { type: 'assignWorkers', buildingId: b.id, count: 1 }, s.now, map);
      }
      expect(['ok', 'storageFull']).toContain(buildingHarvest(s, b)!.status);
    }
  });
});
