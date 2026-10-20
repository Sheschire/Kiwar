import { describe, expect, it } from 'vitest';
import {
  BUILDING_TYPES,
  BUILDINGS,
  buildLock,
  climateOf,
  describeLevel,
  describeTech,
  describeUpgrade,
  levelDef,
  maxLevelOf,
  validateCommand,
  type GameState,
} from '../src';
import { findTile, rich, setup, T0 } from './helpers';

describe('describeLevel (chantier 11)', () => {
  it('gives every level of every building at least one number (except plain monument/lab levels)', () => {
    for (const type of BUILDING_TYPES) {
      if (type === 'monument' || type === 'lab') continue;
      for (let level = 1; level <= maxLevelOf(type); level++)
        expect(describeLevel(type, level).length, `${type} ${level}`).toBeGreaterThan(0);
    }
  });

  it('reads the data tables', () => {
    expect(describeLevel('hut', 1)).toEqual([{ stat: 'housing', value: 2 }]);
    expect(describeUpgrade('hut', 1, 2)).toEqual([{ stat: 'housing', before: 2, after: 4 }]);
    const pulp = describeUpgrade('pulpery', 1, 2);
    expect(pulp).toContainEqual({
      stat: 'production',
      resource: 'pulp',
      before: levelDef('pulpery', 1)!.production!.pulp,
      after: levelDef('pulpery', 2)!.production!.pulp,
    });
    expect(pulp).toContainEqual({ stat: 'workers', before: 1, after: 2 });
  });

  it('a stat new at the next level starts from zero', () => {
    const def = BUILDINGS.nest.levels[0]!;
    expect(describeUpgrade('nest', 1, 2).find((s) => s.stat === 'maxBuildings')?.before).toBe(
      def.maxBuildings,
    );
    expect(describeUpgrade('hut', 0, 1)).toEqual([{ stat: 'housing', before: 0, after: 2 }]);
  });

  it('applies the face climate and the researched bonuses with a state', () => {
    const { state } = setup('kiwino');
    const climate = climateOf(state.face, state.params.biome);
    const raw = levelDef('pulpery', 1)!.production!.pulp!;
    const at = (s: GameState) => describeLevel('pulpery', 1, s).find((x) => x.resource === 'pulp')!;
    expect(at(state).value).toBeCloseTo(raw * climate.pulp);
    const foraged = { ...state, research: { ...state.research, done: ['foraging' as const] } };
    expect(at(foraged).value).toBeCloseTo(raw * climate.pulp * 1.1);
    const store = (s: GameState) => describeLevel('warehouse', 1, s)[0]!.value;
    const masonry = { ...state, research: { ...state.research, done: ['masonry' as const] } };
    expect(store(masonry)).toBeCloseTo(store(state) * 1.2);
  });
});

describe('describeTech (chantier 11)', () => {
  it('compares the colony before and after the technology', () => {
    const { state } = setup();
    const rows = describeTech('foraging', state);
    expect(rows).toContainEqual({
      stat: 'harvest',
      resource: 'pulp',
      before: 1,
      after: 1.1,
      kind: 'multiplier',
    });
    expect(rows.some((r) => r.resource === 'seeds')).toBe(false);
    expect(describeTech('firearms', state)).toEqual([
      { stat: 'firearms', before: 0, after: 1, kind: 'unlock' },
    ]);
    // Stacks on what is already researched.
    const done = { ...state, research: { ...state.research, done: ['foraging' as const] } };
    const pulp = describeTech('machines', done).find((r) => r.resource === 'pulp')!;
    expect(pulp.before).toBeCloseTo(1.1);
    expect(pulp.after).toBeCloseTo(1.1 * 1.15);
  });
});

describe('buildLock (chantier 11)', () => {
  it('matches the build command on a valid tile', () => {
    const { map, state } = setup();
    const s = rich(state);
    const tiles = { pulpery: findTile(map, 'flesh', 3), school: findTile(map, 'flesh', 4) };
    for (const [type, tile] of Object.entries(tiles) as [keyof typeof tiles, typeof tile][]) {
      const lock = buildLock(s, type);
      const error = validateCommand(
        s,
        { type: 'build', buildingType: type, q: tile.q, r: tile.r },
        { now: T0, map },
      );
      expect(error).toBe(lock);
    }
    expect(buildLock(s, 'pulpery')).toBeNull();
    expect(buildLock(s, 'school')).toBe('nestLevelTooLow');
    expect(buildLock(s, 'lab')).toBe('nestLevelTooLow');
    expect(buildLock(s, 'nest')).toBe('notBuildable');
  });
});
