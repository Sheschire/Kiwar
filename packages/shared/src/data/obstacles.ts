import type { Resources } from './resources';
import type { TileType } from './tiles';
import { ms } from './curves';

/**
 * Chantier 08 (second half): obstacles block a few land tiles (no building, camp or path). Stumps
 * are cleared by ordinary kiwis (a queued job for a builder); rocks and meteorite wrecks need a
 * Kikiwiwi. They live in the state (not in the map generation, so maps stay identical) and are
 * placed far from the Nest so that no start is ever blocked.
 */
export const OBSTACLE_KINDS = ['stump', 'rock', 'wreck'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export interface ObstacleDef {
  /** Land types it can stand on (wrecks: where the crater was). */
  tiles: readonly TileType[];
  /** Placed at game creation on each face (wrecks come from the craters). */
  count: number;
  /** Loot when removed (wrecks: × the age factor of the meteorites). */
  loot: Partial<Resources>;
  /** Who can remove it. */
  clearedBy: 'kiwis' | 'titan';
}

export const OBSTACLES: Record<ObstacleKind, ObstacleDef> = {
  stump: { tiles: ['grove', 'flesh'], count: 6, loot: { fiber: 80 }, clearedBy: 'kiwis' },
  rock: {
    tiles: ['flesh', 'ray'],
    count: 5,
    loot: { seeds: 120, fiber: 40 },
    clearedBy: 'titan',
  },
  wreck: {
    tiles: ['flesh', 'grove', 'seedRing'],
    count: 0,
    loot: { seeds: 150, juice: 150 },
    clearedBy: 'titan',
  },
};

export const OBSTACLE_RULES = {
  /** Placed between these normalised distances from the heart (never next to the Nest). */
  rho: [0.38, 0.9] as readonly [number, number],
  /** Clearing a stump: base time for an average builder (technologies shorten it). */
  clearMs: ms.h(1.5),
  /** What the builders eat while clearing a stump. */
  clearCost: { pulp: 40 } as Partial<Resources>,
  /** Wrecks kept at once (a crater fading away leaves none beyond). */
  maxWrecks: 4,
} as const;
