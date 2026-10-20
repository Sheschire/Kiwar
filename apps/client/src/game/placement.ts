import {
  buildLock,
  catchmentPlan,
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
): CommandError | null {
  return buildLock(game, type) ?? siteError(game, map, type, tile);
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
