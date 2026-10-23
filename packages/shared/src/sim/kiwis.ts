import { KIKIWIWI } from '../data/kikiwiwi';
import {
  KIWI,
  MASTERY_IDS,
  PRACTICE_SCALE,
  RESOURCE_MASTERY,
  SHINY_COLORS,
  STAT_IDS,
  TRAIT_IDS,
  TRAITS,
  XP_SCALE,
  masteryHours,
  xpForLevel,
  type KiwiModifiers,
  type Masteries,
  type MasteryId,
  type ShinyColor,
  type StatId,
  type Stats,
  type TraitId,
} from '../data/kiwis';
import type { ResourceId } from '../data/resources';
import {
  CAMP,
  CLASSES,
  CLASS_RULES,
  classSkills,
  inLine,
  SKILLS,
  type ClassId,
  type SkillId,
} from '../data/classes';
import { levelDef } from '../data/buildings';
import { RESOURCE_IDS, type ResourceCost } from '../data/resources';
import { DEPOSITS } from '../data/territory';
import { THREATS } from '../data/threats';
import type { Rng } from '../rng/rng';
import type { BuildingId, TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { faceMapOf, harvestedTileType } from './territory';
import { hungerWork } from './needs';
import { bedsOf, moraleWork, presence } from './rest';
import { withRng, type Building, type GameState, type Villager } from './state';
import { ageOf } from './research';

// ---------------------------------------------------------------------------------------------
// Birth

export interface KiwiRoll {
  stats: Stats;
  trait: TraitId | null;
  shiny: ShinyColor | null;
}

/** Draws the innate part of a kiwi: six stats (bounded total), a rare trait, a very rare shiny. */
export function rollKiwi(rng: Rng): KiwiRoll {
  const { min, max } = KIWI.stat;
  const stats = Object.fromEntries(STAT_IDS.map((id) => [id, min])) as Stats;
  let points = rng.int(KIWI.statTotal.min, KIWI.statTotal.max) - min * STAT_IDS.length;
  while (points > 0) {
    const id = rng.pick(STAT_IDS);
    if (stats[id] >= max) continue;
    stats[id]++;
    points--;
  }
  const trait = rng.chance(KIWI.traitChance) ? rng.pick(TRAIT_IDS) : null;
  const shiny = rollShiny(rng);
  return { stats, trait, shiny };
}

/** 1 chance in 512, then one of four colours. */
export function rollShiny(rng: Rng): ShinyColor | null {
  return rng.next() < KIWI.shinyChance ? rng.pick(SHINY_COLORS) : null;
}

export function emptyMasteries(): Masteries {
  return Object.fromEntries(MASTERY_IDS.map((id) => [id, 0])) as Masteries;
}

/** Everything a newborn kiwi starts with besides its id, name and birth date. */
export function newKiwi(roll: KiwiRoll): Omit<Villager, 'id' | 'name' | 'bornAt' | 'job'> {
  return {
    ...roll,
    stats: { ...roll.stats },
    level: 1,
    xp: 0,
    statPoints: 0,
    mastery: emptyMasteries(),
    history: { expeditions: 0, victories: 0, built: 0 },
    classId: null,
    classXp: 0,
    skillReadyAt: {},
  };
}

// ---------------------------------------------------------------------------------------------
// Modifiers and powers

const MODIFIER_KEYS = [
  'xp',
  'practice',
  'harvest',
  'build',
  'fight',
  'exposure',
  'rations',
  'weight',
  'rest',
  'appetite',
  'research',
  'repair',
] as const satisfies readonly (keyof KiwiModifiers)[];

/** Trait × class (grown by its stat) × unlocked passive skills. */
const modifierCache = new Map<string, Readonly<Required<KiwiModifiers>>>();

/** Modifiers where less is better (a class bonus grows by going down). */
const LOWER_IS_BETTER = new Set<keyof KiwiModifiers>([
  'exposure',
  'rations',
  'weight',
  'rest',
  'appetite',
]);

/** Chantier 37: the class stat of a kiwi (the lower of two for a master class). */
function classStat(v: Villager): number {
  if (!v.classId) return 0;
  const c = CLASSES[v.classId];
  return c.stat2 ? Math.min(v.stats[c.stat], v.stats[c.stat2]) : v.stats[c.stat];
}

/** Chantier 37: rank in the current class, 1–5 (0: no class). */
export function classRank(v: Pick<Villager, 'classId' | 'classXp'>): number {
  if (!v.classId) return 0;
  let rank = 1;
  while (rank < CAMP.maxRank && v.classXp >= CAMP.rankHours[rank + 1]! * PRACTICE_SCALE) rank++;
  return rank;
}

/** Class rank and hours of practice towards the next one (for the UI). */
export function classRankProgress(v: Villager): {
  rank: number;
  hours: number;
  next: number | null;
} {
  const rank = classRank(v);
  return {
    rank,
    hours: v.classXp / PRACTICE_SCALE,
    next: rank > 0 && rank < CAMP.maxRank ? CAMP.rankHours[rank + 1]! : null,
  };
}

/**
 * Chantier 37: how much a class's colony bonus grows with its stat (+2 % per point above 5)
 * and its rank (+3 % per rank above the first); 1 without a class.
 */
export function classGrowth(v: Villager): number {
  if (!v.classId) return 1;
  const stat = 1 + CLASS_RULES.growth * Math.max(0, classStat(v) - KIWI.stat.average);
  return stat * (1 + CLASS_RULES.rankBonus * (classRank(v) - 1));
}

export function modifiers(v: Villager): Readonly<Required<KiwiModifiers>> {
  // Only the trait, the Kikiwiwi infusion, the class with its level, stat and rank matter
  // (asked per worker, many times per tick).
  const c = v.classId ? CLASSES[v.classId] : null;
  const key = `${v.trait ?? ''}|${v.kikiwiwi ? 1 : 0}|${v.classId ?? ''}|${c ? v.level : 0}|${c ? classStat(v) : 0}|${c ? classRank(v) : 0}`;
  const cached = modifierCache.get(key);
  if (cached) return cached;
  const out = Object.fromEntries(MODIFIER_KEYS.map((k) => [k, 1])) as Required<KiwiModifiers>;
  const apply = (m: KiwiModifiers | undefined) => {
    if (m) for (const k of MODIFIER_KEYS) out[k] *= m[k] ?? 1;
  };
  apply(v.trait ? TRAITS[v.trait] : undefined);
  if (v.kikiwiwi) apply(KIKIWIWI.modifiers);
  if (c) {
    apply(c.modifiers);
    for (const skill of classSkills(c.id)) if (v.level >= skill.level) apply(skill.modifiers);
    if (c.grows) {
      const g = classGrowth(v);
      out[c.grows] = LOWER_IS_BETTER.has(c.grows) ? out[c.grows] / g : out[c.grows] * g;
    }
  }
  modifierCache.set(key, Object.freeze(out));
  return out;
}

/** Whether a kiwi has unlocked a skill (its class and level). */
export function hasSkill(v: Villager, skill: SkillId): boolean {
  if (!v.classId) return false;
  const def = classSkills(v.classId).find((x) => x.id === skill);
  return !!def && v.level >= def.level;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < KIWI.maxLevel && xp >= xpForLevel(level + 1) * XP_SCALE) level++;
  return level;
}

export function rankOf(practice: number): number {
  let rank = 0;
  while (rank < KIWI.maxRank && practice >= masteryHours(rank + 1) * PRACTICE_SCALE) rank++;
  return rank;
}

/** Experience and next-level progress, in experience points (for the UI). */
export function levelProgress(v: Villager): { xp: number; current: number; next: number | null } {
  return {
    xp: v.xp / XP_SCALE,
    current: xpForLevel(v.level),
    next: v.level < KIWI.maxLevel ? xpForLevel(v.level + 1) : null,
  };
}

/** Mastery rank and hours of practice towards the next one (for the UI). */
export function masteryProgress(
  v: Villager,
  id: MasteryId,
): { rank: number; hours: number; next: number | null } {
  const rank = rankOf(v.mastery[id]);
  return {
    rank,
    hours: v.mastery[id] / PRACTICE_SCALE,
    next: rank < KIWI.maxRank ? masteryHours(rank + 1) : null,
  };
}

/** Resource harvested by a building (null if it harvests nothing). */
export function buildingResource(state: GameState, b: Building): ResourceId | null {
  const type = harvestedTileType(faceMapOf(state), b);
  return type ? (DEPOSITS[type]?.resource ?? null) : null;
}

/**
 * How much a kiwi brings to a workplace, 1 for an average newborn: Dexterity, the mastery of
 * this resource and its trait.
 */
export function workerPower(v: Villager, resource: ResourceId): number {
  const m = modifiers(v);
  const dex = 1 + KIWI.dexterityBonus * (v.stats.dexterity - KIWI.stat.average);
  const carry = 1 + KIWI.agilityCarry * (v.stats.agility - KIWI.stat.average);
  const rank = 1 + KIWI.rankBonus * rankOf(v.mastery[RESOURCE_MASTERY[resource]]);
  return Math.max(KIWI.minPower, dex * carry * rank * m.harvest);
}

/** Construction speed of a builder (1 for an average newborn). */
export function builderSpeed(v: Villager): number {
  const m = modifiers(v);
  const str = 1 + KIWI.strengthBuild * (v.stats.strength - KIWI.stat.average);
  const rank = 1 + KIWI.rankBonus * rankOf(v.mastery.build);
  return Math.max(KIWI.minPower, str * rank * m.build);
}

/** Fighting strength of one kiwi in an expedition (1 for an average newborn). */
export function kiwiStrength(v: Villager): number {
  const f = KIWI.fight;
  const avg = KIWI.stat.average;
  const stats = 1 + f.strength * (v.stats.strength - avg) + f.endurance * (v.stats.endurance - avg);
  return Math.max(KIWI.minPower, stats * (1 + f.perLevel * (v.level - 1)) * modifiers(v).fight);
}

/**
 * Relative chance to be among the losses of an expedition: inversely proportional to strength,
 * agility and endurance (an invested kiwi survives more often, never always).
 */
export function kiwiExposure(v: Villager): number {
  const e = KIWI.exposure;
  const avg = KIWI.stat.average;
  const dodge = Math.max(0.5, 1 + e.agility * (v.stats.agility - avg));
  const tough = Math.max(0.5, 1 + e.endurance * (v.stats.endurance - avg));
  return modifiers(v).exposure / (kiwiStrength(v) * dodge * tough);
}

/** Summed power of the workers of a building (replaces the head count in harvest maths). */
export function workforce(state: GameState, b: Building, workers: Villager[]): number {
  // Everybody is hiding in the Nest from a wave.
  if (state.threats.shelterUntil > state.now) return 0;
  const damaged = b.damaged ? THREATS.damagedWork : 1;
  const resource = buildingResource(state, b);
  if (!resource) return workers.length * damaged;
  return crewWork(state, workers, resource) * damaged;
}

/**
 * Summed power of kiwis harvesting a resource, as they work right now: each its share of the
 * day (rest and the walk to its bed aside), hunger, morale and the mayor's speech; 0 in a
 * shelter. Also used by the meteorite craters (chantier 15).
 */
export function crewWork(
  state: GameState,
  workers: readonly Villager[],
  resource: ResourceId,
): number {
  if (state.threats.shelterUntil > state.now) return 0;
  const beds = bedsOf(state);
  const sum = workers.reduce(
    (total, v) => total + workerPower(v, resource) * presence(state, v, beds.get(v.id)),
    0,
  );
  return sum * colonyBonus(state) * hungerWork(state) * moraleWork(state, beds);
}

/** The mayor at home, if any. */
export function mayorOf(state: GameState): Villager | undefined {
  return state.villagers.find(
    (v) => v.classId === 'mayor' && v.job.kind !== 'expedition' && v.job.kind !== 'outpost',
  );
}

/** Harvest multiplier of the whole colony: the mayor's speech (a short boost). */
export function colonyBonus(state: GameState): number {
  if (!mayorOf(state) || state.speechUntil <= state.now) return 1;
  return 1 + SKILLS.speechBonus;
}

/**
 * The mayor's lasting effect, on morale (chantier 04): Charisma and Organisation lift the
 * whole colony (0 without a mayor at home).
 */
export function mayorMorale(state: GameState): number {
  const mayor = mayorOf(state);
  if (!mayor) return 0;
  let bonus = SKILLS.mayorPerCharisma * mayor.stats.charisma;
  if (hasSkill(mayor, 'organisation')) bonus += SKILLS.organisationBonus;
  return bonus;
}

/** Regrowth multiplier of a building's deposits (gatherers with Green thumb working there). */
export function regenBonus(workers: Villager[]): number {
  let gatherers = 0;
  for (const v of workers)
    if (hasSkill(v, 'greenThumb'))
      gatherers +=
        v.classId === 'druid'
          ? SKILLS.druidRegen
          : inLine(v.classId, 'herbalist')
            ? SKILLS.herbalistRegen
            : 1;
  return 1 + SKILLS.greenThumbRegen * gatherers;
}

/** Chantier 37: repair speed of a builder (construction speed × the repair bonus). */
export function repairSpeed(v: Villager): number {
  return builderSpeed(v) * modifiers(v).repair;
}

/**
 * Chantier 37: the bards' lasting effect on morale, +1 % each (grown by Charisma, Ballad × 1.5),
 * at most 5 % (bards at home only).
 */
export function bardMorale(state: GameState): number {
  let sum = 0;
  for (const v of state.villagers) {
    if (!inLine(v.classId, 'bard') || v.job.kind === 'expedition' || v.job.kind === 'outpost')
      continue;
    const ballad = hasSkill(v, 'ballad') ? SKILLS.balladBonus : 1;
    const minstrel = inLine(v.classId, 'minstrel') ? SKILLS.minstrelMorale : 1;
    sum += SKILLS.bardMorale * classGrowth(v) * ballad * minstrel;
  }
  return Math.min(SKILLS.bardMax, sum);
}

// ---------------------------------------------------------------------------------------------
// Progress over time (exact: integer units, constant rates between events)

interface KiwiRates {
  xp: number;
  practice: number;
  mastery: MasteryId | null;
  /** Chantier 37: class practice (drill at the training camp). */
  drill: number;
}

/** Chantier 37: class practice per ms of a kiwi drilling at a camp of this level (an integer). */
export function drillRate(v: Villager, campLevel: number): number {
  if (!v.classId || classRank(v) >= CAMP.maxRank) return 0;
  const k = CAMP.drill[Math.min(campLevel, CAMP.drill.length) - 1] ?? 1;
  return Math.max(1, Math.round(100 * k * modifiers(v).practice));
}

/** Mastery practised at a workplace: its resource, or research at the Library. */
function workMastery(state: GameState, b: Building | undefined): MasteryId | null {
  if (!b) return null;
  if (b.type === 'library') return 'research';
  // Chantier 38: smiths practise handiwork.
  if (b.type === 'forge') return 'build';
  const resource = buildingResource(state, b);
  return resource ? RESOURCE_MASTERY[resource] : null;
}

function ratesOf(
  state: GameState,
  v: Villager,
  masteries: Map<BuildingId, MasteryId | null>,
): KiwiRates {
  const job = v.job;
  let perHour = 0;
  let mastery: MasteryId | null = null;
  let drill = 0;
  if (job.kind === 'work') {
    const camp = state.buildings.find((x) => x.id === job.buildingId);
    if (camp?.type === 'trainingCamp') drill = drillRate(v, camp.level);
    perHour = KIWI.xpPerHour.work;
    let m = masteries.get(job.buildingId);
    if (m === undefined) {
      m = workMastery(
        state,
        state.buildings.find((x) => x.id === job.buildingId),
      );
      masteries.set(job.buildingId, m);
    }
    mastery = m;
  } else if (job.kind === 'build') {
    perHour = KIWI.xpPerHour.build;
    mastery = 'build';
  } else if (job.kind === 'meteor') {
    // A crater is harvested like a workplace of its resource.
    const m = state.sky.meteors.find((x) => x.id === job.meteorId);
    perHour = KIWI.xpPerHour.work;
    mastery = m ? RESOURCE_MASTERY[m.resource] : null;
  } else if (job.kind === 'train' || job.kind === 'transform') {
    perHour = KIWI.xpPerHour.train;
  } else if (job.kind === 'guard' || job.kind === 'titan' || job.kind === 'stardust') {
    perHour = KIWI.xpPerHour.guard;
  }
  if (perHour === 0) return { xp: 0, practice: 0, mastery: null, drill };
  const m = modifiers(v);
  const spirit = 1 + KIWI.spiritXp * (v.stats.spirit - KIWI.stat.average);
  // Raw units per ms are integers, so accrued amounts stay exact whatever the step size.
  const xp = v.level >= KIWI.maxLevel ? 0 : Math.max(1, Math.round(perHour * 100 * spirit * m.xp));
  const practice =
    mastery && rankOf(v.mastery[mastery]) < KIWI.maxRank
      ? Math.max(1, Math.round(100 * m.practice))
      : 0;
  return { xp, practice, mastery: practice > 0 ? mastery : null, drill };
}

/** Next time a kiwi levels up or gains a mastery rank (a rate change for the colony). */
export function nextKiwiEvent(state: GameState): TimeMs {
  let next = Infinity;
  const resources = new Map<BuildingId, MasteryId | null>();
  for (const v of state.villagers) {
    const r = ratesOf(state, v, resources);
    if (r.xp > 0) {
      const need = xpForLevel(v.level + 1) * XP_SCALE - v.xp;
      next = Math.min(next, state.now + Math.max(1, Math.ceil(need / r.xp)));
    }
    if (r.mastery) {
      const rank = rankOf(v.mastery[r.mastery]);
      const need = masteryHours(rank + 1) * PRACTICE_SCALE - v.mastery[r.mastery];
      next = Math.min(next, state.now + Math.max(1, Math.ceil(need / r.practice)));
    }
    if (r.drill > 0) {
      const need = CAMP.rankHours[classRank(v) + 1]! * PRACTICE_SCALE - v.classXp;
      next = Math.min(next, state.now + Math.max(1, Math.ceil(need / r.drill)));
    }
  }
  return next;
}

/** Adds `dtMs` of experience and practice to every kiwi; level-ups happen at `at`. */
export function accrueKiwis(state: GameState, dtMs: number, at: TimeMs, events: GameEvent[]): void {
  const resources = new Map<BuildingId, MasteryId | null>();
  for (const v of state.villagers) {
    const r = ratesOf(state, v, resources);
    if (r.mastery) {
      const before = rankOf(v.mastery[r.mastery]);
      v.mastery[r.mastery] += r.practice * dtMs;
      const after = rankOf(v.mastery[r.mastery]);
      if (after > before) {
        events.push({
          type: 'masteryUp',
          at,
          villagerId: v.id,
          name: v.name,
          mastery: r.mastery,
          rank: after,
        });
      }
    }
    if (r.drill > 0) addClassXp(v, r.drill * dtMs, at, events);
    if (r.xp > 0) {
      v.xp += r.xp * dtMs;
      levelUps(state, v, at, events);
    }
  }
}

function addClassXp(v: Villager, raw: number, at: TimeMs, events: GameEvent[]): void {
  const before = classRank(v);
  v.classXp += raw;
  const after = classRank(v);
  if (after > before)
    events.push({ type: 'classRankUp', at, villagerId: v.id, name: v.name, rank: after });
}

/** Chantier 37: a lump of class practice (a wave fought, an expedition), in hours. */
export function grantClassXp(v: Villager, hours: number, at: TimeMs, events: GameEvent[]): void {
  if (!v.classId || v.kikiwiwi || classRank(v) >= CAMP.maxRank) return;
  addClassXp(v, Math.round(hours * modifiers(v).practice * 100) * 3_600_000, at, events);
}

/** A lump of experience (expedition), in experience points. */
export function grantXp(
  state: GameState,
  v: Villager,
  points: number,
  at: TimeMs,
  events: GameEvent[],
): void {
  if (v.level >= KIWI.maxLevel) return;
  v.xp += Math.round(points * modifiers(v).xp) * XP_SCALE;
  levelUps(state, v, at, events);
}

function levelUps(state: GameState, v: Villager, at: TimeMs, events: GameEvent[]): void {
  const target = levelForXp(v.xp);
  while (v.level < target) {
    v.level++;
    let stat: StatId | null = null;
    if (v.level % 2 === 1) {
      stat = withRng(state, (rng) => pickStat(rng, v));
      if (stat) v.stats[stat]++;
    } else {
      v.statPoints++;
    }
    events.push({ type: 'levelUp', at, villagerId: v.id, name: v.name, level: v.level, stat });
  }
}

/** Automatic stat point: weighted by what the kiwi is doing, among stats below the cap. */
function pickStat(rng: Rng, v: Villager): StatId | null {
  const kind =
    v.job.kind === 'work' || v.job.kind === 'build' || v.job.kind === 'expedition'
      ? v.job.kind
      : 'other';
  const weights = KIWI.autoStatWeights[kind];
  const open = STAT_IDS.filter((id) => v.stats[id] < KIWI.stat.cap);
  const total = open.reduce((sum, id) => sum + weights[id], 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const id of open) {
    roll -= weights[id];
    if (roll < 0) return id;
  }
  return open[open.length - 1]!;
}

/** Price of a class for this kiwi (changing class costs more). */
export type TrainLock =
  | 'classLocked'
  | 'levelTooLow'
  | 'statTooLow'
  | 'rankTooLow'
  | 'wrongClass'
  | 'alreadyThisClass'
  | 'kikiwiwiNoWork';

/**
 * Why a kiwi cannot start this class at this School or training camp (null: it can, cost and
 * room aside). Chantier 37: the School teaches tier 1 (its stat ≥ 6); the camp changes a class
 * for another tier 1 and promotes: tier 2 from its parent (level 10, stat ≥ 10, rank 3), tier 3
 * from either parent (Iron age, level 20, both stats ≥ 12, rank 3).
 */
export function trainLock(
  state: GameState,
  v: Villager,
  classId: ClassId,
  place: Building,
): TrainLock | null {
  const def = CLASSES[classId];
  if (!def) return 'classLocked';
  if (v.kikiwiwi) return 'kikiwiwiNoWork';
  const camp = place.type === 'trainingCamp';
  if (!camp && def.tier !== 1) return 'classLocked';
  // The camp only works with kiwis that already have a trade.
  if (camp && !v.classId) return 'wrongClass';
  if (place.level < (camp && def.tier === 1 ? 1 : def.schoolLevel)) return 'classLocked';
  if (ageOf(state) < (def.age ?? 0)) return 'classLocked';
  if (v.classId === classId) return 'alreadyThisClass';
  if (def.tier > 1 && !def.parents?.includes(v.classId!)) return 'wrongClass';
  if (v.level < def.minLevel) return 'levelTooLow';
  const min = CLASS_RULES.statMin[def.tier]!;
  if (v.stats[def.stat] < min || (def.stat2 && v.stats[def.stat2] < min)) return 'statTooLow';
  if (def.tier > 1 && classRank(v) < CLASS_RULES.promoteRank) return 'rankTooLow';
  return null;
}

/**
 * Price of a class: the School charges a change of class twice; the camp a quarter more, and a
 * promotion its price.
 */
export function trainingCost(v: Villager, classId: ClassId, place?: Building): ResourceCost {
  const camp = place?.type === 'trainingCamp';
  const promotion = CLASSES[classId].tier > 1;
  const k = !v.classId || promotion ? 1 : camp ? CAMP.retrainCost : SKILLS.retrainCost;
  const out: ResourceCost = {};
  const cost = CLASSES[classId].cost;
  for (const id of RESOURCE_IDS) if (cost[id]) out[id] = Math.round(cost[id]! * k);
  return out;
}

/** Training time of a class at a School or a camp (faster at higher levels). */
export function trainingDuration(place: Building, classId: ClassId): number {
  const speed = levelDef(place.type, place.level)?.trainingTime ?? 1;
  return Math.round(CLASSES[classId].trainingMs * speed);
}
