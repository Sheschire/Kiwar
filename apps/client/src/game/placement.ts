import {
  buildableTiles,
  buildLock,
  catchmentPlan,
  coveredHarvest,
  footprintHexes,
  footprintOf,
  rotationsOf,
  getTile,
  HARVESTS,
  hexKey,
  parseHexKey,
  siteError,
  type BuildingType,
  type CommandError,
  type FaceMap,
  type GameState,
  type TakenTile,
  type Tile,
} from '@kiwar/shared';

/** Chantier 16: why `type` cannot go on `tile` right now (null: it can), as the build command. */
export function placementError(
  game: GameState,
  map: FaceMap,
  type: BuildingType,
  tile: Tile,
  rot = 0,
): CommandError | null {
  return buildLock(game, type) ?? siteError(game, map, type, tile, rot);
}

/**
 * Chantier 35: what a big building placed there would take away — the harvested deposits it
 * covers (their harvest is lost) and the paths under its covered tiles (refunded).
 */
export function placementCover(
  game: GameState,
  type: BuildingType,
  tile: Tile,
  rot: number,
): { harvested: number; paths: number } {
  if (footprintOf(type) === 1) return { harvested: 0, paths: 0 };
  const paved = new Set(game.paths);
  const covered = footprintHexes(type, tile.q, tile.r, rot).slice(1);
  return {
    harvested: coveredHarvest(game, type, tile.q, tile.r, rot).length,
    paths: covered.filter((h) => paved.has(hexKey(h))).length,
  };
}

/** Chantier 35: the first orientation with somewhere to go (the placement starts there). */
export function firstRotation(game: GameState, map: FaceMap, type: BuildingType): number | null {
  for (const rot of rotationsOf(type))
    if (buildableTiles(game, map, type, rot).length > 0) return rot;
  return null;
}

export interface PlacementPlan {
  /** Deposit tiles the new producer would harvest. */
  free: Tile[];
  /** Tiles in reach that other buildings keep. */
  taken: (TakenTile & { tile: Tile })[];
  cap: number;
  regen: number;
}

let cache: { game: GameState; key: string; plan: PlacementPlan | null } | null = null;

/**
 * Chantier 16: the catchment of a producer placed on `tile` (null for other buildings), shared
 * by the ghost's tile highlights and the placing banner (one computation per state and tile).
 */
export function placementPlan(
  game: GameState,
  map: FaceMap,
  type: BuildingType,
  tile: Tile,
): PlacementPlan | null {
  const key = `${type}:${hexKey(tile)}`;
  if (cache && cache.game === game && cache.key === key) return cache.plan;
  let plan: PlacementPlan | null = null;
  if (HARVESTS[type]) {
    const raw = catchmentPlan(game, map, type, tile);
    const at = (k: string) => getTile(map, parseHexKey(k));
    plan = {
      free: raw.tiles.map(at).filter((t): t is Tile => !!t),
      taken: raw.taken.flatMap((x) => {
        const t = at(x.key);
        return t ? [{ ...x, tile: t }] : [];
      }),
      cap: raw.cap,
      regen: raw.regen,
    };
  }
  cache = { game, key, plan };
  return plan;
}
