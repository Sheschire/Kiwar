import { ms } from './curves';
import type { ObstacleKind } from './obstacles';
import type { TileType } from './tiles';

/**
 * Chantier 08 (second half): titan works. A Kikiwiwi smashes obstacles (any kind) and, once
 * "titan works" is researched, reshapes a few eligible tiles: digs a juice spring in the flesh,
 * raises a floodable tile into a terrace, flattens a grove or a seed ring into flesh. The
 * landscape stays: a capped number of tiles per age, never one that would cut the land in two.
 */
export const TITAN_WORK_IDS = ['smash', 'spring', 'terrace', 'flatten'] as const;
export type TitanWork = (typeof TITAN_WORK_IDS)[number];
export type TerraformKind = Exclude<TitanWork, 'smash'>;
/** Chantier 45: a reshaped tile in `state.terraform` — a titan work or a canal dug by builders. */
export type TerraformTile = TerraformKind | 'canal';

export const TERRAFORM_KINDS = [
  'spring',
  'terrace',
  'flatten',
] as const satisfies readonly TerraformKind[];

export interface TerraformDef {
  /** Land types it applies to (terrace: any floodable tile). */
  tiles: readonly TileType[] | 'flood';
  /** Juice drunk by the Kikiwiwi for the effort, and how long it takes. */
  juice: number;
  durationMs: number;
}

export const TERRAFORM: Record<TerraformKind, TerraformDef> = {
  spring: { tiles: ['flesh'], juice: 600, durationMs: ms.h(3) },
  terrace: { tiles: 'flood', juice: 400, durationMs: ms.h(2) },
  flatten: { tiles: ['grove', 'seedRing'], juice: 300, durationMs: ms.h(2) },
};

export const SMASH: Record<ObstacleKind, { juice: number; durationMs: number }> = {
  stump: { juice: 50, durationMs: ms.min(20) },
  rock: { juice: 200, durationMs: ms.h(1) },
  wreck: { juice: 300, durationMs: ms.h(1.5) },
  ruin: { juice: 100, durationMs: ms.min(40) },
  den: { juice: 250, durationMs: ms.h(1) },
};

export const TITAN = {
  /** Tiles that may be reshaped by age (index = age). */
  maxTerraform: [0, 0, 4, 8] as readonly number[],
  /** A terrace is raised this much above the water. */
  terraceRise: 0.22,
} as const;
