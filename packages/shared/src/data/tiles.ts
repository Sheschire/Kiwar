import type { ResourceId } from './resources';

/**
 * Tile types follow the anatomy of a kiwi slice (see docs/GAME_DESIGN.md §2).
 * Display names live in the client translation files under `tiles.<id>`.
 */
export const TILE_TYPES = ['heart', 'ray', 'seedRing', 'flesh', 'grove', 'juice', 'skin'] as const;
export type TileType = (typeof TILE_TYPES)[number];

export interface TileDef {
  id: TileType;
  /** Base surface height in world units (the client renders the tile top at this height). */
  baseHeight: number;
  /** Amplitude of the noise added to the height. */
  heightNoise: number;
  /** Villagers can walk on it (cosmetic path finding). */
  walkable: boolean;
  /** Path cost multiplier for villagers (rays are fast paths). */
  walkCost: number;
  /** Resource this tile is naturally good for (shown in the tile tooltip). */
  resource: ResourceId | null;
}

export const TILES: Record<TileType, TileDef> = {
  heart: { id: 'heart', baseHeight: 0.62, heightNoise: 0, walkable: true, walkCost: 0.6, resource: null },
  ray: { id: 'ray', baseHeight: 0.3, heightNoise: 0.08, walkable: true, walkCost: 0.5, resource: null },
  seedRing: { id: 'seedRing', baseHeight: 0.42, heightNoise: 0.18, walkable: true, walkCost: 1.2, resource: 'seeds' },
  flesh: { id: 'flesh', baseHeight: 0.36, heightNoise: 0.26, walkable: true, walkCost: 1, resource: 'pulp' },
  grove: { id: 'grove', baseHeight: 0.5, heightNoise: 0.3, walkable: true, walkCost: 1.5, resource: 'fiber' },
  juice: { id: 'juice', baseHeight: 0.02, heightNoise: 0, walkable: false, walkCost: Infinity, resource: 'juice' },
  skin: { id: 'skin', baseHeight: 1.35, heightNoise: 0.7, walkable: false, walkCost: Infinity, resource: null },
};
