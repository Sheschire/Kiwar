import { describe, expect, it } from 'vitest';
import {
  consumption,
  moraleWork,
  presence,
  advance,
  BUILDINGS,
  builderSpeed,
  workerPower,
  capacity,
  FACE_PROFILES,
  HOUR_MS,
  housing,
  population,
  depotDistance,
  logisticsEfficiency,
  productionRates,
  workersOf,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

describe('newGame', () => {
  it('starts with a nest, three kiwis and a small stock', () => {
    const { state } = setup();
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0]).toMatchObject({ type: 'nest', q: 0, r: 0, level: 1 });
    expect(population(state)).toBe(3);
    expect(housing(state)).toBe(4);
    expect(state.resources.pulp).toBeGreaterThan(0);
  });
});

describe('advance', () => {
  it('does nothing when time does not move forward', () => {
    const { state } = setup();
    expect(advance(state, T0).state).toEqual(state);
    expect(advance(state, T0 - 1000).state.resources).toEqual(state.resources);
  });

  it('produces passively from the nest, proportionally to time', () => {
    const { state } = setup('kiwisu');
    const tenMin = advance(state, T0 + HOUR_MS / 6).state;
    // Production minus what the three kiwis eat.
    const expected =
      (BUILDINGS.nest.levels[0]!.passiveProduction!.pulp! / 6) *
        FACE_PROFILES.kiwisu.yieldMultiplier.pulp -
      consumption(state).pulp / 6;
    expect(tenMin.resources.pulp - state.resources.pulp).toBeCloseTo(expected, 6);
  });

  it('never exceeds storage capacity and reports when it fills up', () => {
    const { state } = setup();
    const { state: later, events } = advance(state, T0 + 48 * HOUR_MS);
    expect(later.resources.pulp).toBeCloseTo(capacity(later).pulp, 6);
    expect(events.some((e) => e.type === 'storageFull' && e.resource === 'pulp')).toBe(true);
  });

  it('does not mutate its input', () => {
    const { state } = setup();
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    advance(state, T0 + HOUR_MS);
    expect(state).toEqual(copy);
  });

  it('completes constructions offline, in order, and starts the next one', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    const grove = findTile(map, 'grove');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = run(
      s,
      { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r },
      T0 + 1000,
      map,
    );
    expect(s.queue).toHaveLength(2);
    expect(s.queue[0]!.startedAt).toBe(T0);
    expect(s.queue[1]!.startedAt).toBeNull();

    const { state: after, events } = advance(s, T0 + 10 * 60_000);
    expect(after.queue).toHaveLength(0);
    const types = events
      .filter((e) => e.type === 'constructionComplete')
      .map((e) => e.type === 'constructionComplete' && e.buildingType);
    expect(types).toEqual(['pulpery', 'fiberWorkshop']);
    const pulpery = after.buildings.find((b) => b.type === 'pulpery')!;
    expect(pulpery.builtAt).toBe(T0 + s.queue[0]!.durationMs);
    // The second construction started exactly when the first finished, at its builder's pace.
    const workshop = after.buildings.find((b) => b.type === 'fiberWorkshop')!;
    const started = events.find((e) => e.type === 'constructionStarted' && e.at > T0);
    expect(started?.at).toBe(pulpery.builtAt);
    const builder = after.villagers.find(
      (v) => started?.type === 'constructionStarted' && v.id === started.builderId,
    )!;
    expect(workshop.builtAt).toBe(
      pulpery.builtAt + Math.round(s.queue[1]!.durationMs / builderSpeed(builder)),
    );
    // New workplaces were staffed automatically.
    expect(workersOf(after, pulpery.id)).toHaveLength(1);
    expect(workersOf(after, workshop.id)).toHaveLength(1);
  });

  it('gives the same result in one big step or many small ones (offline progress)', () => {
    const { map, state } = setup('kiwino');
    let s = rich(state);
    s = { ...s, resources: { pulp: 200, fiber: 150, seeds: 0, juice: 50 } };
    const flesh = findTile(map, 'flesh');
    const juice = findTile(map, 'juice');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = run(s, { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r }, T0, map);
    s = run(s, { type: 'hatchEgg' }, T0, map);

    const end = T0 + 3 * HOUR_MS;
    const oneStep = advance(s, end).state;
    let stepped = s;
    for (let t = T0; t <= end; t += 7_919) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;

    expect(stepped.buildings).toEqual(oneStep.buildings);
    expect(stepped.villagers).toEqual(oneStep.villagers);
    expect(stepped.queue).toEqual(oneStep.queue);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const) {
      expect(stepped.resources[id]).toBeCloseTo(oneStep.resources[id], 6);
    }
  });

  it('hatches eggs and the newborn finds work by itself', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = advance(s, T0 + 60_000).state; // pulpery done
    s = run(s, { type: 'upgrade', buildingId: s.buildings[1]!.id }, T0 + 60_000, map);
    s = advance(s, T0 + 10 * 60_000).state; // level 2: 2 slots
    const pulpery = s.buildings[1]!;
    expect(pulpery.level).toBe(2);
    const before = workersOf(s, pulpery.id).length;
    s = run(s, { type: 'hatchEgg' }, s.now, map);
    const { state: after, events } = advance(s, s.now + HOUR_MS);
    expect(population(after)).toBe(4);
    expect(events.some((e) => e.type === 'hatched')).toBe(true);
    expect(workersOf(after, pulpery.id).length).toBe(Math.min(2, before + 1));
  });

  it('uses staffing and logistics in production', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = advance(s, T0 + 60_000).state;
    // Harvesting pauses while the storage is full: empty it first.
    s = { ...s, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    const withWorker = productionRates(s).pulp;
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const worker = workersOf(s, pulpery.id)[0]!;
    // Its share of the day at work (rest, walk to bed) and the colony morale.
    const share = presence(s, worker) * moraleWork(s);
    s = run(s, { type: 'assignWorkers', buildingId: pulpery.id, count: 0 }, s.now, map);
    const without = productionRates(s).pulp;
    const efficiency = logisticsEfficiency(depotDistance(s, map, pulpery));
    const expected =
      BUILDINGS.pulpery.levels[0]!.production!.pulp! *
      efficiency *
      workerPower(worker, 'pulp') *
      share *
      FACE_PROFILES.kiwisu.yieldMultiplier.pulp;
    expect(withWorker - without).toBeCloseTo(expected, 6);
  });
});
