import { ms } from './curves';

/**
 * Chantier 38: meteoric iron. Craters give mostly iron (plus a small share of their old
 * resource), wrecks a little when smashed. It is kept apart from the shared storage, like the
 * stardust, in raw integer units (exact offline), with a cap that grows with the Nest. It pays
 * for the gear of the Forge, levels 7+, the monuments of the Iron and Industry ages, the ships,
 * turrets of level 3+ and a few technologies.
 */
export const IRON = {
  /** Stock cap (units) by Nest level (index 0–12). */
  cap: [20, 20, 30, 40, 60, 90, 120, 160, 220, 300, 400, 500, 600] as readonly number[],
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
} as const;

/** Raw iron units per unit. A crater's rate is `1000 × perHour × factors` raw units per ms. */
export const IRON_SCALE = 1000 * 3_600_000;

/** Iron as whole units (what the UI shows and what costs are in). */
export function ironUnits(raw: number): number {
  return Math.floor(raw / IRON_SCALE + 1e-9);
}
