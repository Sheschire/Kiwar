import { describe, expect, it } from 'vitest';
import { liftPolar, MAX_POLAR, MAX_ZOOM, SPACE_POLAR } from '../src/camera/CameraRig';
import { FRONT_AZIMUTH } from '../src/render/front';
import {
  ALLY_RING,
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
