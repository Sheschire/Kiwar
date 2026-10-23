import { footprintHexes, getTile, type BuildingType, type FaceMap, type Hex } from '@kiwar/shared';
import { worldPosition } from './terrain';
import { WATER_LEVEL } from './water';

/** Where and how a building model stands: centre, ground height, turn and covered tiles. */
export interface FootprintFrame {
  x: number;
  y: number;
  z: number;
  /** `rotation.y` of the model: its front (+z, the door) faces out of the anchor. */
  angle: number;
  tiles: Hex[];
}

/** Ground height of a tile for a building (wells stand in the juice). */
export function groundY(map: FaceMap, h: Hex): number {
  const tile = getTile(map, h);
  if (!tile) return 0;
  return tile.type === 'juice' ? tile.height + WATER_LEVEL - 0.08 : tile.height;
}

/**
 * Chantier 35: the frame of a building on its footprint. One tile: on the tile, facing the
 * heart (with `variant` jitter). A triangle: at its centre, the door towards the anchor. The
 * monument: on its central anchor, roughly facing the heart. Stands on the highest covered
 * tile.
 */
export function footprintFrame(
  map: FaceMap,
  type: BuildingType,
  b: { q: number; r: number; rot?: number; cramped?: true },
  variant = 0.5,
): FootprintFrame {
  const tiles = b.cramped ? [{ q: b.q, r: b.r }] : footprintHexes(type, b.q, b.r, b.rot ?? 0);
  const anchor = worldPosition(b);
  let x = 0;
  let z = 0;
  let y = -Infinity;
  for (const h of tiles) {
    const p = worldPosition(h);
    x += p.x;
    z += p.z;
    y = Math.max(y, groundY(map, h));
  }
  x /= tiles.length;
  z /= tiles.length;
  const facingHeart = Math.atan2(anchor.x, anchor.z) + Math.PI;
  let angle = facingHeart + (variant - 0.5) * 0.5;
  // A triangle turns its door towards the anchor; the monument's plaza keeps its slabs on the
  // tiles (a multiple of 60°).
  if (tiles.length === 3) angle = Math.atan2(anchor.x - x, anchor.z - z);
  else if (tiles.length === 7) angle = Math.round(facingHeart / (Math.PI / 3)) * (Math.PI / 3);
  return { x, y, z, angle, tiles };
}
