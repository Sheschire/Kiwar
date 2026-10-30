import { describe, expect, it } from 'vitest';
import { BUILDINGS, MAX_LEVEL, ageOfLevel } from '../src/data/buildings';
import { CRYSTAL } from '../src/data/crystal';
import { IRON } from '../src/data/iron';
import { TASKS } from '../src/data/jobs';
import { RESEARCH } from '../src/data/research';
import { CATCHMENT_RADIUS } from '../src/data/territory';
import { METEORS, SECTORS, THREATS, TURRETS } from '../src/data/threats';

// Chantier 51: every table indexed by a building or Nest level covers every level, so a new
// age never reads a missing cell (`?? 0` would silently drop a bank or a catchment radius).
describe('tables by level', () => {
  const byLevel: Record<string, readonly number[]> = {
    'TASKS.buildSlots': TASKS.buildSlots,
    'THREATS.nestFactor': THREATS.nestFactor,
    'SECTORS.range': SECTORS.range,
    'TURRETS.max': TURRETS.max,
    'METEORS.nestFactor': METEORS.nestFactor,
    'IRON.cap': IRON.cap,
    'IRON.levels': IRON.levels,
    'IRON.turret': IRON.turret,
    'CRYSTAL.cap': CRYSTAL.cap,
  };
  for (const [name, table] of Object.entries(byLevel)) {
    it(`${name} has a cell for levels 0–${MAX_LEVEL}, never decreasing`, () => {
      expect(table).toHaveLength(MAX_LEVEL + 1);
      for (let i = 1; i < table.length; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]!);
    });
  }

  it('tables indexed by level − 1 have a cell per level', () => {
    expect(CATCHMENT_RADIUS).toHaveLength(MAX_LEVEL);
    expect(RESEARCH.bank).toHaveLength(MAX_LEVEL);
  });

  it('buildings grown by age reach the last level, three per age', () => {
    expect(BUILDINGS.nest.levels).toHaveLength(MAX_LEVEL);
    expect(BUILDINGS.library.levels).toHaveLength(MAX_LEVEL);
    expect(ageOfLevel(MAX_LEVEL)).toBe(4);
    expect(BUILDINGS.pulpery.levels[MAX_LEVEL - 1]!.requiresAge).toBe(4);
  });
});
