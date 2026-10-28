import { ms } from './curves';
import type { Resources } from './resources';

/**
 * Chantier 45: juice canals. Once "Canals" is researched (Eden), builders dig a flesh tile next
 * to juice and it becomes juice: a small deposit of its own, fertile banks around it and a
 * well closer to the Nest. Tile by tile, quick to dig, never cutting the land.
 */
export const CANALS = {
  /**
   * Canal tiles at most: no limit in play (owner's request, October 2026), only a bound the
   * server checks against cheating.
   */
  max: 999,
  /** Paid when ordered (digging or filling), refunded on cancel. */
  cost: { pulp: 30, fiber: 15 } satisfies Partial<Resources>,
  /** Builder time for a tile (× the build speed of the techs, ÷ the builder's speed). */
  durationMs: ms.s(30),
  /** A canal's deposit (stock and regrowth) against a juice tile of the same richness. */
  deposit: 0.4,
} as const;
