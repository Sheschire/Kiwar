import { describe, expect, it } from 'vitest';
import { generateFace, getTile, hexDistance, TILES } from '@kiwar/shared';
import { findPath } from '../src/render/pathfinding';

describe('findPath', () => {
  const map = generateFace('paths', 'kiwisu');

  it('connects the heart to every walkable tile with contiguous steps', () => {
    const targets = map.tiles.filter((t) => TILES[t.type].walkable).slice(0, 120);
    for (const t of targets) {
      const path = findPath(map, { q: 0, r: 0 }, t);
      expect(path, `${t.q},${t.r}`).not.toBeNull();
      for (let i = 1; i < path!.length; i++) expect(hexDistance(path![i - 1]!, path![i]!)).toBe(1);
    }
  });

  it('can end on a juice pool but never walks through one', () => {
    const pool = map.tiles.find((t) => t.type === 'juice')!;
    const path = findPath(map, { q: 0, r: 0 }, pool)!;
    expect(path.at(-1)).toEqual({ q: pool.q, r: pool.r });
    for (const h of path.slice(0, -1)) expect(getTile(map, h)!.type).not.toBe('juice');
  });

  it('never crosses the skin', () => {
    const far = map.tiles.filter((t) => t.type === 'flesh').sort((a, b) => b.rho - a.rho)[0]!;
    const path = findPath(map, { q: 0, r: 0 }, far)!;
    for (const h of path) expect(getTile(map, h)!.type).not.toBe('skin');
  });
});
