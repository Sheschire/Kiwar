import {
  applyCommand,
  alienDefense,
  alienEnemies,
  cloneState,
  recordIntel,
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
  type BuildingType,
  hexDistance,
  rotationsOf,
  siteError,
  IRON_SCALE,
  HOUR_MS,
  type BuildingId,
} from '../src';

export const T0 = 1_700_000_000_000;

export function setup(face: 'kiwisu' | 'kiwino' = 'kiwisu', seed = 'test-seed') {
  const map = generateFace(seed, face);
  const state = newGame({ seed, face, now: T0, biome: 'classic' });
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
  return {
    ...state,
    resources: { pulp: 1e5, fiber: 1e5, seeds: 1e5, juice: 1e5 },
    // Chantier 38: and the meteoric iron of later levels, ships and technologies.
    meteorIron: 200 * IRON_SCALE,
  };
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

/** A perfect, fresh report on every target, read from the hidden garrisons. */
export function knowTruth(state: GameState, at: number): GameState {
  const s = cloneState(state);
  for (const t of s.targets) {
    const defense = alienDefense(s, t.id, at)!;
    const e = alienEnemies(s.aliens![t.id]!, defense);
    recordIntel(s, t.id, {
      at,
      source: 'recon',
      defense: { min: defense, max: defense },
      ferrets: { min: e.ferrets, max: e.ferrets },
      bats: { min: e.bats, max: e.bats },
      victoriesAt: s.victories[t.id] ?? 0,
    });
  }
  return s;
}

/**
 * Chantier 35: a site (anchor and orientation) where a building of `type` fits, `from` first,
 * then the tiles nearest to it.
 */
export function siteFor(
  state: GameState,
  map: FaceMap,
  type: BuildingType,
  from: { q: number; r: number } = { q: 0, r: 0 },
): { q: number; r: number; rot: number } {
  const tiles = [...map.tiles].sort(
    (a, b) => hexDistance(a, from) - hexDistance(b, from) || a.q - b.q || a.r - b.r,
  );
  for (const t of tiles)
    for (const rot of rotationsOf(type))
      if (siteError(state, map, type, t, rot) === null) return { q: t.q, r: t.r, rot };
  throw new Error(`no site for ${type}`);
}

/** An Iron-age colony (Nest 7, monument 2) that knows spelunking, without a tunnel yet. */
export function ironColony(seed = 'depths') {
  const { map, state } = setup('kiwisu', seed);
  const s: GameState = rich(state);
  s.buildings[0]!.level = 7;
  const mon = findTile(map, 'flesh', 6);
  s.buildings.push({
    id: 'bmon' as BuildingId,
    type: 'monument',
    q: mon.q,
    r: mon.r,
    level: 2,
    richness: mon.richness,
    builtAt: T0,
  });
  s.research.done = ['stoneAge', 'ironAge', 'spelunking'];
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  s.threats.next = null;
  return { map, s };
}

/** Chantier 48: an Iron-age colony with its tunnel entrance and `n` seasoned kiwis at home. */
export function delveColony(seed = 'delves', level = 3, kiwis = 8, kiwiLevel = 14) {
  const { map, s } = ironColony(seed);
  const at = findTile(map, 'flesh', 12);
  s.buildings.push({
    id: 'btun' as BuildingId,
    type: 'tunnel',
    q: at.q,
    r: at.r,
    level,
    richness: 1,
    builtAt: T0,
  });
  for (let i = 0; i < kiwis; i++) {
    const v = kiwi(`dk${i}`);
    v.level = kiwiLevel;
    for (const k of Object.keys(v.stats) as (keyof typeof v.stats)[]) v.stats[k] = 9;
    // Half of them reach the fruit flies (fireballs), half hold the front (swords).
    v.classId = i % 2 ? 'warrior' : 'mage';
    s.villagers.push(v);
  }
  s.automation.meteor = false;
  s.automation.stardust = false;
  return { map, s };
}
