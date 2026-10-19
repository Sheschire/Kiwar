import { describe, expect, it } from 'vitest';
import {
  addVillager,
  advance,
  BUILDINGS,
  buildingHarvest,
  capacity,
  consumption,
  FACE_PROFILES,
  HOUR_MS,
  HUNGER_SCALE,
  hungerStage,
  migrateState,
  MORALE,
  moraleOf,
  moraleWork,
  NEEDS,
  netRates,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** A colony of `kiwis` kiwis with empty stocks (the Nest alone cannot feed them). */
function crowd(kiwis: number, nestLevel = 1): GameState {
  const { state } = setup();
  const s: GameState = {
    ...state,
    villagers: [...state.villagers],
    resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
    buildings: state.buildings.map((b) => (b.type === 'nest' ? { ...b, level: nestLevel } : b)),
  };
  while (s.villagers.length < kiwis) addVillager(s, T0);
  return s;
}

const nestRate = (id: 'pulp' | 'juice', level = 1) =>
  BUILDINGS.nest.levels[level - 1]!.passiveProduction![id]! *
  FACE_PROFILES.kiwisu.yieldMultiplier[id];

describe('hunger', () => {
  it('every kiwi at home eats pulp and drinks juice, more in winter', () => {
    const { state } = setup();
    expect(consumption(state)).toMatchObject({
      pulp: NEEDS.eat.pulp * 3,
      juice: NEEDS.eat.juice * 3,
      fiber: 0,
      seeds: 0,
    });
    const winter = { ...state, calendarStart: state.now - 3 * 24 * HOUR_MS - HOUR_MS };
    expect(consumption(winter).pulp).toBeCloseTo(NEEDS.eat.pulp * 3 * NEEDS.appetite.winter, 9);
    // Kiwis away on an expedition live on their provisions.
    const away = {
      ...state,
      villagers: state.villagers.map((v, i) =>
        i === 0 ? { ...v, job: { kind: 'expedition' as const, expeditionId: 'e1' } } : v,
      ),
    };
    expect(consumption(away).pulp).toBe(NEEDS.eat.pulp * 2);
    expect(netRates(state).pulp).toBeCloseTo(nestRate('pulp') - NEEDS.eat.pulp * 3, 6);
  });

  it('reports when food runs out, then the gauge fills as fast as food is missing', () => {
    const s = { ...crowd(20), resources: { pulp: 100, fiber: 0, seeds: 0, juice: 1000 } };
    const eaten = consumption(s).pulp;
    const net = nestRate('pulp') - eaten;
    const { state: later, events } = advance(s, T0 + HOUR_MS);
    const out = events.find((e) => e.type === 'foodRanOut');
    expect(out).toMatchObject({ resource: 'pulp', at: T0 + Math.round((100 / -net) * HOUR_MS) });
    expect(later.resources.pulp).toBe(0);
    // Only pulp is missing: its share of the gauge, for the time it was missing.
    const missing = -net / eaten;
    const rate = Math.round(HUNGER_SCALE * NEEDS.weight.pulp * missing);
    const elapsed = T0 + HOUR_MS - (T0 + Math.ceil((100 / -net) * HOUR_MS));
    expect(later.hunger).toBe(rate * elapsed);
  });

  it('slows work down by stages and recovers once fed', () => {
    const { map, state } = setup();
    const flesh = findTile(map, 'flesh');
    let s = run(
      rich(state),
      { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      T0,
      map,
    );
    s = advance(s, T0 + 60_000).state;
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const fed = buildingHarvest(s, pulpery)!.demand;
    const hungry = { ...s, hunger: NEEDS.stages.hungry * HUNGER_SCALE };
    expect(hungerStage(hungry)).toBe('hungry');
    // Hunger also weighs on morale.
    const morale = moraleWork(hungry) / moraleWork(s);
    expect(moraleOf(hungry).food).toBe(MORALE.hungry);
    expect(moraleOf(s).food).toBe(MORALE.fed);
    expect(buildingHarvest(hungry, pulpery)!.demand).toBeCloseTo(
      fed * NEEDS.work.hungry * morale,
      6,
    );
    const weak = { ...s, hunger: NEEDS.stages.weak * HUNGER_SCALE };
    expect(buildingHarvest(weak, pulpery)!.demand).toBeCloseTo(fed * NEEDS.work.weak * morale, 6);

    // Fed again: the gauge drops three times as fast as it rose.
    const { state: later, events } = advance(weak, weak.now + HOUR_MS);
    expect(later.hunger).toBe(weak.hunger - NEEDS.recovery * HUNGER_SCALE * HOUR_MS);
    expect(events.some((e) => e.type === 'hungerChanged' && e.stage === 'hungry')).toBe(true);
  });

  it('never starves beginners nor the last kiwis', () => {
    // Nest level 1: the gauge stops at the last stage.
    const young = advance(crowd(12, 1), T0 + 4 * 24 * HOUR_MS).state;
    expect(young.villagers).toHaveLength(12);
    expect(young.hunger).toBe(NEEDS.stages.starving * HUNGER_SCALE);
    expect(hungerStage(young)).toBe('starving');
    // Two kiwis left: they hold on, however long the famine.
    const pair = crowd(3, 2);
    pair.villagers = pair.villagers.slice(0, 2);
    const s = { ...pair, buildings: pair.buildings.map((b) => ({ ...b, level: 2 })) };
    // Make the Nest unable to feed them: winter appetite with no stock and a tiny Nest.
    const later = advance(
      { ...s, hunger: NEEDS.stages.starving * HUNGER_SCALE },
      T0 + 10 * HOUR_MS,
    );
    expect(later.state.villagers).toHaveLength(2);
  });

  it('a long famine kills at most one kiwi every six hours, frailest first', () => {
    const s = crowd(20, 2);
    const { state: later, events } = advance(s, T0 + 2 * 24 * HOUR_MS);
    const deaths = events.filter((e) => e.type === 'starved');
    expect(deaths.length).toBeGreaterThan(0);
    for (let i = 1; i < deaths.length; i++)
      expect(deaths[i]!.at - deaths[i - 1]!.at).toBeGreaterThanOrEqual(NEEDS.deathRelief);
    expect(later.villagers.length).toBe(20 - deaths.length);
    expect(later.villagers.length).toBeGreaterThanOrEqual(NEEDS.minSurvivors);
    expect(later.memorial.filter((m) => m.cause === 'famine')).toHaveLength(deaths.length);
    // The first death needs 18 hours of full privation, so it comes later than that.
    expect(deaths[0]!.at - T0).toBeGreaterThan(NEEDS.stages.starving);
  });

  it('keeps a full storage full when production covers the meals', () => {
    const { state } = setup();
    const cap = capacity(state).pulp;
    const full = { ...state, resources: { ...state.resources, pulp: cap } };
    const later = advance(full, T0 + HOUR_MS).state;
    expect(later.resources.pulp).toBe(cap);
    // Too many mouths: the full stock shrinks.
    const s = { ...crowd(20), resources: { pulp: cap, fiber: 0, seeds: 0, juice: cap } };
    const after = advance(s, T0 + HOUR_MS / 4).state;
    expect(after.resources.pulp).toBeLessThan(cap);
  });

  it('gives the same result in one big step or many small ones through a famine', () => {
    const s = { ...crowd(24, 2), resources: { pulp: 300, fiber: 0, seeds: 0, juice: 200 } };
    const end = T0 + 60 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = T0; t <= end; t += 97_313) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(big.memorial.length).toBeGreaterThan(0);
    expect(small.villagers).toEqual(big.villagers);
    expect(small.memorial).toEqual(big.memorial);
    expect(small.hunger).toBe(big.hunger);
    expect(small.rng).toEqual(big.rng);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 4);
  });

  it('migrates v6 saves: colonies start fed', () => {
    const { state } = setup();
    const v6 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 6 })) as Record<
      string,
      unknown
    >;
    delete v6.hunger;
    const m = migrateState(v6);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.hunger).toBe(0);
  });
});
