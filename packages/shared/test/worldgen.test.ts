import { describe, expect, it } from 'vitest';
import { countTiles, generateFace, getTile, HEART, hexNeighbors, type FaceMap } from '../src';

const SEEDS = Array.from({ length: 60 }, (_, i) => `seed-${i}`);

describe('generateFace', () => {
  it('is deterministic: same seed → same face', () => {
    const a = generateFace('banana', 'kiwisu');
    const b = generateFace('banana', 'kiwisu');
    expect(b).toEqual(a);
  });

  it('differs across seeds and faces', () => {
    const a = generateFace('banana', 'kiwisu');
    expect(generateFace('cherry', 'kiwisu').tiles).not.toEqual(a.tiles);
    expect(generateFace('banana', 'kiwino').tiles).not.toEqual(a.tiles);
  });

  it('puts the heart in the centre and closes the world with skin', () => {
    const map = generateFace('anatomy', 'kiwino');
    expect(getTile(map, HEART)?.type).toBe('heart');
    for (const t of map.tiles) {
      const outer = hexNeighbors(t).some((n) => !getTile(map, n));
      if (outer) expect(t.type).toBe('skin');
    }
  });

  it('keeps juice pools surrounded by land, away from the rim', () => {
    const map = generateFace('ponds', 'kiwino');
    for (const t of map.tiles.filter((x) => x.type === 'juice')) {
      for (const n of hexNeighbors(t)) expect(getTile(map, n)?.type).not.toBe('skin');
    }
  });

  it('always generates every resource tile in playable amounts', () => {
    for (const face of ['kiwisu', 'kiwino'] as const) {
      for (const seed of SEEDS) {
        const c = countTiles(generateFace(seed, face));
        expect(c.seedRing, `${face}/${seed} seeds`).toBeGreaterThanOrEqual(8);
        expect(c.grove, `${face}/${seed} groves`).toBeGreaterThanOrEqual(12);
        expect(c.juice, `${face}/${seed} juice`).toBeGreaterThanOrEqual(4);
        expect(c.flesh, `${face}/${seed} flesh`).toBeGreaterThanOrEqual(80);
        expect(c.ray, `${face}/${seed} rays`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('applies the face biases on average', () => {
    const avg = (face: 'kiwisu' | 'kiwino', key: 'grove' | 'seedRing' | 'juice') =>
      SEEDS.reduce((sum, s) => sum + countTiles(generateFace(s, face))[key], 0) / SEEDS.length;
    expect(avg('kiwisu', 'grove')).toBeGreaterThan(avg('kiwino', 'grove'));
    expect(avg('kiwino', 'seedRing')).toBeGreaterThan(avg('kiwisu', 'seedRing'));
    expect(avg('kiwino', 'juice')).toBeGreaterThan(avg('kiwisu', 'juice'));
  });

  it('has a sensible size', () => {
    const map: FaceMap = generateFace('size', 'kiwisu');
    expect(map.tiles.length).toBeGreaterThan(350);
    expect(map.tiles.length).toBeLessThan(600);
  });
});
