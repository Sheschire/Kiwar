import { describe, expect, it } from 'vitest';
import { depthsMapOf, isLocule } from '@kiwar/shared';
import { TiltPast } from '../src/camera/tiltPast';
import {
  CORE,
  CUT_ASPECT,
  LOCULE_T,
  LOCULES,
  ROOM_T,
  along,
  cutLinks,
  roomPoint,
  wayTo,
} from '../src/render/depths/cutLayout';

const ASPECT = 1.8;

describe('the cut of the depths (chantier 49)', () => {
  const maps = ['demo', 'a', 'b', 'c', 'd', 'e'].flatMap((seed) =>
    (['kiwisu', 'kiwino'] as const).map((face) => depthsMapOf({ seed, face })),
  );

  it('keeps every room inside the flesh, off the seam and clear of the locules', () => {
    for (const map of maps)
      for (const r of map.rooms) {
        if (isLocule(r)) continue;
        const p = roomPoint(map, r);
        expect(p.s * p.s + p.t * p.t).toBeLessThan(1);
        expect(Math.abs(p.s)).toBeGreaterThanOrEqual(0.149);
        // In depth units around the bottom pole (the ring and the core are round in the world).
        const d = Math.hypot(p.s * ASPECT, 1 - p.t);
        expect(d).toBeGreaterThan(LOCULES.outer + ROOM_T);
        expect(d).toBeGreaterThan(CORE);
        expect(Math.sign(p.s)).toBe(r.x < 0 ? -1 : 1);
      }
  });

  it('keeps the rooms of a row apart', () => {
    for (const map of maps)
      for (const a of map.rooms)
        for (const b of map.rooms) {
          if (a === b || a.depth !== b.depth || isLocule(a)) continue;
          const pa = roomPoint(map, a);
          const pb = roomPoint(map, b);
          expect(Math.abs(pa.s - pb.s) * ASPECT).toBeGreaterThan(ROOM_T * 1.5);
        }
  });

  it('sets the locules in their ring around the core, apart from each other', () => {
    for (const map of maps) {
      const locules = map.rooms.filter(isLocule);
      expect(locules.length).toBeGreaterThanOrEqual(30);
      const pts = locules.map((r) => roomPoint(map, r));
      for (const p of pts) {
        const d = Math.hypot(p.s * CUT_ASPECT, 1 - p.t);
        expect(d - LOCULE_T).toBeGreaterThan(LOCULES.inner);
        expect(d + LOCULE_T).toBeLessThan(LOCULES.outer);
      }
      for (const a of pts)
        for (const b of pts)
          if (a !== b)
            expect(Math.hypot((a.s - b.s) * CUT_ASPECT, a.t - b.t)).toBeGreaterThan(LOCULE_T * 2);
    }
  });

  it('draws a passage for every link and from the shaft to the first rooms', () => {
    for (const map of maps) {
      const links = cutLinks(map);
      const pairs = map.rooms.reduce((n, r) => n + r.links.length, 0) / 2;
      const entrances = map.rooms.filter((r) => r.entrance).length;
      expect(links.length).toBe(pairs + entrances);
    }
  });

  it('walks down the shaft and the known rooms to a room', () => {
    const map = maps[0]!;
    const deep = map.rooms.find((r) => r.depth === 3)!;
    const way = wayTo(map, deep.id, () => true);
    expect(way[0]).toEqual({ s: 0, t: 0 });
    expect(way[way.length - 1]).toEqual(roomPoint(map, deep));
    const mid = along(way, 0.5, { s: 0, t: 0 });
    expect(mid.t).toBeGreaterThan(0);
    expect(along(way, 1, { s: 0, t: 0 })).toEqual(roomPoint(map, deep));
  });
});

describe('tilting beyond the edge (chantier 49)', () => {
  it('fires once the drag pushed far enough at the edge', () => {
    const tilt = new TiltPast(90);
    expect(tilt.feed(50, true)).toBe(false);
    expect(tilt.progress).toBeCloseTo(50 / 90);
    expect(tilt.feed(50, true)).toBe(true);
    // Once only, until let go.
    expect(tilt.feed(500, true)).toBe(false);
    tilt.reset();
    expect(tilt.progress).toBe(0);
  });

  it('forgets the push away from the edge, and moving back eats it', () => {
    const tilt = new TiltPast(90);
    tilt.feed(80, true);
    tilt.feed(-60, true);
    expect(tilt.feed(40, true)).toBe(false);
    tilt.feed(80, false);
    expect(tilt.progress).toBe(0);
  });
});
