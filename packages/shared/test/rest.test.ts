import { describe, expect, it } from 'vitest';
import {
  advance,
  bedsOf,
  CALENDAR,
  CYCLES,
  hexDistance,
  HOUR_MS,
  kiwiRhythm,
  migrateState,
  MORALE,
  moraleOf,
  presence,
  REST,
  SEASON_MS,
  workersOf,
  type FaceMap,
  type GameState,
} from '../src';
import { rich, run, setup, T0 } from './helpers';

/** A pulpery far from the heart (staffed), and a flesh tile next to it for a hut. */
function farPulpery(): { map: FaceMap; s: GameState; hutSite: { q: number; r: number } } {
  const { map, state } = setup();
  const far = map.tiles
    .filter((t) => t.type === 'flesh')
    .sort((a, b) => b.rho - a.rho)
    .find((t) =>
      map.tiles.some((n) => n.type === 'flesh' && hexDistance(n, t) === 1 && n.rho < t.rho + 0.05),
    )!;
  const hutSite = map.tiles.find(
    (n) => n.type === 'flesh' && hexDistance(n, far) === 1 && n.rho < far.rho + 0.05,
  )!;
  let s = run(rich(state), { type: 'build', buildingType: 'pulpery', q: far.q, r: far.r }, T0, map);
  s = advance(s, T0 + 2 * 60_000).state;
  return { map, s, hutSite };
}

describe('beds and rest', () => {
  it('a hut next to a far work site shortens the walk to bed and adds work time', () => {
    const { map, s, hutSite } = farPulpery();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const worker = workersOf(s, pulpery.id)[0]!;
    const before = bedsOf(s, map).get(worker.id)!;
    expect(before.buildingId).toBe(s.buildings[0]!.id); // the Nest
    let t = run(s, { type: 'build', buildingType: 'hut', q: hutSite.q, r: hutSite.r }, s.now, map);
    t = advance(t, t.now + 2 * 60_000).state;
    const hut = t.buildings.find((b) => b.type === 'hut')!;
    const after = bedsOf(t, map).get(worker.id)!;
    expect(after.buildingId).toBe(hut.id);
    expect(after.distance).toBeLessThan(before.distance);
    expect(presence(t, worker, after)).toBeGreaterThan(presence(s, worker, before));
  });

  it('enduring kiwis rest less; summer heat tires everyone', () => {
    const { s } = farPulpery();
    const v = s.villagers[0]!;
    const bed = { buildingId: s.buildings[0]!.id, distance: 2 };
    const tough = { ...v, stats: { ...v.stats, endurance: 10 } };
    const frail = { ...v, stats: { ...v.stats, endurance: 2 } };
    expect(presence(s, tough, bed)).toBeGreaterThan(presence(s, frail, bed));
    const summer = { ...s, calendarStart: s.now - SEASON_MS - HOUR_MS };
    expect(presence(summer, v, bed)).toBeLessThan(presence(s, v, bed));
    // Sleeping outside (no bed) doubles the rest needed; presence never drops below the floor.
    expect(presence(s, v, { buildingId: null, distance: 0 })).toBeCloseTo(
      1 - 2 * (1 - presence(s, v, { buildingId: bed.buildingId, distance: 0 })),
      9,
    );
    expect(presence(s, frail, { buildingId: null, distance: 50 })).toBe(REST.minPresence);
  });

  it('early birds rest a quarter less by day and always sleep at night', () => {
    const { s } = farPulpery();
    const v = { ...s.villagers[0]!, trait: null };
    const bird = { ...v, trait: 'earlyBird' as const };
    const bed = { buildingId: s.buildings[0]!.id, distance: 2 };
    expect(1 - presence(s, bird, bed)).toBeCloseTo((1 - presence(s, v, bed)) * 0.75, 9);
    const night = s.calendarStart + CALENDAR.dayMs - CALENDAR.nightMs.spring / 2;
    for (let i = 0; i < 20; i++)
      expect(kiwiRhythm(s, { ...bird, id: `b${i}` as never }, night).rhythm).toBe('sleep');
  });

  it('every kiwi gets a bed of its own while there are enough', () => {
    const { map, s } = farPulpery();
    const beds = bedsOf(s, map);
    const counts = new Map<string, number>();
    for (const b of beds.values()) counts.set(b.buildingId!, (counts.get(b.buildingId!) ?? 0) + 1);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(s.villagers.length);
    expect(counts.get(s.buildings[0]!.id)).toBeLessThanOrEqual(4);
  });
});

describe('morale', () => {
  it('adds up food, beds, speech, mourning and season, within ±10 %', () => {
    const { s } = farPulpery();
    const m = moraleOf(s);
    expect(m.food).toBe(MORALE.fed);
    expect(m.season).toBe(MORALE.season.spring);
    expect(m.total).toBeCloseTo(m.food + m.comfort + m.speech + m.mourning + m.season, 9);
    const sad = moraleOf({ ...s, mourningUntil: s.now + HOUR_MS, hunger: 1e12 });
    expect(sad.mourning).toBe(MORALE.mourning);
    expect(sad.total).toBeGreaterThanOrEqual(-MORALE.max);
  });

  it('the colony mourns a lost kiwi for a day', () => {
    const { state } = setup();
    const s = { ...state, mourningUntil: T0 + MORALE.mourningMs };
    const { events, state: later } = advance(s, T0 + MORALE.mourningMs + HOUR_MS);
    expect(events.some((e) => e.type === 'mourningOver' && e.at === T0 + MORALE.mourningMs)).toBe(
      true,
    );
    expect(moraleOf(later).mourning).toBe(0);
  });

  it('migrates v7 saves: nobody mourns', () => {
    const { state } = setup();
    const v7 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 7 })) as Record<
      string,
      unknown
    >;
    delete v7.mourningUntil;
    const m = migrateState(v7);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.mourningUntil).toBe(0);
  });
});

describe('kiwi rhythm (cosmetic)', () => {
  it('most kiwis sleep at night; by day they alternate work and rest', () => {
    const { s } = farPulpery();
    const night = s.calendarStart + CALENDAR.dayMs - CALENDAR.nightMs.spring / 2;
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...s.villagers[0]!,
      id: `k${i}` as never,
    }));
    const sleeping = many.filter((v) => kiwiRhythm(s, v, night).rhythm === 'sleep').length;
    expect(sleeping / many.length).toBeCloseTo(1 - CYCLES.nightWork, 1);
    const v = s.villagers[0]!;
    let resting = 0;
    for (let t = 0; t < REST.cycleMs; t += 60_000) {
      const r = kiwiRhythm(s, v, s.now + t);
      expect(r.fatigue).toBeGreaterThanOrEqual(0);
      expect(r.fatigue).toBeLessThanOrEqual(1);
      if (r.rhythm === 'rest') resting++;
    }
    expect(resting / (REST.cycleMs / 60_000)).toBeCloseTo(1 - presence(s, v), 1);
  });
});
