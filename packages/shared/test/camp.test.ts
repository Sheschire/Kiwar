import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildLock,
  CAMP,
  CLASSES,
  classRank,
  consumption,
  grantClassXp,
  hasSkill,
  HOUR_MS,
  migrateState,
  modifiers,
  PRACTICE_SCALE,
  SKILLS,
  trainingCost,
  XP_SCALE,
  xpForLevel,
  type BuildingId,
  type Command,
  type GameEvent,
  type GameState,
  type Villager,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const STRONG = { strength: 11, agility: 7, endurance: 10, spirit: 10, dexterity: 7, charisma: 7 };

/** An Iron-age colony with a training camp, a School and seasoned builders. */
function campColony(campLevel = 1) {
  const { map, state } = setup('kiwisu', 'camp');
  const s: GameState = rich(state);
  s.buildings[0]!.level = 7;
  const mon = findTile(map, 'flesh', 6);
  const at = findTile(map, 'flesh', 9);
  const school = findTile(map, 'flesh', 12);
  s.buildings.push(
    {
      id: 'bmon' as BuildingId,
      type: 'monument',
      q: mon.q,
      r: mon.r,
      level: 2,
      richness: mon.richness,
      builtAt: T0,
    },
    {
      id: 'bcamp' as BuildingId,
      type: 'trainingCamp',
      q: at.q,
      r: at.r,
      level: campLevel,
      richness: at.richness,
      builtAt: T0,
      cramped: true,
    },
    {
      id: 'bschool' as BuildingId,
      type: 'school',
      q: school.q,
      r: school.r,
      level: 2,
      richness: school.richness,
      builtAt: T0,
      cramped: true,
    },
  );
  s.research.done = ['stoneAge', 'ironAge'];
  // No wave meanwhile.
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  s.threats.next = null;
  s.villagers = s.villagers.map((v, i) => ({
    ...v,
    level: 12,
    xp: xpForLevel(12) * XP_SCALE,
    stats: { ...STRONG },
    classId: i < 2 ? ('builder' as const) : null,
    job: { kind: 'idle' as const },
  }));
  return { map, s };
}

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

const drill = (v: Villager): Command => ({
  type: 'assignKiwi',
  villagerId: v.id,
  buildingId: 'bcamp' as BuildingId,
});

const promote = (v: Villager, classId: Villager['classId'], at = 'bcamp'): Command => ({
  type: 'train',
  villagerId: v.id,
  schoolId: at as BuildingId,
  classId: classId!,
});

describe('training camp (chantier 37)', () => {
  it('waits for the Stone age', () => {
    const { state } = setup('kiwisu', 'camp-age');
    const s = rich(state);
    s.buildings[0]!.level = 4;
    expect(buildLock(s, 'trainingCamp')).not.toBeNull();
  });

  it('drills classed kiwis into class ranks, exactly offline, and they eat more', () => {
    const { map, s: s0 } = campColony();
    const builder = s0.villagers[0]!;
    expect(errorOf(s0, drill(s0.villagers[2]!), map)).toBe('wrongClass');
    const s = run(s0, drill(builder), s0.now, map);
    expect(consumption(s).pulp).toBeGreaterThan(consumption(s0).pulp);
    const end = s.now + 30 * HOUR_MS;
    const { state: big, events } = advance(s, end);
    const v = big.villagers[0]!;
    expect(classRank(v)).toBeGreaterThanOrEqual(3);
    expect(events.some((e: GameEvent) => e.type === 'classRankUp' && e.rank === 2)).toBe(true);
    let small = s;
    for (let t = s.now; t < end; t += 977_311) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    // Each rank lifts the class bonus a little.
    expect(modifiers(v).build).toBeGreaterThan(modifiers({ ...v, classXp: 0 }).build);
  });

  it('promotes a ranked builder to architect, who keeps the builder skills', () => {
    const { map, s: s0 } = campColony();
    const ranked = structuredClone(s0);
    ranked.villagers[0]!.classXp = CAMP.rankHours[3]! * PRACTICE_SCALE;
    const v = ranked.villagers[0]!;
    // Rank, class, place and stats are all checked.
    expect(errorOf(s0, promote(s0.villagers[0]!, 'architect'), map)).toBe('rankTooLow');
    expect(errorOf(ranked, promote(v, 'archmage'), map)).toBe('wrongClass');
    expect(errorOf(ranked, promote(v, 'architect', 'bschool'), map)).toBe('classLocked');
    const weak = structuredClone(ranked);
    weak.villagers[0]!.stats.strength = 9;
    expect(errorOf(weak, promote(weak.villagers[0]!, 'architect'), map)).toBe('statTooLow');
    const young = structuredClone(ranked);
    young.villagers[0]!.level = 9;
    young.villagers[0]!.xp = xpForLevel(9) * XP_SCALE;
    expect(errorOf(young, promote(young.villagers[0]!, 'architect'), map)).toBe('levelTooLow');
    const s = run(ranked, promote(v, 'architect'), ranked.now, map);
    expect(s.resources.pulp).toBe(ranked.resources.pulp - CLASSES.architect.cost.pulp!);
    const done = advance(s, s.now + CLASSES.architect.trainingMs).state.villagers[0]!;
    expect(done.classId).toBe('architect');
    expect(done.classXp).toBe(0);
    expect(hasSkill(done, 'scaffold')).toBe(true);
    expect(modifiers(done).build).toBeGreaterThan(modifiers(v).build);
  });

  it('changes a class for less than the School, and the rank starts over', () => {
    const { map, s: s0 } = campColony();
    const s = structuredClone(s0);
    s.villagers[0]!.classXp = CAMP.rankHours[2]! * PRACTICE_SCALE;
    const v = s.villagers[0]!;
    const camp = s.buildings.find((b) => b.id === 'bcamp')!;
    const school = s.buildings.find((b) => b.id === 'bschool')!;
    expect(trainingCost(v, 'warrior', camp).pulp).toBe(
      Math.round(CLASSES.warrior.cost.pulp! * CAMP.retrainCost),
    );
    expect(trainingCost(v, 'warrior', school).pulp).toBe(
      CLASSES.warrior.cost.pulp! * SKILLS.retrainCost,
    );
    // The camp never teaches a first class.
    expect(errorOf(s, promote(s.villagers[2]!, 'warrior'), map)).toBe('wrongClass');
    const after = advance(run(s, promote(v, 'warrior'), s.now, map), s.now + 3 * HOUR_MS).state;
    expect(after.villagers[0]!.classId).toBe('warrior');
    expect(classRank(after.villagers[0]!)).toBe(1);
  });

  it('gives class practice for fights and expeditions', () => {
    const { s } = campColony();
    const v = structuredClone(s.villagers[0]!);
    const events: GameEvent[] = [];
    grantClassXp(v, CAMP.rankHours[2]!, s.now, events);
    expect(classRank(v)).toBe(2);
    expect(events).toHaveLength(1);
    const none = structuredClone(s.villagers[2]!);
    grantClassXp(none, 10, s.now, events);
    expect(none.classXp).toBe(0);
  });

  it('migrates v29 saves: every class at rank 1', () => {
    const { s } = campColony();
    const old = JSON.parse(JSON.stringify({ ...s, schemaVersion: 29 })) as Record<string, unknown>;
    old.villagers = (old.villagers as Record<string, unknown>[]).map((v) => {
      const { classXp: _x, ...rest } = v;
      return rest;
    });
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.villagers.every((v) => v.classXp === 0)).toBe(true);
  });
});
