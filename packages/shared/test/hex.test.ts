import { describe, expect, it } from 'vitest';
import {
  hex,
  hexDisk,
  hexDistance,
  hexKey,
  hexNeighbors,
  hexRing,
  hexToPixel,
  parseHexKey,
  pixelToHex,
} from '../src';

describe('hex grid', () => {
  it('computes distances', () => {
    expect(hexDistance(hex(0, 0), hex(3, -1))).toBe(3);
    expect(hexDistance(hex(-2, 2), hex(2, -2))).toBe(4);
  });

  it('builds rings and disks of the expected size', () => {
    expect(hexRing(hex(0, 0), 0)).toHaveLength(1);
    expect(hexRing(hex(0, 0), 3)).toHaveLength(18);
    for (const h of hexRing(hex(1, 1), 4)) expect(hexDistance(h, hex(1, 1))).toBe(4);
    const disk = hexDisk(hex(0, 0), 5);
    expect(disk).toHaveLength(1 + 3 * 5 * 6);
    expect(new Set(disk.map(hexKey)).size).toBe(disk.length);
  });

  it('has six unique neighbours at distance 1', () => {
    const n = hexNeighbors(hex(2, -1));
    expect(new Set(n.map(hexKey)).size).toBe(6);
    for (const h of n) expect(hexDistance(h, hex(2, -1))).toBe(1);
  });

  it('round-trips pixel conversion and keys', () => {
    for (const h of hexDisk(hex(0, 0), 6)) {
      const p = hexToPixel(h, 1.3);
      expect(pixelToHex(p.x, p.y, 1.3)).toEqual(h);
      expect(parseHexKey(hexKey(h))).toEqual(h);
    }
  });
});
