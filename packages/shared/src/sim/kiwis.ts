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
import { DEPOSITS } from '../data/territory';
import type { Rng } from '../rng/rng';
import type { BuildingId, TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { faceMapOf, harvestedTileType } from './territory';
import { withRng, type Building, type GameState, type Villager } from './state';

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
  };
}

// ---------------------------------------------------------------------------------------------
// Modifiers and powers

export function modifiers(v: Villager): Required<KiwiModifiers> {
  const t = v.trait ? TRAITS[v.trait] : {};
  return {
    xp: t.xp ?? 1,
    practice: t.practice ?? 1,
    harvest: t.harvest ?? 1,
    build: t.build ?? 1,
    fight: t.fight ?? 1,
    exposure: t.exposure ?? 1,
    rations: t.rations ?? 1,
  };
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
  const rank = 1 + KIWI.rankBonus * rankOf(v.mastery[RESOURCE_MASTERY[resource]]);
  return Math.max(KIWI.minPower, dex * rank * m.harvest);
}

/** Construction speed of a builder (1 for an average newborn). */
export function builderSpeed(v: Villager): number {
  const m = modifiers(v);
  const str = 1 + KIWI.strengthBuild * (v.stats.strength - KIWI.stat.average);
  const rank = 1 + KIWI.rankBonus * rankOf(v.mastery.build);
  return Math.max(KIWI.minPower, str * rank * m.build);
}

/** Summed power of the workers of a building (replaces the head count in harvest maths). */
export function workforce(state: GameState, b: Building, workers: Villager[]): number {
  const resource = buildingResource(state, b);
  if (!resource) return workers.length;
  return workers.reduce((sum, v) => sum + workerPower(v, resource), 0);
}

// ---------------------------------------------------------------------------------------------
// Progress over time (exact: integer units, constant rates between events)

interface KiwiRates {
  xp: number;
  practice: number;
  mastery: MasteryId | null;
}

function ratesOf(
  state: GameState,
  v: Villager,
  resources: Map<BuildingId, ResourceId | null>,
): KiwiRates {
  const job = v.job;
  let perHour = 0;
  let mastery: MasteryId | null = null;
  if (job.kind === 'work') {
    perHour = KIWI.xpPerHour.work;
    let resource = resources.get(job.buildingId);
    if (resource === undefined) {
      const b = state.buildings.find((x) => x.id === job.buildingId);
      resource = b ? buildingResource(state, b) : null;
      resources.set(job.buildingId, resource);
    }
    mastery = resource ? RESOURCE_MASTERY[resource] : null;
  } else if (job.kind === 'build') {
    perHour = KIWI.xpPerHour.build;
    mastery = 'build';
  }
  if (perHour === 0) return { xp: 0, practice: 0, mastery: null };
  const m = modifiers(v);
  const spirit = 1 + KIWI.spiritXp * (v.stats.spirit - KIWI.stat.average);
  // Raw units per ms are integers, so accrued amounts stay exact whatever the step size.
  const xp = v.level >= KIWI.maxLevel ? 0 : Math.max(1, Math.round(perHour * 100 * spirit * m.xp));
  const practice =
    mastery && rankOf(v.mastery[mastery]) < KIWI.maxRank
      ? Math.max(1, Math.round(100 * m.practice))
      : 0;
  return { xp, practice, mastery: practice > 0 ? mastery : null };
}

/** Next time a kiwi levels up or gains a mastery rank (a rate change for the colony). */
export function nextKiwiEvent(state: GameState): TimeMs {
  let next = Infinity;
  const resources = new Map<BuildingId, ResourceId | null>();
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
  }
  return next;
}

/** Adds `dtMs` of experience and practice to every kiwi; level-ups happen at `at`. */
export function accrueKiwis(state: GameState, dtMs: number, at: TimeMs, events: GameEvent[]): void {
  const resources = new Map<BuildingId, ResourceId | null>();
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
    if (r.xp > 0) {
      v.xp += r.xp * dtMs;
      levelUps(state, v, at, events);
    }
  }
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
