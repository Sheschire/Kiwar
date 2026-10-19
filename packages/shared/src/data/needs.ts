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
