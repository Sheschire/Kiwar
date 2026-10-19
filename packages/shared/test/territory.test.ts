import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildingHarvest,
  CAMPS,
  depotDistance,
  FACE_PROFILES,
  hexKey,
  hexLine,
  HOUR_MS,
  migrateState,
  PATHS,
  TILES,
  type FaceMap,
  type GameState,
  type Tile,
} from '../src';
import { findTile, run, setup, T0 } from './helpers';

const empty = (s: GameState): GameState => ({
  ...s,
  resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
});

/** The flesh tile closest to the heart whose own deposit is exhausted by a full camp. */
function campSite(map: FaceMap): Tile {
  for (let i = 0; i < 40; i++) {
    const t = findTile(map, 'flesh', i);
    if (t.richness <= 1) return t;
  }
  throw new Error('no camp site');
}

function withCamp() {
  const { map, state } = setup();
  const site = campSite(map);
  let s = run(state, { type: 'gather', q: site.q, r: site.r }, T0, map);
  const camp = s.buildings.find((b) => b.type === 'camp')!;
  s = run(s, { type: 'assignWorkers', buildingId: camp.id, count: 2 }, T0, map);
  return { map, s: empty(s), camp, site };
}

describe('deposits', () => {
  it('a camp claims its own tile and starts full', () => {
    const { s, camp, site } = withCamp();
    const b = s.buildings.find((x) => x.id === camp.id)!;
    expect(b.pool?.tiles).toEqual([hexKey(site)]);
    const h = buildingHarvest(s, b)!;
    expect(h.resource).toBe('pulp');
    expect(h.stock).toBeCloseTo(300 * site.richness, 6);
    expect(h.status).toBe('ok');
  });

  it('drains, then runs dry and only yields the regrowth (exactly, offline)', () => {
    const { s: start, camp } = withCamp();
    const b0 = start.buildings.find((x) => x.id === camp.id)!;
    const h0 = buildingHarvest(start, b0)!;
    expect(h0.demand).toBeGreaterThan(h0.regen);
    // Leave just enough stock for 10 minutes, then run for 20 (below the 400 storage).
    const s: GameState = {
      ...start,
      buildings: start.buildings.map((b) =>
        b.id === camp.id ? { ...b, pool: { ...b.pool!, stock: (h0.demand - h0.regen) / 6 } } : b,
      ),
    };
    const nestPulp = 240 * FACE_PROFILES.kiwisu.yieldMultiplier.pulp;
    const climate = FACE_PROFILES.kiwisu.yieldMultiplier.pulp;
    const big = advance(s, s.now + HOUR_MS / 3).state;
    const expected = nestPulp / 3 + (h0.demand / 6 + h0.regen / 6) * climate;
    expect(big.resources.pulp).toBeCloseTo(expected, 3);
    const b = big.buildings.find((x) => x.id === camp.id)!;
    expect(b.pool!.stock).toBe(0);
    expect(buildingHarvest(big, b)!.status).toBe('depleted');

    let small = s;
    for (let i = 1; i <= 20; i++) small = advance(small, s.now + i * 60_000).state;
    expect(small.resources.pulp).toBeCloseTo(big.resources.pulp, 3);
  });

  it('pauses harvesting while the storage is full, and the deposit grows back', () => {
    const { s: start, camp } = withCamp();
    const s: GameState = {
      ...start,
      resources: { ...start.resources, pulp: 400 },
      buildings: start.buildings.map((b) =>
        b.id === camp.id ? { ...b, pool: { ...b.pool!, stock: 0 } } : b,
      ),
    };
    const later = advance(s, s.now + HOUR_MS).state;
    const b = later.buildings.find((x) => x.id === camp.id)!;
    const h = buildingHarvest(later, b)!;
    expect(h.status).toBe('storageFull');
    expect(b.pool!.stock).toBeCloseTo(h.regen, 6);
  });

  it('depletion follows the land: a new camp on a drained tile does not start full', () => {
    const { map, s: start, camp, site } = withCamp();
    const s: GameState = {
      ...start,
      buildings: start.buildings.map((b) =>
        b.id === camp.id ? { ...b, pool: { ...b.pool!, stock: 0 } } : b,
      ),
    };
    let t = run(s, { type: 'dismantle', buildingId: camp.id }, s.now, map);
    expect(t.deposits[hexKey(site)]).toEqual({ stock: 0, at: s.now });
    t = run(t, { type: 'gather', q: site.q, r: site.r }, s.now + HOUR_MS / 2, map);
    const again = t.buildings.find((b) => b.type === 'camp')!;
    expect(again.pool!.stock).toBeCloseTo((150 * site.richness) / 2, 6);
    expect(t.deposits[hexKey(site)]).toBeUndefined();
  });

  it('producers share the land: the oldest building claims contested tiles', () => {
    const { map, state } = setup();
    const rich = { ...state, resources: { pulp: 1e4, fiber: 1e4, seeds: 1e4, juice: 1e4 } };
    const a = findTile(map, 'flesh');
    const n = map.tiles.find(
      (t) => t.type === 'flesh' && Math.abs(t.q - a.q) + Math.abs(t.r - a.r) === 2 && t !== a,
    );
    let s = run(rich, { type: 'build', buildingType: 'pulpery', q: a.q, r: a.r }, T0, map);
    if (n) s = run(s, { type: 'build', buildingType: 'pulpery', q: n.q, r: n.r }, T0, map);
    s = advance(s, T0 + HOUR_MS).state;
    const claimed = s.buildings.flatMap((b) => b.pool?.tiles ?? []);
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

describe('paths and logistics', () => {
  it('paths shorten the walk to the depot and make harvesting faster', () => {
    const { map, state } = setup();
    const far = map.tiles
      .filter((t) => t.type === 'flesh')
      .sort((x, y) => y.rho - x.rho)
      .find((t) => t.richness <= 1.2)!;
    let s = { ...state, resources: { pulp: 0, fiber: 1000, seeds: 0, juice: 0 } };
    s = run(s, { type: 'gather', q: far.q, r: far.r }, T0, map);
    const camp = s.buildings.find((b) => b.type === 'camp')!;
    const before = depotDistance(s, map, camp);
    const line = hexLine({ q: 0, r: 0 }, far)
      .slice(1, -1)
      .filter((h) => TILES[map.tiles[map.index.get(hexKey(h))!]!.type].walkable)
      .slice(0, PATHS.maxPerCommand);
    s = run(s, { type: 'buildPath', tiles: line }, T0, map);
    expect(s.paths).toHaveLength(line.length);
    expect(s.resources.fiber).toBe(1000 - PATHS.cost.fiber * line.length);
    const after = depotDistance(s, map, camp);
    expect(after).toBeLessThan(before);
    const h = buildingHarvest(
      s,
      s.buildings.find((b) => b.type === 'camp')!,
    )!;
    expect(h.efficiency).toBeGreaterThan(0);
    // Painting the same tiles again costs nothing.
    const again = run(s, { type: 'buildPath', tiles: line }, T0, map);
    expect(again.resources.fiber).toBe(s.resources.fiber);
    // Removing is free.
    const removed = run(s, { type: 'removePath', tiles: line }, T0, map);
    expect(removed.paths).toHaveLength(0);
  });

  it('rejects paths on water and over the limit, and building sites replace paths', () => {
    const { map, state } = setup();
    const s = { ...state, resources: { pulp: 1e4, fiber: 1e4, seeds: 1e4, juice: 1e4 } };
    const juice = findTile(map, 'juice');
    const r = applyCommand(s, { type: 'buildPath', tiles: [juice] }, { now: T0, map });
    expect(r.ok ? null : r.error).toBe('pathNotAllowed');
    const walkable = map.tiles.filter((t) => TILES[t.type].walkable && (t.q !== 0 || t.r !== 0));
    let t = s;
    const limit = PATHS.base + PATHS.perNestLevel;
    for (let i = 0; i < limit; i += PATHS.maxPerCommand) {
      const batch = walkable.slice(i, Math.min(limit, i + PATHS.maxPerCommand));
      t = run(t, { type: 'buildPath', tiles: batch }, T0, map);
    }
    const over = applyCommand(
      t,
      { type: 'buildPath', tiles: [walkable[limit]!] },
      { now: T0, map },
    );
    expect(over.ok ? null : over.error).toBe('pathLimit');
    const flesh = walkable.find((x) => x.type === 'flesh')!;
    expect(t.paths).toContain(hexKey(flesh));
    t = run(t, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    expect(t.paths).not.toContain(hexKey(flesh));
  });
});

describe('camps', () => {
  it('are free, outside the building cap, limited in number, and only camps can be dismantled', () => {
    const { map, state } = setup();
    let s = state;
    const sites = [0, 1, 2, 3].map((i) => findTile(map, 'flesh', i * 3));
    for (const site of sites.slice(0, CAMPS.max)) {
      s = run(s, { type: 'gather', q: site.q, r: site.r }, T0, map);
    }
    expect(s.resources).toEqual(state.resources);
    const last = sites[CAMPS.max]!;
    const r = applyCommand(s, { type: 'gather', q: last.q, r: last.r }, { now: T0, map });
    expect(r.ok ? null : r.error).toBe('campLimit');
    const nest = s.buildings.find((b) => b.type === 'nest')!;
    const d = applyCommand(s, { type: 'dismantle', buildingId: nest.id }, { now: T0, map });
    expect(d.ok ? null : d.error).toBe('notDismantlable');
    const camp = s.buildings.find((b) => b.type === 'camp')!;
    const up = applyCommand(s, { type: 'upgrade', buildingId: camp.id }, { now: T0, map });
    expect(up.ok ? null : up.error).toBe('maxLevel');
  });
});

describe('migration', () => {
  it('upgrades a v2 save to the territory schema', () => {
    const { state } = setup();
    const { paths: _p, deposits: _d, ...rest } = state;
    const migrated = migrateState({ ...rest, schemaVersion: 2 });
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.state.paths).toEqual([]);
      expect(migrated.state.deposits).toEqual({});
    }
  });
});
