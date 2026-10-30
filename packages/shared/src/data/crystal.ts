/**
 * Chantier 50: the rare stocks of the locules, kept apart from the shared storage like the
 * meteoric iron. Crystal (raphides) is cut in the raphide forests' galleries, in raw integer
 * units (exact offline), with a cap that grows with the Nest; it pays for glass (lenses),
 * crystal ammunition and the crystal tier of the Forge. Giant seeds are found in the locules
 * (whole units, a low cap by age); they are planted (locule trees) or hatched (locule eggs).
 * Every number here is a hypothesis, checked with the balance bot.
 */
export const CRYSTAL = {
  /** Stock cap (units) by Nest level (index 0–15). */
  cap: [40, 40, 40, 40, 40, 40, 40, 60, 80, 100, 150, 200, 260, 320, 380, 450] as readonly number[],
  /** An average miner cuts this many units per hour in a raphide forest. */
  perHour: 0.5,
  /** A lens fitted on a turret (technology `glass`): its crystal, and the range it adds. */
  lens: { crystal: 12, range: 1 },
  /**
   * Crystal ammunition (technology `crystalCut`): each seed turret of a battle costs this much
   * crystal at the strike, and its shots pierce this share of the armour.
   */
  ammo: { perTurret: 2, pierce: 0.6 },
  /** Chantier 51: crystal paid by building levels 13+ (index = level), like the iron at 7+. */
  levels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 45, 60] as readonly number[],
  /** Crystal of the levels with their own number (index = level). */
  own: { monument: [0, 0, 0, 0, 120] } as Partial<Record<string, readonly number[]>>,
} as const;

/** Raw crystal units per unit (a gallery's rate is `1000 × perHour × work` raw units per ms). */
export const CRYSTAL_SCALE = 1000 * 3_600_000;

/** Crystal as whole units (what the UI shows and what costs are in). */
export function crystalUnits(raw: number): number {
  return Math.floor(raw / CRYSTAL_SCALE + 1e-9);
}

export const GIANT_SEEDS = {
  /** Stock cap (whole seeds) by age (index = age). */
  cap: [3, 3, 3, 5, 8] as readonly number[],
  /** A locule egg: a giant seed hatched with the egg; the kiwi gets this much in every stat. */
  egg: { seeds: 1, stat: 1 },
  /**
   * A locule tree: the n-th one costs `n × perTree` giant seeds; it grows for `growMs`, then
   * gives a seed every `everyMs` (a ripe seed waits on the tree while the stock is full).
   */
  tree: { perTree: 1, growMs: 48 * 3_600_000, everyMs: 72 * 3_600_000 },
  /**
   * Locule trees allowed by age (index = age): the n-th one costs n seeds, so the last one must
   * stay within the cap (a sixth tree at 6 seeds with a cap of 5 would never come).
   */
  maxTrees: [0, 0, 0, 4, 6] as readonly number[],
  /**
   * Chantier 51: giant seeds paid by the levels of the Age of the stars (index = level), only
   * for the Nest, the Library and the monument (the other levels 13–15 pay crystal).
   */
  levels: {
    nest: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3],
    library: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3],
    monument: [0, 0, 0, 0, 4],
  } as Partial<Record<string, readonly number[]>>,
} as const;
