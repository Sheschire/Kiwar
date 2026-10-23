import { CAMP } from '../data/classes';
import { HUNGER_SCALE, NEEDS, type HungerStage } from '../data/needs';
import { emptyResources, type Resources } from '../data/resources';
import type { TimeMs } from '../types/ids';
import { seasonOf } from './calendar';
import { withRng, type GameState, type Villager } from './state';
import { modifiers } from './kiwis';
import { kikiwiwiUpkeep } from './kikiwiwi';

/** Kiwis eating from the colony stock (not away on an expedition). */
export function homeKiwis(state: GameState): Villager[] {
  return state.villagers.filter((v) => v.job.kind !== 'expedition');
}

/** Food eaten by the colony per hour (season appetite included, Kikiwiwis' juice too). */
/** Kiwis drilling at a training camp (chantier 37). */
export function drillingKiwis(state: GameState): number {
  const camps = state.buildings.filter((b) => b.type === 'trainingCamp');
  if (camps.length === 0) return 0;
  let n = 0;
  for (const v of state.villagers) {
    if (v.job.kind !== 'work') continue;
    const id = v.job.buildingId;
    if (camps.some((b) => b.id === id)) n++;
  }
  return n;
}

export function consumption(state: GameState): Resources {
  const out = emptyResources();
  // Gluttons count for more mouths.
  let mouths = 0;
  for (const v of homeKiwis(state)) mouths += modifiers(v).appetite;
  // Chantier 37: kiwis drilling at the training camp eat more.
  mouths += CAMP.drillAppetite * drillingKiwis(state);
  if (mouths === 0) return out;
  const appetite = NEEDS.appetite[seasonOf(state)];
  out.pulp = NEEDS.eat.pulp * mouths * appetite;
  out.juice = NEEDS.eat.juice * mouths * appetite + kikiwiwiUpkeep(state);
  return out;
}

const STAGE_ORDER: readonly HungerStage[] = ['fed', 'hungry', 'weak', 'starving'];

/** Raw gauge value where a stage starts. */
function threshold(stage: Exclude<HungerStage, 'fed'>): number {
  return NEEDS.stages[stage] * HUNGER_SCALE;
}

export function stageOf(hunger: number): HungerStage {
  if (hunger >= threshold('starving')) return 'starving';
  if (hunger >= threshold('weak')) return 'weak';
  if (hunger >= threshold('hungry')) return 'hungry';
  return 'fed';
}

export function hungerStage(state: GameState): HungerStage {
  return stageOf(state.hunger);
}

/** Hours of full privation on the hunger gauge (for the UI). */
export function hungerHours(state: GameState): number {
  return state.hunger / HUNGER_SCALE / 3_600_000;
}

/** Work multiplier of a hungry colony. */
export function hungerWork(state: GameState): number {
  return NEEDS.work[hungerStage(state)];
}

/** Whether a kiwi may starve to death now (guard rails for absent players and beginners). */
export function canStarve(state: GameState): boolean {
  const nest = state.buildings.find((b) => b.type === 'nest');
  return (
    state.villagers.length > NEEDS.minSurvivors &&
    (nest?.level ?? 0) >= NEEDS.protectedBelowNest &&
    homeKiwis(state).length > 0
  );
}

/**
 * Hunger gauge rate in raw units per ms: as fast as the share of food missing (weighted), or
 * recovering when every stock is fed. Integer, so offline progress is exact.
 */
export function hungerRate(state: GameState, deficit: { pulp: number; juice: number }): number {
  const share = NEEDS.weight.pulp * deficit.pulp + NEEDS.weight.juice * deficit.juice;
  if (share > 0) return Math.max(1, Math.round(HUNGER_SCALE * share));
  return state.hunger > 0 ? -HUNGER_SCALE * NEEDS.recovery : 0;
}

/** Highest value the gauge can reach (it stops at the last stage when nobody may die). */
export function hungerCap(state: GameState): number {
  return canStarve(state) ? Infinity : threshold('starving');
}

/** Next time the gauge crosses a stage threshold (a rate change), or Infinity. */
export function nextHungerEvent(state: GameState, rate: number): TimeMs {
  const h = state.hunger;
  if (rate > 0) {
    for (const stage of STAGE_ORDER.slice(1) as Exclude<HungerStage, 'fed'>[]) {
      const t = threshold(stage);
      if (h >= t) continue;
      return state.now + Math.max(1, Math.ceil((t - h) / rate));
    }
    // At the last stage: the next death.
    return canStarve(state) ? state.now : Infinity;
  }
  if (rate < 0) {
    for (const stage of ['starving', 'weak', 'hungry'] as const) {
      const t = threshold(stage);
      if (h < t) continue;
      return state.now + Math.floor((h - t) / -rate) + 1;
    }
  }
  return Infinity;
}

/**
 * Picks the kiwi that starves: frailer kiwis (low Endurance) first, drawn with the state RNG;
 * gluttons hold on longest (only when nobody else is left).
 */
export function pickStarving(state: GameState): Villager | undefined {
  const all = homeKiwis(state);
  const lean = all.filter((v) => v.trait !== 'glutton');
  const home = lean.length > 0 ? lean : all;
  if (home.length === 0) return undefined;
  const weights = home.map((v) => 1 / Math.max(1, v.stats.endurance));
  const total = weights.reduce((a, b) => a + b, 0);
  return withRng(state, (rng) => {
    let roll = rng.next() * total;
    for (let i = 0; i < home.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) return home[i];
    }
    return home[home.length - 1];
  });
}

/** Time until a stock runs out at a net rate per hour (null when it is not shrinking). */
export function foodLeftMs(stock: number, netPerHour: number): number | null {
  if (netPerHour >= 0) return null;
  return (stock / -netPerHour) * 3_600_000;
}
