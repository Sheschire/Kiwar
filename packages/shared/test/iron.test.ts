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
  levelDef,
  TECHS,
  BUILDING_TYPES,
  BUILDINGS,
  applyCommand,
  type BuildingId,
} from '../src';
import { kiwi, rich, run, setup, T0 } from './helpers';

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
    expect(m.max).toBe(Math.round(meteorStock(s, m.landedAt) * IRON.resourceShare));
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

describe('what meteoric iron pays for (chantier 38)', () => {
  it('levels 7+, the monuments of the Iron and Industry ages, turrets 3+, a few techs', () => {
    expect(levelDef('pulpery', 6)!.iron).toBeUndefined();
    expect(levelDef('pulpery', 7)!.iron).toBe(IRON.levels[7]);
    expect(levelDef('nest', 12)!.iron).toBe(IRON.levels[12]);
    expect(levelDef('monument', 1)!.iron).toBeUndefined();
    expect(levelDef('monument', 2)!.iron).toBe(IRON.own.monument![2]);
    expect(levelDef('monument', 3)!.iron).toBe(IRON.own.monument![3]);
    expect(levelDef('seedTurret', 2)!.iron).toBeUndefined();
    expect(levelDef('seedTurret', 3)!.iron).toBe(IRON.turret[3]);
    expect(levelDef('forge', 3)!.iron).toBe(IRON.own.forge![3]);
    expect(TECHS.armor.iron).toBeGreaterThan(0);
    expect(TECHS.firearms.iron).toBeGreaterThan(0);
  });

  it('never costs more than the iron the Nest it needs can hold (no blocked game)', () => {
    for (const type of BUILDING_TYPES)
      BUILDINGS[type].levels.forEach((l, i) => {
        if (!l.iron) return;
        const nest = type === 'nest' ? i : l.requiresNestLevel;
        expect(l.iron, `${type} ${i + 1}`).toBeLessThanOrEqual(IRON.cap[nest]!);
      });
  });

  it('an upgrade pays its iron and gets it back when cancelled', () => {
    const { map, state } = setup();
    const s = rich(state);
    const turret = {
      ...s.buildings[0]!,
      id: 'bt' as BuildingId,
      type: 'seedTurret' as const,
      level: 2,
    };
    s.buildings = [...s.buildings, turret];
    s.buildings[0] = { ...s.buildings[0]!, level: 3 };
    // Refunds fill up to the cap: start from it.
    s.meteorIron = ironCap(s);
    const before = s.meteorIron;
    const poor = cloneState(s);
    poor.meteorIron = 0;
    const r = applyCommand(poor, { type: 'upgrade', buildingId: turret.id }, { now: s.now, map });
    expect(!r.ok && r.error).toBe('notEnoughIron');
    let after = run(s, { type: 'upgrade', buildingId: turret.id }, s.now, map);
    expect(after.meteorIron).toBe(before - IRON.turret[3]! * IRON_SCALE);
    after = run(after, { type: 'cancel', queueItemId: after.queue[0]!.id }, after.now, map);
    expect(after.meteorIron).toBe(before);
  });

  it('a technology pays its iron when chosen and gets it back when abandoned', () => {
    const { map, state } = setup();
    const s = rich(state);
    s.buildings.push({
      ...s.buildings[0]!,
      id: 'bm' as BuildingId,
      type: 'monument',
      level: 2,
      q: 99,
      r: 99,
    });
    s.buildings.push({
      ...s.buildings[0]!,
      id: 'bl' as BuildingId,
      type: 'library',
      level: 4,
      q: 98,
      r: 98,
    });
    s.meteorIron = ironCap(s);
    const before = s.meteorIron;
    let after = run(s, { type: 'setResearch', tech: 'armor' }, s.now, map);
    expect(after.meteorIron).toBe(before - TECHS.armor.iron! * IRON_SCALE);
    after = run(after, { type: 'setResearch', tech: null }, after.now, map);
    expect(after.meteorIron).toBe(before);
  });
});
