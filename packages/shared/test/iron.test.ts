import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  craterIron,
  ironCap,
  IRON,
  IRON_SCALE,
  meteorIronOf,
  meteorIronRate,
  meteorStock,
  METEORS,
  migrateState,
  minersOf,
  removeObstacle,
  leaveWreck,
  isPlausible,
  type GameEvent,
  type GameState,
} from '../src';
import { kiwi, run, setup, T0 } from './helpers';

const HOUR = 3_600_000;

/** A colony of twelve kiwis, just after its first meteorite landed. */
function landed() {
  const { map, state } = setup();
  for (let i = state.villagers.length; i < 12; i++) state.villagers.push(kiwi(`k${i}`));
  const { state: s, events } = advance(state, T0 + METEORS.firstMs + 1);
  return { map, s, events };
}

describe('meteoric iron (chantier 38)', () => {
  it('a crater holds mostly iron, plus a small share of its old resource', () => {
    const { s, events } = landed();
    const m = s.sky.meteors[0]!;
    expect(m.ironMax).toBe(craterIron(s));
    expect(m.ironMax).toBe(IRON.crater * IRON_SCALE);
    expect(m.stock).toBe(Math.round(meteorStock(s, m.landedAt) * IRON.resourceShare));
    const e = events.find((x) => x.type === 'meteorLanded');
    expect(e && e.type === 'meteorLanded' && e.iron).toBe(IRON.crater);
  });

  it('its miners dig iron at an integer rate, exactly offline', () => {
    const { map, s: s0 } = landed();
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const m = s.sky.meteors[0]!;
    expect(minersOf(s, m.id).length).toBe(Math.floor(s.villagers.length * METEORS.autoShare));
    const rate = meteorIronRate(s, m);
    expect(Number.isInteger(rate)).toBe(true);
    const end = s.now + 30 * HOUR;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now; t < end; t += 13 * 60_000 + 7) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(big.meteorIron).toBeGreaterThan(0);
    expect(small.meteorIron).toBe(big.meteorIron);
    expect(small.sky).toEqual(big.sky);
    expect(small.villagers).toEqual(big.villagers);
  });

  it('stops at the cap of the Nest, and the miners go back to work', () => {
    const { map, s: s0 } = landed();
    const cap = ironCap(s0);
    expect(cap).toBe(IRON.cap[1]! * IRON_SCALE);
    s0.meteorIron = cap - IRON_SCALE / 2;
    // Nothing else to take from the crater.
    s0.sky.meteors[0]!.stock = 0;
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    expect(minersOf(s, 'm1').length).toBeGreaterThan(0);
    const { state: after, events } = advance(s, s.now + 24 * HOUR);
    expect(after.meteorIron).toBe(cap);
    expect(events.some((e: GameEvent) => e.type === 'ironFull')).toBe(true);
    expect(minersOf(after, 'm1')).toHaveLength(0);
    expect(meteorIronOf(after)).toBe(IRON.cap[1]);
  });

  it('a smashed wreck gives a little iron', () => {
    const { s: s0 } = landed();
    const s = cloneState(s0);
    const events: GameEvent[] = [];
    const m = s.sky.meteors[0]!;
    s.sky.meteors = [];
    leaveWreck(s, m, s.now, events);
    const wreck = s.obstacles.find((o) => o.kind === 'wreck')!;
    expect(wreck.iron).toBe(IRON.wreck);
    removeObstacle(s, wreck, s.now, events, 'titan');
    expect(meteorIronOf(s)).toBe(IRON.wreck);
    const cleared = events.find((e) => e.type === 'obstacleCleared');
    expect(cleared && cleared.type === 'obstacleCleared' && cleared.iron).toBe(IRON.wreck);
  });

  it('never leaves more than three days without a fall', () => {
    const { state } = setup();
    const { events } = advance(state, T0 + 12 * 24 * HOUR);
    const falls = events.filter((e) => e.type === 'meteorLanded').map((e) => e.at);
    expect(falls.length).toBeGreaterThanOrEqual(9);
    let last = T0;
    for (const at of falls) {
      expect(at - last).toBeLessThanOrEqual(IRON.guaranteeMs);
      last = at;
    }
  });

  it('falls on any free tile of a crowded colony', () => {
    const { map, state } = setup();
    // Every tile where meteorites usually land is taken by an obstacle.
    const s: GameState = cloneState(state);
    s.obstacles = map.tiles
      .filter((t) => (METEORS.tiles as readonly string[]).includes(t.type))
      .map((t) => ({ id: `rock:${t.q},${t.r}`, kind: 'rock' as const, q: t.q, r: t.r, loot: {} }));
    const after = advance(s, T0 + METEORS.firstMs + 1).state;
    expect(after.sky.meteors).toHaveLength(1);
    const m = after.sky.meteors[0]!;
    const tile = map.tiles.find((t) => t.q === m.q && t.r === m.r)!;
    expect(METEORS.tiles as readonly string[]).not.toContain(tile.type);
  });

  it('migrates v30 saves and checks imported iron', () => {
    const { s } = landed();
    const old = JSON.parse(JSON.stringify({ ...s, schemaVersion: 30 })) as Record<string, unknown>;
    delete old.meteorIron;
    const sky = old.sky as { meteors: Record<string, unknown>[] };
    for (const m of sky.meteors) {
      delete m.iron;
      delete m.ironMax;
    }
    const r = migrateState(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.meteorIron).toBe(0);
    expect(r.state.sky.meteors[0]!.iron).toBe(0);
    // Imports (a plain colony: no test kiwis).
    const plain = advance(setup().state, T0 + METEORS.firstMs + 1).state;
    plain.meteorIron = ironCap(plain);
    expect(isPlausible(plain, plain.now)).toBe(true);
    const cheat = cloneState(plain);
    cheat.meteorIron = ironCap(plain) + IRON_SCALE;
    expect(isPlausible(cheat, plain.now)).toBe(false);
  });
});
