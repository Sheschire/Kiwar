import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  BATTLE,
  buildLock,
  cloneState,
  enemyUnit,
  forgeRate,
  guardPower,
  hexDisk,
  hexDistance,
  HOUR_MS,
  IRON_SCALE,
  ITEMS,
  kiwiUnit,
  migrateState,
  orderWork,
  removeVillagers,
  simulateBattle,
  smithsOf,
  FORGE,
  type BattleSetup,
  type BuildingId,
  type Command,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** A Stone-age colony with a Forge, the `forge` technology and plenty of everything. */
function forgeColony(level = 1) {
  const { map, state } = setup('kiwisu', 'forge');
  const s: GameState = rich(state);
  s.buildings[0]!.level = 7;
  const mon = findTile(map, 'flesh', 6);
  const at = findTile(map, 'flesh', 10);
  s.buildings.push(
    {
      id: 'bmon' as BuildingId,
      type: 'monument',
      q: mon.q,
      r: mon.r,
      level: 1,
      richness: mon.richness,
      builtAt: T0,
    },
    {
      id: 'bforge' as BuildingId,
      type: 'forge',
      q: at.q,
      r: at.r,
      level,
      richness: at.richness,
      builtAt: T0,
      cramped: true,
    },
  );
  s.research.done = ['stoneAge', 'forge'];
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  s.threats.next = null;
  s.automation.meteor = false;
  s.automation.stardust = false;
  s.meteorIron = 30 * IRON_SCALE;
  return { map, s };
}

function err(s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
}

describe('the Forge (chantier 38)', () => {
  it('needs its technology, and only one stands', () => {
    const { s } = forgeColony();
    expect(buildLock(s, 'forge')).toBe('forgeExists');
    const none = cloneState(s);
    none.buildings = none.buildings.filter((b) => b.type !== 'forge');
    expect(buildLock(none, 'forge')).toBeNull();
    none.research.done = ['stoneAge'];
    expect(buildLock(none, 'forge')).toBe('techMissing');
  });

  it('works an order with the best smiths, exactly offline, into the armory', () => {
    const { map, s: s0 } = forgeColony();
    s0.villagers[0]!.stats.strength = 12;
    const before = s0.resources.fiber;
    const s = run(s0, { type: 'forgeItem', item: 'blade-stone' }, s0.now, map);
    expect(s.resources.fiber).toBe(before - ITEMS['blade-stone'].cost.fiber!);
    const smiths = smithsOf(s);
    expect(smiths.length).toBeGreaterThan(0);
    expect(smiths.map((v) => v.id)).toContain(s0.villagers[0]!.id);
    expect(smiths.every((v) => v.lent !== undefined)).toBe(true);
    const rate = forgeRate(s);
    expect(Number.isInteger(rate) && rate > 0).toBe(true);
    const end = s.now + 6 * HOUR_MS;
    const big = advance(s, end);
    let small = s;
    for (let t = s.now; t < end; t += 7 * 60_000 + 11) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.forge).toEqual(big.state.forge);
    expect(small.villagers).toEqual(big.state.villagers);
    expect(big.events.some((e) => e.type === 'itemForged' && e.item === 'blade-stone')).toBe(true);
    // The smiths went back, and a kiwi of the blade line took the sword.
    expect(smithsOf(big.state).filter((v) => v.lent !== undefined)).toHaveLength(0);
    expect(orderWork('blade-stone')).toBe(ITEMS['blade-stone'].workH * HOUR_MS * FORGE.rate);
  });

  it('refuses what it cannot make, and refunds a cancelled order', () => {
    const { map, s: s0 } = forgeColony();
    expect(err(s0, { type: 'forgeItem', item: 'blade-iron' }, map)).toBe('techMissing');
    const iron = cloneState(s0);
    iron.research.done.push('smelting');
    iron.meteorIron = 2 * IRON_SCALE;
    expect(err(iron, { type: 'forgeItem', item: 'blade-iron' }, map)).toBe('notEnoughIron');
    let s = run(s0, { type: 'forgeItem', item: 'light-stone' }, s0.now, map);
    s = run(s, { type: 'forgeItem', item: 'heavy-stone' }, s.now, map);
    expect(err(s, { type: 'forgeItem', item: 'mace-stone' }, map)).toBe('forgeQueueFull');
    expect(err(s, { type: 'cancelForge', orderId: 'nope' }, map)).toBe('unknownOrder');
    const pulp = s.resources.pulp;
    s = run(s, { type: 'cancelForge', orderId: s.forge.orders[1]!.id }, s.now, map);
    expect(s.resources.pulp).toBe(pulp + ITEMS['heavy-stone'].cost.pulp!);
    // Demolishing the Forge refunds the rest.
    const left = s.resources.pulp;
    s = run(s, { type: 'demolish', buildingId: 'bforge' as BuildingId }, s.now, map);
    expect(s.forge.orders).toHaveLength(0);
    expect(s.resources.pulp).toBeGreaterThanOrEqual(left + ITEMS['light-stone'].cost.pulp!);
    const noForge = cloneState(s);
    expect(err(noForge, { type: 'forgeItem', item: 'mace-stone' }, map)).toBe('noForge');
  });
});

describe('gear (chantier 38)', () => {
  /** A colony with a warrior guard, a mage and pieces in the armory. */
  function armed() {
    const { map, s } = forgeColony();
    const [a, b, c] = s.villagers;
    a!.classId = 'warrior';
    b!.classId = 'mage';
    c!.classId = 'warrior';
    a!.job = { kind: 'guard' };
    s.forge.armory = { 'blade-stone': 1, 'staff-stone': 1, 'heavy-stone': 1, 'light-stone': 1 };
    return { map, s, a: a!, b: b!, c: c! };
  }

  it('the automation dresses the guards first, each with a weapon of its line', () => {
    const { map, s: s0, a, b, c } = armed();
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const of = (id: string) => s.villagers.find((v) => v.id === id)!;
    expect(of(a.id).gear).toEqual({ weapon: 'blade-stone', armor: 'heavy-stone' });
    expect(of(b.id).gear?.weapon).toBe('staff-stone');
    // The light armour went to the next kiwi by strength.
    expect([of(b.id).gear?.armor, of(c.id).gear?.armor]).toContain('light-stone');
    expect(s.forge.armory).toEqual({});
  });

  it('equips by hand (kept), refuses a weapon of another line, takes it back on a new class', () => {
    const { map, s: s0, a, b } = armed();
    s0.automation.equip = false;
    expect(
      err(s0, { type: 'equip', villagerId: b.id, slot: 'weapon', item: 'blade-stone' }, map),
    ).toBe('wrongFamily');
    expect(
      err(s0, { type: 'equip', villagerId: b.id, slot: 'armor', item: 'blade-stone' }, map),
    ).toBe('wrongSlot');
    expect(
      err(s0, { type: 'equip', villagerId: b.id, slot: 'weapon', item: 'mace-stone' }, map),
    ).toBe('notInArmory');
    let s = run(
      s0,
      { type: 'equip', villagerId: a.id, slot: 'weapon', item: 'blade-stone' },
      s0.now,
      map,
    );
    const v = s.villagers.find((x) => x.id === a.id)!;
    expect(v.gear).toEqual({ weapon: 'blade-stone', kept: true });
    expect(s.forge.armory['blade-stone']).toBeUndefined();
    // A new line: the sword goes back to the armory.
    const changed = cloneState(s);
    changed.villagers.find((x) => x.id === a.id)!.classId = 'mage';
    s = run(changed, { type: 'debugGrant', resources: {} }, changed.now, map);
    expect(s.villagers.find((x) => x.id === a.id)!.gear?.weapon).toBeUndefined();
    expect(s.forge.armory['blade-stone']).toBe(1);
  });

  it('comes back to the armory when its kiwi dies, and migrates v31 saves', () => {
    const { map, s: s0, a } = armed();
    const s = run(s0, { type: 'debugGrant', resources: {} }, s0.now, map);
    const after = cloneState(s);
    removeVillagers(after, [a.id], 'predator', after.now);
    expect(after.forge.armory['blade-stone']).toBe(1);
    expect(after.forge.armory['heavy-stone']).toBe(1);
    const old = JSON.parse(JSON.stringify({ ...s0, schemaVersion: 31 })) as Record<string, unknown>;
    delete old.forge;
    const automation = old.automation as Record<string, boolean>;
    delete automation.forge;
    delete automation.equip;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.state.forge).toEqual({ orders: [], armory: {} });
      expect(m.state.automation.equip).toBe(true);
    }
  });

  it('an equipped guard fights better, and the garrison forecast sees it', () => {
    const { s, a } = armed();
    const bare = cloneState(s);
    const geared = cloneState(s);
    const g = geared.villagers.find((v) => v.id === a.id)!;
    g.gear = { weapon: 'blade-iron', armor: 'heavy-iron' };
    const at = { q: 0, r: 0 };
    const u0 = kiwiUnit(
      bare.villagers.find((v) => v.id === a.id)!,
      bare,
      'guard',
      at,
      'front',
    );
    const u1 = kiwiUnit(g, geared, 'guard', at, 'front');
    expect(u1.weapon.damage).toBeCloseTo(u0.weapon.damage * ITEMS['blade-iron'].damage!, 9);
    expect(u1.hp).toBeCloseTo(u0.hp * ITEMS['heavy-iron'].hp!, 9);
    expect(u1.armor).toBeGreaterThan(u0.armor);
    expect(u1.speed).toBeLessThan(u0.speed);
    expect(guardPower(g, geared).ground).toBeGreaterThan(guardPower(a, bare).ground);

    // Three guards against a pack of ferrets: the equipped ones take down more of them.
    const radius = 8;
    const tiles = hexDisk({ q: 0, r: 0 }, radius).map((h) => ({ ...h, cost: 1 }));
    const exits = tiles
      .map((t, i) => (hexDistance(t, { q: 0, r: 0 }) === radius ? i : -1))
      .filter((i) => i >= 0);
    const battle = (unit: typeof u0) => {
      const guards = [0, 1, 2].map((i) => ({ ...unit, ref: `g${i}`, at: { q: i - 1, r: 1 } }));
      const pack = Array.from({ length: 8 }, (_, i) =>
        enemyUnit(
          'soldier',
          1.6,
          `s${i}`,
          { q: radius, r: -radius },
          i * BATTLE.enterGap,
          'front',
          1,
        ),
      );
      const setup: BattleSetup = {
        tiles,
        exits,
        buildings: [
          {
            ref: 'w',
            type: 'warehouse',
            side: 0,
            tiles: [{ q: 0, r: 0 }],
            hp: 40,
            loot: [100, 100, 0, 0],
            priority: 1,
          },
        ],
        units: [...guards, ...pack],
        orders: [
          { posture: 'cautious', retreatBelow: 0 },
          { posture: 'bold', retreatBelow: 0 },
        ],
      };
      return simulateBattle(setup, 'forge').result;
    };
    const r0 = battle(u0);
    const r1 = battle(u1);
    expect(r1.attackers.fallen).toBeGreaterThan(r0.attackers.fallen);
  });
});
