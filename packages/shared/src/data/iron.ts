import { ms } from './curves';

/**
 * Chantier 38: meteoric iron. Craters give mostly iron (plus a small share of their old
 * resource), wrecks a little when smashed. It is kept apart from the shared storage, like the
 * stardust, in raw integer units (exact offline), with a cap that grows with the Nest. It pays
 * for the gear of the Forge, levels 7+, the monuments of the Iron and Industry ages, the ships,
 * turrets of level 3+ and a few technologies.
 */
export const IRON = {
  /** Stock cap (units) by Nest level (index 0–15). */
  cap: [
    20, 20, 30, 40, 60, 90, 120, 160, 220, 300, 400, 500, 600, 700, 800, 900,
  ] as readonly number[],
  /** Iron in a crater (units), × `METEORS.ageFactor` and the `starIron` technology. */
  crater: 12,
  /** An average kiwi digs this many units per hour (× the crater's usual multipliers). */
  perHour: 0.2,
  /** Share of the old meteorite stock (seeds, juice or fiber) a crater still gives. */
  resourceShare: 0.2,
  /** A smashed wreck gives this many units (× `METEORS.ageFactor`). */
  wreck: 3,
  /** Anti-blocking guarantee: never longer than this without a fall. */
  guaranteeMs: ms.h(72),
  /**
   * Iron paid by building levels 7+ (index = level; turrets and the monument have their own).
   * The launchpad's levels 7+ pay the iron hull, then the jet, of the ship generations.
   */
  levels: [0, 0, 0, 0, 0, 0, 0, 4, 6, 9, 14, 20, 28, 34, 40, 48] as readonly number[],
  /** Iron paid by turret levels 3+ (index = level). */
  turret: [0, 0, 0, 2, 2, 3, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18] as readonly number[],
  /** Iron of the levels with their own number (the monument's ages, the Iron levels of the
   * camp and the Forge; index = level). */
  own: {
    monument: [0, 0, 20, 60, 150],
    trainingCamp: [0, 0, 0, 6],
    forge: [0, 0, 0, 8],
    tunnel: [0, 3, 6, 10],
    lab: [0, 0, 0, 0],
    camp: [0, 0],
  } as Partial<Record<string, readonly number[]>>,
} as const;

/** Raw iron units per unit. A crater's rate is `1000 × perHour × factors` raw units per ms. */
export const IRON_SCALE = 1000 * 3_600_000;

/** Iron as whole units (what the UI shows and what costs are in). */
export function ironUnits(raw: number): number {
  return Math.floor(raw / IRON_SCALE + 1e-9);
}
