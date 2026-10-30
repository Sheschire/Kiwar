import type { ShipId } from './expeditions';
import type { ResourceCost } from './resources';
import type { Posture } from './units';
import type { AssaultPriority } from '../battle/types';

/**
 * Chantier 40: the landing. One mission replaces the raids, the reconnaissance and the siege: the
 * ship lands on one parcel of an alien face, the crew fights its garrison with the battle engine
 * under orders given at the departure, and comes back with a beacon (victory), a dated glimpse
 * (retreat), or not at all (defeat: crew, ship and information lost).
 */

export const LANDING_PRIORITIES: readonly AssaultPriority[] = [
  'nearest',
  'air',
  'casters',
  'weakest',
];
export const LANDING_GOALS = ['burn', 'loot'] as const;
export type LandingGoal = (typeof LANDING_GOALS)[number];

/** Orders given before the departure (the battle follows them, nobody steers it live). */
export interface LandingOrders {
  posture: Posture;
  priority: AssaultPriority;
  /** The survivors run back to the ship once this share of the crew has fallen (0.3–0.8). */
  retreatAt: number;
  goal: LandingGoal;
}

export const LANDING = {
  /** Bounds and default of the retreat threshold (share of the crew fallen). */
  retreat: { min: 0.3, max: 0.8, step: 0.1, default: 0.5 },
  defaultOrders: {
    posture: 'cautious',
    priority: 'nearest',
    retreatAt: 0.5,
    goal: 'burn',
  } as LandingOrders,
  /** A breakdown delays the trip (× the travel time) and the ship lands with less hold. */
  breakdown: { delay: 1.5, cargo: 0.6 },
  /**
   * A lost ship is rebuilt at the launchpad (a repair of the launchpad): this cost × the ship of
   * the age it was lost at, and these hours by generation.
   */
  rebuild: {
    cost: { fiber: 400, juice: 250 } as ResourceCost,
    ship: { wood: 1, logs: 2, iron: 5, jet: 12, sail: 16 } as Record<ShipId, number>,
    hours: { wood: 4, logs: 6, iron: 10, jet: 16, sail: 20 } as Record<ShipId, number>,
  },
  /** Units of a parcel at most in a battle (more power makes them stronger, not more numerous). */
  maxGround: 24,
  maxAir: 16,
  /** A neighbouring parcel with a standing barracks sends this share of its garrison… */
  reinforce: { share: 0.25, delayS: 25 },
  /** Loot of a victory: the face's loot × the age × this share (the centre is richer). */
  loot: { burn: 0.25, loot: 1, inner: 2 },
  /** Experience of the survivors of a landing won (× the expedition's victory lump). */
  victoryXp: 2,
  /** A beacon shows the edge of the neighbouring parcels: their garrison within ± this share. */
  edgeSpread: 0.25,
  /** The ship lands this many tiles inside the parcel's outer edge. */
  inset: 1,
  /** Practice battles of the forecast (luck of the defenders' power). */
  trials: [0.85, 1, 1.15] as readonly number[],
  /** An unseen outer parcel is guessed from the public numbers within this spread. */
  guess: [0.75, 1.25] as const,
  /** A glimpse is fresh, stale or old after these game days (like the old reports). */
  fresh: 1,
  stale: 3,
  /** Hours of development a lost ship and each piece of gear left behind give the aliens. */
  defeat: { shipH: 4, gearH: 1 },
} as const;
