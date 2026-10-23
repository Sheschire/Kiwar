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
  // Chantier 37, tier 2 (training camp).
  'architect',
  'navigator',
  'champion',
  'archmage',
  'herbalist',
  'minstrel',
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
  /** Stat the class asks for (≥ `CLASS_RULES.statMin[tier]`) and grows with. */
  stat: StatId;
  /** Tier 3: a second stat asked for too (the growth takes the lower of the two). */
  stat2?: StatId;
  /** 1: taught at the School; 2 and 3 at the training camp (chantier 37). */
  tier: 1 | 2 | 3;
  /** Tiers 2 and 3: the classes a kiwi may come from (it keeps their skills). */
  parents?: readonly ClassId[];
  /** Age of the colony needed to teach it (0: from the start). */
  age?: number;
  /**
   * The colony bonus that grows with the class's stat (`CLASS_RULES.growth` per point above
   * average). Lower is better for `weight`.
   */
  grows?: keyof KiwiModifiers;
  /** Level of the School (tier 1) or the training camp (tiers 2–3) needed to teach it. */
  schoolLevel: number;
  /** Kiwi level needed to start the training. */
  minLevel: number;
  cost: ResourceCost;
  trainingMs: number;
  /** Only one kiwi of this class at a time. */
  unique?: boolean;
  modifiers: KiwiModifiers;
  /** Its own skills; a higher tier also keeps those of its parents (`classSkills`). */
  skills: readonly SkillDef[];
}

type TierOne = 'builder' | 'warrior' | 'mage' | 'scout' | 'mayor' | 'gatherer' | 'bard';
const CLASSES_T1: Record<TierOne, ClassDef> = {
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

/**
 * Chantier 37, tier 2: the advanced classes of the training camp (kiwi level 10, the class
 * stat ≥ 10, class rank 3). Each replaces its parent's bonuses with stronger ones, keeps its
 * parent's skills and fights with a new weapon.
 */
const ADVANCED_COST = { pulp: 1500, fiber: 1500, seeds: 300, juice: 600 };
const advanced = (
  id: ClassId,
  parent: TierOne,
  grows: keyof KiwiModifiers | undefined,
  modifiers: KiwiModifiers,
): ClassDef => ({
  id,
  stat: CLASSES_T1[parent].stat,
  tier: 2,
  parents: [parent],
  ...(grows ? { grows } : {}),
  schoolLevel: 1,
  minLevel: 10,
  cost: ADVANCED_COST,
  trainingMs: ms.h(4),
  modifiers,
  skills: [],
});

/** Chantier 37: rules shared by every class. */
export const CLASS_RULES = {
  /** A class is taught to a kiwi whose class stat(s) reach this, by tier (index = tier). */
  statMin: [0, 6, 10, 12] as readonly number[],
  /** The class's colony bonus: +2 % per point of its stat above average (5). */
  growth: 0.02,
  /** Class rank needed in the current class to move up a tier. */
  promoteRank: 3,
  /** Colony bonus per class rank above the first (+3 %). */
  rankBonus: 0.03,
} as const;

/** The training camp (chantier 37): class ranks, drills, class changes. */
export const CAMP = {
  maxRank: 5,
  /** Hours of practice to reach each rank (index = rank; rank 1 from the start). */
  rankHours: [0, 0, 6, 18, 40, 80] as readonly number[],
  /** Practice per hour of drill at the camp, by camp level (index = level − 1). */
  drill: [1, 1.25, 1.5] as readonly number[],
  /** Practice granted for a wave fought on guard (militia: less), and an expedition. */
  waveHours: { guard: 1.5, militia: 0.5 },
  expeditionHours: { base: 2, victory: 1 },
  /** A kiwi in drill eats this much more (in mouths). */
  drillAppetite: 0.5,
  /** Changing class at the camp costs this many times the price (the School: `retrainCost`). */
  retrainCost: 1.25,
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
  /** Chantier 37: a minstrel counts as this many bards; a navigator's crew travels faster. */
  minstrelMorale: 2,
  navigatorTravel: 0.8,
  /** Herbalist: its Green thumb counts this many times. */
  herbalistRegen: 2,
  /** Changing class costs this many times the price. */
  retrainCost: 2,
} as const;

/** Training slots and speed of the School by level. */
export const SCHOOL = {
  slots: [1, 1, 2],
  trainingTime: [1, 1, 0.7],
} as const;

export const CLASSES: Record<ClassId, ClassDef> = {
  ...CLASSES_T1,
  architect: advanced('architect', 'builder', 'build', { build: 1.6, practice: 1.2 }),
  navigator: advanced('navigator', 'scout', 'weight', { fight: 1.3, weight: 0.35 }),
  champion: advanced('champion', 'warrior', 'repair', {
    fight: 1.8,
    build: 1.1,
    repair: 1.8,
    exposure: 0.8,
  }),
  archmage: advanced('archmage', 'mage', 'research', { fight: 1.5, build: 0.9, research: 2 }),
  herbalist: advanced('herbalist', 'gatherer', 'harvest', { harvest: 1.5, fight: 1.2 }),
  // Its morale share is the bard's, doubled (`SKILLS.minstrelMorale`).
  minstrel: advanced('minstrel', 'bard', undefined, { fight: 1.1 }),
};

const skillCache = new Map<ClassId, readonly SkillDef[]>();

/** Skills of a class: its own and those of the classes it comes from (chantier 37). */
export function classSkills(id: ClassId): readonly SkillDef[] {
  const cached = skillCache.get(id);
  if (cached) return cached;
  const def = CLASSES[id];
  const out: SkillDef[] = [];
  for (const parent of def.parents ?? [])
    for (const skill of classSkills(parent))
      if (!out.some((x) => x.id === skill.id)) out.push(skill);
  for (const skill of def.skills) if (!out.some((x) => x.id === skill.id)) out.push(skill);
  skillCache.set(id, out);
  return out;
}

/** Whether a class is this one or comes from it (a champion is of the warrior line). */
export function inLine(id: ClassId | null, root: ClassId): boolean {
  if (!id) return false;
  if (id === root) return true;
  return (CLASSES[id].parents ?? []).some((p) => inLine(p, root));
}
