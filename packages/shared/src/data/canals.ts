import { ms } from './curves';
import type { Resources } from './resources';

/**
 * Chantier 45: juice canals. Once "Canals" is researched (Eden), builders dig a flesh tile next
 * to juice and it becomes juice: a small deposit of its own, fertile banks around it and a
 * well closer to the Nest. Tile by tile, capped by age, never cutting the land.
 */
export const CANALS = {
  /** Canal tiles by age (index = age). */
  maxByAge: [3, 6, 10, 15] as readonly number[],
  /** Paid when ordered (digging or filling), refunded on cancel. */
  cost: { pulp: 80, fiber: 40 } satisfies Partial<Resources>,
  /** Builder time for a tile (× the build speed of the techs, ÷ the builder's speed). */
  durationMs: ms.h(1),
  /** A canal's deposit (stock and regrowth) against a juice tile of the same richness. */
  deposit: 0.4,
} as const;
