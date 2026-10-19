import { generateFace, type GameState, type Tile, type TileType } from '../src';

export * from '../src';

export function findTileForTest(state: GameState, type: TileType): Tile {
  const map = generateFace(state.seed, state.face, state.params);
  return map.tiles.filter((t) => t.type === type).sort((a, b) => a.rho - b.rho)[0]!;
}
