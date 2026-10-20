import { describe, expect, it } from 'vitest';
import {
  advance,
  BIOME_IDS,
  BIOMES,
  biomesOf,
  buildingHarvest,
  computeClaims,
  countTiles,
  DEFAULT_FACE_PARAMS,
  drawBiomes,
  FACES,
  freeDepositStock,
  generateFace,
  hexKey,
  hexNeighbors,
  HOUR_MS,
  isPlausible,
  migrateState,
  newGame,
  SEASON_MS,
  tileDeposit,
  walkCost,
  type BiomeId,
  type Face,
  type FaceMap,
  type GameState,
} from '../src';
import { findTile, rich, run, T0 } from './helpers';

const SEEDS = Array.from({ length: 24 }, (_, i) => `biome-${i}`);

function world(face: Face, biome: BiomeId, seed = 'biomes') {
  const state = newGame({ seed, face, now: T0, biome });
  return { state, map: generateFace(seed, face, state.params) };
}

/** Share of the walkable land kiwis cannot reach from the heart (spring). */
function unreachable(map: FaceMap): number {
  const paths = new Set<string>();
  const seen = new Set(['0,0']);
  const open = [{ q: 0, r: 0 }];
  while (open.length > 0) {
    const h = open.pop()!;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (seen.has(k) || walkCost(map, paths, n, 'summer') === Infinity) continue;
      seen.add(k);
      open.push(n);
    }
  }
  const land = map.tiles.filter((t) => walkCost(map, paths, t, 'summer') !== Infinity);
  return 1 - seen.size / land.length;
}

const mean = (face: Face, biome: BiomeId, type: keyof ReturnType<typeof countTiles>) =>
  SEEDS.reduce(
    (sum, s) => sum + countTiles(generateFace(s, face, { radius: 12, biome }))[type],
    0,
  ) / SEEDS.length;

describe('biomes', () => {
  it('draws one biome per face from the planet seed, every biome of a face in turn', () => {
    expect(drawBiomes('banana')).toEqual(drawBiomes('banana'));
    for (const face of FACES) {
      expect(biomesOf(face)).toHaveLength(3);
      const drawn = new Set(SEEDS.map((s) => drawBiomes(s)[face]));
      expect([...drawn].sort()).toEqual([...biomesOf(face)].sort());
    }
    expect(biomesOf('kiwisu')).not.toContain('classic');
    const s = newGame({ seed: 'banana', face: 'kiwino', now: T0 });
    expect(s.params.biome).toBe(drawBiomes('banana').kiwino);
  });

  it('keeps the classic map identical to the one before biomes', () => {
    const a = generateFace('banana', 'kiwisu');
    const b = generateFace('banana', 'kiwisu', { ...DEFAULT_FACE_PARAMS, biome: 'classic' });
    expect(b.tiles).toEqual(a.tiles);
    expect(a.tiles.some((t) => t.flood)).toBe(false);
  });

  it('shapes the land of each biome', () => {
    expect(mean('kiwisu', 'orchard', 'grove')).toBeLessThan(mean('kiwisu', 'classic', 'grove'));
    expect(mean('kiwisu', 'highlands', 'grove')).toBeGreaterThan(
      mean('kiwisu', 'classic', 'grove'),
    );
    expect(mean('kiwisu', 'delta', 'juice')).toBeGreaterThan(mean('kiwisu', 'classic', 'juice'));
    expect(mean('kiwino', 'seedCrown', 'seedRing')).toBeGreaterThan(
      mean('kiwino', 'classic', 'seedRing'),
    );
    expect(mean('kiwino', 'lagoons', 'juice')).toBeGreaterThan(
      mean('kiwino', 'classic', 'juice') * 1.4,
    );
    const lagoons = generateFace('lagoon', 'kiwino', { radius: 12, biome: 'lagoons' });
    const floods = lagoons.tiles.filter((t) => t.flood);
    expect(floods.length).toBeGreaterThan(8);
    expect(floods.every((t) => t.type === 'flesh')).toBe(true);
  });

  it('leaves every biome walkable from the heart (rivers have fords)', () => {
    for (const id of BIOME_IDS) {
      const face = BIOMES[id].face ?? 'kiwisu';
      for (const seed of SEEDS.slice(0, 8))
        expect(unreachable(generateFace(seed, face, { radius: 12, biome: id }))).toBeLessThan(0.04);
    }
  });

  it('sizes deposits by biome (rich tundra, slow regrowth)', () => {
    const { map } = world('kiwino', 'tundra');
    const tile = findTile(map, 'seedRing');
    const classic = tileDeposit(tile)!;
    const tundra = tileDeposit(tile, 'tundra')!;
    expect(tundra.cap).toBeCloseTo(classic.cap * BIOMES.tundra.deposits.stock.seeds!, 6);
    expect(tundra.regen).toBeCloseTo(classic.regen * BIOMES.tundra.deposits.regen.seeds!, 6);
  });

  it('migrates v8 saves to the classic biome, and rejects imported foreign biomes', () => {
    const fresh = newGame({ seed: 'old', face: 'kiwisu', now: T0 });
    const raw = { ...fresh, schemaVersion: 8, params: { radius: 12 } };
    const m = migrateState(JSON.parse(JSON.stringify(raw)));
    expect(m.ok && m.state.params).toEqual({ radius: 12, biome: 'classic' });
    expect(isPlausible(fresh, T0)).toBe(true);
    expect(isPlausible({ ...fresh, params: { radius: 12, biome: 'classic' } }, T0)).toBe(true);
    const other = biomesOf('kiwisu').find((b) => b !== fresh.params.biome)!;
    expect(isPlausible({ ...fresh, params: { radius: 12, biome: other } }, T0)).toBe(false);
  });
});

describe('floods (lagoons)', () => {
  /** Moves the calendar so that `now` falls on this season (0 = spring). */
  const at = (s: GameState, season: number, hour = 0.5): GameState => ({
    ...s,
    calendarStart: s.now - season * SEASON_MS - hour * HOUR_MS,
  });

  it('floods the flesh around the pools in spring: no walking, building or harvest', () => {
    const { state, map } = world('kiwino', 'lagoons', 'lagoon');
    const tile = map.tiles.find((t) => t.flood && t.rho > 0.3)!;
    expect(walkCost(map, new Set(), tile, 'spring')).toBe(Infinity);
    expect(walkCost(map, new Set(), tile, 'summer')).toBeLessThan(Infinity);
    const build = { type: 'build', buildingType: 'pulpery', q: tile.q, r: tile.r } as const;
    const spring = rich(at(state, 0));
    expect(() => run(spring, build, T0, map)).toThrow(/flooded/);
    // Built in summer, it stops when the spring floods come, and its tile leaves the pool.
    let s = run(rich(at(state, 3, 1)), build, T0, map);
    s = advance(s, T0 + 3 * HOUR_MS).state;
    const b = s.buildings.find((x) => x.type === 'pulpery')!;
    expect(b.pool!.tiles).toContain(hexKey(tile));
    expect(buildingHarvest(s, b)!.status).not.toBe('flooded');
    s = advance(s, T0 + SEASON_MS).state;
    const flooded = s.buildings.find((x) => x.id === b.id)!;
    expect(buildingHarvest(s, flooded)!.status).toBe('flooded');
    expect(flooded.pool!.tiles).not.toContain(hexKey(tile));
    expect(computeClaims(s, map).get(b.id)).not.toContain(hexKey(tile));
  });

  it('gives the same result in one big step or many small ones through the floods', () => {
    const { state, map } = world('kiwino', 'lagoons', 'lagoon');
    const tile = map.tiles.find((t) => t.flood && t.rho > 0.3)!;
    let s = at({ ...state, resources: { pulp: 400, fiber: 300, seeds: 0, juice: 100 } }, 3, 20);
    s = run(s, { type: 'build', buildingType: 'pulpery', q: tile.q, r: tile.r }, T0, map);
    const juice = findTile(map, 'juice');
    s = run(s, { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r }, T0, map);
    const end = T0 + 12 * HOUR_MS;
    const one = advance(s, end);
    expect(one.events.some((e) => e.type === 'seasonChanged' && e.season === 'spring')).toBe(true);
    let stepped = s;
    for (let t = T0; t <= end; t += 47_311) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    expect(stepped.buildings.map((b) => b.pool?.tiles)).toEqual(
      one.state.buildings.map((b) => b.pool?.tiles),
    );
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(stepped.resources[id]).toBeCloseTo(one.state.resources[id], 4);
    // A deposit that grew back may be forgotten earlier when stepping: compare stocks.
    for (const k of new Set([...Object.keys(stepped.deposits), ...Object.keys(one.state.deposits)]))
      expect(freeDepositStock(stepped, map, k, end)).toBeCloseTo(
        freeDepositStock(one.state, map, k, end),
        4,
      );
  });
});
