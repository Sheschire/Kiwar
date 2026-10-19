import { describe, expect, it } from 'vitest';
import {
  advance,
  buildingHarvest,
  CALENDAR,
  calendarAt,
  CYCLES,
  DEPOSITS,
  depotDistance,
  eggDuration,
  freeDepositStock,
  HATCHING,
  hexKey,
  HOUR_MS,
  migrateState,
  nextCalendarChange,
  PATHS,
  population,
  moraleWork,
  SEASON_MS,
  seasonOf,
  tileWalkCost,
  YEAR_MS,
  type FaceMap,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** Moves the calendar so that `now` falls on this season, `hour` hours after dawn. */
function at(state: GameState, season: number, hour = 0.5): GameState {
  return { ...state, calendarStart: state.now - season * SEASON_MS - hour * HOUR_MS };
}

const empty = (s: GameState): GameState => ({
  ...s,
  resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
});

function withPulpery(): { map: FaceMap; s: GameState } {
  const { map, state } = setup();
  const flesh = findTile(map, 'flesh');
  let s = run(
    rich(state),
    { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
    T0,
    map,
  );
  s = advance(s, T0 + 60_000).state;
  return { map, s: empty(s) };
}

describe('calendar', () => {
  it('starts at dawn of spring and alternates day and night', () => {
    const c = calendarAt(T0, T0);
    expect(c).toMatchObject({ season: 'spring', year: 0, day: 0, sinceDawn: 0, night: false });
    const nightAt = T0 + CALENDAR.dayMs - CALENDAR.nightMs.spring;
    expect(c.nightAt).toBe(nightAt);
    expect(calendarAt(T0, nightAt - 1).night).toBe(false);
    expect(calendarAt(T0, nightAt).night).toBe(true);
    expect(calendarAt(T0, T0 + CALENDAR.dayMs)).toMatchObject({ day: 1, night: false });
    expect(nextCalendarChange(T0, T0)).toBe(nightAt);
    expect(nextCalendarChange(T0, nightAt)).toBe(T0 + CALENDAR.dayMs);
  });

  it('cycles through the four seasons, with shorter summer nights', () => {
    expect(calendarAt(T0, T0 + SEASON_MS).season).toBe('summer');
    expect(calendarAt(T0, T0 + 2 * SEASON_MS).season).toBe('autumn');
    const winter = calendarAt(T0, T0 + 3 * SEASON_MS + 5);
    expect(winter).toMatchObject({ season: 'winter', next: 'spring' });
    expect(winter.seasonEndsAt).toBe(T0 + YEAR_MS);
    expect(calendarAt(T0, T0 + YEAR_MS)).toMatchObject({ season: 'spring', year: 1 });
    const summer = calendarAt(T0, T0 + SEASON_MS);
    expect(summer.nightAt - T0 - SEASON_MS).toBe(CALENDAR.dayMs - CALENDAR.nightMs.summer);
    // Before the calendar start (universe joined later is never earlier, but stay total).
    expect(calendarAt(T0, T0 - 1)).toMatchObject({ season: 'winter', night: true, year: -1 });
  });

  it('reports season changes while advancing', () => {
    const { state } = setup();
    // A new colony wakes up on a spring morning.
    expect(calendarAt(state.calendarStart, T0)).toMatchObject({ season: 'spring', day: 0 });
    expect(state.calendarStart).toBe(T0 - CALENDAR.startOffsetMs);
    const summer = state.calendarStart + SEASON_MS;
    const { events, state: after } = advance(state, summer + HOUR_MS);
    const seasons = events.filter((e) => e.type === 'seasonChanged');
    expect(seasons).toEqual([{ type: 'seasonChanged', at: summer, season: 'summer' }]);
    expect(after.now).toBe(summer + HOUR_MS);
  });

  it('migrates v5 saves: the calendar starts with the game', () => {
    const { state } = setup();
    const v5 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 5 })) as Record<
      string,
      unknown
    >;
    delete v5.calendarStart;
    const m = migrateState(v5);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.calendarStart).toBe(state.calendarStart);
  });
});

describe('night and seasons at work', () => {
  it('kiwis work much less at night', () => {
    const { s } = withPulpery();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const day = buildingHarvest(at(s, 0, 0.5), pulpery)!;
    const night = buildingHarvest(at(s, 0, 1.8), pulpery)!;
    expect(day.cycle).toBe(1);
    expect(night.cycle).toBe(CYCLES.nightWork);
    expect(night.harvest).toBeCloseTo(day.harvest * CYCLES.nightWork, 6);
  });

  it('seasons change harvests and regrowth', () => {
    const { s } = withPulpery();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const spring = buildingHarvest(at(s, 0), pulpery)!;
    const autumn = buildingHarvest(at(s, 2), pulpery)!;
    const winter = buildingHarvest(at(s, 3), pulpery)!;
    expect(spring.cycle).toBe(1);
    expect(autumn.cycle).toBe(1.2);
    // Same staff, same land: only the season (and the season's morale) differs.
    const morale = moraleWork(at(s, 2)) / moraleWork(at(s, 0));
    expect(autumn.harvest).toBeCloseTo(spring.harvest * 1.2 * morale, 6);
    expect(winter.regen).toBe(0);
    expect(spring.regen).toBeCloseTo(autumn.regen * 1.4, 6);
  });

  it('freezes the juice wells and buries the groves in winter (paths stay clear)', () => {
    const { map, state } = setup();
    const juice = findTile(map, 'juice');
    let s = run(
      rich(state),
      { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r },
      T0,
      map,
    );
    s = empty(advance(s, T0 + 60_000).state);
    const well = s.buildings.find((b) => b.type === 'juiceWell')!;
    const summer = buildingHarvest(at(s, 1), well)!;
    const winter = buildingHarvest(at(s, 3), well)!;
    expect(winter.cycle).toBe(0.5);
    // Snow also slows the walk to the depot.
    expect(winter.efficiency).toBeLessThanOrEqual(summer.efficiency);
    expect(summer.cycle).toBe(1);

    // Some grove tiles are out of reach in winter; paths are always cleared of snow.
    const blocked = map.tiles.some(
      (t) =>
        t.type === 'grove' &&
        depotDistance(at(s, 3), map, t) === Infinity &&
        depotDistance(at(s, 1), map, t) < Infinity,
    );
    expect(blocked).toBe(true);
    expect(tileWalkCost('grove', false, 'winter')).toBe(Infinity);
    expect(tileWalkCost('grove', true, 'winter')).toBe(PATHS.walkCost);
    expect(tileWalkCost('flesh', false, 'winter')).toBe(1.5);
  });

  it('free deposits stop regrowing in winter and start again in spring', () => {
    const { map, state } = setup();
    const flesh = findTile(map, 'flesh', 5);
    const key = hexKey(flesh);
    // Two hours before spring, a drained free deposit.
    let s = at(state, 3, 0);
    s = {
      ...s,
      calendarStart: s.now - (YEAR_MS - 2 * HOUR_MS),
      deposits: { [key]: { stock: 0, at: s.now } },
    };
    expect(seasonOf(s)).toBe('winter');
    const winterEnd = s.calendarStart + YEAR_MS;
    const later = advance(s, winterEnd + HOUR_MS).state;
    // Nothing grew during the last two winter hours; one spring hour of regrowth since.
    const regen = DEPOSITS.flesh!.regen * flesh.richness * 1.4;
    expect(freeDepositStock(later, map, key, later.now)).toBeCloseTo(regen, 6);
    expect(later.deposits[key]!.at).toBe(winterEnd);
  });

  it('hatches faster in spring', () => {
    const { state } = setup();
    const base = HATCHING.durationMs(population(state));
    expect(eggDuration(at(state, 0))).toBe(Math.round(base * 0.8));
    expect(eggDuration(at(state, 1))).toBe(base);
  });

  it('gives the same result in one big step or many small ones over days and seasons', () => {
    const { map, state } = setup('kiwino');
    // Start late in autumn, five hours before winter.
    let s: GameState = { ...state, resources: { pulp: 300, fiber: 250, seeds: 0, juice: 80 } };
    s = { ...s, calendarStart: s.now - (3 * SEASON_MS - 5 * HOUR_MS) };
    const flesh = findTile(map, 'flesh');
    const juice = findTile(map, 'juice');
    const grove = findTile(map, 'grove');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = run(s, { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r }, T0, map);
    s = run(s, { type: 'hatchEgg' }, T0, map);
    s = run(
      s,
      { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r },
      T0 + 120_000,
      map,
    );
    const t0 = s.now;

    const end = T0 + 30 * HOUR_MS;
    const oneStep = advance(s, end);
    let stepped = s;
    for (let t = t0; t <= end; t += 61_237) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;

    expect(oneStep.events.some((e) => e.type === 'seasonChanged' && e.season === 'winter')).toBe(
      true,
    );
    const a = oneStep.state;
    expect(stepped.villagers).toEqual(a.villagers);
    expect(stepped.queue).toEqual(a.queue);
    expect(stepped.buildings.map((b) => b.pool?.tiles)).toEqual(
      a.buildings.map((b) => b.pool?.tiles),
    );
    for (let i = 0; i < a.buildings.length; i++)
      expect(stepped.buildings[i]!.pool?.stock ?? 0).toBeCloseTo(
        a.buildings[i]!.pool?.stock ?? 0,
        4,
      );
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(stepped.resources[id]).toBeCloseTo(a.resources[id], 4);
    expect(Object.keys(stepped.deposits).sort()).toEqual(Object.keys(a.deposits).sort());
  });
});
