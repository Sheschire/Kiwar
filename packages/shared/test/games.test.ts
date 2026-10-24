import { describe, expect, it } from 'vitest';
import {
  bedsOf,
  buildLock,
  cloneState,
  hexDistance,
  isVillageLife,
  kiwiMorale,
  LEISURE,
  MORALE,
  nestDef,
  type BuildingType,
  type GameState,
} from '../src';
import { rich, setup } from './helpers';

/** The starting colony (everyone sleeps in the Nest) with these games 2 steps from it. */
function withGames(types: BuildingType[], distance = 2): GameState {
  const { map, state } = setup();
  const s = cloneState(rich(state));
  const nest = s.buildings.find((b) => b.type === 'nest')!;
  const tiles = map.tiles.filter(
    (t) =>
      t.type === 'flesh' &&
      hexDistance(t, nest) === distance &&
      !s.obstacles.some((o) => o.q === t.q && o.r === t.r),
  );
  types.forEach((type, i) =>
    s.buildings.push({
      ...nest,
      id: `bg${i}` as never,
      type,
      level: 1,
      q: tiles[i]!.q,
      r: tiles[i]!.r,
    }),
  );
  return s;
}

const leisureOf = (s: GameState) => {
  const beds = bedsOf(s);
  return kiwiMorale(s, s.villagers[0]!, beds).leisure;
};

describe('games (chantier 44)', () => {
  it('are leisures outside the building cap, the swing in the Eden, the others in the Stone age', () => {
    for (const type of ['swing', 'skittles', 'skipPond', 'slide'] as const) {
      expect(LEISURE[type]).toBeDefined();
      expect(isVillageLife(type)).toBe(true);
    }
    const s = withGames([]);
    s.buildings.find((b) => b.type === 'nest')!.level = 2;
    expect(buildLock(s, 'swing')).toBeNull();
    expect(buildLock(s, 'skittles')).not.toBeNull();
    const cap = nestDef(s).maxBuildings!;
    for (let i = 0; i < cap; i++)
      s.buildings.push({
        ...s.buildings[0]!,
        id: `bx${i}` as never,
        type: 'hut',
        level: 1,
        q: 9,
        r: -9 + i,
      });
    expect(buildLock(s, 'hut')).toBe('buildingLimit');
    expect(buildLock(s, 'swing')).toBeNull();
  });

  it('add up by kind within reach of a bed, up to the cap', () => {
    expect(leisureOf(withGames([]))).toBe(0);
    expect(leisureOf(withGames(['swing']))).toBe(MORALE.leisure);
    // The same game twice counts once.
    expect(leisureOf(withGames(['swing', 'swing']))).toBe(MORALE.leisure);
    expect(leisureOf(withGames(['swing', 'campfire']))).toBe(MORALE.leisure + MORALE.leisureMore);
    expect(leisureOf(withGames(['swing', 'skittles', 'skipPond', 'slide', 'campfire']))).toBe(
      MORALE.leisureMax,
    );
    // Out of reach: nothing.
    expect(leisureOf(withGames(['swing'], LEISURE.swing!.radius + 2))).toBe(0);
  });
});
