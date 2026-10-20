import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  builderSpeed,
  buildingHarvest,
  CLASSES,
  colonyBonus,
  mayorMorale,
  moraleOf,
  crewWeight,
  HOUR_MS,
  migrateState,
  productionRates,
  SKILLS,
  travelTime,
  XP_SCALE,
  xpForLevel,
  type ClassId,
  type Command,
  type GameState,
  type Villager,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const at = (v: Villager, level: number): Villager => ({
  ...v,
  level,
  xp: xpForLevel(level) * XP_SCALE,
});

/** A colony with a Nest 2, a pulpery, a School and seasoned kiwis. */
function schoolColony(schoolLevel = 1) {
  const { map, state } = setup('kiwisu', 'school');
  let s: GameState = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + HOUR_MS).state;
  const flesh = findTile(map, 'flesh');
  const site = findTile(map, 'flesh', 3);
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, s.now, map);
  s = run(s, { type: 'build', buildingType: 'school', q: site.q, r: site.r }, s.now, map);
  s = advance(s, s.now + HOUR_MS).state;
  const school = s.buildings.find((b) => b.type === 'school')!;
  for (let l = 1; l < schoolLevel; l++) {
    s = run(s, { type: 'upgrade', buildingId: school.id }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
  }
  s = {
    ...s,
    resources: { pulp: 5000, fiber: 5000, seeds: 5000, juice: 5000 },
    villagers: s.villagers.map((v, i) => at(v, i === 0 ? 12 : 6)),
  };
  return { map, s, schoolId: school.id };
}

const train = (s: GameState, i: number, schoolId: string, classId: ClassId): Command => ({
  type: 'train',
  villagerId: s.villagers[i]!.id,
  schoolId: schoolId as never,
  classId,
});

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

describe('school and classes', () => {
  it('trains a kiwi, who comes back to work with a class', () => {
    const { map, s, schoolId } = schoolColony();
    const trained = run(s, train(s, 1, schoolId, 'builder'), s.now, map);
    const v = trained.villagers[1]!;
    expect(v.job.kind).toBe('train');
    expect(trained.resources.pulp).toBe(s.resources.pulp - CLASSES.builder.cost.pulp!);
    const { state: after, events } = advance(trained, s.now + CLASSES.builder.trainingMs);
    const done = after.villagers[1]!;
    expect(done.classId).toBe('builder');
    expect(done.job.kind).not.toBe('train');
    expect(events.some((e) => e.type === 'trained' && e.villagerId === v.id)).toBe(true);
    expect(builderSpeed(done)).toBeGreaterThan(builderSpeed({ ...done, classId: null }));
  });

  it('refuses what the School or the kiwi cannot do', () => {
    const { map, s, schoolId } = schoolColony();
    expect(errorOf(s, train(s, 1, schoolId, 'mage'), map)).toBe('classLocked');
    expect(errorOf(s, train(s, 1, s.buildings[0]!.id, 'builder'), map)).toBe('notASchool');
    const young = { ...s, villagers: s.villagers.map((v, i) => (i === 1 ? at(v, 2) : v)) };
    expect(errorOf(young, train(young, 1, schoolId, 'builder'), map)).toBe('levelTooLow');
    const busy = run(s, train(s, 1, schoolId, 'warrior'), s.now, map);
    expect(errorOf(busy, train(busy, 2, schoolId, 'builder'), map)).toBe('schoolFull');
    expect(errorOf(busy, train(busy, 1, schoolId, 'builder'), map)).toBe('kiwiBusy');
    const mayor = advance(
      run(s, train(s, 0, schoolId, 'mayor'), s.now, map),
      s.now + 4 * HOUR_MS,
    ).state;
    expect(mayor.villagers[0]!.classId).toBe('mayor');
    expect(errorOf(mayor, train(mayor, 1, schoolId, 'mayor'), map)).toBe('mayorExists');
    expect(errorOf(mayor, train(mayor, 0, schoolId, 'mayor'), map)).toBe('alreadyThisClass');
  });

  it('charges more to change class, and refunds trainees if the School goes', () => {
    const { map, s, schoolId } = schoolColony();
    const builder = advance(
      run(s, train(s, 1, schoolId, 'builder'), s.now, map),
      s.now + 2 * HOUR_MS,
    ).state;
    const before = builder.resources.seeds;
    const retrain = run(builder, train(builder, 1, schoolId, 'warrior'), builder.now, map);
    expect(before - retrain.resources.seeds).toBe(CLASSES.warrior.cost.seeds! * SKILLS.retrainCost);
    const gone = run(
      retrain,
      { type: 'demolish', buildingId: schoolId as never },
      retrain.now,
      map,
    );
    expect(gone.villagers[1]!.job.kind).not.toBe('train');
    expect(gone.villagers[1]!.classId).toBe('builder');
    expect(gone.resources.seeds).toBeGreaterThanOrEqual(before);
  });

  it('lets the mayor lift the harvest, more during a speech', () => {
    const { map, s, schoolId } = schoolColony();
    const empty = (x: GameState): GameState => ({
      ...x,
      resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
    });
    const base = advance(
      run(s, train(s, 0, schoolId, 'mayor'), s.now, map),
      s.now + 4 * HOUR_MS,
    ).state;
    const mayor = base.villagers[0]!;
    // Chantier 04: Charisma and Organisation lift morale; the speech is the harvest boost.
    const lift = SKILLS.mayorPerCharisma * mayor.stats.charisma + SKILLS.organisationBonus;
    expect(mayorMorale(base)).toBeCloseTo(lift);
    expect(moraleOf(base).mayor).toBeCloseTo(lift);
    expect(colonyBonus(base)).toBe(1);
    const before = productionRates(empty(base)).pulp;
    const speaking = run(
      base,
      { type: 'useSkill', villagerId: mayor.id, skill: 'speech' },
      base.now,
      map,
    );
    expect(productionRates(empty(speaking)).pulp).toBeGreaterThan(before);
    expect(
      errorOf(speaking, { type: 'useSkill', villagerId: mayor.id, skill: 'speech' }, map),
    ).toBe('skillCooling');
    const { state: later, events } = advance(speaking, speaking.now + 2 * HOUR_MS);
    expect(events.some((e) => e.type === 'speechOver')).toBe(true);
    expect(colonyBonus(later)).toBe(1);
    expect(colonyBonus(speaking)).toBeCloseTo(1 + SKILLS.speechBonus);
    // A young mayor has no speech yet.
    const young = { ...base, villagers: base.villagers.map((v, i) => (i === 0 ? at(v, 6) : v)) };
    expect(errorOf(young, { type: 'useSkill', villagerId: mayor.id, skill: 'speech' }, map)).toBe(
      'skillLocked',
    );
  });

  it('lets a mage make it rain on the deposits of their workplace', () => {
    const { map, s: start, schoolId } = schoolColony(2);
    let s = advance(
      run(start, train(start, 0, schoolId, 'mage'), start.now, map),
      start.now + 4 * HOUR_MS,
    ).state;
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    s = run(s, { type: 'assignWorkers', buildingId: pulpery.id, count: 0 }, s.now, map);
    s = {
      ...s,
      buildings: s.buildings.map((b) =>
        b.id === pulpery.id ? { ...b, pool: { ...b.pool!, stock: 0 } } : b,
      ),
    };
    const mage = s.villagers[0]!;
    expect(errorOf(s, { type: 'useSkill', villagerId: mage.id, skill: 'rain' }, map)).toBe(
      'notHere',
    );
    s = run(s, { type: 'assignWorkers', buildingId: pulpery.id, count: 1 }, s.now, map);
    expect(s.villagers[0]!.job).toMatchObject({ kind: 'work', buildingId: pulpery.id });
    const wet = run(s, { type: 'useSkill', villagerId: mage.id, skill: 'rain' }, s.now, map);
    const h = buildingHarvest(
      wet,
      wet.buildings.find((b) => b.id === pulpery.id)!,
    )!;
    expect(h.stock).toBeCloseTo(SKILLS.rainRefill * h.cap, 3);
  });

  it('gives scouts a light weight and a tailwind', () => {
    const { s } = schoolColony();
    const v = s.villagers[0]!;
    const scout = { ...v, classId: 'scout' as const };
    expect(crewWeight([scout])).toBeCloseTo(crewWeight([v]) / 2);
    const target = s.targets[0]!;
    const pad = { ...s.buildings[0]!, type: 'launchpad' as const, level: 1 };
    expect(travelTime(target, pad, [at(scout, 20)])).toBeLessThan(travelTime(target, pad, [v]));
  });

  it('stays exact offline through trainings and speeches', () => {
    const { map, s, schoolId } = schoolColony();
    let x = run(s, train(s, 0, schoolId, 'mayor'), s.now, map);
    x = advance(x, s.now + 4 * HOUR_MS).state;
    x = run(x, { type: 'useSkill', villagerId: x.villagers[0]!.id, skill: 'speech' }, x.now, map);
    x = run(x, train(x, 1, schoolId, 'warrior'), x.now, map);
    const end = x.now + 6 * HOUR_MS;
    const big = advance(x, end).state;
    let small = x;
    for (let t = x.now; t < end; t += 412_337) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.buildings).toEqual(big.buildings);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 4);
  });

  it('migrates v4 saves (no classes yet)', () => {
    const { s } = schoolColony();
    const v4 = JSON.parse(JSON.stringify({ ...s, schemaVersion: 4 })) as Record<string, unknown>;
    delete v4.speechUntil;
    v4.villagers = (v4.villagers as Record<string, unknown>[]).map((v) => {
      const { classId: _c, skillReadyAt: _r, ...rest } = v;
      return rest;
    });
    const m = migrateState(v4);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.state.speechUntil).toBe(0);
      expect(m.state.villagers.every((v) => v.classId === null)).toBe(true);
    }
  });
});
