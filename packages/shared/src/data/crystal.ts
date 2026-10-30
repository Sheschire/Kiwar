/**
 * Chantier 50: the rare stocks of the locules, kept apart from the shared storage like the
 * meteoric iron. Crystal (raphides) is cut in the raphide forests' galleries, in raw integer
 * units (exact offline), with a cap that grows with the Nest; it pays for glass (lenses),
 * crystal ammunition and the crystal tier of the Forge. Giant seeds are found in the locules
 * (whole units, a low cap by age); they are planted (locule trees) or hatched (locule eggs).
 * Every number here is a hypothesis, checked with the balance bot.
 */
export const CRYSTAL = {
  /** Stock cap (units) by Nest level (index 0–12). */
  cap: [40, 40, 40, 40, 40, 40, 40, 60, 80, 100, 150, 200, 260] as readonly number[],
  /** An average miner cuts this many units per hour in a raphide forest. */
  perHour: 0.5,
} as const;

/** Raw crystal units per unit (a gallery's rate is `1000 × perHour × work` raw units per ms). */
export const CRYSTAL_SCALE = 1000 * 3_600_000;

/** Crystal as whole units (what the UI shows and what costs are in). */
export function crystalUnits(raw: number): number {
  return Math.floor(raw / CRYSTAL_SCALE + 1e-9);
}

export const GIANT_SEEDS = {
  /** Stock cap (whole seeds) by age (index = age; the Age of the stars comes at chantier 51). */
  cap: [3, 3, 3, 5, 8] as readonly number[],
} as const;
