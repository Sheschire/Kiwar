import { ms } from './curves';
import { IRON } from './iron';
import type { ResourceCost, Resources } from './resources';
import { CAMPS } from './territory';
import { SCHOOL } from './classes';
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
  'school',
  'library',
  'monument',
  'lab',
  'camp',
  'seedTurret',
  'skyTurret',
  'trainingCamp',
  'forge',
  'townHall',
  'campfire',
  'lanterns',
  'flowerBed',
  'vineArch',
  'fountain',
  'mayorStatue',
  'swing',
  'skittles',
  'skipPond',
  'slide',
  'cabaret',
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export interface BuildingLevelDef {
  /** Cost to reach this level (for level 1: to build it). */
  cost: ResourceCost;
  durationMs: number;
  /** Required Nest level to start this level. */
  requiresNestLevel: number;
  /** Required age (index in AGE_IDS) to start this level (levels 4–12: `ageOfLevel`). */
  requiresAge?: number;
  /** Chantier 13: stardust paid on top of the resources (the monument of the Iron and Industry ages). */
  stardust?: number;
  /** Chantier 38: whole units of meteoric iron paid on top (levels 7+, monuments, turrets 3+). */
  iron?: number;
  /** Output per hour at full staffing, before tile richness and face multipliers. */
  production?: Partial<Resources>;
  /** Output per hour that needs no workers (the Nest). */
  passiveProduction?: Partial<Resources>;
  workerSlots?: number;
  housing?: number;
  /** Storage capacity added for every resource. */
  storage?: number;
  /**
   * Chantier 30, warehouses only: what the warehouse keeps in reserve for every resource once
   * the stock is full (the player brings it back with a tap).
   */
  reserve?: number;
  /** Launchpad only: ship cargo (cargo units) and travel time multiplier. */
  cargo?: number;
  travelTime?: number;
  /** School only: kiwis trained at once and training time multiplier. */
  trainingSlots?: number;
  trainingTime?: number;
  /** Library only: research points per hour of an average researcher (chantier 08). */
  research?: number;
  /** Turrets only: defense against ferrets (ground) and bats (air), and seeds fired per wave. */
  defense?: { ground?: number; air?: number };
  ammo?: number;
  /** Chantier 38, Forge only: orders kept in its queue and work speed multiplier. */
  forgeQueue?: number;
  forging?: number;
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
 * Chantier 35: tiles a building covers — 1, a triangle of 3 (anchor + two neighbours, turned by
 * `Building.rot`) or a full hexagon of 7 (anchor + its six neighbours). Missing types cover one.
 */
export type FootprintSize = 1 | 3 | 7;

export const FOOTPRINTS: Partial<Record<BuildingType, FootprintSize>> = {
  warehouse: 3,
  launchpad: 3,
  school: 3,
  library: 3,
  lab: 3,
  monument: 7,
  trainingCamp: 3,
  forge: 3,
  townHall: 3,
  cabaret: 3,
};

export function footprintOf(type: BuildingType): FootprintSize {
  return FOOTPRINTS[type] ?? 1;
}

/** Chantier 44: where a decoration or a game may stand (also on the skin rampart). */
const DECOR_TILES: readonly TileType[] = ['flesh', 'ray', 'heart', 'skin'];

/** Highest level of any building (the last age, chantier 30). */
export const MAX_LEVEL = 12;

/** Levels 1–3 (Eden); levels 4–12 are grown from them by `withAgeLevels`. */
const BASE: Record<BuildingType, BuildingDef> = {
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
        // A little spring by the Nest: the first kiwis can drink before the first Juice well.
        passiveProduction: { pulp: 340, fiber: 290, juice: 40 },
        housing: 4,
        storage: 600,
        maxBuildings: 6,
        queueSize: 2,
      },
      {
        cost: { pulp: 300, fiber: 300, seeds: 40, juice: 80 },
        durationMs: ms.min(5),
        requiresNestLevel: 1,
        passiveProduction: { pulp: 450, fiber: 300, juice: 60 },
        housing: 6,
        storage: 1500,
        maxBuildings: 11,
        queueSize: 3,
      },
      {
        cost: { pulp: 1400, fiber: 1400, seeds: 250, juice: 450 },
        durationMs: ms.min(30),
        requiresNestLevel: 2,
        passiveProduction: { pulp: 600, fiber: 380, juice: 80 },
        housing: 8,
        storage: 3000,
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
        production: { pulp: 750 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 120, fiber: 80, seeds: 10 },
        durationMs: ms.min(2),
        requiresNestLevel: 1,
        production: { pulp: 1880 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 550, fiber: 400, seeds: 70, juice: 90 },
        durationMs: ms.min(10),
        requiresNestLevel: 2,
        production: { pulp: 3750 },
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
        production: { fiber: 600 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 110, fiber: 100, seeds: 10 },
        durationMs: ms.min(2.5),
        requiresNestLevel: 1,
        production: { fiber: 1500 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 500, fiber: 450, seeds: 70, juice: 90 },
        durationMs: ms.min(12),
        requiresNestLevel: 2,
        production: { fiber: 3000 },
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
        production: { juice: 450 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 150, fiber: 120, seeds: 15 },
        durationMs: ms.min(3),
        requiresNestLevel: 1,
        production: { juice: 1120 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 600, fiber: 500, seeds: 80 },
        durationMs: ms.min(15),
        requiresNestLevel: 2,
        production: { juice: 2250 },
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
        production: { seeds: 190 },
        workerSlots: 1,
      },
      {
        cost: { pulp: 200, fiber: 200, juice: 80 },
        durationMs: ms.min(4),
        requiresNestLevel: 1,
        production: { seeds: 480 },
        workerSlots: 2,
      },
      {
        cost: { pulp: 800, fiber: 700, seeds: 60, juice: 300 },
        durationMs: ms.min(20),
        requiresNestLevel: 2,
        production: { seeds: 1000 },
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
  // Chantier 30: a small bonus to the stock, and a reserve the overflow fills once the stock is
  // full (~8 h of a young colony's production); the player brings it back with a tap.
  warehouse: {
    id: 'warehouse',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      {
        cost: { pulp: 60, fiber: 80 },
        durationMs: ms.s(40),
        requiresNestLevel: 1,
        storage: 60,
        reserve: 3000,
      },
      {
        cost: { pulp: 200, fiber: 260, seeds: 20 },
        durationMs: ms.min(4),
        requiresNestLevel: 1,
        storage: 150,
        reserve: 7000,
      },
      {
        cost: { pulp: 700, fiber: 900, seeds: 80, juice: 150 },
        durationMs: ms.min(20),
        requiresNestLevel: 2,
        storage: 250,
        reserve: 14000,
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
  // Chantier 03: the School teaches classes (builder, warrior, mayor; mage and scout at level 2).
  school: {
    id: 'school',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 2,
    levels: [
      {
        cost: { pulp: 250, fiber: 250, seeds: 30 },
        durationMs: ms.min(5),
        requiresNestLevel: 2,
        trainingSlots: SCHOOL.slots[0],
        trainingTime: SCHOOL.trainingTime[0],
      },
      {
        cost: { pulp: 600, fiber: 600, seeds: 120, juice: 150 },
        durationMs: ms.min(15),
        requiresNestLevel: 2,
        trainingSlots: SCHOOL.slots[1],
        trainingTime: SCHOOL.trainingTime[1],
      },
      {
        cost: { pulp: 1500, fiber: 1500, seeds: 300, juice: 400 },
        durationMs: ms.min(30),
        requiresNestLevel: 3,
        trainingSlots: SCHOOL.slots[2],
        trainingTime: SCHOOL.trainingTime[2],
      },
    ],
  },
  // Chantier 08: researchers (Spirit) produce research points; a laboratory in later ages.
  library: {
    id: 'library',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 2,
    levels: [
      {
        cost: { pulp: 300, fiber: 350, seeds: 40, juice: 60 },
        durationMs: ms.min(6),
        requiresNestLevel: 2,
        workerSlots: 1,
        research: 8,
      },
      {
        cost: { pulp: 800, fiber: 900, seeds: 120, juice: 200 },
        durationMs: ms.min(20),
        requiresNestLevel: 2,
        workerSlots: 2,
        research: 10,
      },
      {
        cost: { pulp: 1800, fiber: 2000, seeds: 300, juice: 500 },
        durationMs: ms.min(45),
        requiresNestLevel: 3,
        workerSlots: 3,
        research: 12,
      },
    ],
  },
  // Chantier 08: one monument per colony; each level opens an age (Stone, Iron, Industry) once
  // its passage technology is researched. Outside the building cap, never demolished.
  monument: {
    id: 'monument',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1,
    levels: [
      {
        cost: { pulp: 2000, fiber: 2000, seeds: 400, juice: 600 },
        durationMs: ms.h(1),
        requiresNestLevel: 3,
      },
      {
        cost: { pulp: 9000, fiber: 9000, seeds: 2000, juice: 3000 },
        durationMs: ms.h(6),
        requiresNestLevel: 6,
        stardust: 15,
      },
      {
        cost: { pulp: 20000, fiber: 20000, seeds: 5000, juice: 7000 },
        durationMs: ms.h(12),
        requiresNestLevel: 9,
        stardust: 25,
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
  // Chantier 06: turrets stand on the skin rampart and fire seeds at the predators, on their
  // own (offline too). Outside the building cap, limited by the Nest level (TURRETS).
  // Chantier 08: one laboratory against nature per colony (Iron age, after juice infusion).
  // Outside the building cap; its level shortens the infusion and lowers the risk.
  lab: {
    id: 'lab',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1,
    levels: [
      {
        cost: { pulp: 4000, fiber: 4000, seeds: 800, juice: 1500 },
        durationMs: ms.h(2),
        requiresNestLevel: 7,
        requiresAge: 2,
      },
      {
        cost: { pulp: 8000, fiber: 8000, seeds: 1600, juice: 3000 },
        durationMs: ms.h(4),
        requiresNestLevel: 7,
        requiresAge: 2,
      },
      {
        cost: { pulp: 16000, fiber: 16000, seeds: 3200, juice: 6000 },
        durationMs: ms.h(8),
        requiresNestLevel: 10,
        requiresAge: 3,
      },
    ],
  },
  // Chantier 37: the training camp (Stone age) drills classed kiwis (class rank), promotes them
  // to tier 2 (tier 3 at level 3, Iron age) and changes their class for less than the School.
  // Its trainees are placed by the player only.
  trainingCamp: {
    id: 'trainingCamp',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 2,
    levels: [
      {
        cost: { pulp: 2500, fiber: 3000, seeds: 500, juice: 600 },
        durationMs: ms.h(1),
        requiresNestLevel: 4,
        requiresAge: 1,
        workerSlots: 2,
        trainingSlots: 1,
        trainingTime: 1,
      },
      {
        cost: { pulp: 5000, fiber: 6000, seeds: 1000, juice: 1200 },
        durationMs: ms.h(2),
        requiresNestLevel: 5,
        requiresAge: 1,
        workerSlots: 3,
        trainingSlots: 1,
        trainingTime: 0.85,
      },
      {
        cost: { pulp: 12000, fiber: 14000, seeds: 2500, juice: 3000 },
        durationMs: ms.h(4),
        requiresNestLevel: 7,
        requiresAge: 2,
        workerSlots: 4,
        trainingSlots: 2,
        trainingTime: 0.7,
      },
    ],
  },
  // Chantier 38: the Forge (Stone age, technology `forge`) makes weapons and armours; its smiths
  // are placed by the automation (Strength and Dexterity) or by the player.
  forge: {
    id: 'forge',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 2,
    levels: [
      {
        cost: { pulp: 2000, fiber: 2500, seeds: 600, juice: 400 },
        durationMs: ms.h(1),
        requiresNestLevel: 4,
        requiresAge: 1,
        workerSlots: 2,
        forgeQueue: 2,
        forging: 1,
      },
      {
        cost: { pulp: 4500, fiber: 5500, seeds: 1200, juice: 900 },
        durationMs: ms.h(2),
        requiresNestLevel: 5,
        requiresAge: 1,
        workerSlots: 3,
        forgeQueue: 3,
        forging: 1.2,
      },
      {
        cost: { pulp: 11000, fiber: 13000, seeds: 2800, juice: 2500 },
        durationMs: ms.h(4),
        requiresNestLevel: 7,
        requiresAge: 2,
        workerSlots: 4,
        forgeQueue: 4,
        forging: 1.45,
      },
    ],
  },
  // Chantier 43: the Town Hall (Nest 3), where the mayor gives the Speech (`SPEECH`). One per
  // colony, outside the building cap; it does nothing without a mayor at home.
  townHall: {
    id: 'townHall',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1,
    levels: [
      {
        cost: { pulp: 800, fiber: 1000, seeds: 200, juice: 250 },
        durationMs: ms.min(20),
        requiresNestLevel: 3,
      },
      {
        cost: { pulp: 1400, fiber: 1600, seeds: 350, juice: 450 },
        durationMs: ms.min(40),
        requiresNestLevel: 3,
      },
      {
        cost: { pulp: 2000, fiber: 2000, seeds: 450, juice: 600 },
        durationMs: ms.h(1),
        requiresNestLevel: 3,
      },
    ],
  },
  // Chantier 43: the campfire (Nest 3), outside the building cap, each copy dearer: leisure for
  // the kiwis sleeping near it and a supper together at nightfall (`CAMPFIRE`).
  campfire: {
    id: 'campfire',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      {
        cost: { pulp: 150, fiber: 250, seeds: 40 },
        durationMs: ms.min(5),
        requiresNestLevel: 3,
      },
    ],
  },
  // Chantier 44: decorations, one tile each, outside the building cap, each copy dearer. They
  // give beauty to the whole village (`BEAUTY`); lanterns and the fountain glow at night.
  lanterns: {
    id: 'lanterns',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      { cost: { pulp: 80, fiber: 120, seeds: 20 }, durationMs: ms.min(2), requiresNestLevel: 2 },
    ],
  },
  flowerBed: {
    id: 'flowerBed',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      { cost: { pulp: 120, fiber: 60, seeds: 60 }, durationMs: ms.min(2), requiresNestLevel: 2 },
    ],
  },
  vineArch: {
    id: 'vineArch',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      { cost: { pulp: 60, fiber: 220, seeds: 30 }, durationMs: ms.min(3), requiresNestLevel: 3 },
    ],
  },
  fountain: {
    id: 'fountain',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      {
        cost: { pulp: 600, fiber: 400, seeds: 300, juice: 300 },
        durationMs: ms.min(15),
        requiresNestLevel: 4,
        requiresAge: 1,
      },
    ],
  },
  // One per colony: the mayor in stone (its name on the plinth).
  mayorStatue: {
    id: 'mayorStatue',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1,
    levels: [
      {
        cost: { pulp: 900, fiber: 600, seeds: 700, juice: 250 },
        durationMs: ms.min(25),
        requiresNestLevel: 4,
        requiresAge: 1,
      },
    ],
  },
  // Chantier 44: games, leisures like the campfire (`LEISURE`): one tile, outside the cap, each
  // copy dearer. Different games within reach of a bed add up (`MORALE.leisureMore`).
  swing: {
    id: 'swing',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      { cost: { pulp: 100, fiber: 220, seeds: 30 }, durationMs: ms.min(4), requiresNestLevel: 2 },
    ],
  },
  skittles: {
    id: 'skittles',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      {
        cost: { pulp: 500, fiber: 450, seeds: 400 },
        durationMs: ms.min(12),
        requiresNestLevel: 4,
        requiresAge: 1,
      },
    ],
  },
  skipPond: {
    id: 'skipPond',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      {
        cost: { pulp: 650, fiber: 300, seeds: 300, juice: 200 },
        durationMs: ms.min(12),
        requiresNestLevel: 4,
        requiresAge: 1,
      },
    ],
  },
  slide: {
    id: 'slide',
    allowedTiles: DECOR_TILES,
    buildable: true,
    copyGrowth: 1.6,
    levels: [
      {
        cost: { pulp: 400, fiber: 800, seeds: 200 },
        durationMs: ms.min(12),
        requiresNestLevel: 4,
        requiresAge: 1,
      },
    ],
  },
  // Chantier 44: the Robin's Cabaret (Iron age), one per colony, outside the building cap. It
  // opens at nightfall for the kiwis sleeping around it, for some juice (`CABARET`).
  cabaret: {
    id: 'cabaret',
    allowedTiles: ['flesh', 'ray', 'heart'],
    buildable: true,
    copyGrowth: 1,
    levels: [
      {
        cost: { pulp: 7000, fiber: 8000, seeds: 2000, juice: 2500 },
        durationMs: ms.h(2),
        requiresNestLevel: 7,
        requiresAge: 2,
      },
    ],
  },
  seedTurret: {
    id: 'seedTurret',
    allowedTiles: ['skin'],
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      {
        cost: { pulp: 80, fiber: 140, seeds: 50 },
        durationMs: ms.min(1),
        requiresNestLevel: 1,
        defense: { ground: 4 },
        ammo: 15,
      },
      {
        cost: { pulp: 300, fiber: 350, seeds: 150 },
        durationMs: ms.min(4),
        requiresNestLevel: 2,
        defense: { ground: 8 },
        ammo: 25,
      },
      {
        cost: { pulp: 800, fiber: 900, seeds: 400, juice: 150 },
        durationMs: ms.min(15),
        requiresNestLevel: 3,
        defense: { ground: 14 },
        ammo: 40,
      },
    ],
  },
  // Shoots seed bursts high in the air: the only building that reaches the bats.
  skyTurret: {
    id: 'skyTurret',
    allowedTiles: ['skin'],
    buildable: true,
    copyGrowth: 1.4,
    levels: [
      {
        cost: { pulp: 60, fiber: 160, seeds: 50, juice: 40 },
        durationMs: ms.min(1.5),
        requiresNestLevel: 1,
        defense: { air: 4 },
        ammo: 15,
      },
      {
        cost: { pulp: 250, fiber: 400, seeds: 150, juice: 120 },
        durationMs: ms.min(5),
        requiresNestLevel: 2,
        defense: { air: 8 },
        ammo: 25,
      },
      {
        cost: { pulp: 700, fiber: 1000, seeds: 400, juice: 300 },
        durationMs: ms.min(18),
        requiresNestLevel: 3,
        defense: { air: 14 },
        ammo: 40,
      },
    ],
  },
};

/** Levels per age: Eden 1–3, Stone 4–6, Iron 7–9, Industry 10–12 (chantier 30). */
export const LEVELS_PER_AGE = 3;

/** Age a building level belongs to (0 Eden … 3 Industry). */
export function ageOfLevel(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / LEVELS_PER_AGE);
}

/**
 * How levels 4–12 grow from the level before (chantier 30: three levels per age). Factors
 * apply at every level; the first level of an age adds the `age*` extras on top, so that the
 * age is felt (a bigger cost step, one more worker, more beds…).
 */
interface AgeGrowth {
  cost: number;
  /** Cost factor of the first level of an age (instead of `cost`). */
  ageCost: number;
  time: number;
  /** Production, passive production and defense. */
  output: number;
  research?: number;
  /** Added at the first level of each age. */
  workerSlots?: number;
  /** Added at every level. */
  housing?: number;
  storage?: number;
  /** Storage factor of the first level of an age (instead of `storage`). */
  ageStorage?: number;
  reserve?: number;
  cargo?: number;
  travelTime?: number;
  ammo?: number;
  /** Added at every level. */
  maxBuildings?: number;
  /** Added at the first level of each age. */
  queueSize?: number;
  /** Added at the first level of each age. */
  trainingSlots?: number;
  trainingTime?: number;
}

const DEFAULT_GROWTH: AgeGrowth = { cost: 1.7, ageCost: 2, time: 1.35, output: 1.25 };

const AGE_GROWTH: Partial<Record<BuildingType, AgeGrowth>> = {
  nest: {
    ...DEFAULT_GROWTH,
    output: 1.1,
    housing: 1,
    // The stock grows like the costs: the biggest ones keep fitting (never a blocked game).
    storage: 1.7,
    ageStorage: 2,
    maxBuildings: 3,
    queueSize: 1,
  },
  pulpery: { ...DEFAULT_GROWTH, workerSlots: 1 },
  fiberWorkshop: { ...DEFAULT_GROWTH, workerSlots: 1 },
  juiceWell: { ...DEFAULT_GROWTH, workerSlots: 1 },
  seedQuarry: { ...DEFAULT_GROWTH, workerSlots: 1 },
  hut: { ...DEFAULT_GROWTH, housing: 1 },
  warehouse: { ...DEFAULT_GROWTH, storage: 1.7, ageStorage: 2, reserve: 1.5 },
  launchpad: { ...DEFAULT_GROWTH, cargo: 70, travelTime: 0.965 },
  school: { ...DEFAULT_GROWTH, trainingSlots: 1, trainingTime: 0.965 },
  library: { ...DEFAULT_GROWTH, research: 1.07, workerSlots: 1 },
  townHall: DEFAULT_GROWTH,
  seedTurret: { ...DEFAULT_GROWTH, output: 1.15, ammo: 1.12 },
  skyTurret: { ...DEFAULT_GROWTH, output: 1.15, ammo: 1.12 },
};

const round = (v: number, step: number) => Math.round(v / step) * step;

function scaled<T extends string>(
  values: Partial<Record<T, number>> | undefined,
  k: number,
  step: number,
): Partial<Record<T, number>> | undefined {
  if (!values) return undefined;
  const out: Partial<Record<T, number>> = {};
  for (const [key, v] of Object.entries(values) as [T, number][]) out[key] = round(v * k, step);
  return out;
}

/** Levels 4–12: each needs its age, and the Nest of the same level (the Nest itself: its
 * previous level). */
function withAgeLevels(def: BuildingDef): BuildingDef {
  const g = AGE_GROWTH[def.id];
  if (!g) return def;
  const levels = [...def.levels];
  for (let level = levels.length + 1; level <= MAX_LEVEL; level++) {
    const prev = levels[levels.length - 1]!;
    const age = ageOfLevel(level);
    const first = (level - 1) % LEVELS_PER_AGE === 0;
    const next: BuildingLevelDef = {
      cost: scaled(prev.cost, first ? g.ageCost : g.cost, 10)!,
      durationMs: round(prev.durationMs * g.time, 1000),
      requiresNestLevel: def.id === 'nest' ? level - 1 : level,
      requiresAge: age,
    };
    const extra = (n: number | undefined) => (first ? (n ?? 0) : 0);
    if (prev.production) next.production = scaled(prev.production, g.output, 10);
    if (prev.passiveProduction)
      next.passiveProduction = scaled(prev.passiveProduction, g.output, 10);
    if (prev.workerSlots) next.workerSlots = prev.workerSlots + extra(g.workerSlots);
    if (prev.housing !== undefined) next.housing = prev.housing + (g.housing ?? 0);
    if (prev.storage !== undefined) {
      const k = first ? (g.ageStorage ?? g.storage ?? 1) : (g.storage ?? 1);
      next.storage = round(prev.storage * k, prev.storage < 1000 ? 10 : 50);
    }
    if (prev.reserve !== undefined) next.reserve = round(prev.reserve * (g.reserve ?? 1), 50);
    if (prev.cargo !== undefined) next.cargo = prev.cargo + (g.cargo ?? 0);
    if (prev.travelTime !== undefined)
      next.travelTime = Math.round(prev.travelTime * (g.travelTime ?? 1) * 1000) / 1000;
    if (prev.trainingSlots !== undefined)
      next.trainingSlots = prev.trainingSlots + extra(g.trainingSlots);
    if (prev.trainingTime !== undefined)
      next.trainingTime = Math.round(prev.trainingTime * (g.trainingTime ?? 1) * 1000) / 1000;
    if (prev.research !== undefined)
      next.research = round(prev.research * (g.research ?? g.output), 1);
    if (prev.defense) next.defense = scaled(prev.defense, g.output, 1);
    if (prev.ammo !== undefined) next.ammo = round(prev.ammo * (g.ammo ?? 1), 5);
    if (prev.maxBuildings !== undefined)
      next.maxBuildings = prev.maxBuildings + (g.maxBuildings ?? 0);
    if (prev.queueSize !== undefined) next.queueSize = prev.queueSize + extra(g.queueSize);
    levels.push(next);
  }
  return { ...def, levels };
}

/**
 * Pacing: level 1 takes seconds, level 2 a few minutes, level 3 a quarter of an hour or more;
 * levels 4–12 come with the ages, three per age (hours). Tune the economy here (check with `pnpm balance`).
 */
export const BUILDINGS: Record<BuildingType, BuildingDef> = Object.fromEntries(
  Object.entries(BASE).map(([id, def]) => [id, withIron(withAgeLevels(def))]),
) as Record<BuildingType, BuildingDef>;

/** Chantier 38: the meteoric iron of each level (`IRON.levels`, `IRON.turret`, `IRON.own`). */
function withIron(def: BuildingDef): BuildingDef {
  const table =
    IRON.own[def.id] ??
    (def.id === 'seedTurret' || def.id === 'skyTurret' ? IRON.turret : IRON.levels);
  return {
    ...def,
    levels: def.levels.map((l, i) => {
      const iron = table[i + 1] ?? 0;
      return iron > 0 ? { ...l, iron } : l;
    }),
  };
}

export const TURRET_TYPES = ['seedTurret', 'skyTurret'] as const satisfies readonly BuildingType[];

export function isTurret(type: BuildingType): boolean {
  return (TURRET_TYPES as readonly BuildingType[]).includes(type);
}

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

/** Workplaces the kiwis never join on their own: the player picks who goes (researchers). */
export function isManualWorkplace(type: BuildingType): boolean {
  return type === 'library' || type === 'trainingCamp' || type === 'forge';
}

/** Construction time multiplier for sites next to (or on) a ray: rays speed up the builders. */
export const RAY_BUILD_SPEEDUP = 0.85;

/** Demolition: instant, refunds a share of what was invested (build + upgrades), rounded to 5. */
export const DEMOLITION = {
  refund: 0.25,
};
