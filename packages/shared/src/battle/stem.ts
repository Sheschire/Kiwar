import { hexDisk, hexDistance, hexRing, type Hex } from '../hex/hex';
import { DEPTHS } from '../data/depths';
import type { LandingOrders } from '../data/landing';
import { KIWI_UNIT, WEAPONS } from '../data/units';
import { grouillants } from '../sim/depths';
import type { AlienUnit } from '../sim/civ';
import type { GameState, Villager } from '../sim/state';
import { alienUnit, capped } from './landing';
import { kiwiUnit } from './units';
import type { BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 52: the battle of the stem against the Great Weevil, the final battle of our depths.
 * The crew comes in from the passage; the Weevil stands in the middle of the round room with a
 * few Grouillants. Its phases are read from its wounds: its shell on the ground, then (under
 * 66 %) bursts in the air where only blows that reach the air touch it, then (under 33 %) a swarm
 * of larvae out of the walls, then (under 20 %) its last stand. When it falls, the others flee.
 * Its guard is public: the same builder serves the truth and the forecast.
 */

export interface StemInput {
  /** Share of its hit points still missing from our last battle. */
  wounds: number;
  orders: LandingOrders;
  /** Share of the outbound rations the crew had (hunger weakens the blows). */
  fed: number;
}

export const WEEVIL_REF = 'weevil';
const ROOM_RADIUS = 5;
const ENTRY: Hex = { q: 0, r: ROOM_RADIUS };
const CENTRE: Hex = { q: 0, r: -1 };

/** The Grouillants by its side at the start (public). */
export function stemEscort(): AlienUnit[] {
  const E = DEPTHS.stem.escort;
  return grouillants(E.power, E.level);
}

/** Its own unit: a giant beetle, hit points × √ its level factor, minus its wounds. */
export function weevilUnit(wounds: number): BattleUnitSetup {
  const W = DEPTHS.stem;
  const lv = 1 + KIWI_UNIT.perLevel * (W.level - 1);
  const w = WEAPONS.weevilRam;
  return {
    ref: WEEVIL_REF,
    side: 0,
    body: 'weevil',
    role: 'guard',
    kind: 'weevil',
    name: '',
    level: W.level,
    classId: null,
    hp: Math.max(1, W.hp * Math.sqrt(lv) * (1 - Math.min(0.9, wounds))),
    armor: W.armor,
    speed: W.speed,
    dodge: 0,
    size: W.size,
    flying: false,
    fixed: false,
    weaponId: 'weevilRam',
    weapon: { ...w, damage: w.damage * Math.sqrt(lv) * W.damage },
    ammo: null,
    carry: 0,
    power: 0,
    at: CENTRE,
    delay: 0,
    building: null,
    fightsBack: true,
    huntsKiwis: false,
    sector: null,
    rage: { ...W.rage },
    flight: { ...W.flight },
  };
}

export function stemSetup(
  state: GameState,
  crew: readonly Villager[],
  input: StemInput,
): BattleSetup {
  const W = DEPTHS.stem;
  const disk = hexDisk({ q: 0, r: 0 }, ROOM_RADIUS);
  const tiles: BattleTile[] = disk.map((h) => ({ q: h.q, r: h.r, cost: 1 }));
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => hexDistance(t, ENTRY) <= 1)
    .map(({ i }) => i);
  const byEntry = [...disk].sort(
    (a, b) => hexDistance(a, ENTRY) - hexDistance(b, ENTRY) || a.q - b.q || a.r - b.r,
  );
  const hunger = 0.5 + 0.5 * Math.max(0, Math.min(1, input.fed));
  const units: BattleUnitSetup[] = [];
  crew.forEach((v, i) => {
    const at = byEntry[Math.floor(i / 2) % byEntry.length] ?? ENTRY;
    const u = kiwiUnit(v, state, 'guard', at, null, 1);
    units.push({
      ...u,
      role: 'assault',
      power: 1,
      weapon: { ...u.weapon, damage: u.weapon.damage * hunger },
    });
  });
  units.push(weevilUnit(input.wounds));
  // Its escort around it: crawlers next to it, fliers above.
  const around = [...hexRing(CENTRE, 1), ...hexRing(CENTRE, 2)];
  let n = 0;
  for (const { unit, count, k } of capped(stemEscort()))
    for (let i = 0; i < count; i++, n++)
      units.push(alienUnit(unit, k, `e${n}`, around[(n * 3) % around.length]!, 0));
  // Under 33 %: the larvae come out of the walls, away from the passage.
  const rim = hexRing({ q: 0, r: 0 }, ROOM_RADIUS)
    .filter((h) => hexDistance(h, ENTRY) > 2)
    .sort((a, b) => a.q - b.q || a.r - b.r);
  const swarm: AlienUnit[] = [{ kind: 'larva', count: W.swarm.larvae, level: W.escort.level }];
  let j = 0;
  for (const { unit, count, k } of capped(swarm))
    for (let i = 0; i < count; i++, j++, n++)
      units.push({
        ...alienUnit(unit, k, `s${n}`, rim[(j * 5) % rim.length]!, W.swarm.delayS + j * 0.2),
        wake: { ref: WEEVIL_REF, below: W.swarm.below },
      });
  return {
    tiles,
    exits,
    buildings: [],
    units,
    orders: [
      { posture: 'bold', retreatBelow: 0 },
      {
        posture: input.orders.posture,
        retreatBelow: 1 - input.orders.retreatAt + 1e-6,
        priority: input.orders.priority,
      },
    ],
    clearEnds: true,
    leader: WEEVIL_REF,
    maxS: W.maxS,
  };
}

/** Whether the crew has anybody who reaches the Weevil in the air (the planner warns). */
export function reachesFlight(units: readonly BattleUnitSetup[]): boolean {
  return units.some((u) => u.side === 1 && u.weapon.hitsAir);
}
