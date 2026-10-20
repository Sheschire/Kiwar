import type { ResourceId } from './resources';

/**
 * Chantier 03: every kiwi is an individual. Stats are drawn at hatching with the state's seeded
 * RNG; levels and masteries grow with work. Progress is integrated with integers (see
 * `XP_SCALE` / `PRACTICE_SCALE`) so offline progress is exact.
 */
export const STAT_IDS = [
  'strength',
  'agility',
  'endurance',
  'spirit',
  'dexterity',
  'charisma',
] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;

export const SHINY_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type ShinyColor = (typeof SHINY_COLORS)[number];

/** Masteries: one per harvested resource, plus construction. */
export const MASTERY_IDS = ['pulp', 'fiber', 'seeds', 'juice', 'build'] as const;
export type MasteryId = (typeof MASTERY_IDS)[number];
export type Masteries = Record<MasteryId, number>;

export const TRAIT_IDS = [
  'earlyBird',
  'glutton',
  'brave',
  'dreamer',
  'sturdy',
  'lucky',
  'curious',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

/** Multipliers a trait (or later a class) applies; 1 when absent. */
export interface KiwiModifiers {
  /** Experience gained. */
  xp?: number;
  /** Mastery practice gained. */
  practice?: number;
  /** Harvesting power. */
  harvest?: number;
  /** Construction speed. */
  build?: number;
  /** Fighting strength in expeditions. */
  fight?: number;
  /** Chance to be the one lost in an expedition (higher = more exposed). */
  exposure?: number;
  /** Rations eaten on an expedition. */
  rations?: number;
  /** Cargo taken aboard a ship. */
  weight?: number;
  /** Rest needed by day (chantier 04). */
  rest?: number;
  /** Meals eaten at the colony (chantier 04). */
  appetite?: number;
}

/** A small advantage and a small drawback each. */
export const TRAITS: Record<TraitId, KiwiModifiers> = {
  earlyBird: { harvest: 1.06, build: 0.94, rest: 0.75 },
  glutton: { fight: 1.12, rations: 1.5, appetite: 1.5 },
  brave: { fight: 1.15, exposure: 1.3 },
  dreamer: { xp: 1.15, harvest: 0.95 },
  sturdy: { build: 1.12, xp: 0.9 },
  lucky: { exposure: 0.7, practice: 0.9 },
  curious: { practice: 1.25, harvest: 0.97 },
};

export const KIWI = {
  stat: { min: 1, max: 10, cap: 20, average: 5 },
  /** Sum of the six base stats (drawn in this range): no perfect kiwi. */
  statTotal: { min: 27, max: 33 },
  shinyChance: 1 / 512,
  traitChance: 0.3,
  maxLevel: 30,
  /** Experience per hour by activity (idle and travelling kiwis do not learn; see expeditionXp). */
  xpPerHour: { work: 10, build: 12, train: 10 },
  /** Experience bonus per point of Spirit above average (+4 %). */
  spiritXp: 0.04,
  /** Lump of experience for every crew member coming home (part 3). */
  expeditionXp: { base: 40, victory: 40 },
  /** Mastery ranks (cumulative hours of practice: see masteryHours). */
  maxRank: 10,
  /** Bonus per mastery rank on the kiwi's work (+3 %). */
  rankBonus: 0.03,
  /** Harvesting bonus per point of Dexterity above average (+3 %). */
  dexterityBonus: 0.03,
  /** Construction speed bonus per point of Strength above average (+2 %). */
  strengthBuild: 0.02,
  /** Expedition strength of a kiwi: +6 % per Strength point and +3 % per Endurance point above
   * average, ×(1 + 4 % per level above 1), × trait (and later class). */
  fight: { strength: 0.06, endurance: 0.03, perLevel: 0.04 },
  /** How exposed a kiwi is in expeditions (who falls first): weaker, slower, frailer kiwis more. */
  exposure: { agility: 0.05, endurance: 0.05 },
  /** Never below this share of an average kiwi's work. */
  minPower: 0.5,
  /** Odd levels give a stat point drawn from the activity; even levels one to place. */
  autoStatWeights: {
    work: { strength: 1, agility: 2, endurance: 1, spirit: 1, dexterity: 3, charisma: 1 },
    build: { strength: 3, agility: 1, endurance: 2, spirit: 1, dexterity: 1, charisma: 1 },
    expedition: { strength: 2, agility: 2, endurance: 2, spirit: 1, dexterity: 1, charisma: 1 },
    other: { strength: 1, agility: 1, endurance: 1, spirit: 1, dexterity: 1, charisma: 1 },
  } satisfies Record<string, Stats>,
} as const;

/** Lost kiwis remembered in the memorial. */
export const MEMORIAL_MAX = 50;

/** Longest kiwi name (characters). */
export const KIWI_NAME_MAX = 20;

/** Raw experience units per experience point (integers keep offline progress exact). */
export const XP_SCALE = 100 * 3_600_000;
/** Raw practice units per hour of practice. */
export const PRACTICE_SCALE = 100 * 3_600_000;

/**
 * Cumulative experience needed to reach `level`: level 5 ≈ 11 h of work, level 10 ≈ 3 days,
 * level 20 ≈ 3 weeks, level 30 ≈ 2 months.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return Math.floor((518 * n * n + 41 * n * n * n) / 100);
}

/** Cumulative hours of practice to reach a mastery rank (rank 1: 2 h, 5: 50 h, 10: 200 h). */
export function masteryHours(rank: number): number {
  return 2 * rank * rank;
}

export const RESOURCE_MASTERY: Record<ResourceId, MasteryId> = {
  pulp: 'pulp',
  fiber: 'fiber',
  seeds: 'seeds',
  juice: 'juice',
};
