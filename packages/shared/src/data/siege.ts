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
} as const;
