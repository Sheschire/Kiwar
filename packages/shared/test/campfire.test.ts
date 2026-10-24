import { describe, expect, it } from 'vitest';
import {
  advance,
  bedsOf,
  buildCost,
  buildLock,
  calendarAt,
  CAMPFIRE,
  cloneState,
  consumption,
  hexDistance,
  HOUR_MS,
  isNight,
  kiwiMorale,
  LEISURE,
  MORALE,
  type GameState,
} from '../src';
import { rich, setup } from './helpers';

const RADIUS = LEISURE.campfire!.radius;

/** The starting colony (everyone sleeps in the Nest) with a campfire at `distance` from it. */
function withFire(distance: number) {
  const { map, state } = setup();
  const s = cloneState(rich(state));
  const nest = s.buildings.find((b) => b.type === 'nest')!;
  const tile = map.tiles.find(
    (t) =>
      t.type === 'flesh' &&
      hexDistance(t, nest) === distance &&
      !s.obstacles.some((o) => o.q === t.q && o.r === t.r),
  )!;
  s.buildings.push({
    ...nest,
    id: 'bf' as never,
    type: 'campfire',
    level: 1,
    q: tile.q,
    r: tile.r,
  });
  s.threats.next = null;
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  return { map, s };
}

/** The next nightfall after `s.now`. */
function nightfall(s: GameState): number {
  const c = calendarAt(s.calendarStart, s.now);
  return c.night ? calendarAt(s.calendarStart, c.dawnAt).nightAt : c.nightAt;
}

describe('the campfire (chantier 43)', () => {
  it('opens at the Nest 3, outside the building cap, each copy dearer', () => {
    const { state } = setup();
    const s = cloneState(rich(state));
    expect(buildLock(s, 'campfire')).toBe('nestLevelTooLow');
    s.buildings.find((b) => b.type === 'nest')!.level = 3;
    expect(buildLock(s, 'campfire')).toBeNull();
    const first = buildCost(s, 'campfire');
    const { s: one } = withFire(2);
    one.buildings.find((b) => b.type === 'nest')!.level = 3;
    expect(buildCost(one, 'campfire').fiber).toBeGreaterThan(first.fiber!);
  });

  it('is a leisure for the kiwis sleeping within its reach', () => {
    const near = withFire(RADIUS).s;
    const far = withFire(RADIUS + 2).s;
    for (const v of near.villagers) {
      expect(bedsOf(near).get(v.id)?.buildingId).toBeTruthy();
      expect(kiwiMorale(near, v).leisure).toBe(MORALE.leisure);
    }
    for (const v of far.villagers) expect(kiwiMorale(far, v).leisure).toBe(0);
  });

  it('gathers the free kiwis at nightfall: morale until the next one, lighter meals at night', () => {
    const { s } = withFire(2);
    const guard = s.villagers[0]!;
    guard.job = { kind: 'guard' };
    const dusk = nightfall(s);
    const { state: night, events } = advance(s, dusk);
    expect(isNight(night)).toBe(true);
    const next = calendarAt(s.calendarStart, calendarAt(s.calendarStart, dusk).dawnAt).nightAt;
    expect(events.find((e) => e.type === 'vigil')).toEqual({
      type: 'vigil',
      at: dusk,
      count: s.villagers.length - 1,
    });
    for (const v of night.villagers) {
      if (v.id === guard.id) expect(v.memories).toBeUndefined();
      else
        expect(v.memories).toEqual([
          { kind: 'vigil', value: MORALE.memories.vigil.value, until: next },
        ]);
    }
    // Meals of the night: the supped kiwis eat less.
    const hungry = cloneState(night);
    for (const v of hungry.villagers) delete v.memories;
    const ratio = consumption(night).pulp / consumption(hungry).pulp;
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThanOrEqual(CAMPFIRE.meals);
    // By day, the memory lifts morale but the meals are as usual.
    const day = advance(night, calendarAt(s.calendarStart, dusk).dawnAt + 60_000).state;
    expect(isNight(day)).toBe(false);
    const dayHungry = cloneState(day);
    for (const v of dayHungry.villagers) delete v.memories;
    expect(consumption(day).pulp).toBeCloseTo(consumption(dayHungry).pulp, 9);
    expect(kiwiMorale(day, day.villagers[1]!).memories).toBe(MORALE.memories.vigil.value);
  });

  it('gives the same result in one big step or many small ones over two days', () => {
    const { s } = withFire(2);
    const end = s.now + 5 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let at = s.now + 7 * 60_000; at < end; at += 7 * 60_000) small = advance(small, at).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.hunger).toBe(big.hunger);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 6);
    expect(big.villagers.some((v) => v.memories?.some((m) => m.kind === 'vigil'))).toBe(true);
  });
});
