import type { Face } from '../types/ids';
import type { Resources } from './resources';

/**
 * Per-face generation biases. Kiwisu leans towards pulp and down groves, Kiwino towards
 * seeds and juice. `tools/balance` checks that both stay within the balance threshold.
 */
export interface FaceProfile {
  face: Face;
  /** Number of white rays leaving the heart. */
  rays: readonly [number, number];
  /** Horizontal stretch of the disc (1 = circle). */
  ellipse: readonly [number, number];
  /** Normalised radius band of the seed ring and the share of it covered by seeds. */
  seedRing: { inner: number; outer: number; density: number };
  /** Down groves grow from `inner` (normalised radius) up to the skin. */
  groves: { inner: number; density: number; scattered: number };
  juicePools: { count: readonly [number, number]; size: readonly [number, number] };
  /** Global production multiplier per resource (climate). */
  yieldMultiplier: Resources;
}

export const FACE_PROFILES: Record<Face, FaceProfile> = {
  kiwisu: {
    face: 'kiwisu',
    rays: [6, 7],
    ellipse: [1.04, 1.12],
    seedRing: { inner: 0.2, outer: 0.4, density: 0.5 },
    groves: { inner: 0.64, density: 0.36, scattered: 0.05 },
    juicePools: { count: [3, 4], size: [2, 4] },
    yieldMultiplier: { pulp: 1.05, fiber: 1.0, seeds: 0.95, juice: 0.95 },
  },
  kiwino: {
    face: 'kiwino',
    rays: [7, 8],
    ellipse: [1.0, 1.06],
    seedRing: { inner: 0.2, outer: 0.42, density: 0.62 },
    groves: { inner: 0.68, density: 0.28, scattered: 0.03 },
    juicePools: { count: [4, 5], size: [2, 4] },
    yieldMultiplier: { pulp: 1.0, fiber: 1.0, seeds: 1.05, juice: 1.05 },
  },
};
