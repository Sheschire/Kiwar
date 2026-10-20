import { ms } from './curves';
import type { KiwiModifiers } from './kiwis';
import type { ResourceCost } from './resources';

/**
 * Chantier 03: classes are taught at the School. A trained kiwi keeps working (roles are
 * versatile) with its class bonuses, gains skills at levels 5 / 10 / 20 and wears an outfit.
 */
export const CLASS_IDS = ['builder', 'warrior', 'mage', 'scout', 'mayor'] as const;
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
  // Sword fighter: strong in expeditions, helps with manual work.
  warrior: {
    id: 'warrior',
    schoolLevel: 1,
    minLevel: 3,
    cost: { pulp: 200, fiber: 100, seeds: 30 },
    trainingMs: ms.h(2),
    modifiers: { fight: 1.5, build: 1.1, harvest: 0.95 },
    skills: [
      { id: 'charge', level: 5, modifiers: { fight: 1.2 } },
      { id: 'shield', level: 10, modifiers: { exposure: 0.6 } },
      { id: 'champion', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
  // Ranged fighter who helps the harvest and the regrowth, and can make it rain.
  mage: {
    id: 'mage',
    schoolLevel: 2,
    minLevel: 3,
    cost: { fiber: 150, seeds: 60, juice: 120 },
    trainingMs: ms.h(3),
    modifiers: { fight: 1.3, harvest: 1.15, build: 0.9, research: 1.2 },
    skills: [
      { id: 'greenThumb', level: 5 },
      { id: 'rain', level: 10, cooldownMs: ms.h(12) },
      { id: 'lightning', level: 20, modifiers: { fight: 1.3 } },
    ],
  },
  // Flying scout: light on board, hard to hit; speeds up the whole expedition.
  scout: {
    id: 'scout',
    schoolLevel: 2,
    minLevel: 3,
    cost: { fiber: 200, seeds: 40, juice: 80 },
    trainingMs: ms.h(2),
    modifiers: { fight: 1.1, weight: 0.5, harvest: 1.05 },
    skills: [
      { id: 'glide', level: 5, modifiers: { exposure: 0.7 } },
      { id: 'scouting', level: 10 },
      { id: 'tailwind', level: 20 },
    ],
  },
  // The one mayor organises the colony (production bonus from Charisma) and gives speeches.
  mayor: {
    id: 'mayor',
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
};

/** Numbers of the skills with a colony-wide or crew-wide effect. */
export const SKILLS = {
  /** Mage: regrowth bonus of the deposits harvested by the building the mage works in. */
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
  /** Changing class costs this many times the price. */
  retrainCost: 2,
} as const;

/** Training slots and speed of the School by level. */
export const SCHOOL = {
  slots: [1, 1, 2],
  trainingTime: [1, 1, 0.7],
} as const;
