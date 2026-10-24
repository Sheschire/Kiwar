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
  missingBeds,
  MORALE,
  moraleOf,
  colonyMood,
  kiwiMorale,
  moraleFactor,
  removeVillagers,
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

describe('kiwis without a bed (chantier 12)', () => {
  it('never count as sleeping near their work, and their cost is shown', () => {
    const { s } = farPulpery();
    const outside = new Map([...bedsOf(s)].map(([id]) => [id, { buildingId: null, distance: 0 }]));
    expect(moraleOf(s, outside).comfort).toBe(MORALE.noBed);
    for (const v of s.villagers) expect(kiwiMorale(s, v, outside).bed).toBe(MORALE.noBed);
    const cost = missingBeds(s, outside);
    expect(cost.count).toBe(
      s.villagers.filter((v) => v.job.kind === 'work' || v.job.kind === 'idle').length,
    );
    expect(cost.presenceLost).toBeGreaterThan(0);
    expect(missingBeds(s)).toEqual({ count: 0, presenceLost: 0 });
  });
});

describe('morale per kiwi (chantier 43)', () => {
  it('adds up the colony, the bed, the temper and the memories, within 0–100', () => {
    const { s } = farPulpery();
    const mood = colonyMood(s);
    expect(mood.base).toBe(MORALE.base[0]);
    expect(mood.food).toBe(MORALE.fed);
    expect(mood.season).toBe(MORALE.season.spring);
    expect(mood.sum).toBeCloseTo(
      mood.base + mood.food + mood.season + mood.mayor + mood.bards + mood.speech,
      9,
    );
    for (const v of s.villagers) {
      const m = kiwiMorale(s, v);
      expect(m.total).toBeCloseTo(m.colony + m.bed + m.temper + m.memories, 9);
    }
    const v = s.villagers[0]!;
    const sad = {
      ...s,
      hunger: 1e12,
      villagers: s.villagers.map((x) =>
        x.id === v.id
          ? { ...x, memories: [{ kind: 'grief' as const, value: -90, until: s.now + HOUR_MS }] }
          : x,
      ),
    };
    expect(kiwiMorale(sad, sad.villagers[0]!).total).toBe(0);
    expect(moraleOf(sad).low).toBeGreaterThanOrEqual(1);
  });

  it('turns morale into work: ×0.7 at 0, ×1 at neutral, ×1.15 at the top', () => {
    expect(moraleFactor(0)).toBeCloseTo(MORALE.work.low, 9);
    expect(moraleFactor(MORALE.neutral)).toBe(1);
    expect(moraleFactor(MORALE.max)).toBeCloseTo(MORALE.work.high, 9);
    expect(moraleFactor(25)).toBeCloseTo((MORALE.work.low + 1) / 2, 9);
  });

  it('expects more in later ages', () => {
    const { s } = farPulpery();
    const v = s.villagers[0]!;
    const aged = (level: number) => ({
      ...s,
      buildings: [
        ...s.buildings,
        { ...s.buildings[0]!, id: 'bm' as never, type: 'monument' as const, level },
      ],
    });
    const eden = kiwiMorale(s, v).total;
    expect(kiwiMorale(aged(1), v).total).toBeCloseTo(eden - MORALE.base[0] + MORALE.base[1], 9);
    expect(kiwiMorale(aged(3), v).total).toBeCloseTo(eden - MORALE.base[0] + MORALE.base[3], 9);
  });

  it('a lost kiwi leaves a memory: grief for its hut mates, mourning for the others', () => {
    const { s } = farPulpery();
    const beds = bedsOf(s);
    const dead = s.villagers[0]!;
    const hut = beds.get(dead.id)!.buildingId;
    const t = structuredClone(s);
    removeVillagers(t, [dead.id], 'predator', t.now);
    expect(t.villagers.some((v) => v.id === dead.id)).toBe(false);
    for (const v of t.villagers) {
      const kind = hut && beds.get(v.id)?.buildingId === hut ? 'grief' : 'mourning';
      expect(v.memories).toEqual([
        { kind, value: MORALE.memories[kind].value, until: t.now + MORALE.memories[kind].ms },
      ]);
    }
    // A second loss later renews the memory (the stronger value, the later end).
    removeVillagers(t, [t.villagers[0]!.id], 'predator', t.now + HOUR_MS);
    expect(t.villagers[0]!.memories!.length).toBe(1);
    expect(t.villagers[0]!.memories![0]!.until).toBe(
      t.now + HOUR_MS + MORALE.memories[t.villagers[0]!.memories![0]!.kind].ms,
    );
  });

  it('memories fade at an event: one big step equals small steps', () => {
    const { s } = farPulpery();
    const t = structuredClone(s);
    removeVillagers(t, [t.villagers[0]!.id], 'predator', t.now);
    const end = t.now + MORALE.memories.mourning.ms + HOUR_MS;
    const big = advance(t, end).state;
    let small = t;
    for (let at = t.now + 7 * 60_000; at < end; at += 7 * 60_000) small = advance(small, at).state;
    small = advance(small, end).state;
    expect(big.villagers.every((v) => !v.memories)).toBe(true);
    expect(small.villagers).toEqual(big.villagers);
    expect(small.resources.pulp).toBeCloseTo(big.resources.pulp, 6);
    expect(moraleOf(big).memories).toBe(0);
  });

  it('migrates v35 saves: the colony mourning becomes a memory of each kiwi', () => {
    const { state } = setup();
    const v35 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 35 })) as Record<
      string,
      unknown
    >;
    v35.mourningUntil = state.now + HOUR_MS;
    const m = migrateState(v35);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect('mourningUntil' in m.state).toBe(false);
    for (const v of m.state.villagers)
      expect(v.memories).toEqual([
        { kind: 'mourning', value: MORALE.memories.mourning.value, until: state.now + HOUR_MS },
      ]);
    const old = JSON.parse(JSON.stringify({ ...state, schemaVersion: 35 })) as Record<
      string,
      unknown
    >;
    old.mourningUntil = 0;
    const n = migrateState(old);
    expect(n.ok && n.state.villagers.every((v) => !v.memories)).toBe(true);
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
