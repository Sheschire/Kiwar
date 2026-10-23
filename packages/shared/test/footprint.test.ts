import { describe, expect, it } from 'vitest';
import {
  advance,
  buildableTiles,
  buildingAt,
  cloneState,
  computeClaims,
  cutsLand,
  footprintHexes,
  footprintTiles,
  hexKey,
  hexNeighbors,
  HOUR_MS,
  migrateState,
  occupancy,
  PATHS,
  queuedBuildAt,
  validateCommand,
  walkDistances,
  type Building,
  type BuildingId,
  type Command,
  type FaceMap,
  type GameState,
} from '../src';
import { rich, run, setup, siteFor, T0 } from './helpers';

/** A Nest 2 colony with full stocks: the big buildings are open. */
function nest2(): { map: FaceMap; s: GameState } {
  const { map, state } = setup('kiwisu', 'footprint');
  let s = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + 3 * HOUR_MS).state;
  return { map, s: rich(s) };
}

const build = (type: Building['type'], site: { q: number; r: number; rot: number }): Command => ({
  type: 'build',
  buildingType: type,
  ...site,
});

const keys = (tiles: { q: number; r: number }[]) => tiles.map((h) => hexKey(h)).sort();

describe('footprints (chantier 35)', () => {
  it('covers 1, 3 (a turning triangle) or 7 tiles', () => {
    expect(footprintHexes('pulpery', 2, 1)).toEqual([{ q: 2, r: 1 }]);
    expect(footprintHexes('library', 0, 0, 0)).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: -1 },
    ]);
    const turned = new Set(
      [0, 1, 2, 3, 4, 5].map((rot) => keys(footprintHexes('library', 0, 0, rot)).join(';')),
    );
    expect(turned.size).toBe(6);
    expect(footprintHexes('monument', 3, -1)).toHaveLength(7);
  });

  it('places a big building on all its tiles, then frees them all when demolished', () => {
    const { map, s } = nest2();
    const site = siteFor(s, map, 'library', { q: 3, r: 0 });
    const tiles = footprintHexes('library', site.q, site.r, site.rot);
    let t = run(s, build('library', site), s.now, map);
    // The site holds every tile.
    for (const h of tiles) expect(queuedBuildAt(t, h.q, h.r)?.buildingType).toBe('library');
    t = advance(t, t.now + 6 * HOUR_MS).state;
    const library = t.buildings.find((b) => b.type === 'library')!;
    expect(library.rot).toBe(site.rot);
    expect(keys(footprintTiles(library))).toEqual(keys(tiles));
    for (const h of tiles) expect(buildingAt(t, h.q, h.r)?.id).toBe(library.id);
    // Nothing else goes on a covered tile, not even a path.
    const covered = tiles[1]!;
    const ctx = { now: t.now, map };
    expect(validateCommand(rich(t), { type: 'build', buildingType: 'hut', ...covered }, ctx)).toBe(
      'tileOccupied',
    );
    expect(validateCommand(rich(t), { type: 'buildPath', tiles: [covered] }, ctx)).toBe(
      'tileOccupied',
    );
    const gone = run(t, { type: 'demolish', buildingId: library.id }, t.now, map);
    for (const h of tiles) expect(buildingAt(gone, h.q, h.r)).toBeUndefined();
    expect(occupancy(gone).blocked.size).toBe(0);
  });

  it('refuses obstacles, juice and other sites under any tile, whatever the orientation', () => {
    const { map, s } = nest2();
    const site = siteFor(s, map, 'library', { q: 3, r: 0 });
    const tiles = footprintHexes('library', site.q, site.r, site.rot);
    const ctx = { now: s.now, map };
    const rock = cloneState(s);
    rock.obstacles = [
      ...rock.obstacles,
      { id: `rock:${hexKey(tiles[2]!)}`, kind: 'rock', q: tiles[2]!.q, r: tiles[2]!.r, loot: {} },
    ];
    expect(validateCommand(rock, build('library', site), ctx)).toBe('obstacle');
    // A hut site on the second tile.
    const hut = run(s, { type: 'build', buildingType: 'hut', ...tiles[1]! }, s.now, map);
    expect(validateCommand(rich(hut), build('library', site), ctx)).toBe('tileOccupied');
    // A footprint that reaches the juice or off the map.
    const juice = map.tiles.find((t) => t.type === 'juice')!;
    const shore = hexNeighbors(juice)
      .map((h) => map.tiles[map.index.get(hexKey(h)) ?? -1])
      .find((t) => t && (t.type === 'flesh' || t.type === 'ray'));
    if (shore) {
      const towards = [0, 1, 2, 3, 4, 5].find((rot) =>
        footprintHexes('library', shore.q, shore.r, rot).some(
          (h) => h.q === juice.q && h.r === juice.r,
        ),
      )!;
      expect(
        validateCommand(s, build('library', { q: shore.q, r: shore.r, rot: towards }), ctx),
      ).toBe('tileNotAllowed');
    }
  });

  it('lists exactly the tiles where the build command passes, for each orientation', () => {
    const { map, s } = nest2();
    for (const rot of [0, 3]) {
      const ok = new Set(buildableTiles(s, map, 'library', rot).map((t) => hexKey(t)));
      expect(ok.size).toBeGreaterThan(0);
      for (const t of map.tiles) {
        const error = validateCommand(s, build('library', { q: t.q, r: t.r, rot }), {
          now: s.now,
          map,
        });
        expect(ok.has(hexKey(t)), `${t.q},${t.r} rot ${rot}`).toBe(error === null);
      }
    }
  });

  it('takes the paths off its tiles and refunds the covered ones', () => {
    const { map, s } = nest2();
    const site = siteFor(s, map, 'library', { q: 3, r: 0 });
    const tiles = footprintHexes('library', site.q, site.r, site.rot);
    const paved = run(s, { type: 'buildPath', tiles }, s.now, map);
    const before = paved.resources.fiber;
    const t = run(paved, build('library', site), paved.now, map);
    for (const h of tiles) expect(t.paths).not.toContain(hexKey(h));
    const plain = run(s, build('library', site), s.now, map);
    // Same cost as on bare land, minus the two covered paths given back.
    expect(before - t.resources.fiber).toBeCloseTo(
      s.resources.fiber - plain.resources.fiber - (PATHS.cost.fiber ?? 0) * 2,
      6,
    );
  });

  it('is walked around (anchor excepted) and its covered deposits are not harvested', () => {
    const { map, s } = nest2();
    const site = siteFor(s, map, 'library', { q: 3, r: 0 });
    const tiles = footprintHexes('library', site.q, site.r, site.rot);
    let t = run(s, build('library', site), s.now, map);
    t = advance(t, t.now + 6 * HOUR_MS).state;
    const dist = walkDistances(t, map, [hexKey(t.buildings[0]!)]);
    expect(dist.has(hexKey(tiles[0]!))).toBe(true);
    expect(dist.has(hexKey(tiles[1]!))).toBe(false);
    expect(dist.has(hexKey(tiles[2]!))).toBe(false);
    const claimed = new Set([...computeClaims(t, map).values()].flat());
    for (const h of tiles) expect(claimed.has(hexKey(h))).toBe(false);
  });

  it('never cuts the walkable land in two', () => {
    const { map } = nest2();
    const centre = map.tiles.find((t) => t.type === 'flesh' && t.rho > 0.4)!;
    // A ring around a tile shuts it in.
    expect(cutsLand(map, keys(hexNeighbors(centre)))).toBe(true);
    expect(cutsLand(map, keys(hexNeighbors(centre).slice(0, 5)))).toBe(false);
  });
});

describe('older saves (chantier 35)', () => {
  /** A v26 save: the big buildings have no orientation yet. */
  function oldSave(s: GameState): Record<string, unknown> {
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.schemaVersion = 26;
    for (const b of raw.buildings as Record<string, unknown>[]) {
      delete b.rot;
      delete b.cramped;
    }
    return raw;
  }

  it('spreads each big building where it fits, or keeps it cramped, losing none', () => {
    const { map, s } = nest2();
    const roomy = siteFor(s, map, 'library', { q: 3, r: 0 });
    let t = run(s, build('library', roomy), s.now, map);
    t = advance(t, t.now + 6 * HOUR_MS).state;
    // A warehouse shut in by huts all around.
    const spot = siteFor(t, map, 'hut', { q: -4, r: 2 });
    const huts = hexNeighbors(spot).map((h, i): Building => ({
      id: `bh${i}` as BuildingId,
      type: 'hut',
      q: h.q,
      r: h.r,
      level: 1,
      richness: 1,
      builtAt: T0,
    }));
    const store: Building = {
      id: 'bw' as BuildingId,
      type: 'warehouse',
      q: spot.q,
      r: spot.r,
      level: 1,
      richness: 1,
      builtAt: T0,
    };
    const crowded = { ...t, buildings: [...t.buildings, ...huts, store] };
    const loaded = migrateState(oldSave(crowded));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const after = loaded.state;
    expect(after.buildings).toHaveLength(crowded.buildings.length);
    const library = after.buildings.find((b) => b.type === 'library')!;
    expect(library.cramped).toBeUndefined();
    expect(footprintTiles(library)).toHaveLength(3);
    const warehouse = after.buildings.find((b) => b.id === 'bw')!;
    expect(warehouse.cramped).toBe(true);
    expect(footprintTiles(warehouse)).toHaveLength(1);

    // Its upgrade waits for room; once two huts go, it spreads with it.
    const ctx = { now: after.now, map };
    const up: Command = { type: 'upgrade', buildingId: warehouse.id };
    expect(validateCommand(rich(after), up, ctx)).toBe('cramped');
    const freed = {
      ...rich(after),
      buildings: after.buildings.filter((b) => b.id !== 'bh0' && b.id !== 'bh1'),
    };
    let u = run(freed, up, after.now, map);
    const item = u.queue.find((i) => i.buildingId === warehouse.id)!;
    expect(item.rot).toBeDefined();
    u = advance(u, u.now + 12 * HOUR_MS).state;
    const grown = u.buildings.find((b) => b.id === warehouse.id)!;
    expect(grown.level).toBe(2);
    expect(grown.cramped).toBeUndefined();
    expect(footprintTiles(grown)).toHaveLength(3);
  });
});
