import { ms } from './curves';
import type { Resources } from './resources';

/**
 * Expeditions to other faces. Planning puzzle: every crew member weighs in the ship and must be
 * fed for the whole round trip; provisions also take room that the loot needs on the way back.
 */
export const EXPEDITIONS = {
  /** Cargo units taken by one kiwi. */
  kiwiWeight: 10,
  /** Cargo units taken by one unit of any resource (provisions or loot). */
  resourceWeight: 0.1,
  /** What one crew member eats and drinks per hour of travel. */
  hourlyRations: { pulp: 4, juice: 2 },
  minCrew: 2,
  /** At least this many kiwis must stay home. */
  keepHome: 1,
  /** Fighting strength of a basic kiwi (specialised units will come later). */
  strengthPerKiwi: 1,
  /** Strength multiplier of a completely starving crew (fed crews fight at 1). */
  starvingStrength: 0.5,
  /** ± random swing on the crew strength, drawn from the seeded game RNG. */
  luck: 0.1,
  /** Losses: share of the crew lost in a victory (scaled by defense/strength) / in a defeat. */
  victoryLosses: { factor: 0.25, max: 0.6 },
  defeatLosses: { min: 0.5, max: 0.9 },
  /** Share of survivors lost per missing share of rations on the way back. */
  starvationLossRate: 0.5,
} as const;

export interface ExpeditionTargetDef {
  /** Base defense of the alien garrison. */
  defense: number;
  /** Defense added after each victory against it (the aliens reinforce). */
  reinforce: number;
  /** Loot available on a victory (before cargo limits). */
  loot: Resources;
  /** One-way travel time from a level-1 launchpad. */
  travelMs: number;
}

/** The alien garrison holding the other face of your own kiwi. */
export const ALIEN_TWIN_FACE: ExpeditionTargetDef = {
  defense: 6,
  reinforce: 3,
  loot: { pulp: 240, fiber: 120, seeds: 120, juice: 180 },
  travelMs: ms.min(90),
};

/** Alien faces on other kiwis of a shared universe are further away and richer. */
export function alienFaceOnKiwi(distance: number): ExpeditionTargetDef {
  return {
    defense: 10 + 4 * distance,
    reinforce: 3 + distance,
    loot: { pulp: 300, fiber: 160, seeds: 150 + 60 * distance, juice: 220 + 80 * distance },
    travelMs: ms.min(90 + 60 * distance),
  };
}
