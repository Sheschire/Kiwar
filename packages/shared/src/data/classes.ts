import { ms } from './curves';
import type { KiwiModifiers, StatId } from './kiwis';
import type { ResourceCost } from './resources';

/**
 * Chantier 03: classes are taught at the School. A trained kiwi keeps working (roles are
 * versatile) with its class bonuses, gains skills at levels 5 / 10 / 20 and wears an outfit.
 * Chantier 37: one class per stat (the School asks for that stat ≥ 6), and the colony bonus of a
 * class grows with its stat.
 */
export const CLASS_IDS = [
  'builder',
  'warrior',
  'mage',
  'scout',
  'mayor',
  'gatherer',
  'bard',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const SKILL_IDS = [
  'scaffold',
  'quickHands',
  'architect',
  'charge',
  'shield',
  'champion',
  'greenThumb',
  'rain',
  'lightning',
  'glide',
  'scouting',
  'tailwind',
  'organisation',
  'speech',
  'festival',
  'insight',
  'quickPick',
  'eagleEye',
  'ballad',
  'chorus',
  'anthem',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export interface SkillDef {
  id: SkillId;
  /** Kiwi level that unlocks it. */
  level: number;
  /** Passive bonus on the kiwi itself. */
  modifiers?: KiwiModifiers;
  /** Active skills: used with the `useSkill` command, then cool down. */
  cooldownMs?: number;
}

export interface ClassDef {
  id: ClassId;
  /** Stat the class asks for (≥ `CLASS_RULES.statMin` at the School) and grows with. */
  stat: StatId;
  /** 1: taught at the School (chantier 37: 2 and 3 at the training camp). */
  tier: 1 | 2 | 3;
  /** Age of the colony needed to teach it (0: from the start). */
  age?: number;
  /**
   * The colony bonus that grows with the class's stat (`CLASS_RULES.growth` per point above
   * average). Lower is better for `weight`.
   */
  grows?: keyof KiwiModifiers;
  /** School level needed to teach it. */
  schoolLevel: number;
  /** Kiwi level needed to start the training. */
  minLevel: number;
  cost: ResourceCost;
  trainingMs: number;
  /** Only one kiwi of this class at a time. */
  unique?: boolean;
  modifiers: KiwiModifiers;
  skills: readonly [SkillDef, SkillDef, SkillDef];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  // Builds much faster (and learns construction faster).
  builder: {
    id: 'builder',
    stat: 'strength',
    tier: 1,
    grows: 'build',
    schoolLevel: 1,
    minLevel: 3,
    cost: { pulp: 150, fiber: 150 },
    trainingMs: ms.h(1),
    modifiers: { build: 1.3 },
    skills: [
      { id: 'scaffold', level: 5, modifiers: { build: 1.15 } },
      { id: 'quickHands', level: 10, modifiers: { practice: 1.5 } },
      { id: 'architect', level: 20, modifiers: { build: 1.25 } },
    ],
  },
  // Sword fighter on the front line: strong in expeditions, mends what the waves broke.
  warrior: {
    id: 'warrior',
    stat: 'endurance',
    tier: 1,
    grows: 'repair',
    schoolLevel: 1,
    minLevel: 3,
    cost: { pulp: 200, fiber: 100, seeds: 30 },
    trainingMs: ms.h(2),
    modifiers: { fight: 1.5, build: 1.1, harvest: 0.95, repair: 1.5 },
    skills: [
      { id: 'charge', level: 5, modifiers: { fight: 1.2 } },
      { id: 'shield', level: 10, modifiers: { exposure: 0.6 } },
      { id: 'champion', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
  // Scholar of the Library, throws fireballs (reaching bats) and can make it rain.
  mage: {
    id: 'mage',
    stat: 'spirit',
    tier: 1,
    grows: 'research',
    schoolLevel: 2,
    minLevel: 3,
    cost: { fiber: 150, seeds: 60, juice: 120 },
    trainingMs: ms.h(3),
    modifiers: { fight: 1.3, build: 0.9, research: 1.5 },
    skills: [
      { id: 'insight', level: 5, modifiers: { research: 1.15 } },
      { id: 'rain', level: 10, cooldownMs: ms.h(12) },
      { id: 'lightning', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
  // Agile scout: light on board, hard to hit, speeds up the whole expedition; a quick dagger.
  scout: {
    id: 'scout',
    stat: 'agility',
    tier: 1,
    grows: 'weight',
    schoolLevel: 2,
    minLevel: 3,
    cost: { fiber: 200, seeds: 40, juice: 80 },
    trainingMs: ms.h(2),
    modifiers: { fight: 1.1, weight: 0.5 },
    skills: [
      { id: 'glide', level: 5, modifiers: { exposure: 0.7 } },
      { id: 'scouting', level: 10 },
      { id: 'tailwind', level: 20 },
    ],
  },
  // The one mayor organises the colony (production bonus from Charisma) and gives speeches.
  mayor: {
    id: 'mayor',
    stat: 'charisma',
    tier: 1,
    schoolLevel: 1,
    minLevel: 5,
    cost: { pulp: 300, fiber: 300, seeds: 80, juice: 150 },
    trainingMs: ms.h(3),
    unique: true,
    modifiers: {},
    skills: [
      { id: 'organisation', level: 5 },
      { id: 'speech', level: 10, cooldownMs: ms.h(12) },
      { id: 'festival', level: 20 },
    ],
  },
  // Chantier 37: deft harvester (and crater miner), slings stones at the bats.
  gatherer: {
    id: 'gatherer',
    stat: 'dexterity',
    tier: 1,
    grows: 'harvest',
    schoolLevel: 1,
    minLevel: 3,
    cost: { pulp: 150, fiber: 120, seeds: 20 },
    trainingMs: ms.h(1.5),
    modifiers: { harvest: 1.3, fight: 1.1 },
    skills: [
      { id: 'greenThumb', level: 5 },
      { id: 'quickPick', level: 10, modifiers: { harvest: 1.1, practice: 1.25 } },
      { id: 'eagleEye', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
  // Chantier 37: lifts the colony's morale, and sings to its neighbours in a battle.
  bard: {
    id: 'bard',
    stat: 'charisma',
    tier: 1,
    age: 1,
    schoolLevel: 2,
    minLevel: 3,
    cost: { fiber: 150, seeds: 50, juice: 100 },
    trainingMs: ms.h(2),
    modifiers: { fight: 0.9, harvest: 0.95 },
    skills: [
      { id: 'ballad', level: 5 },
      { id: 'chorus', level: 10 },
      { id: 'anthem', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
};

/** Chantier 37: rules shared by every class. */
export const CLASS_RULES = {
  /** The School teaches a class to a kiwi whose class stat reaches this. */
  statMin: 6,
  /** The class's colony bonus: +2 % per point of its stat above average (5). */
  growth: 0.02,
} as const;

/** Numbers of the skills with a colony-wide or crew-wide effect. */
export const SKILLS = {
  /** Gatherer: regrowth bonus of the deposits harvested by the building it works in. */
  greenThumbRegen: 0.15,
  /** Mage: refills this share of its workplace's deposits. */
  rainRefill: 0.3,
  /** Scout: crew strength bonus (once per crew). */
  scoutingStrength: 0.1,
  /** Scout: travel time multiplier (once per crew). */
  tailwindTravel: 0.8,
  /** Mayor: colony harvest bonus per Charisma point, plus a flat bonus with Organisation. */
  mayorPerCharisma: 0.01,
  organisationBonus: 0.05,
  /** Mayor: speech bonus and duration (Festival doubles the duration). */
  speechBonus: 0.15,
  speechMs: ms.h(1),
  festivalMultiplier: 2,
  /** Scout: travel time multiplier of a crew with a scout (once per crew, chantier 37). */
  scoutTravel: 0.9,
  /** Bard: colony morale per bard at home (Charisma growth), at most `bardMax` in all. */
  bardMorale: 0.01,
  bardMax: 0.05,
  /** Bard: Ballad multiplies its own share. */
  balladBonus: 1.5,
  /** Changing class costs this many times the price. */
  retrainCost: 2,
} as const;

/** Training slots and speed of the School by level. */
export const SCHOOL = {
  slots: [1, 1, 2],
  trainingTime: [1, 1, 0.7],
} as const;
