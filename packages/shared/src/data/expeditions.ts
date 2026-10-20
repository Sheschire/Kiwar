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

/** Base numbers of an alien face, from its distance (public: the real garrison is drawn around them). */
export function alienDefOf(distance: number): ExpeditionTargetDef {
  return distance === 0 ? ALIEN_TWIN_FACE : alienFaceOnKiwi(distance);
}

/**
 * Chantier 07: the real alien garrisons are hidden. Each one is drawn from a secret seed around
 * the public base numbers; the player only knows what missions report.
 */
export const ALIENS = {
  /** Spread of the real base defense around the public number (×). */
  defenseSpread: [0.8, 1.3] as const,
  /** Spread of the real loot around the public number (×). */
  lootSpread: [0.8, 1.2] as const,
  /** Defense gained per game day, as a share of the base defense (drawn in this range). */
  growthPerDay: [0.02, 0.05] as const,
  /** The garrison stops growing at this multiple of its base defense (victories aside). */
  maxGrowth: 2,
  /** Defense brought by one ferret or one bat. */
  defensePerEnemy: 1,
  /** Share of ferrets in the garrison (the rest are bats), drawn in this range. */
  ferretShare: [0.35, 0.8] as const,
  /** Number of dens and roosts on the face: base + per kiwi of distance. */
  structures: { base: 6, perDistance: 2 },
  /** Structures stand at this distance from the heart, in hex steps. */
  structureRing: [2, 11] as const,
} as const;

/** What the player knows about alien faces (chantier 07). */
export const INTEL = {
  /** The face is cut into 6 slices × 2 rings: inner ring up to this hex distance. */
  innerRadius: 6,
  sectors: 12,
  /** Report age labels, in game days: fresh below `fresh`, stale below `stale`, then old. */
  fresh: 1,
  stale: 3,
} as const;
