import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  BUILDING_TYPES,
  capacity,
  cloneState,
  HOUR_MS,
  isPlausible,
  levelDef,
  maxLevelOf,
  migrateState,
  reserveCapOf,
  reserves,
  storageFullCheck,
  type Building,
  type Command,
  type GameState,
} from '../src';
import { findTile, run, setup } from './helpers';

/** A young colony with `count` level-1 warehouses, its stock just full. */
function withWarehouses(count: number) {
  const { map, state } = setup('kiwisu', 'reserves');
  let s: GameState = {
    ...state,
    resources: { pulp: 1000, fiber: 1000, seeds: 100, juice: 300 },
  };
  for (let i = 0; i < count; i++) {
    const t = findTile(map, 'flesh', 3 + i);
    s = run(s, { type: 'build', buildingType: 'warehouse', q: t.q, r: t.r }, s.now, map);
    s = advance(s, s.now + 10 * 60_000).state;
  }
  const cap = capacity(s);
  s = cloneState(s);
  s.resources = { ...cap };
  for (const b of s.buildings) delete b.reserve;
  const warehouses = s.buildings.filter((b) => b.type === 'warehouse');
  expect(warehouses).toHaveLength(count);
  return { map, s, warehouses };
}

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

const reserveOf = (s: GameState, b: Building) =>
  s.buildings.find((x) => x.id === b.id)!.reserve?.pulp ?? 0;

describe('warehouse reserves (chantier 30)', () => {
  it('never asks for more than the stock a colony can hold at the Nest it needs', () => {
    // The Nest of that level and a single warehouse of the same level, no technology.
    const stock = (nest: number) =>
      levelDef('nest', nest)!.storage! + levelDef('warehouse', nest)!.storage!;
    for (const type of BUILDING_TYPES) {
      for (let level = 1; level <= maxLevelOf(type); level++) {
        const def = levelDef(type, level)!;
        const nest = type === 'nest' ? level - 1 : def.requiresNestLevel;
        if (nest < 1) continue;
        for (const v of Object.values(def.cost)) expect(v).toBeLessThanOrEqual(stock(nest));
      }
    }
  });

  it('fills the reserves once the stock is full, one warehouse after another', () => {
    const { s, warehouses } = withWarehouses(2);
    const [first, second] = warehouses as [Building, Building];
    expect(storageFullCheck(s)('pulp')).toBe(false);
    const later = advance(s, s.now + 2 * HOUR_MS).state;
    expect(later.resources.pulp).toBeCloseTo(capacity(later).pulp, 6);
    expect(reserveOf(later, first)).toBeGreaterThan(0);
    expect(reserveOf(later, second)).toBe(0);
    const { state: full, events } = advance(s, s.now + 72 * HOUR_MS);
    const cap = reserveCapOf(full, first);
    expect(reserveOf(full, first)).toBeCloseTo(cap, 6);
    expect(reserveOf(full, second)).toBeCloseTo(cap, 6);
    // With every reserve full, harvesting pauses (and the colony is told so).
    expect(storageFullCheck(full)('pulp')).toBe(true);
    expect(events.some((e) => e.type === 'storageFull' && e.resource === 'pulp')).toBe(true);
  });

  it('gives the same reserves in one big step or many small ones (3 days away)', () => {
    const { s } = withWarehouses(2);
    const end = s.now + 72 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now; t < end; t += 17 * 60_000 + 7) small = advance(small, t).state;
    small = advance(small, end).state;
    const a = reserves(big).stock;
    const b = reserves(small).stock;
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const) {
      expect(b[id]).toBeCloseTo(a[id], 3);
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 3);
    }
  });

  it('brings a reserve back into the stock, as much as fits', () => {
    const { map, s, warehouses } = withWarehouses(1);
    const w = warehouses[0]!;
    const filled = advance(s, s.now + 3 * HOUR_MS).state;
    const kept = reserveOf(filled, w);
    expect(kept).toBeGreaterThan(100);
    expect(errorOf(filled, { type: 'collect', buildingId: w.id }, map)).toBe('nothingToCollect');
    // Spend 100 pulp: only those 100 come back.
    const spent = cloneState(filled);
    spent.resources.pulp -= 100;
    const after = run(spent, { type: 'collect', buildingId: w.id }, spent.now, map);
    expect(after.resources.pulp).toBeCloseTo(capacity(after).pulp, 6);
    expect(reserveOf(after, w)).toBeCloseTo(kept - 100, 6);
    // Spend everything: the whole reserve comes back.
    const empty = cloneState(after);
    empty.resources.pulp = 0;
    const all = run(empty, { type: 'collectAll' }, empty.now, map);
    const back = Math.min(kept - 100, capacity(all).pulp);
    expect(all.resources.pulp).toBeCloseTo(back, 6);
    expect(reserveOf(all, w)).toBeCloseTo(kept - 100 - back, 6);
    const nestId = s.buildings[0]!.id;
    expect(errorOf(all, { type: 'collect', buildingId: nestId }, map)).toBe('notWarehouse');
  });

  it('gives a demolished warehouse’s reserve back to the stock, even above the cap', () => {
    const { map, s, warehouses } = withWarehouses(1);
    const w = warehouses[0]!;
    const filled = advance(s, s.now + 3 * HOUR_MS).state;
    const kept = reserveOf(filled, w);
    const before = filled.resources.pulp;
    const after = run(filled, { type: 'demolish', buildingId: w.id }, filled.now, map);
    expect(after.resources.pulp).toBeGreaterThanOrEqual(before + kept - 1e-6);
  });

  it('keeps reserves through a save and checks them on import', () => {
    const { s, warehouses } = withWarehouses(1);
    const filled = advance(s, s.now + 3 * HOUR_MS).state;
    const m = migrateState(structuredClone(filled));
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(reserveOf(m.state, warehouses[0]!)).toBeCloseTo(reserveOf(filled, warehouses[0]!), 9);
    expect(isPlausible(filled, filled.now)).toBe(true);
    const cheat = cloneState(filled);
    cheat.buildings.find((b) => b.id === warehouses[0]!.id)!.reserve!.pulp = 1e6;
    expect(isPlausible(cheat, cheat.now)).toBe(false);
  });

  it('migrates v24 games with empty reserves', () => {
    const { s } = withWarehouses(1);
    const raw = structuredClone(s) as unknown as Record<string, unknown>;
    raw.schemaVersion = 24;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (m.ok) expect(reserves(m.state).stock.pulp).toBe(0);
  });
});
