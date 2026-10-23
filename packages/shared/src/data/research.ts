import type { ResourceId } from './resources';

/**
 * Chantier 08: research. Kiwis working at the Library (a laboratory in later ages) produce
 * research points, faster with Spirit and their research mastery. Points flow into the chosen
 * technology; with nothing chosen they wait in a bank (capped by the Library level). Points are
 * integers in raw units (`RESEARCH_SCALE` per point), so offline progress stays exact.
 */
export const TECH_BRANCHES = [
  'economy',
  'defense',
  'exploration',
  'passage',
  'unnatural',
  'stars',
] as const;
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
  // Against nature (second half of chantier 08)
  'juiceInfusion',
  'titanWorks',
  'greenBlood',
  // Stars (chantier 13: research points and stardust)
  'clearNights',
  'starWatch',
  'cometLure',
  'starIron',
  // Chantier 15
  'meteorDrill',
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
  /** Opens the laboratory against nature (Kikiwiwis). */
  laboratory?: boolean;
  /** Kikiwiwis may terraform tiles. */
  terraform?: boolean;
  /** Kikiwiwi power and juice upkeep multipliers, points of infusion risk removed. */
  kikiwiwiPower?: number;
  kikiwiwiUpkeep?: number;
  infusionRisk?: number;
  /** Chantier 13: work at night (multiplier of the night rate, at most a day's work). */
  nightWork?: number;
  /** Waves announced this much earlier (ms). */
  waveNotice?: number;
  /** Time between two comets. */
  cometInterval?: number;
  /** Meteorite stock. */
  meteorStock?: number;
  /** Chantier 15: a drill on every worked crater (`METEORS.drill` by age). */
  meteorDrill?: boolean;
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
  /** Chantier 13: stardust paid when it is chosen (refunded if abandoned). */
  stardust?: number;
  effects: TechEffects;
}

export const TECHS: Record<TechId, TechDef> = {
  foraging: {
    id: 'foraging',
    age: 0,
    branch: 'economy',
    cost: 25,
    libraryLevel: 1,
    effects: { harvest: { pulp: 1.1, fiber: 1.1 } },
  },
  palisade: {
    id: 'palisade',
    age: 0,
    branch: 'defense',
    cost: 40,
    libraryLevel: 1,
    effects: { turretDefense: 1.15 },
  },
  starCharts: {
    id: 'starCharts',
    age: 0,
    branch: 'exploration',
    cost: 40,
    libraryLevel: 1,
    effects: { travel: 0.9 },
  },
  stoneAge: { id: 'stoneAge', age: 0, branch: 'passage', cost: 120, libraryLevel: 1, effects: {} },
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
  ironAge: { id: 'ironAge', age: 1, branch: 'passage', cost: 2900, libraryLevel: 4, effects: {} },
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
    // Chantier 30: passages for Stone ≈ 12 h, Iron ≈ 3 d, Industry ≈ 10 d (see the balance report).
    cost: 11500,
    libraryLevel: 7,
    effects: {},
  },
  machines: {
    id: 'machines',
    age: 3,
    branch: 'economy',
    cost: 2000,
    libraryLevel: 7,
    effects: { harvest: { pulp: 1.15, fiber: 1.15, seeds: 1.15, juice: 1.15 } },
  },
  firearms: {
    id: 'firearms',
    age: 3,
    branch: 'defense',
    cost: 2400,
    libraryLevel: 10,
    effects: { firearms: true },
  },
  steamEngines: {
    id: 'steamEngines',
    age: 3,
    branch: 'exploration',
    cost: 2000,
    libraryLevel: 7,
    effects: { travel: 0.85 },
  },
  juiceInfusion: {
    id: 'juiceInfusion',
    age: 2,
    branch: 'unnatural',
    cost: 1200,
    libraryLevel: 4,
    effects: { laboratory: true },
  },
  titanWorks: {
    id: 'titanWorks',
    age: 2,
    branch: 'unnatural',
    cost: 1500,
    libraryLevel: 7,
    effects: { terraform: true },
  },
  greenBlood: {
    id: 'greenBlood',
    age: 3,
    branch: 'unnatural',
    cost: 2500,
    libraryLevel: 10,
    effects: { kikiwiwiPower: 1.25, kikiwiwiUpkeep: 0.75, infusionRisk: 0.1 },
  },
  clearNights: {
    id: 'clearNights',
    age: 1,
    branch: 'stars',
    cost: 250,
    libraryLevel: 2,
    stardust: 8,
    effects: { nightWork: 1.15 },
  },
  starWatch: {
    id: 'starWatch',
    age: 1,
    branch: 'stars',
    cost: 300,
    libraryLevel: 2,
    stardust: 8,
    effects: { waveNotice: 4 * 3_600_000 },
  },
  cometLure: {
    id: 'cometLure',
    age: 2,
    branch: 'stars',
    cost: 700,
    libraryLevel: 4,
    stardust: 15,
    effects: { cometInterval: 0.8 },
  },
  starIron: {
    id: 'starIron',
    age: 2,
    branch: 'stars',
    cost: 700,
    libraryLevel: 4,
    stardust: 12,
    effects: { meteorStock: 1.3 },
  },
  meteorDrill: {
    id: 'meteorDrill',
    age: 1,
    branch: 'economy',
    cost: 300,
    libraryLevel: 2,
    effects: { meteorDrill: true },
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
  bank: [100, 200, 400, 800, 1000, 1200, 1500, 1800, 2100, 2500, 2800, 3100] as readonly number[],
} as const;

/** Raw research units per research point (integers keep offline progress exact). */
export const RESEARCH_SCALE = 100 * 3_600_000;
