import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildingHarvest,
  capacity,
  constructionDuration,
  defenseOf,
  guardPower,
  waveOutcome,
  HOUR_MS,
  migrateState,
  RESEARCH,
  RESEARCH_SCALE,
  researchPerHour,
  researchRate,
  researchPower,
  TECHS,
  techStatus,
  type Command,
  type GameEvent,
  type GameState,
  type Defense,
} from '../src';
import { findTile, kiwi, rich, run, setup, T0, siteFor } from './helpers';

/** A colony with a Nest 2, a pulpery and a Library (nobody researching yet). */
function libraryColony(level = 1) {
  const { map, state } = setup('kiwisu', 'library');
  let s: GameState = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + HOUR_MS).state;
  const flesh = findTile(map, 'flesh');
  const site = findTile(map, 'flesh', 3);
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, s.now, map);
  s = run(
    s,
    { type: 'build', buildingType: 'library', ...siteFor(s, map, 'library', site) },
    s.now,
    map,
  );
  s = advance(s, s.now + HOUR_MS).state;
  const library = s.buildings.find((b) => b.type === 'library')!;
  for (let l = 1; l < level; l++) {
    s = rich(s);
    s = run(s, { type: 'upgrade', buildingId: library.id }, s.now, map);
    s = advance(s, s.now + 2 * HOUR_MS).state;
  }
  return { map, s: rich(s), libraryId: library.id };
}

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

describe('research', () => {
  it('kiwis never join the Library on their own', () => {
    const { s, libraryId } = libraryColony();
    expect(s.villagers.some((v) => v.job.kind === 'work' && v.job.buildingId === libraryId)).toBe(
      false,
    );
    expect(researchRate(s)).toBe(0);
  });

  it('researchers bank points, capped without a chosen technology', () => {
    const { map, s, libraryId } = libraryColony();
    // No wave meanwhile (chantier 31: an injured researcher stops the research).
    s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
    s.threats.next = null;
    const staffed = run(s, { type: 'assignWorkers', buildingId: libraryId, count: 1 }, s.now, map);
    expect(researchPerHour(staffed)).toBeGreaterThan(0);
    const later = advance(staffed, staffed.now + 200 * HOUR_MS).state;
    expect(later.research.points).toBe(RESEARCH.bank[0]! * RESEARCH_SCALE);
    // The banked points pay for a technology at once.
    const r = applyCommand(
      later,
      { type: 'setResearch', tech: 'foraging' },
      { now: later.now, map },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.research.done).toEqual(['foraging']);
    expect(r.state.research.points).toBe(
      (RESEARCH.bank[0]! - TECHS.foraging.cost) * RESEARCH_SCALE,
    );
    expect(r.events.some((e) => e.type === 'researchDone' && e.tech === 'foraging')).toBe(true);
  });

  it('completes the chosen technology at an exact time, offline as online', () => {
    const { map, s, libraryId } = libraryColony();
    let a = run(s, { type: 'assignWorkers', buildingId: libraryId, count: 1 }, s.now, map);
    a = run(a, { type: 'setResearch', tech: 'palisade' }, a.now, map);
    const end = a.now + 30 * HOUR_MS;
    const big = advance(a, end);
    let small = a;
    const events: GameEvent[] = [];
    for (let t = a.now; t < end;) {
      t = Math.min(end, t + 17 * 60_000 + 321);
      const step = advance(small, t);
      small = step.state;
      events.push(...step.events);
    }
    expect(big.state.research).toEqual(small.research);
    expect(big.state.research.done).toContain('palisade');
    const done = (list: typeof events) => list.find((e) => e.type === 'researchDone')?.at;
    expect(done(events)).toBe(done(big.events));
    expect(big.state.villagers).toEqual(small.villagers);
  });

  it('Spirit and research practice make better researchers', () => {
    const { map, s, libraryId } = libraryColony();
    const staffed = run(s, { type: 'assignWorkers', buildingId: libraryId, count: 1 }, s.now, map);
    const v = staffed.villagers.find(
      (x) => x.job.kind === 'work' && x.job.buildingId === libraryId,
    )!;
    const later = advance(staffed, staffed.now + 10 * HOUR_MS).state;
    const after = later.villagers.find((x) => x.id === v.id)!;
    expect(after.mastery.research).toBeGreaterThan(0);
    const wise = { ...v, stats: { ...v.stats, spirit: v.stats.spirit + 5 } };
    expect(researchPower(wise)).toBeGreaterThan(researchPower(v));
  });

  it('refuses locked or known technologies', () => {
    const { map, s } = libraryColony();
    expect(errorOf(s, { type: 'setResearch', tech: 'masonry' }, map)).toBe('techAgeLocked');
    // Chantier 30: the Stone passage needs only the first Library.
    expect(techStatus(s, 'stoneAge')).toBe('available');
    const known = { ...s, research: { ...s.research, done: ['foraging' as const] } };
    expect(errorOf(known, { type: 'setResearch', tech: 'foraging' }, map)).toBe('techDone');
    const { map: m2, state } = setup();
    expect(errorOf(state, { type: 'setResearch', tech: 'foraging' }, m2)).toBe('libraryTooLow');
  });

  it('technologies change the harvest and the turrets', () => {
    const { map, s } = libraryColony();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const before = buildingHarvest(s, pulpery)!.harvest;
    const known: GameState = {
      ...s,
      research: { ...s.research, done: ['foraging', 'palisade'] },
    };
    expect(buildingHarvest(known, pulpery)!.harvest).toBeCloseTo(before * 1.1, 6);
    const skin = map.tiles.find((t) => t.type === 'skin' && t.rho > 0.9)!;
    const turret = {
      id: 'bt' as never,
      type: 'seedTurret' as const,
      q: skin.q,
      r: skin.r,
      level: 1,
      richness: 1,
      builtAt: T0,
    };
    const a = { ...s, buildings: [...s.buildings, turret] };
    const b = { ...known, buildings: [...known.buildings, turret] };
    expect(defenseOf(b).turrets.ground).toBeCloseTo(defenseOf(a).turrets.ground * 1.15, 6);
  });

  it('later technologies: storage, building time, guards, firearms and injuries', () => {
    const { s } = libraryColony();
    const known = (...done: (typeof s.research.done)[number][]): GameState => ({
      ...s,
      research: { ...s.research, done },
    });
    expect(capacity(known('masonry')).pulp).toBeCloseTo(capacity(s).pulp * 1.2, 6);
    expect(constructionDuration(known('smelting'), 'hut', 2, false, false)).toBeLessThan(
      constructionDuration(s, 'hut', 2, false, false),
    );
    const warrior = { ...kiwi('w'), classId: 'warrior' as const };
    expect(guardPower(warrior, s).air).toBe(0);
    expect(guardPower(warrior, known('firearms')).air).toBeGreaterThan(0);
    expect(guardPower(warrior, known('slingshots')).ground).toBeCloseTo(
      guardPower(warrior, s).ground * 1.25,
      6,
    );
    const crowd = (st: GameState): GameState => ({
      ...st,
      villagers: Array.from({ length: 10 }, (_, i) => kiwi(`c${i}`)),
    });
    const threat = { ground: 400, air: 400 };
    const zero = { ground: 0, air: 0 };
    const hurt = (st: GameState) =>
      waveOutcome(
        crowd(st),
        threat,
        { ...zero, sectors: { front: zero, left: zero, right: zero } } as Defense,
        false,
      ).injured;
    expect(hurt(known('armor'))).toBeLessThan(hurt(s));
  });

  it('migrates v12 saves with an empty research and no practice', () => {
    const { state } = setup();
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete old.research;
    old.schemaVersion = 12;
    old.villagers = (old.villagers as Record<string, Record<string, unknown>>[]).map((v) => {
      const mastery = { ...(v.mastery as Record<string, number>) };
      delete mastery.research;
      return { ...v, mastery };
    });
    const r = migrateState(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.research).toEqual({ points: 0, current: null, done: [], outbox: 0 });
    expect(r.state.villagers[0]!.mastery.research).toBe(0);
  });
});
