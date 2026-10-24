import { hexDisk, hexDistance, hexKey, hexRing, type Hex } from '../hex/hex';
import { INTEL } from '../data/expeditions';
import { type LandingOrders } from '../data/landing';
import { SIEGE } from '../data/siege';
import { BATTLE, ENEMIES, KIWI_UNIT, WEAPONS } from '../data/units';
import { sectorUnits, type AlienUnit } from '../sim/civ';
import type { GameState, Villager } from '../sim/state';
import { alienUnit, capped, landingTile } from './landing';
import { kiwiUnit } from './units';
import type { BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 42: the final battle against the ferret queen, at the centre of the twin. Our crew
 * lands on the edge of her parcel; she stands in the middle with her guard and fights in phases
 * read from her wounds: a charge, then (under 75 %) the bats she calls, then (under 50 %) elite
 * ferrets out of the tunnels, then (under 25 %) her last stand. When she falls, the others run
 * away. The same builder serves the truth (server) and the forecast (her public view).
 */

export interface QueenInput {
  /** Her parcel (the royal burrow): the ship lands on its edge. */
  sector: number;
  /** Age of her parcel. */
  age: number;
  /** Her ground and air power (× her parcel's growth). */
  ground: number;
  air: number;
  escort: AlienUnit[];
  /** Share of her hit points still missing from our last battle. */
  wounds: number;
  orders: LandingOrders;
  fed: number;
}

export const QUEEN_REF = 'queen';
const CENTRE: Hex = { q: 0, r: 0 };

/** Her own unit: a giant ferret, hit points and blows × √ her power. */
function queenUnit(input: QueenInput): BattleUnitSetup {
  const F = SIEGE.final;
  const k = Math.sqrt(Math.max(0.05, input.ground / SIEGE.queen.ground));
  const w = WEAPONS.royalSlam;
  const level = 10 + 5 * input.age;
  const lv = 1 + KIWI_UNIT.perLevel * (level - 1);
  return {
    ref: QUEEN_REF,
    side: 0,
    body: 'queen',
    role: 'guard',
    kind: 'queen',
    name: '',
    level,
    classId: null,
    hp: Math.max(1, F.hp * k * Math.sqrt(lv) * (1 - Math.min(0.9, input.wounds))),
    armor: F.armor,
    speed: F.speed,
    dodge: F.dodge,
    size: F.size,
    flying: false,
    fixed: false,
    weaponId: 'royalSlam',
    weapon: { ...w, damage: w.damage * Math.sqrt(k) * F.damage },
    ammo: null,
    carry: 0,
    power: 0,
    at: CENTRE,
    delay: 0,
    building: null,
    fightsBack: true,
    huntsKiwis: false,
    sector: null,
    rage: { ...F.rage },
  };
}

/** Scales a garrison by a share (at least one of each kind). */
function share(units: readonly AlienUnit[], k: number): AlienUnit[] {
  return units.map((u) => ({ ...u, count: Math.round(u.count * k) })).filter((u) => u.count > 0);
}

export function queenSetup(
  state: GameState,
  crew: readonly Villager[],
  input: QueenInput,
): BattleSetup {
  const F = SIEGE.final;
  const radius = INTEL.innerRadius + 1;
  const field = hexDisk(CENTRE, radius);
  const tiles: BattleTile[] = [...field]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((h) => ({ q: h.q, r: h.r, cost: 1 }));
  const ship = landingTile(input.sector);
  const shipKey = hexKey(ship);
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => hexDistance(t, ship) <= 1)
    .map(({ i }) => i);

  const units: BattleUnitSetup[] = [];
  const around = [...tiles].sort(
    (a, b) =>
      hexDistance(a, ship) - hexDistance(b, ship) ||
      (hexKey(a) === shipKey ? -1 : 0) ||
      a.q - b.q ||
      a.r - b.r,
  );
  const hunger = 0.5 + 0.5 * Math.max(0, Math.min(1, input.fed));
  crew.forEach((v, i) => {
    const at = around[Math.floor(i / 2) % around.length] ?? ship;
    const u = kiwiUnit(v, state, 'guard', at, null, 1);
    units.push({
      ...u,
      role: 'assault',
      power: 1,
      weapon: { ...u.weapon, damage: u.weapon.damage * hunger },
    });
  });

  units.push(queenUnit(input));
  // Her guard stands around her.
  const guardTiles = [...hexRing(CENTRE, 1), ...hexRing(CENTRE, 2)];
  let n = 0;
  for (const { unit, count, k } of capped(share(input.escort, F.escort)))
    for (let i = 0; i < count; i++, n++)
      units.push(alienUnit(unit, k, `e${n}`, guardTiles[n % guardTiles.length]!, 0));
  // Under 75 %: the bats she calls swoop in from all around.
  const rim = hexRing(CENTRE, radius);
  const swarm = sectorUnits(
    { sector: input.sector, inner: true, age: input.age, power: input.air * F.swarm.share },
    0,
  );
  let j = 0;
  for (const { unit, count, k } of capped(swarm))
    for (let i = 0; i < count; i++, j++, n++)
      units.push({
        ...alienUnit(unit, k, `s${n}`, rim[(j * 5) % rim.length]!, F.swarm.delayS + j * 0.25),
        wake: { ref: QUEEN_REF, below: F.swarm.below },
      });
  // Under 50 %: elite ferrets, an age ahead, out of the tunnels around her.
  const tunnels = hexRing(CENTRE, F.tunnels.tiles);
  const elite = sectorUnits(
    {
      sector: input.sector,
      inner: true,
      age: Math.min(3, input.age + 1),
      power: input.ground * F.tunnels.share,
    },
    1,
  ).filter((u) => ENEMIES[u.kind].body !== 'bat');
  j = 0;
  for (const { unit, count, k } of capped(elite))
    for (let i = 0; i < count; i++, j++, n++)
      units.push({
        ...alienUnit(
          unit,
          k,
          `t${n}`,
          tunnels[(j * 7) % tunnels.length]!,
          F.tunnels.delayS + j * BATTLE.enterGap,
        ),
        wake: { ref: QUEEN_REF, below: F.tunnels.below },
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
    leader: QUEEN_REF,
    maxS: F.maxS,
  };
}
