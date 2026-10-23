import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, footprintOf, maxLevelOf } from '@kiwar/shared';
import { buildingModel, lookOf } from '../src/render/buildingModels';

/** The set of vertex colours of a model (its materials). */
function colours(type: (typeof BUILDING_TYPES)[number], level: number): Set<string> {
  const c = buildingModel(type, level).geometry.getAttribute('color');
  const out = new Set<string>();
  for (let i = 0; i < c.count; i++)
    out.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
  return out;
}

describe('building models (chantier 33)', () => {
  it('builds every type at every level', () => {
    for (const type of BUILDING_TYPES)
      for (let level = 1; level <= maxLevelOf(type); level++) {
        const model = buildingModel(type, level);
        expect(model.geometry.getAttribute('position').count).toBeGreaterThan(0);
        expect(model.height).toBeGreaterThan(0.2);
      }
  });

  it('reads the look from the level: age and tier', () => {
    expect(lookOf('hut', 3)).toMatchObject({ age: 0, tier: 3 });
    expect(lookOf('hut', 4)).toMatchObject({ age: 1, tier: 1 });
    expect(lookOf('hut', 12)).toMatchObject({ age: 3, tier: 3 });
    expect(lookOf('monument', 2)).toMatchObject({ age: 2 });
    expect(lookOf('lab', 1).age).toBe(2);
  });

  it('changes the materials at each age and adds pieces with the tiers', () => {
    for (const type of BUILDING_TYPES) {
      if (maxLevelOf(type) < 12) continue;
      for (const level of [3, 6, 9]) {
        const before = colours(type, level);
        const after = colours(type, level + 1);
        const fresh = [...after].filter((c) => !before.has(c)).length;
        expect(fresh, `${type} ${level} → ${level + 1}`).toBeGreaterThanOrEqual(3);
      }
      for (const first of [4, 7, 10]) {
        const count = (l: number) => buildingModel(type, l).geometry.getAttribute('position').count;
        expect(count(first + 2), `${type} ${first + 2}`).toBeGreaterThan(count(first));
      }
    }
  });

  it('keeps a lit door on the houses and workshops of every age', () => {
    for (const type of ['nest', 'hut', 'pulpery', 'fiberWorkshop', 'school', 'library'] as const)
      for (const level of [1, 4, 7, 10]) {
        const { lights } = buildingModel(type, level);
        if (type !== 'nest') expect(lights.doors.length, `${type} ${level}`).toBeGreaterThan(0);
      }
  });
});

describe('big buildings (chantier 35)', () => {
  /** Width of a model's footprint on the ground (world units). */
  const width = (type: (typeof BUILDING_TYPES)[number], level = 1) => {
    const box = buildingModel(type, level).geometry.boundingBox!;
    return Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  };

  it('spreads over its footprint: one tile, a triangle, the hexagon', () => {
    const hut = width('hut');
    for (const type of BUILDING_TYPES) {
      const size = footprintOf(type);
      if (size === 1) expect(width(type), type).toBeLessThan(2.2);
      else expect(width(type), type).toBeGreaterThan(size === 7 ? 4.5 : 2.8);
    }
    expect(width('monument')).toBeGreaterThan(2 * hut);
  });
});
