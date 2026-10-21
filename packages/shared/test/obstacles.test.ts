import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  faceMapOf,
  generateObstacles,
  HOUR_MS,
  isPlausible,
  migrateState,
  newGame,
  OBSTACLES,
  OBSTACLE_RULES,
  validateCommand,
  type GameState,
  type Obstacle,
} from '../src';
import { rich, run, T0 } from './helpers';

const SEED = 'obstacle-seed';

/** A colony on the biome drawn from the seed (imports check it). */
function colony() {
  const state = newGame({ seed: SEED, face: 'kiwisu', now: T0 });
  expect(state.params.biome).not.toBe('classic');
  return { state, map: faceMapOf(state) };
}

const first = (s: GameState, kind: Obstacle['kind']) => s.obstacles.find((o) => o.kind === kind)!;

describe('obstacles', () => {
  it('places rocks and stumps away from the Nest, never on the classic biome', () => {
    expect(newGame({ seed: SEED, face: 'kiwisu', now: T0, biome: 'classic' }).obstacles).toEqual(
      [],
    );
    const { state, map } = colony();
    const counts = { stump: 0, rock: 0, wreck: 0, ruin: 0, den: 0 };
    for (const o of state.obstacles) {
      counts[o.kind]++;
      const tile = map.tiles[map.index.get(`${o.q},${o.r}`)!]!;
      expect(OBSTACLES[o.kind].tiles).toContain(tile.type);
      expect(tile.rho).toBeGreaterThanOrEqual(OBSTACLE_RULES.rho[0]);
      expect(tile.flood).toBeUndefined();
    }
    expect(counts).toEqual({
      stump: OBSTACLES.stump.count,
      rock: OBSTACLES.rock.count,
      wreck: 0,
      ruin: 0,
      den: 0,
    });
    expect(new Set(state.obstacles.map((o) => o.id)).size).toBe(state.obstacles.length);
    // Deterministic, and drawn apart from the colony RNG.
    expect(colony().state).toEqual(state);
    const classic = newGame({ seed: SEED, face: 'kiwisu', now: T0, biome: 'classic' });
    expect(classic.villagers).toEqual(state.villagers);
    expect(classic.rng).toEqual(state.rng);
  });

  it('blocks buildings, camps and paths', () => {
    const { state, map } = colony();
    const s = rich(state);
    const o = first(s, 'stump');
    const ctx = { now: T0, map };
    expect(validateCommand(s, { type: 'gather', q: o.q, r: o.r }, ctx)).toBe('obstacle');
    expect(validateCommand(s, { type: 'buildPath', tiles: [{ q: o.q, r: o.r }] }, ctx)).toBe(
      'obstacle',
    );
    const tile = map.tiles[map.index.get(`${o.q},${o.r}`)!]!;
    const type = tile.type === 'grove' ? 'fiberWorkshop' : 'pulpery';
    expect(validateCommand(s, { type: 'build', buildingType: type, q: o.q, r: o.r }, ctx)).toBe(
      'obstacle',
    );
  });

  it('a builder clears a stump for its loot; rocks need a Kikiwiwi', () => {
    const { state, map } = colony();
    const s0 = state;
    const rock = first(s0, 'rock');
    expect(
      validateCommand(s0, { type: 'clearObstacle', q: rock.q, r: rock.r }, { now: T0, map }),
    ).toBe('needsKikiwiwi');
    expect(validateCommand(s0, { type: 'clearObstacle', q: 0, r: 0 }, { now: T0, map })).toBe(
      'noObstacle',
    );
    const stump = first(s0, 'stump');
    const s = run(s0, { type: 'clearObstacle', q: stump.q, r: stump.r }, T0, map);
    expect(s.queue[0]).toMatchObject({ kind: 'clear', q: stump.q, r: stump.r });
    expect(s.resources.pulp).toBe(s0.resources.pulp - OBSTACLE_RULES.clearCost.pulp!);
    expect(
      validateCommand(s, { type: 'clearObstacle', q: stump.q, r: stump.r }, { now: T0, map }),
    ).not.toBeNull();
    const end = T0 + 4 * HOUR_MS;
    const r = advance(s, end);
    expect(r.state.obstacles.some((o) => o.id === stump.id)).toBe(false);
    const cleared = r.events.find((e) => e.type === 'obstacleCleared');
    expect(cleared).toMatchObject({ kind: 'stump', by: 'kiwis' });
    // One big step = many small ones.
    let small = s;
    for (let t = T0; t < end; t += HOUR_MS / 7) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.obstacles).toEqual(r.state.obstacles);
    expect(small.villagers).toEqual(r.state.villagers);
    expect(small.resources.fiber).toBeCloseTo(r.state.resources.fiber, 6);
    // Cancelling gives the food back and keeps the stump.
    const c = run(s, { type: 'cancel', queueItemId: s.queue[0]!.id }, T0, map);
    expect(c.resources.pulp).toBe(s0.resources.pulp);
    expect(c.obstacles).toEqual(s0.obstacles);
  });

  it('a fading crater leaves a wreck', () => {
    const { state } = colony();
    const s = structuredClone(state);
    const taken = new Set(s.obstacles.map((o) => `${o.q},${o.r}`));
    const spot = faceMapOf(s).tiles.find(
      (t) => t.type === 'flesh' && t.rho > 0.5 && !taken.has(`${t.q},${t.r}`),
    )!;
    s.sky.meteors.push({
      id: 'mx',
      q: spot.q,
      r: spot.r,
      resource: 'seeds',
      stock: 0,
      max: 300,
      landedAt: T0,
      expiresAt: T0 + HOUR_MS,
    });
    const r = advance(s, T0 + 2 * HOUR_MS);
    expect(r.events.some((e) => e.type === 'wreckLeft')).toBe(true);
    const wreck = r.state.obstacles.find((o) => o.kind === 'wreck')!;
    expect(wreck).toMatchObject({ q: spot.q, r: spot.r, loot: OBSTACLES.wreck.loot });
    expect(isPlausible(r.state, T0 + 2 * HOUR_MS)).toBe(true);
  });

  it('migrates older games, only on free tiles', () => {
    const { state, map } = colony();
    const stump = first(state, 'stump');
    // An older game had a camp where a stump would now be.
    const old = structuredClone(state) as unknown as Record<string, unknown> & GameState;
    old.obstacles = [];
    old.buildings.push({
      id: 'b99' as never,
      type: 'camp',
      q: stump.q,
      r: stump.r,
      level: 1,
      richness: map.tiles[map.index.get(`${stump.q},${stump.r}`)!]!.richness,
      builtAt: T0,
    });
    const raw = { ...old, schemaVersion: 14 } as Record<string, unknown>;
    delete raw.obstacles;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.obstacles).toEqual(state.obstacles.filter((o) => o.id !== stump.id));
    expect(generateObstacles(map)).toEqual(state.obstacles);
  });

  it('refuses imported saves with made-up obstacles', () => {
    const { state } = colony();
    expect(isPlausible(state, T0)).toBe(true);
    const s = structuredClone(state);
    s.obstacles[0]!.loot = { seeds: 1e5 };
    expect(isPlausible(s, T0)).toBe(false);
    const t = structuredClone(state);
    t.obstacles.push({ id: 'rock:1,1', kind: 'rock', q: 1, r: 1, loot: {} });
    expect(isPlausible(t, T0)).toBe(false);
    // A command with a stump still goes through the server schema.
    const stump = first(state, 'stump');
    const r = applyCommand(
      state,
      { type: 'clearObstacle', q: stump.q, r: stump.r },
      {
        now: T0,
        map: faceMapOf(state),
      },
    );
    expect(r.ok).toBe(true);
  });
});
