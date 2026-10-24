import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  BEAUTY,
  beautyOf,
  buildCost,
  buildLock,
  cloneState,
  colonyMood,
  describeLevel,
  isDecor,
  MORALE,
  nestDef,
  type BuildingType,
  type GameState,
} from '../src';
import { rich, setup } from './helpers';

const DECORS: BuildingType[] = ['lanterns', 'flowerBed', 'vineArch', 'fountain', 'mayorStatue'];

/** A rich colony with its Nest at `level` and the monument at `age`. */
function colony(level: number, age = 0): GameState {
  const { state } = setup();
  const s = cloneState(rich(state));
  s.buildings.find((b) => b.type === 'nest')!.level = level;
  if (age > 0)
    s.buildings.push({
      ...s.buildings[0]!,
      id: 'bm' as never,
      type: 'monument',
      level: age,
      q: 0,
      r: 5,
    });
  return s;
}

/** Puts a decoration (already built) far from everything. */
function place(s: GameState, type: BuildingType, i: number): void {
  s.buildings.push({
    ...s.buildings[0]!,
    id: `bd${type}${i}` as never,
    type,
    level: 1,
    q: -6 + i,
    r: 6,
  });
}

describe('decorations (chantier 44)', () => {
  it('are all decorations with a beauty', () => {
    for (const type of DECORS) {
      expect(isDecor(type)).toBe(true);
      expect(describeLevel(type, 1).find((x) => x.stat === 'beauty')?.value).toBe(BEAUTY[type]);
    }
    expect(isDecor('hut')).toBe(false);
  });

  it('open by age: lanterns and flowers in the Eden, the fountain and the statue in the Stone age', () => {
    const eden = colony(3);
    expect(buildLock(eden, 'lanterns')).toBeNull();
    expect(buildLock(eden, 'flowerBed')).toBeNull();
    expect(buildLock(eden, 'vineArch')).toBeNull();
    expect(buildLock(eden, 'fountain')).not.toBeNull();
    expect(buildLock(eden, 'mayorStatue')).not.toBeNull();
    expect(buildLock(colony(1), 'lanterns')).toBe('nestLevelTooLow');
    const stone = colony(4, 1);
    expect(buildLock(stone, 'fountain')).toBeNull();
    expect(buildLock(stone, 'mayorStatue')).toBeNull();
  });

  it('stand outside the building cap, each copy dearer, one statue only', () => {
    const s = colony(4, 1);
    const cap = nestDef(s).maxBuildings!;
    for (let i = 0; i < cap; i++)
      s.buildings.push({ ...s.buildings[0]!, id: `bx${i}` as never, type: 'hut', level: 1 });
    expect(buildLock(s, 'hut')).toBe('buildingLimit');
    for (const type of DECORS) expect(buildLock(s, type)).toBeNull();
    const first = buildCost(s, 'lanterns');
    place(s, 'lanterns', 0);
    expect(buildCost(s, 'lanterns').fiber).toBeGreaterThan(first.fiber!);
    place(s, 'mayorStatue', 1);
    expect(buildLock(s, 'mayorStatue')).toBe('statueExists');
  });

  it('give the whole village a capped beauty', () => {
    const s = colony(3);
    const before = colonyMood(s);
    expect(before.beauty).toBe(0);
    place(s, 'lanterns', 0);
    place(s, 'flowerBed', 1);
    expect(beautyOf(s)).toBe(2);
    expect(colonyMood(s).sum).toBe(before.sum + 2);
    place(s, 'mayorStatue', 2);
    expect(beautyOf(s)).toBe(5);
    for (let i = 3; i < 10; i++) place(s, 'flowerBed', i);
    expect(beautyOf(s)).toBe(MORALE.beauty);
  });

  it('are built through the queue like any building', () => {
    const { map, state } = setup();
    const s = cloneState(rich(state));
    s.buildings.find((b) => b.type === 'nest')!.level = 3;
    const tile = map.tiles.find(
      (t) =>
        t.type === 'flesh' &&
        !s.buildings.some((b) => b.q === t.q && b.r === t.r) &&
        !s.obstacles.some((o) => o.q === t.q && o.r === t.r),
    )!;
    const r = applyCommand(
      s,
      { type: 'build', buildingType: 'lanterns', q: tile.q, r: tile.r },
      { now: s.now, map },
    );
    expect(r.ok).toBe(true);
  });
});
