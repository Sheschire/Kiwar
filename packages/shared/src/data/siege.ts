import { ms } from './curves';

/**
 * Chantier 19, reshaped by chantier 42: the ferret queen of the twin face. Her base power and her
 * starting parcel are drawn from the garrison's secret seed (`queenTruth`), so the queen of an
 * older game stays where it was found.
 */
export const SIEGE = {
  /** The ferret queen: ground (ferrets) and air (bats) power, before her parcel's growth. */
  queen: {
    ground: 24,
    air: 14,
    spread: [0.85, 1.2] as const,
  },
  /** Old bridgeheads drawn before the queen in the seed's stream (kept for older games). */
  oldHolds: 6,
  /**
   * Chantier 42: the final battle. Once our 12 beacons light the twin, the queen comes out of
   * the depths at its centre. She is one giant unit; her hit points and blows grow with her
   * ground power (× her parcel's growth) by √(power / `ground`), like the predators of a wave.
   */
  final: {
    hp: 900,
    armor: 0.3,
    speed: 0.55,
    size: 3,
    dodge: 0,
    /** Share of her parcel's garrison standing beside her at the start. */
    escort: 0.3,
    /** Under 75 % of her hit points she calls the bats (× her air power). */
    swarm: { below: 0.75, share: 1, delayS: 2 },
    /** Under 50 % elite ferrets come out of the tunnels (× her ground power, an age ahead). */
    tunnels: { below: 0.5, share: 0.6, delayS: 3, tiles: 2 },
    /** Under 25 % the last stand: she rages. */
    rage: { below: 0.25, damage: 1.6, speed: 1.4 },
    /** The final battle lasts at most this long. */
    maxS: 480,
    /** Her wounds of a lost battle heal over this long. */
    healMs: ms.h(72),
    /** The queen's treasure: the face's loot × the age × this (hold-limited). */
    loot: 4,
  },
} as const;
