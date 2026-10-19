import {
  applyCommand,
  createRng,
  newKiwi,
  rollKiwi,
  type Villager,
  type VillagerId,
  generateFace,
  newGame,
  type Command,
  type FaceMap,
  type GameState,
  type TileType,
  type Tile,
} from '../src';

export const T0 = 1_700_000_000_000;

export function setup(face: 'kiwisu' | 'kiwino' = 'kiwisu', seed = 'test-seed') {
  const map = generateFace(seed, face);
  const state = newGame({ seed, face, now: T0 });
  return { map, state };
}

/** First tile of a type, sorted by distance to the heart for stable tests. */
export function findTile(map: FaceMap, type: TileType, skip = 0): Tile {
  const tiles = map.tiles
    .filter((t) => t.type === type)
    .sort((a, b) => a.rho - b.rho || a.q - b.q || a.r - b.r);
  const t = tiles[skip];
  if (!t) throw new Error(`no ${type} tile`);
  return t;
}

export function run(state: GameState, cmd: Command, now: number, map: FaceMap): GameState {
  const r = applyCommand(state, cmd, { now, map });
  if (!r.ok) throw new Error(`command ${cmd.type} failed: ${r.error}`);
  return r.state;
}

export function rich(state: GameState): GameState {
  return { ...state, resources: { pulp: 1e5, fiber: 1e5, seeds: 1e5, juice: 1e5 } };
}

/** A test kiwi with stats drawn from its id (idle). */
export function kiwi(id: string, name = id, bornAt = T0): Villager {
  return {
    id: id as VillagerId,
    name,
    bornAt,
    job: { kind: 'idle' },
    ...newKiwi(rollKiwi(createRng(`test/${id}`))),
  };
}
