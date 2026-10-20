import {
  buildLock,
  siteError,
  type BuildingType,
  type CommandError,
  type FaceMap,
  type GameState,
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
