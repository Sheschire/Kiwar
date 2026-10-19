import type { BuildingType } from './buildings';
import type { ResourceId, Resources } from './resources';
import type { TileType } from './tiles';

/**
 * Milestone 4: the land is finite. Every resource tile holds a deposit that harvesting drains
 * and that grows back slowly. Values are per tile, multiplied by the tile richness.
 */
export interface DepositDef {
  resource: ResourceId;
  /** Stock of a full deposit. */
  stock: number;
  /** Regrowth per hour. */
  regen: number;
}

export const DEPOSITS: Partial<Record<TileType, DepositDef>> = {
  flesh: { resource: 'pulp', stock: 300, regen: 150 },
  grove: { resource: 'fiber', stock: 260, regen: 120 },
  seedRing: { resource: 'seeds', stock: 90, regen: 30 },
  juice: { resource: 'juice', stock: 400, regen: 160 },
};

/** Tile type harvested by each producer (camps harvest the tile they stand on). */
export const HARVESTS: Partial<Record<BuildingType, TileType>> = {
  pulpery: 'flesh',
  fiberWorkshop: 'grove',
  seedQuarry: 'seedRing',
  juiceWell: 'juice',
};

/** Catchment radius (in hexes) of a producer, by level. Camps only use their own tile. */
export const CATCHMENT_RADIUS = [1, 1, 2] as const;

/**
 * Logistics: kiwis carry the harvest to the nearest depot (Nest or Warehouse). A trip takes
 * `cycleS` seconds of work plus `stepS` seconds per unit of walking cost, there and back.
 * Efficiency = (cycle + step × refDistance) / (cycle + step × distance), clamped.
 */
export const LOGISTICS = {
  cycleS: 30,
  stepS: 4,
  refDistance: 3,
  min: 0.35,
  max: 1.25,
  /** Extra cost to reach a building standing on an unwalkable tile (a well in the juice). */
  shoreCost: 0.5,
} as const;

export const PATHS = {
  /** Walking cost of a tile with a path (rays cost 0.5, flesh 1, groves 1.5). */
  walkCost: 0.35,
  cost: { fiber: 4 } satisfies Partial<Resources>,
  /** Max path tiles: base + perNestLevel × Nest level. */
  base: 20,
  perNestLevel: 15,
  /** Max tiles per command (one painting gesture). */
  maxPerCommand: 40,
} as const;

/** Gathering camps: no building, a couple of kiwis picking by hand. Slower, but free. */
export const CAMPS = {
  /** Harvest per hour with both slots filled. */
  rates: { pulp: 180, fiber: 150, seeds: 50, juice: 150 } satisfies Resources,
  workerSlots: 2,
  max: 3,
  tiles: ['flesh', 'grove', 'seedRing', 'juice'] as readonly TileType[],
} as const;
