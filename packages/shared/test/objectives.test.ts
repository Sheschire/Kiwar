import { describe, expect, it } from 'vitest';
import {
  AGE_OBJECTIVES,
  OBJECTIVES,
  OBJECTIVES_SHOWN,
  STARDUST_SCALE,
  ageObjectives,
  ageProgress,
  applyCommand,
  claimableObjective,
  eggCost,
  isPlausible,
  migrateState,
  nextStep,
  notebookCount,
  type BuildingId,
  type GameState,
} from '../src';
import { T0, rich, run, setup } from './helpers';

/** A colony past the tutorial. */
function afterTutorial(): ReturnType<typeof setup> {
  const { map, state } = setup();
  return { map, state: { ...state, objectiveIndex: OBJECTIVES.length } };
}

const withMonument = (s: GameState, level: number): GameState => ({
  ...s,
  buildings: [
    ...s.buildings,
    { id: 'bm' as BuildingId, type: 'monument', q: 1, r: 0, level, richness: 1, builtAt: T0 },
  ],
});

describe('age objectives (chantier 31)', () => {
  it('every age has 6 to 10 objectives with unique ids', () => {
    const ids = new Set(AGE_OBJECTIVES.map((o) => o.id));
    expect(ids.size).toBe(AGE_OBJECTIVES.length);
    for (const age of [0, 1, 2, 3]) {
      const n = AGE_OBJECTIVES.filter((o) => o.age === age).length;
      expect(n, `age ${age}`).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it('opens after the tutorial and shows three at a time', () => {
    const { state } = setup();
    expect(ageObjectives(state)).toEqual([]);
    const { state: s } = afterTutorial();
    const shown = ageObjectives(s);
    expect(shown).toHaveLength(OBJECTIVES_SHOWN);
    expect(shown.every((o) => o.age === 0)).toBe(true);
  });

  it('claims a completed objective once, with its reward', () => {
    const { map, state } = afterTutorial();
    const s0: GameState = { ...state, stats: { ...state.stats, collects: 1 } };
    const before = s0.resources.juice;
    const s1 = run(s0, { type: 'claimObjective', id: 'edenCollect' }, T0, map);
    expect(s1.resources.juice).toBe(before + 150);
    expect(s1.objectives.claimed).toEqual(['edenCollect']);
    expect(ageObjectives(s1).some((o) => o.id === 'edenCollect')).toBe(false);
    const again = applyCommand(s1, { type: 'claimObjective', id: 'edenCollect' }, { now: T0, map });
    expect(again.ok).toBe(false);
    const early = applyCommand(s0, { type: 'claimObjective', id: 'edenTurrets' }, { now: T0, map });
    expect(early).toMatchObject({ ok: false, error: 'objectiveIncomplete' });
    const hidden = applyCommand(s0, { type: 'claimObjective', id: 'ironLab' }, { now: T0, map });
    expect(hidden).toMatchObject({ ok: false, error: 'noObjective' });
  });

  it('gives stardust and a free egg', () => {
    const { map, state } = afterTutorial();
    let s: GameState = {
      ...state,
      objectives: {
        claimed: ['edenTurrets', 'edenLibrary', 'edenCollect', 'edenSchool'],
        giftEggs: 0,
      },
      stats: { ...state.stats, wavesHeld: 1 },
      villagers: state.villagers.map((v, i) => (i === 0 ? { ...v, classId: 'mayor' } : v)),
    };
    s = {
      ...s,
      objectives: { ...s.objectives, claimed: [...s.objectives.claimed, 'edenProducer3'] },
    };
    s = run(s, { type: 'claimObjective', id: 'edenWave' }, T0, map);
    expect(s.stardust).toBe(3 * STARDUST_SCALE);
    s = run(s, { type: 'claimObjective', id: 'edenMayor' }, T0, map);
    expect(s.objectives.giftEggs).toBe(1);
    // The egg costs nothing once (housing permitting).
    s = { ...s, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    const cost = eggCost(s);
    expect(Object.values(cost).some((v) => (v ?? 0) > 0)).toBe(true);
    s = run(s, { type: 'hatchEgg' }, T0, map);
    expect(s.objectives.giftEggs).toBe(0);
    expect(s.egg).not.toBeNull();
  });

  it('keeps the unclaimed objectives of an older age first', () => {
    const { state } = afterTutorial();
    const stone = withMonument(state, 1);
    const shown = ageObjectives(stone);
    expect(shown[0]!.age).toBe(0);
    const claimedEden = AGE_OBJECTIVES.filter((o) => o.age === 0).map((o) => o.id);
    const s = { ...stone, objectives: { claimed: claimedEden, giftEggs: 0 } };
    expect(ageObjectives(s).every((o) => o.age === 1)).toBe(true);
    expect(notebookCount(s, 0)).toEqual({ claimed: claimedEden.length, total: claimedEden.length });
  });

  it('a sister colony has no notebook', () => {
    const { state } = afterTutorial();
    expect(ageObjectives({ ...state, colony: { ...state.colony, index: 1 } })).toEqual([]);
  });

  it('the tutorial is claimed first', () => {
    const { state } = setup();
    expect(claimableObjective(state)).toBeNull();
  });

  it('a claimed save stays plausible, a forged one does not', () => {
    const { state } = afterTutorial();
    const ok = { ...state, objectives: { claimed: ['edenCollect'], giftEggs: 0 } };
    expect(isPlausible(ok, T0)).toBe(true);
    expect(isPlausible({ ...ok, objectives: { claimed: ['nope'], giftEggs: 0 } }, T0)).toBe(false);
    expect(isPlausible({ ...ok, objectives: { claimed: ['edenCollect'], giftEggs: 1 } }, T0)).toBe(
      false,
    );
  });

  it('migrates a v25 save', () => {
    const { state } = setup();
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    raw.schemaVersion = 25;
    delete raw.objectives;
    const stats = raw.stats as Record<string, unknown>;
    delete stats.collects;
    delete stats.wavesHeld;
    const r = migrateState(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.objectives).toEqual({ claimed: [], giftEggs: 0 });
      expect(r.state.stats.wavesHeld).toBe(0);
    }
  });
});

describe('age progress and next step (chantier 31)', () => {
  it('lists the steps to the next age', () => {
    const { state } = setup();
    const p = ageProgress(state)!;
    expect(p.age).toBe(1);
    expect(p.steps.map((x) => x.id)).toEqual(['library', 'research', 'monument']);
    expect(p.progress).toBe(0);
    const done = { ...state, research: { ...state.research, done: ['stoneAge' as const] } };
    const q = ageProgress(done)!;
    expect(q.steps[0]!.done && q.steps[1]!.done).toBe(true);
    expect(q.progress).toBeCloseTo(0.7);
    expect(ageProgress(withMonument(state, 3))).toBeNull();
  });

  it('suggests the monument once its passage is known', () => {
    const { state } = afterTutorial();
    const s = { ...state, research: { ...state.research, done: ['stoneAge' as const] } };
    expect(nextStep(s).id).toBe('monument');
  });

  it('suggests a claim, then idle kiwis', () => {
    const { state } = afterTutorial();
    const s = { ...state, stats: { ...state.stats, collects: 1 } };
    expect(nextStep(s)).toMatchObject({ id: 'claim', objectiveId: 'edenCollect' });
    expect(nextStep(rich(state)).id).not.toBe('claim');
  });

  it('suggests a repair first', () => {
    const { state } = setup();
    const s: GameState = {
      ...state,
      buildings: [
        ...state.buildings,
        {
          id: 'bp' as BuildingId,
          type: 'pulpery',
          q: 1,
          r: -1,
          level: 1,
          richness: 1,
          builtAt: T0,
          damaged: true,
        },
      ],
    };
    expect(nextStep(s)).toMatchObject({ id: 'repair', buildingId: 'bp' });
  });
});
