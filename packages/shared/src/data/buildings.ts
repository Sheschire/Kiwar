import { ms } from './curves';
import type { ResourceCost, Resources } from './resources';
import { CAMPS } from './territory';
import type { TileType } from './tiles';

export const BUILDING_TYPES = [
  'nest',
  'pulpery',
  'fiberWorkshop',
  'seedQuarry',
  'juiceWell',
  'hut',
  'warehouse',
  'launchpad',
  'camp',
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export interface BuildingLevelDef {
  /** Cost to reach this level (for level 1: to build it). */
  cost: ResourceCost;
  durationMs: number;
  /** Required Nest level to start this level. */
  requiresNestLevel: number;
  /** Output per hour at full staffing, before tile richness and face multipliers. */
  production?: Partial<Resources>;
  /** Output per hour that needs no workers (the Nest). */
  passiveProduction?: Partial<Resources>;
  workerSlots?: number;
  housing?: number;
  /** Storage capacity added for every resource. */
  storage?: number;
  /** Launchpad only: ship cargo (cargo units) and travel time multiplier. */
  cargo?: number;
  travelTime?: number;
  /** Nest only: building cap (Nest excluded) and construction queue length. */
  maxBuildings?: number;
  queueSize?: number;
}

export interface BuildingDef {
  id: BuildingType;
  allowedTiles: readonly TileType[];
  /** Can be ordered by the player (the Nest exists from the start). */
  buildable: boolean;
  levels: readonly BuildingLevelDef[];
  /** Cost and duration multiplier of each additional copy of this building. */
  copyGrowth: number;
}

/**
 * Pacing: level 1 takes seconds, level 2 a few minutes, level 3 a quarter of an hour or more.
 * Tune the economy here (and check the result with `pnpm balance`).
 */
export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  nest: {
    id: 'nest',
    allowedTiles: ['heart'],
    buildable: false,
    copyGrowth: 1,
    levels: [
      {
        cost: {},
        durationMs: 0,
        requiresNestLevel: 0,
        passiveProduction: { pulp: 240, fiber: 180 },
        housing: 4,
        storage: 400,
        maxBuildings: 6,
        queueSize: 2,
      },
      {
        cost: { pulp: 300, fiber: 300, seeds: 40, juice: 80 },
        durationMs: ms.min(5),
        requiresNestLevel: 1,
        passiveProduction: { pulp: 360, fiber: 240 },
        housing: 6,
        storage: 1000,
        maxBuildings: 11,
        queueSize: 3,
      },
      {
        cost: { pulp: 1400, fiber: 1400, seeds: 250, juice: 450 },
        durationMs: ms.min(30),
        requiresNestLevel: 2,
        passiveProduction: { pulp: 480, fiber: 300 },
        housing: 8,
        storage: 2500,
        maxBuildings: 18,
        queueSize: 4,
      },
    ],
  },
  pulpery: {
    id: 'pulpery',
    allowedTiles: ['flesh'],
    buildable: true,
    copyGrowth: 1.35,
    levels: [
      {
        cost: { pulp: 20, fiber: 10 },
        durationMs: ms.s(15),
        requiresNestLevel: 1,
        production: { pulp: 600 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 120, fiber: 80, seeds: 10 },
        durationMs: ms.min(2),
        requiresNestLevel: 1,
        production: { pulp: 1500 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 550, fiber: 400, seeds: 70, juice: 90 },
        durationMs: ms.min(10),
        requiresNestLevel: 2,
        production: { pulp: 3000 },
        workerSlots: 3,
      },
    ],
  },
  fiberWorkshop: {
    id: 'fiberWorkshop',
    allowedTiles: ['grove'],
    buildable: true,
    copyGrowth: 1.35,
    levels: [
      {
        cost: { pulp: 30 },
        durationMs: ms.s(20),
        requiresNestLevel: 1,
        production: { fiber: 480 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 110, fiber: 100, seeds: 10 },
        durationMs: ms.min(2.5),
        requiresNestLevel: 1,
        production: { fiber: 1200 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 500, fiber: 450, seeds: 70, juice: 90 },
        durationMs: ms.min(12),
        requiresNestLevel: 2,
        production: { fiber: 2400 },
        workerSlots: 3,
      },
    ],
  },
  juiceWell: {
    id: 'juiceWell',
    allowedTiles: ['juice'],
    buildable: true,
    copyGrowth: 1.35,
    levels: [
      {
        cost: { pulp: 40, fiber: 30 },
        durationMs: ms.s(30),
        requiresNestLevel: 1,
        production: { juice: 360 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 150, fiber: 120, seeds: 15 },
        durationMs: ms.min(3),
        requiresNestLevel: 1,
        production: { juice: 900 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 600, fiber: 500, seeds: 80 },
        durationMs: ms.min(15),
        requiresNestLevel: 2,
        production: { juice: 1800 },
        workerSlots: 3,
      },
    ],
  },
  seedQuarry: {
    id: 'seedQuarry',
    allowedTiles: ['seedRing'],
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      {
        cost: { pulp: 60, fiber: 60, juice: 20 },
        durationMs: ms.s(45),
        requiresNestLevel: 1,
        production: { seeds: 150 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 200, fiber: 200, juice: 80 },
        durationMs: ms.min(4),
        requiresNestLevel: 1,
        production: { seeds: 380 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 800, fiber: 700, seeds: 60, juice: 300 },
        durationMs: ms.min(20),
        requiresNestLevel: 2,
        production: { seeds: 800 },
        workerSlots: 3,
      },
    ],
  },
  hut: {
    id: 'hut',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1.3,
    levels: [
      { cost: { pulp: 40, fiber: 40 }, durationMs: ms.s(25), requiresNestLevel: 1, housing: 2 },
      {
        cost: { pulp: 150, fiber: 200, seeds: 15 },
        durationMs: ms.min(3),
        requiresNestLevel: 1,
        housing: 4,
      },
      {
        cost: { pulp: 500, fiber: 700, seeds: 60, juice: 100 },
        durationMs: ms.min(15),
        requiresNestLevel: 2,
        housing: 6,
      },
    ],
  },
  warehouse: {
    id: 'warehouse',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      { cost: { pulp: 60, fiber: 80 }, durationMs: ms.s(40), requiresNestLevel: 1, storage: 500 },
      {
        cost: { pulp: 200, fiber: 260, seeds: 20 },
        durationMs: ms.min(4),
        requiresNestLevel: 1,
        storage: 1200,
      },
      {
        cost: { pulp: 700, fiber: 900, seeds: 80, juice: 150 },
        durationMs: ms.min(20),
        requiresNestLevel: 2,
        storage: 3000,
      },
    ],
  },
  launchpad: {
    id: 'launchpad',
    allowedTiles: ['flesh', 'ray'],
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      {
        cost: { pulp: 350, fiber: 450, seeds: 60, juice: 120 },
        durationMs: ms.min(8),
        requiresNestLevel: 2,
        cargo: 150,
        travelTime: 1,
      },
      {
        cost: { pulp: 800, fiber: 1000, seeds: 150, juice: 300 },
        durationMs: ms.min(25),
        requiresNestLevel: 2,
        cargo: 300,
        travelTime: 0.85,
      },
      {
        cost: { pulp: 1600, fiber: 2000, seeds: 300, juice: 600 },
        durationMs: ms.min(60),
        requiresNestLevel: 3,
        cargo: 500,
        travelTime: 0.7,
      },
    ],
  },
  // Gathering camp (milestone 4): set up instantly and for free with the `gather` command,
  // outside the building cap. Its harvest depends on the tile (see CAMPS).
  camp: {
    id: 'camp',
    allowedTiles: CAMPS.tiles,
    buildable: false,
    copyGrowth: 1,
    levels: [{ cost: {}, durationMs: 0, requiresNestLevel: 1, workerSlots: CAMPS.workerSlots }],
  },
};

export const MAX_LEVEL = 3;

/** Highest level a building type can reach (camps have a single level). */
export function maxLevelOf(type: BuildingType): number {
  return BUILDINGS[type].levels.length;
}

/** Building ordered by the player in the build menu. */
export const BUILDABLE_TYPES = BUILDING_TYPES.filter((t) => BUILDINGS[t].buildable);

export function levelDef(type: BuildingType, level: number): BuildingLevelDef | undefined {
  return BUILDINGS[type].levels[level - 1];
}

export function isProducer(type: BuildingType): boolean {
  return BUILDINGS[type].levels.some((l) => (l.workerSlots ?? 0) > 0);
}

/** Construction time multiplier for sites next to (or on) a ray: rays speed up the builders. */
export const RAY_BUILD_SPEEDUP = 0.85;
