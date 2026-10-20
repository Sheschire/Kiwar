import { ms } from './curves';

/**
 * Chantier 13: comets. A rare comet is announced hours ahead (a trail across the night sky),
 * passes over the planet and drops stardust on a few land tiles. Kiwis sent there pick it up
 * before it scatters. Stardust is kept apart from the shared storage, with a small cap.
 */
export const COMETS = {
  /** The first comet passes this long after the start (no draw at game creation)… */
  firstMs: ms.h(36),
  /** …and is announced this long before. */
  firstNoticeMs: ms.h(9),
  /** Time between two comets (drawn in this range). */
  intervalMs: [ms.h(72), ms.h(120)],
  /** How long before its passage a comet is announced (drawn in this range). */
  noticeMs: [ms.h(6), ms.h(12)],
  /** The comet is seen moving away for this long after the dust fell (cosmetic). */
  passMs: ms.h(3),
  /** Stardust lies on the ground this long, then scatters. */
  lifeMs: ms.h(24),
  /** Tiles the dust falls on (drawn in this range). */
  tiles: [1, 3] as readonly [number, number],
  /** Land types it can fall on. */
  landTypes: ['flesh', 'grove', 'seedRing'] as const,
  /** Stardust per comet (whole points), × the age factor (index = age). */
  stock: 16,
  ageFactor: [1, 1.3, 1.7, 2.2] as readonly number[],
} as const;

/** Stardust: a separate stock in raw integer units (exact offline, like the experience). */
export const STARDUST = {
  /** Stock cap (points). */
  cap: 50,
  /** Kiwis per dust tile. */
  slots: 3,
  /** An average kiwi picks one point in this time… */
  pickMs: ms.min(30),
  /** …and this much faster per point of Dexterity above the average. */
  perDexterity: 0.05,
} as const;

/** Chantier 13: what stardust buys for a kiwi (costs in points). */
export const BLESSINGS = {
  /** Heals a wounded kiwi at once. */
  heal: 3,
  /** Every stat back to 1, the points to place again. */
  respec: 6,
  /** +1 in a stat, at most `statMax` times per kiwi. */
  stat: 10,
  statMax: 3,
  /** A star egg costs the usual egg plus this much stardust… */
  starEgg: 15,
  /** …and hatches a golden shiny with this chance. */
  starShiny: 1 / 8,
} as const;

/** Raw stardust units per point. A kiwi picks `rate` raw units per ms (an integer). */
export const STARDUST_SCALE = 100 * STARDUST.pickMs;

/** Stardust as whole points (what the UI shows and what costs are in). */
export function dustPoints(raw: number): number {
  return Math.floor(raw / STARDUST_SCALE + 1e-9);
}
