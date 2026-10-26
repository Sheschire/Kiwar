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

/** Chantier 59: how far beyond a member's planet their alien twin floats, and how much higher. */
export const ALLY_TWIN_GAP = 75;
export const ALLY_TWIN_RISE = 14;

/**
 * Chantier 59: where a member's alien twin floats — further out on the same azimuth as their
 * planet (the two halves of their kiwi side by side, like ours), a little higher.
 */
export function allyTwinPlace(rank: number, kiwiGap: number): SpacePoint {
  const p = allyPlace(rank, kiwiGap);
  const d = Math.hypot(p.x, p.z);
  const k = (d + ALLY_TWIN_GAP) / d;
  return { x: p.x * k, y: p.y + ALLY_TWIN_RISE, z: p.z * k };
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

/** Chantier 32: comets fly on a wide arc around home, far beyond the members' ring. */
export const COMET_DISTANCE = 340;
/** How far round the sky a comet travels during its whole stay (rad). */
export const COMET_SPAN = (140 * Math.PI) / 180;
/** Its height: rising from `COMET_LOW` to `COMET_LOW + COMET_RISE` mid-way, then setting. */
export const COMET_LOW = 20;
export const COMET_RISE = 26;

/** Stable [0, 1) from a comet's time (its arc must not change between two frames or visits). */
function unit(seed: number): number {
  let h = Math.imul(Math.floor(seed / 1000) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Chantier 32: where a comet is in the map of space at `k` (0 = first seen, 1 = gone), and the
 * direction it flies (unit vector): an arc round home, starting at an azimuth drawn from
 * `seed` (its passage time), rising then setting. Fixed in space: the camera looks at it.
 */
export function cometPath(seed: number, k: number): { head: SpacePoint; dir: SpacePoint } {
  const at = (t: number): SpacePoint => {
    const a = unit(seed) * Math.PI * 2 + COMET_SPAN * t;
    const r = COMET_DISTANCE * (1 + 0.06 * Math.sin(Math.PI * t));
    return along(a, r, COMET_LOW + COMET_RISE * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
  };
  const head = at(k);
  const next = at(k + 0.01);
  const dx = next.x - head.x;
  const dy = next.y - head.y;
  const dz = next.z - head.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { head, dir: { x: dx / len, y: dy / len, z: dz / len } };
}

/**
 * Chantier 32: where to draw the arrow towards something off screen. `ndc` is its projected
 * point (x, y in -1..1 when on screen), `behind` true when it is behind the camera. Returns
 * null when it is on screen (inside the margins), else the point on the inset rectangle of a
 * `width` × `height` screen (pixels, y down) and the arrow's angle (rad, screen convention).
 */
export function edgeArrow(
  ndc: { x: number; y: number },
  behind: boolean,
  width: number,
  height: number,
  inset: { top: number; right: number; bottom: number; left: number },
): { x: number; y: number; angle: number } | null {
  let x = ndc.x;
  let y = ndc.y;
  if (behind) {
    x = -x;
    y = -y;
  }
  const px = ((x + 1) / 2) * width;
  const py = ((1 - y) / 2) * height;
  const inside =
    !behind &&
    px >= inset.left &&
    px <= width - inset.right &&
    py >= inset.top &&
    py <= height - inset.bottom;
  if (inside) return null;
  const cx = (inset.left + width - inset.right) / 2;
  const cy = (inset.top + height - inset.bottom) / 2;
  let dx = px - cx;
  let dy = py - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1;
  const hx = (width - inset.left - inset.right) / 2;
  const hy = (height - inset.top - inset.bottom) / 2;
  const t = 1 / Math.max(Math.abs(dx) / hx, Math.abs(dy) / hy);
  dx *= t;
  dy *= t;
  return { x: cx + dx, y: cy + dy, angle: Math.atan2(dy, dx) };
}
