import { describe, expect, it } from 'vitest';
import {
  advance,
  buildingAt,
  cloneState,
  deserializeSave,
  faceMapOf,
  kiwaiMapOf,
  migrateState,
  moduleSpotError,
  occupancy,
  ORBIT,
  serializeSave,
  smallMap,
  hexDistance,
  hexKey,
  HOUR_MS,
  type GameState,
  type Kiwai,
  type VillagerId,
} from '../src';
import { setup, T0 } from './helpers';

function withKiwai(s: GameState): GameState {
  const c = cloneState(s);
  const kiwai: Kiwai = {
    id: 'k1',
    type: 'greenhouse',
    place: 0,
    launchedAt: T0,
    readyAt: T0 + HOUR_MS,
    modules: [
      { id: 'm1', type: 'habitat', q: 1, r: 0, readyAt: T0 + HOUR_MS },
      { id: 'm2', type: 'dome', q: 0, r: 1, readyAt: T0 + HOUR_MS, broken: T0 + 2 * HOUR_MS },
    ],
    dust: 0,
    wear: { n: 0, at: 0, moduleId: null },
  };
  c.orbit = { kiwais: [kiwai], shuttle: null, launched: 1 };
  return c;
}

describe('chantier 53, small maps', () => {
  it('draws a disc of 19 tiles: the pad at the centre, a few rocks apart on the ring', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const map = smallMap(`seed-${seed}`, ORBIT.radius, ORBIT.rocks);
      expect(map.tiles).toHaveLength(19);
      expect(map.tiles[0]).toMatchObject({ q: 0, r: 0, kind: 'pad' });
      const rocks = map.tiles.filter((t) => t.kind === 'rock');
      expect(rocks.length).toBeGreaterThanOrEqual(ORBIT.rocks[0]);
      expect(rocks.length).toBeLessThanOrEqual(ORBIT.rocks[1]);
      for (const r of rocks) {
        expect(hexDistance(r, { q: 0, r: 0 })).toBe(ORBIT.radius);
        for (const o of rocks) if (o !== r) expect(hexDistance(r, o)).toBeGreaterThan(1);
      }
      // Same seed, same map.
      expect(smallMap(`seed-${seed}`, ORBIT.radius, ORBIT.rocks)).toBe(map);
    }
  });

  it('gives each kiwai its own map, from public seeds', () => {
    const { state } = setup();
    const a = kiwaiMapOf(state, { id: 'k1' });
    const b = kiwaiMapOf(state, { id: 'k2' });
    expect(a.key).not.toBe(b.key);
    expect(kiwaiMapOf(state, { id: 'k1' })).toBe(a);
  });

  it('never mixes a kiwai with the face', () => {
    const { state } = setup();
    const s = withKiwai(state);
    // The face sees nothing of the orbit.
    expect(faceMapOf(s)).toBe(faceMapOf(state));
    expect([...occupancy(s).tiles.keys()].sort()).toEqual(
      [...occupancy(state).tiles.keys()].sort(),
    );
    expect(buildingAt(s, 1, 0)).toBe(buildingAt(state, 1, 0));
    expect(buildingAt(s, 0, 1)).toBe(buildingAt(state, 0, 1));
    // The kiwai sees nothing of the face: the Nest stands on the heart, the kiwai's (0, 0) is
    // its pad, and a surface building elsewhere never blocks a module.
    const kiwai = s.orbit.kiwais[0]!;
    const nest = s.buildings.find((b) => b.type === 'nest')!;
    const map = kiwaiMapOf(s, kiwai);
    const free = map.tiles.find(
      (t) => t.kind === 'ground' && !kiwai.modules.some((m) => m.q === t.q && m.r === t.r),
    )!;
    const moved = cloneState(s);
    moved.buildings = moved.buildings.map((b) =>
      b.id === nest.id ? { ...b, q: free.q, r: free.r } : b,
    );
    expect(moduleSpotError(moved, moved.orbit.kiwais[0]!, free)).toBeNull();
    expect(moduleSpotError(s, kiwai, { q: 1, r: 0 })).toBe('tileOccupied');
    expect(moduleSpotError(s, kiwai, { q: 0, r: 0 })).toBe('pad');
    expect(moduleSpotError(s, kiwai, { q: 3, r: 0 })).toBe('offSite');
    const rock = map.tiles.find((t) => t.kind === 'rock')!;
    expect(moduleSpotError(s, kiwai, rock)).toBe('rock');
    expect(hexKey(free)).not.toBe('0,0');
  });

  it('leaves the surface unchanged: a colony with a kiwai lives the same days', () => {
    const { state } = setup();
    const s = withKiwai(state);
    const later = T0 + 48 * HOUR_MS;
    const a = advance(state, later).state;
    const b = advance(s, later).state;
    const strip = (x: GameState) => ({ ...x, orbit: null });
    expect(strip(b)).toEqual(strip(a));
  });
});

describe('chantier 53, the orbit in the state', () => {
  it('starts empty and is deep-copied', () => {
    const { state } = setup();
    expect(state.orbit).toEqual({ kiwais: [], shuttle: null, launched: 0 });
    const s = withKiwai(state);
    s.orbit.shuttle = {
      kiwaiId: 'k1',
      leftAt: T0,
      upAt: T0 + 1,
      backAt: T0 + 2,
      up: ['v1' as VillagerId],
      down: [],
      cargo: 0,
    };
    const c = cloneState(s);
    c.orbit.kiwais[0]!.modules[0]!.broken = 5;
    c.orbit.kiwais[0]!.wear.n = 3;
    c.orbit.shuttle!.up.push('v2' as VillagerId);
    expect(s.orbit.kiwais[0]!.modules[0]!.broken).toBeUndefined();
    expect(s.orbit.kiwais[0]!.wear.n).toBe(0);
    expect(s.orbit.shuttle!.up).toEqual(['v1']);
  });

  it('round-trips through a save', () => {
    const { state } = setup();
    const s = withKiwai(state);
    const loaded = deserializeSave(serializeSave(s, T0));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.state.orbit).toEqual(s.orbit);
  });

  it('migrates a v42 save to an empty orbit', () => {
    const { state } = setup();
    const raw = structuredClone(state) as unknown as Record<string, unknown>;
    raw.schemaVersion = 42;
    delete raw.orbit;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.orbit).toEqual({ kiwais: [], shuttle: null, launched: 0 });
  });
});
