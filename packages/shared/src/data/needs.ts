import { ms } from './curves';
import type { Season } from './cycles';
import type { Resources } from './resources';

/**
 * Chantier 04: kiwis eat pulp and drink juice all the time (kiwis away on an expedition live on
 * their provisions). When a stock runs dry the colony goes hungry: a colony-wide hunger gauge
 * fills up (as fast as the share of food missing), with stages that slow work down, then a kiwi
 * starves now and then. Guard rails keep an absent player from losing everything.
 */
export const NEEDS = {
  /** Eaten per kiwi at home and per hour. */
  eat: { pulp: 30, fiber: 0, seeds: 0, juice: 10 } satisfies Resources,
  /** Appetite by season (less in summer, more in winter). */
  appetite: { spring: 1, summer: 0.8, autumn: 1, winter: 1.3 } satisfies Record<Season, number>,
  /** Weight of each food in the hunger gauge (missing pulp hurts more than missing juice). */
  weight: { pulp: 2 / 3, juice: 1 / 3 },
  /** Hunger gauge (hours of full privation) where each stage starts. */
  stages: { hungry: ms.h(2), weak: ms.h(8), starving: ms.h(18) },
  /** Work multiplier by stage. */
  work: { fed: 1, hungry: 0.7, weak: 0.4, starving: 0.4 },
  /** A fed colony recovers this many hours of hunger per hour. */
  recovery: 3,
  /** A death relieves the gauge by this much: never more than one death per 6 hours. */
  deathRelief: ms.h(6),
  /** The last kiwis never starve to death. */
  minSurvivors: 2,
  /** No death before this Nest level (beginners). */
  protectedBelowNest: 2,
  /** Warn when a food stock lasts less than this. */
  warnMs: ms.h(6),
} as const;

export type HungerStage = 'fed' | 'hungry' | 'weak' | 'starving';

/** Raw hunger units per millisecond of full privation (integers keep offline progress exact). */
export const HUNGER_SCALE = 100;

/**
 * Fatigue and rest (aggregated model): every kiwi needs a share of the day to rest besides the
 * night. It rests in its bed — the nearest free bed (housing of the Nest and the huts) to its
 * workplace — so the walk to bed costs work time: huts near the work sites pay off. The share
 * of time a kiwi spends at work is constant between two events.
 */
export const REST = {
  /** Share of the day an average kiwi spends resting (sleep at night is the night work cut). */
  base: 0.12,
  /** Each point of Endurance above average shortens rest by 4 %. */
  endurance: 0.04,
  /** Fatigue by season (the summer heat tires kiwis faster). */
  season: { spring: 1, summer: 1.3, autumn: 1, winter: 1.1 } satisfies Record<Season, number>,
  /** Every step between the work and the bed lengthens each break by this share. */
  commute: 0.08,
  /** A kiwi without a bed sleeps outside and recovers twice slower. */
  noBed: 2,
  /** Never less than this share of the time at work (night aside). */
  minPresence: 0.5,
  /** Cosmetic work/rest cycle length (fatigue gauge, kiwis going to bed in 3D). */
  cycleMs: ms.min(45),
} as const;

/**
 * Colony morale: small bonus or malus on all work (±10 %), from things the player controls.
 * Every factor only changes at an event (stage change, season, layout, speech, mourning).
 */
export const MORALE = {
  max: 0.1,
  /** Fed colony vs hungry colony. */
  fed: 0.03,
  hungry: -0.05,
  /** Beds close to the work: +comfort when every kiwi sleeps within `near` steps of its work,
   * −comfort when none does (linear in between). */
  comfort: 0.03,
  near: 4,
  /** The mayor's speech lifts spirits. */
  speech: 0.03,
  /** After a death, the colony mourns for a day. */
  mourning: -0.06,
  mourningMs: ms.h(24),
  season: { spring: 0.02, summer: 0, autumn: 0, winter: -0.02 } satisfies Record<Season, number>,
} as const;
