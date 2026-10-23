import { describe, expect, it } from 'vitest';
import {
  BATTLE,
  EV,
  WEAPONS,
  decodeEvents,
  decodeInts,
  encodeInts,
  enemyUnit,
  hexDisk,
  hexDistance,
  simulateBattle,
  tileCode,
  type BattleBuilding,
  type BattleSetup,
  type BattleUnitSetup,
  type EnemyKind,
  type Hex,
} from '../src';

const RADIUS = 9;

/** A plain disc: the outer ring is where the predators come in. */
function arena(): Pick<BattleSetup, 'tiles' | 'exits'> {
  const tiles = hexDisk({ q: 0, r: 0 }, RADIUS).map((h) => ({ ...h, cost: 1 }));
  const exits = tiles
    .map((t, i) => (hexDistance(t, { q: 0, r: 0 }) === RADIUS ? i : -1))
    .filter((i) => i >= 0);
  return { tiles, exits };
}

const store = (ref: string, at: Hex, loot = 100, priority = 1): BattleBuilding => ({
  ref,
  type: 'warehouse',
  side: 0,
  tiles: [at],
  hp: 40,
  loot: [loot, loot, 0, 0],
  priority,
});

function guard(ref: string, at: Hex, weaponId: keyof typeof WEAPONS = 'sword'): BattleUnitSetup {
  return {
    ref,
    side: 0,
    body: 'kiwi',
    role: 'guard',
    kind: 'warrior',
    name: ref,
    level: 1,
    classId: 'warrior',
    hp: 14,
    armor: 0,
    speed: 1.3,
    dodge: 0.05,
    size: 1,
    flying: false,
    fixed: false,
    weaponId,
    weapon: WEAPONS[weaponId],
    ammo: null,
    carry: 0,
    power: 0,
    at,
    delay: 0,
    building: null,
    fightsBack: true,
    huntsKiwis: false,
    sector: 'front',
  };
}

function turret(ref: string, at: Hex, building: number, air: boolean, ammo = 20): BattleUnitSetup {
  const w = WEAPONS[air ? 'skyShot' : 'seedShot'];
  return {
    ...guard(ref, at),
    body: 'turret',
    role: 'turret',
    kind: air ? 'skyTurret' : 'seedTurret',
    size: 0,
    fixed: true,
    weaponId: air ? 'skyShot' : 'seedShot',
    weapon: { ...w, damage: 3.2 },
    ammo,
    building,
  };
}

function raiders(kind: EnemyKind, count: number, from: Hex, k = 1): BattleUnitSetup[] {
  return Array.from({ length: count }, (_, i) =>
    enemyUnit(kind, k, `${kind}${i}`, from, i * BATTLE.enterGap, 'front', 1),
  );
}

function setup(units: BattleUnitSetup[], buildings: BattleBuilding[]): BattleSetup {
  return {
    ...arena(),
    buildings,
    units,
    orders: [
      { posture: 'cautious', retreatBelow: 0 },
      { posture: 'bold', retreatBelow: BATTLE.retreatBelow },
    ],
  };
}

const EDGE: Hex = { q: RADIUS, r: -RADIUS };

describe('battle codec', () => {
  it('round-trips integers', () => {
    const values = [0, 1, 31, 32, 33, 1023, 1024, 99999, 4096 * 3 + 7];
    expect(decodeInts(encodeInts(values))).toEqual(values);
  });
});

describe('battle engine', () => {
  it('gives the same journal for the same setup and seed', () => {
    const s = setup(
      [guard('g1', { q: 2, r: -2 }), ...raiders('soldier', 8, EDGE)],
      [store('w1', { q: 0, r: 0 })],
    );
    const a = simulateBattle(s, 'seed-1');
    const b = simulateBattle(structuredClone(s), 'seed-1');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = simulateBattle(s, 'seed-2');
    expect(c.events).not.toBe(a.events);
  });

  it('lets undefended raiders carry the loot away', () => {
    const log = simulateBattle(
      setup(raiders('soldier', 6, EDGE), [store('w1', { q: 0, r: 0 })]),
      's',
    );
    expect(log.result.held).toBe(false);
    const taken = log.result.loot.reduce((sum, l) => sum + l.amounts[0] + l.amounts[1], 0);
    expect(taken).toBeGreaterThan(0);
    expect(log.result.attackers.escaped).toBeGreaterThan(0);
  });

  it('goes for the store that is closest to the rampart first', () => {
    const near = store('near', { q: 6, r: -6 });
    const far = store('far', { q: -6, r: 6 });
    const log = simulateBattle(setup(raiders('scout', 2, EDGE), [near, far]), 's');
    const first = decodeEvents(log.events, log.dt).find((e) => e.code === EV.loot);
    expect(first?.args[1]).toBe(0);
  });

  it('a strong garrison holds and some kiwis may fall, never the buildings', () => {
    const guards = [0, 1, 2, 3, 4, 5].map((i) => guard(`g${i}`, { q: 5, r: -5 + (i % 3) }));
    const log = simulateBattle(
      setup([...guards, ...raiders('soldier', 4, EDGE)], [store('w1', { q: 0, r: 0 })]),
      's',
    );
    expect(log.result.held).toBe(true);
    expect(log.result.attackers.fallen + log.result.attackers.escaped).toBe(4);
  });

  it('swords never reach the bats; a sky turret does', () => {
    const swords = simulateBattle(
      setup(
        [guard('g1', { q: 1, r: 0 }), guard('g2', { q: 0, r: 1 }), ...raiders('diver', 3, EDGE)],
        [store('w1', { q: 0, r: 0 })],
      ),
      's',
    );
    const hitBats = decodeEvents(swords.events, swords.dt).some(
      (e) => e.code === EV.attack && e.args[0]! < 2 && e.args[2]! > 0,
    );
    expect(hitBats).toBe(false);
    const sky = simulateBattle(
      setup(
        [turret('t1', { q: 1, r: -1 }, 1, true, 40), ...raiders('diver', 3, EDGE)],
        [store('w1', { q: 0, r: 0 }), { ...store('t1', { q: 1, r: -1 }, 0), type: 'skyTurret' }],
      ),
      's',
    );
    expect(sky.result.attackers.fallen).toBeGreaterThan(0);
  });

  it('a bard sings: the fighters around it hit harder (chantier 37)', () => {
    const units = (aura: boolean) => [
      guard('g1', { q: 3, r: -3 }),
      {
        ...guard('bard', { q: 2, r: -2 }, 'song'),
        kind: 'bard',
        classId: 'bard' as const,
        ...(aura ? { aura: { range: 2, boost: 0.2 } } : {}),
      },
      ...raiders('soldier', 3, EDGE),
    ];
    const blows = (aura: boolean) => {
      const log = simulateBattle(setup(units(aura), [store('w1', { q: 0, r: 0 })]), 's');
      const hits = decodeEvents(log.events, log.dt).filter(
        (e) => e.code === EV.attack && e.args[0] === 0 && e.args[2]! > 0,
      );
      return hits.reduce((sum, e) => sum + e.args[2]!, 0) / Math.max(1, hits.length);
    };
    expect(blows(true)).toBeGreaterThan(blows(false) * 1.1);
  });

  it('a dagger goes for the thieves first (chantier 37)', () => {
    const pack = [
      ...raiders('soldier', 3, EDGE),
      ...raiders('scout', 2, EDGE).map((u) => ({ ...u, ref: `t${u.ref}` })),
    ];
    const log = simulateBattle(
      setup([guard('g1', { q: 7, r: -7 }, 'dagger'), ...pack], [store('w1', { q: 0, r: 0 })]),
      's',
    );
    const first = decodeEvents(log.events, log.dt).find(
      (e) => e.code === EV.attack && e.args[0] === 0,
    );
    expect(first).toBeDefined();
    const target = (first!.args[1]! >> 1) - 1;
    expect(pack[target]!.kind).toBe('scout');
  });

  it('two teams of the same size but other classes fight differently (chantier 37)', () => {
    const team = (w: keyof typeof WEAPONS) =>
      [0, 1, 2, 3].map((i) => guard(`g${i}`, { q: 4, r: -4 + (i % 2) }, w));
    const bats = raiders('diver', 3, EDGE).map((u) => ({ ...u, ref: `b${u.ref}` }));
    const fight = (w: keyof typeof WEAPONS) =>
      simulateBattle(
        setup([...team(w), ...raiders('soldier', 4, EDGE), ...bats], [store('w1', { q: 0, r: 0 })]),
        's',
      );
    // Units 0–3 are the kiwis, 4–7 the ferrets, 8–10 the bats.
    const batsDown = (w: keyof typeof WEAPONS) => {
      const log = fight(w);
      return decodeEvents(log.events, log.dt).filter((e) => e.code === EV.fall && e.args[0]! >= 8)
        .length;
    };
    expect(JSON.stringify(fight('sword').result)).not.toBe(JSON.stringify(fight('sling').result));
    expect(batsDown('sword')).toBe(0);
    expect(batsDown('sling')).toBeGreaterThan(0);
  });

  it('a turret only fires within its range', () => {
    const t = turret('t1', { q: -6, r: 6 }, 1, false);
    const log = simulateBattle(
      setup(
        [t, ...raiders('soldier', 3, EDGE)],
        [store('w1', { q: 5, r: -5 }), { ...store('t1', { q: -6, r: 6 }, 0), type: 'seedTurret' }],
      ),
      's',
    );
    expect(log.result.shots.t1 ?? 0).toBe(0);
  });

  it('the attackers run away under their retreat threshold', () => {
    const guards = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => guard(`g${i}`, { q: 6, r: -6 + (i % 4) }));
    const log = simulateBattle(
      setup([...guards, ...raiders('soldier', 10, EDGE)], [store('w1', { q: 0, r: 0 })]),
      's',
    );
    const fled = decodeEvents(log.events, log.dt).filter((e) => e.code === EV.flee);
    expect(fled.length).toBeGreaterThan(0);
  });

  it('keeps 60 against 60 within the time and size budget', () => {
    const buildings = Array.from({ length: 30 }, (_, i) => {
      const h = hexDisk({ q: 0, r: 0 }, 5)[i * 3]!;
      return store(`b${i}`, h, 200, 1 + (i % 3));
    });
    const blocked = new Set(buildings.map((b) => tileCode(b.tiles[0]!)));
    const spots = hexDisk({ q: 0, r: 0 }, 7).filter(
      (h) => hexDistance(h, { q: 0, r: 0 }) >= 6 && !blocked.has(tileCode(h)),
    );
    const guards = Array.from({ length: 60 }, (_, i) =>
      guard(`g${i}`, spots[i % spots.length]!, i % 3 === 0 ? 'fireball' : 'sword'),
    );
    const edges = [EDGE, { q: -RADIUS, r: RADIUS }, { q: 0, r: -RADIUS }];
    const enemies = Array.from({ length: 60 }, (_, i) =>
      enemyUnit(
        i % 5 === 0 ? 'diver' : i % 7 === 0 ? 'brute' : 'soldier',
        1.5,
        `e${i}`,
        edges[i % 3]!,
        Math.floor(i / 3) * BATTLE.enterGap,
        'front',
        3,
      ),
    );
    const s = setup([...guards, ...enemies], buildings);
    simulateBattle(s, 'warm');
    const t0 = performance.now();
    const log = simulateBattle(s, 'big');
    const ms = performance.now() - t0;
    const size = JSON.stringify(log).length;
    expect(ms).toBeLessThan(150);
    expect(size).toBeLessThan(60_000);
  });
});
