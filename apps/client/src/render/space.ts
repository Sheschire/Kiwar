import { FRONT_AZIMUTH } from './front';

/**
 * The map of space (chantier 24): every planet has a fixed place, none follows the camera.
 * The face on show ("home") is always at the origin. The other half of the same kiwi (the
 * alien twin, or later the sister colony of chantier 19) hangs towards the colony's front
 * (`FRONT_AZIMUTH`: waves, compass); the other members of a shared universe sit on an outer
 * ring, out of the front's sector so they never hide the twin. Pure functions, so the
 * colonisation can place its show on the same spots.
 */
export interface SpacePoint {
  x: number;
  y: number;
  z: number;
}

/** Distance of the twin from the heart of our face, and its height (above our horizon). */
export const TWIN_DISTANCE = 120;
export const TWIN_HEIGHT = 8;
/** Chantier 19's siege show: how close the twin comes at `approach` 1. */
export const TWIN_CLOSEST = 65;

/** The outer ring of the other members' planets, one step further per kiwi of gap. */
export const ALLY_RING = 210;
export const ALLY_RING_STEP = 20;
/** A second lap of slots (more than `ALLY_SLOTS.length` members) sits this much further. */
export const ALLY_LAP = 60;
export const ALLY_HEIGHT = -10;
/**
 * Azimuths of the ally slots relative to the front, nearest kiwi first: flanking the twin
 * (seen together when zooming out towards the front), then further round, behind us last.
 * None closer than `FRONT_CLEARANCE` to the front.
 */
export const ALLY_SLOTS = [50, -50, 80, -80, 110, -110, 140, -140, 180].map(
  (d) => (d * Math.PI) / 180,
);
export const FRONT_CLEARANCE = (35 * Math.PI) / 180;

/** Every planet leans its far rim up towards home by this much, so its surface shows. */
export const PLANET_TILT = 0.42;

/** A point at `distance` from the origin along a camera-controls azimuth (sin a, 0, cos a). */
function along(azimuth: number, distance: number, y: number): SpacePoint {
  return { x: Math.sin(azimuth) * distance, y, z: Math.cos(azimuth) * distance };
}

/**
 * Where the other half of our kiwi floats. `approach` (0–1) brings it closer, for the siege
 * show of chantier 19 (the twin "comes nearer" during the assaults).
 */
export function twinPlace(approach = 0): SpacePoint {
  const t = Math.min(1, Math.max(0, approach));
  return along(FRONT_AZIMUTH, TWIN_DISTANCE + (TWIN_CLOSEST - TWIN_DISTANCE) * t, TWIN_HEIGHT);
}

/**
 * Where a member's planet floats: `rank` in the stable order (nearest kiwi first, then kiwi
 * index), `kiwiGap` how many kiwis away it is (≥ 1).
 */
export function allyPlace(rank: number, kiwiGap: number): SpacePoint {
  const slot = ALLY_SLOTS[rank % ALLY_SLOTS.length]!;
  const lap = Math.floor(rank / ALLY_SLOTS.length);
  const distance = ALLY_RING + ALLY_RING_STEP * Math.max(0, kiwiGap - 1) + ALLY_LAP * lap;
  return along(FRONT_AZIMUTH + slot, distance, ALLY_HEIGHT - (rank % 2) * 6);
}

/**
 * Fixed orientation of a planet at `place`: turned to face home (yaw, around Y), then its far
 * rim lifted by `PLANET_TILT` (around its own X). Apply as `rotation.set(0, 0, 0)`,
 * `rotateY(yaw)`, `rotateX(tilt)`.
 */
export function planetOrientation(place: SpacePoint): { yaw: number; tilt: number } {
  return { yaw: Math.atan2(-place.x, -place.z), tilt: PLANET_TILT };
}

/** A far planet the camera can go to: our twin, or a member's planet by kiwi index. */
export type PlanetRef = 'twin' | number;
