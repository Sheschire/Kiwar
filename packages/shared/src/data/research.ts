import type { ResourceId } from './resources';

/**
 * Chantier 08: research. Kiwis working at the Library (a laboratory in later ages) produce
 * research points, faster with Spirit and their research mastery. Points flow into the chosen
 * technology; with nothing chosen they wait in a bank (capped by the Library level). Points are
 * integers in raw units (`RESEARCH_SCALE` per point), so offline progress stays exact.
 */
export const TECH_BRANCHES = ['economy', 'defense', 'exploration', 'passage'] as const;
export type TechBranch = (typeof TECH_BRANCHES)[number];

export const TECH_IDS = [
  // Eden
  'foraging',
  'palisade',
  'starCharts',
  'stoneAge',
  // Stone
  'masonry',
  'slingshots',
  'preserves',
  'ironAge',
  // Iron
  'smelting',
  'armor',
  'compass',
  'industryAge',
  // Industry
  'machines',
  'firearms',
  'steamEngines',
] as const;
export type TechId = (typeof TECH_IDS)[number];

/** What a researched technology changes (multipliers are 1 when absent, bonuses 0). */
export interface TechEffects {
  /** Harvest of these resources (producers and camps). */
  harvest?: Partial<Record<ResourceId, number>>;
  /** Storage of the Nest and the Warehouses. */
  storage?: number;
  /** Turret defense. */
  turretDefense?: number;
  /** Defense of the kiwis posted on the rampart. */
  guard?: number;
  /** Expedition travel time. */
  travel?: number;
  /** Rations eaten on expeditions. */
  rations?: number;
  /** Construction time. */
  build?: number;
  /** Share of kiwis hurt by a wave. */
  injuries?: number;
  /** Added to the ship armour (raid losses). */
  armor?: number;
  /** Added to the quality of reconnaissance reports. */
  recon?: number;
  /** Warriors shoot the bats (garrison and raids). */
  firearms?: boolean;
}

export interface TechDef {
  id: TechId;
  /** Age it belongs to (index in AGE_IDS): researchable once that age is reached. */
  age: number;
  branch: TechBranch;
  /** Research points. */
  cost: number;
  /** Library level needed to research it. */
  libraryLevel: number;
  effects: TechEffects;
}

export const TECHS: Record<TechId, TechDef> = {
  foraging: {
    id: 'foraging',
    age: 0,
    branch: 'economy',
    cost: 60,
    libraryLevel: 1,
    effects: { harvest: { pulp: 1.1, fiber: 1.1 } },
  },
  palisade: {
    id: 'palisade',
    age: 0,
    branch: 'defense',
    cost: 80,
    libraryLevel: 1,
    effects: { turretDefense: 1.15 },
  },
  starCharts: {
    id: 'starCharts',
    age: 0,
    branch: 'exploration',
    cost: 80,
    libraryLevel: 1,
    effects: { travel: 0.9 },
  },
  stoneAge: { id: 'stoneAge', age: 0, branch: 'passage', cost: 700, libraryLevel: 2, effects: {} },
  masonry: {
    id: 'masonry',
    age: 1,
    branch: 'economy',
    cost: 300,
    libraryLevel: 2,
    effects: { storage: 1.2 },
  },
  slingshots: {
    id: 'slingshots',
    age: 1,
    branch: 'defense',
    cost: 350,
    libraryLevel: 2,
    effects: { guard: 1.25 },
  },
  preserves: {
    id: 'preserves',
    age: 1,
    branch: 'exploration',
    cost: 300,
    libraryLevel: 2,
    effects: { rations: 0.8 },
  },
  ironAge: { id: 'ironAge', age: 1, branch: 'passage', cost: 1800, libraryLevel: 4, effects: {} },
  smelting: {
    id: 'smelting',
    age: 2,
    branch: 'economy',
    cost: 800,
    libraryLevel: 4,
    effects: { harvest: { seeds: 1.15 }, build: 0.85 },
  },
  armor: {
    id: 'armor',
    age: 2,
    branch: 'defense',
    cost: 900,
    libraryLevel: 4,
    effects: { injuries: 0.7, armor: 0.1 },
  },
  compass: {
    id: 'compass',
    age: 2,
    branch: 'exploration',
    cost: 800,
    libraryLevel: 4,
    effects: { travel: 0.9, recon: 0.1 },
  },
  industryAge: {
    id: 'industryAge',
    age: 2,
    branch: 'passage',
    cost: 4000,
    libraryLevel: 5,
    effects: {},
  },
  machines: {
    id: 'machines',
    age: 3,
    branch: 'economy',
    cost: 2000,
    libraryLevel: 5,
    effects: { harvest: { pulp: 1.15, fiber: 1.15, seeds: 1.15, juice: 1.15 } },
  },
  firearms: {
    id: 'firearms',
    age: 3,
    branch: 'defense',
    cost: 2400,
    libraryLevel: 6,
    effects: { firearms: true },
  },
  steamEngines: {
    id: 'steamEngines',
    age: 3,
    branch: 'exploration',
    cost: 2000,
    libraryLevel: 5,
    effects: { travel: 0.85 },
  },
};

/** The passage technology of each age (index = the age it leads to). */
export const PASSAGE_TECHS: readonly (TechId | null)[] = [
  null,
  'stoneAge',
  'ironAge',
  'industryAge',
];

export const RESEARCH = {
  /** Research bonus per point of Spirit above average (+6 %). */
  spirit: 0.06,
  /** Bank when no technology is chosen: points kept by Library level (index = level − 1). */
  bank: [100, 200, 400, 800, 1500, 2500] as readonly number[],
} as const;

/** Raw research units per research point (integers keep offline progress exact). */
export const RESEARCH_SCALE = 100 * 3_600_000;
