import { describe, expect, it } from 'vitest';
import {
  BATTLE,
  WEAPONS,
  enemyUnit,
  hexDisk,
  hexDistance,
  simulateBattle,
  type BattleSetup,
  type BattleUnitSetup,
} from '@kiwar/shared';
import { buildTimeline, hpAt, placeAt, shownAt } from '../src/render/battle/timeline';

function battle() {
  const tiles = hexDisk({ q: 0, r: 0 }, 7).map((h) => ({ ...h, cost: 1 }));
  const exits = tiles
    .map((t, i) => (hexDistance(t, { q: 0, r: 0 }) === 7 ? i : -1))
    .filter((i) => i >= 0);
  const guard: BattleUnitSetup = {
    ...enemyUnit('soldier', 1, 'g1', { q: 3, r: -3 }, 0, 'front', 1),
    side: 0,
    body: 'kiwi',
    role: 'guard',
    kind: 'warrior',
    name: 'Pip',
    hp: 14,
    weaponId: 'sword',
    weapon: WEAPONS.sword,
    carry: 0,
    power: 0,
  };
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
        loot: [50, 50, 0, 0],
        priority: 1,
      },
    ],
    units: [
      guard,
      ...[0, 1, 2].map((i) =>
        enemyUnit('soldier', 1, `f${i}`, { q: 7, r: -7 }, i * BATTLE.enterGap, 'front', 1),
      ),
    ],
    orders: [
      { posture: 'bold', retreatBelow: 0 },
      { posture: 'bold', retreatBelow: BATTLE.retreatBelow },
    ],
  };
  return simulateBattle(setup, 'timeline');
}

describe('battle timeline (chantier 36)', () => {
  it('reads one track per unit: walks, blows, falls', () => {
    const log = battle();
    const tl = buildTimeline(log);
    expect(tl.tracks).toHaveLength(log.units.length);
    expect(tl.duration).toBeGreaterThan(tl.fight);
    const ferret = tl.tracks[1]!;
    // Predators come in, then walk.
    expect(shownAt(ferret, -1, 1)).toBe(false);
    expect(ferret.steps.length).toBeGreaterThan(0);
    const first = ferret.steps[0]!;
    expect(placeAt(ferret, first.t0).from).toEqual({ q: 7, r: -7 });
    // Hit points only go down, and a fallen unit has none left.
    for (const track of tl.tracks) {
      let last = track.maxHp;
      for (const h of track.hurts) {
        const hp = hpAt(track, h.t);
        expect(hp).toBeLessThanOrEqual(last + 1e-9);
        last = hp;
      }
      if (track.endKind === 'fall') expect(hpAt(track, track.end!)).toBeLessThanOrEqual(1e-6);
    }
  });
});

/** Chantier 41: a landing's journal (a crew on side 1, the field cleared ends it). */
function landing() {
  const tiles = hexDisk({ q: 0, r: 0 }, 6).map((h) => ({ ...h, cost: 1 }));
  const ship = { q: 0, r: 5 };
  const exits = tiles.map((t, i) => (hexDistance(t, ship) <= 1 ? i : -1)).filter((i) => i >= 0);
  const kiwi = (i: number): BattleUnitSetup => ({
    ...enemyUnit('soldier', 1, `k${i}`, { q: i - 1, r: 5 }, 0, null, 1),
    side: 1,
    body: 'kiwi',
    role: 'assault',
    kind: 'warrior',
    name: `Kiwi${i}`,
    hp: 16,
    weaponId: 'sword',
    weapon: WEAPONS.sword,
    carry: 0,
    power: 1,
  });
  const alien = (i: number): BattleUnitSetup => ({
    ...enemyUnit('soldier', 1, `a${i}`, { q: i - 1, r: -2 }, 0, null, 3),
    side: 0,
    role: 'guard',
    carry: 0,
  });
  const setup: BattleSetup = {
    tiles,
    exits,
    buildings: [],
    units: [0, 1, 2].map(kiwi).concat([0, 1, 2, 3].map(alien)),
    orders: [
      { posture: 'bold', retreatBelow: 0 },
      { posture: 'bold', retreatBelow: 0.5 + 1e-6, priority: 'nearest' },
    ],
    clearEnds: true,
  };
  return simulateBattle(setup, 'landing-timeline');
}

describe('landing timeline (chantier 41)', () => {
  it('replays exactly what the journal says: who fell on each side, when it ended', () => {
    const log = landing();
    const tl = buildTimeline(log);
    expect(tl.fight).toBeCloseTo(log.result.duration, 6);
    const fallen = (side: 0 | 1) =>
      tl.tracks.filter((t) => t.side === side && t.endKind === 'fall').map((t) => t.unit[0]);
    // Our crew lost: the journal's own list.
    expect(fallen(1).sort()).toEqual([...(log.result.lost ?? [])].sort());
    // The aliens left standing (or not) at the end.
    const standing = tl.tracks.filter((t) => t.side === 0 && t.endKind !== 'fall').length;
    expect(standing).toBe(log.result.defendersLeft ?? standing);
    // Twice the same journal, twice the same show.
    expect(buildTimeline(log)).toEqual(tl);
  });
});
