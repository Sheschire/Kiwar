import { describe, expect, it } from 'vitest';
import {
  liftOffset,
  liftPolar,
  MAX_POLAR,
  MAX_ZOOM,
  MIN_POLAR,
  polarRange,
  SPACE_POLAR,
} from '../src/camera/CameraRig';
import { FRONT_AZIMUTH } from '../src/render/front';
import {
  ALLY_RING,
  COMET_DISTANCE,
  COMET_LOW,
  cometPath,
  edgeArrow,
  ALLY_SLOTS,
  FRONT_CLEARANCE,
  allyPlace,
  planetOrientation,
  twinPlace,
  TWIN_CLOSEST,
  TWIN_DISTANCE,
} from '../src/render/space';

const azimuth = (p: { x: number; z: number }) => Math.atan2(p.x, p.z);
const angleTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('map of space (chantier 24)', () => {
  it('puts the twin at a fixed place towards the front', () => {
    const p = twinPlace();
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(TWIN_DISTANCE, 6);
    expect(angleTo(azimuth(p), FRONT_AZIMUTH)).toBeLessThan(1e-9);
    expect(twinPlace()).toEqual(p);
  });

  it('brings the twin closer for the siege show, never past its closest', () => {
    expect(Math.hypot(twinPlace(0.5).x, twinPlace(0.5).z)).toBeCloseTo(
      (TWIN_DISTANCE + TWIN_CLOSEST) / 2,
      6,
    );
    expect(Math.hypot(twinPlace(3).x, twinPlace(3).z)).toBeCloseTo(TWIN_CLOSEST, 6);
  });

  it('keeps the members out of the front, apart, and beyond the twin', () => {
    const places = Array.from({ length: 2 * ALLY_SLOTS.length }, (_, rank) => allyPlace(rank, 1));
    for (const p of places) {
      expect(angleTo(azimuth(p), FRONT_AZIMUTH)).toBeGreaterThanOrEqual(FRONT_CLEARANCE);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(ALLY_RING - 1e-6);
    }
    for (let i = 0; i < places.length; i++)
      for (let j = i + 1; j < places.length; j++) {
        const a = places[i]!;
        const b = places[j]!;
        // Planets are ~20 units across: far enough apart never to touch.
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(50);
      }
    expect(allyPlace(3, 2)).toEqual(allyPlace(3, 2));
  });

  it('turns every planet towards home', () => {
    for (const p of [twinPlace(), allyPlace(0, 1), allyPlace(5, 3)]) {
      const { yaw } = planetOrientation(p);
      // The planet's +Z (after the yaw) points back to the origin.
      const toHome = Math.atan2(-p.x, -p.z);
      expect(angleTo(yaw, toHome)).toBeLessThan(1e-9);
    }
  });
});

describe('space view (chantier 24)', () => {
  it('leaves the tilt alone up to the framing, then rises towards the horizon', () => {
    expect(liftPolar(0.5)).toBeLessThan(0.8);
    expect(liftPolar(1)).toBeLessThan(0.8);
    expect(liftPolar(1.4)).toBeGreaterThan(MAX_POLAR - 0.15);
    expect(liftPolar(MAX_ZOOM)).toBeCloseTo(SPACE_POLAR, 6);
    for (let k = 1; k < MAX_ZOOM; k += 0.1)
      expect(liftPolar(k + 0.1)).toBeGreaterThanOrEqual(liftPolar(k));
  });
});

describe('free tilt (chantier 32)', () => {
  it('keeps a wide tilt range at every zoom', () => {
    for (let k = 0.5; k <= MAX_ZOOM; k += 0.1) {
      const [min, max] = polarRange(k);
      expect(min).toBe(MIN_POLAR);
      expect(max - min).toBeGreaterThan(MAX_POLAR - MIN_POLAR - 1e-9);
      // The lifted default view always fits in the range.
      expect(liftPolar(k)).toBeLessThanOrEqual(max);
    }
  });

  it('adds no lift up to the framing', () => {
    expect(liftOffset(0.5)).toBe(0);
    expect(liftOffset(1)).toBe(0);
    expect(liftOffset(MAX_ZOOM)).toBeGreaterThan(0.5);
  });
});

describe('comets in space (chantier 32)', () => {
  it('flies a fixed arc far beyond the planets, above the horizon', () => {
    const seed = 1_792_000_000_000;
    for (let k = 0; k <= 1; k += 0.1) {
      const { head, dir } = cometPath(seed, k);
      expect(Math.hypot(head.x, head.z)).toBeGreaterThan(COMET_DISTANCE * 0.99);
      expect(Math.hypot(head.x, head.z)).toBeGreaterThan(ALLY_RING + 100);
      expect(head.y).toBeGreaterThanOrEqual(COMET_LOW - 1e-9);
      expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 6);
    }
    // The same comet is at the same place every time (no camera in the path).
    expect(cometPath(seed, 0.4)).toEqual(cometPath(seed, 0.4));
    expect(cometPath(seed, 0)).not.toEqual(cometPath(seed + 86_400_000, 0));
  });

  it('points an arrow from the edge only when off screen', () => {
    const inset = { top: 90, right: 60, bottom: 110, left: 60 };
    expect(edgeArrow({ x: 0.1, y: 0.2 }, false, 1280, 800, inset)).toBeNull();
    const up = edgeArrow({ x: 0, y: 3 }, false, 1280, 800, inset)!;
    expect(up.y).toBeCloseTo(90, 6);
    expect(up.angle).toBeCloseTo(-Math.PI / 2, 6);
    const right = edgeArrow({ x: 4, y: 0 }, false, 1280, 800, inset)!;
    expect(right.x).toBeCloseTo(1280 - 60, 6);
    // Behind the camera: never "on screen", and the arrow points the other way.
    const behind = edgeArrow({ x: 0.2, y: 0.1 }, true, 1280, 800, inset)!;
    expect(behind).not.toBeNull();
    expect(behind.x).toBeLessThan(640);
  });
});
