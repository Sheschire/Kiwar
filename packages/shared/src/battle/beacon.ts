import { hexDistance, hexKey, hexNeighbors, type Hex } from '../hex/hex';
import { BEACONS } from '../data/beacons';
import { LANDING, type LandingOrders } from '../data/landing';
import { BATTLE, ENEMIES } from '../data/units';
import type { AlienBuilding, AlienUnit } from '../sim/civ';
import { sectorOf } from '../sim/aliens';
import type { BuildingType } from '../data/buildings';
import type { Building, GameState, Villager } from '../sim/state';
import type { BuildingId } from '../types/ids';
import { alienUnit, capped, landingTile, parcelField } from './landing';
import { kiwiUnit, turretUnit } from './units';
import type { BattleBuilding, BattleLog, BattleSetup, BattleUnitSetup } from './types';

/**
 * Chantier 42: an attack on one of our beacons as a battle. The field is the beacon's parcel (and
 * its margin); our side is at home there: the beacon's tower (what the attackers want to bring
 * down), its two turrets once fortified, and the guard posted around it, who runs to the ship
 * past its retreat threshold. The aliens come in from the parcel they were sent from, as raiders.
 * The same builder serves the strike (truth) and the forecast (public view).
 */

export interface BeaconInput {
  sector: number;
  /** The parcel the attack comes from. */
  origin: number;
  attackers: AlienUnit[];
  /** Alien buildings still standing on the beacon's parcel (walls). */
  buildings: AlienBuilding[];
  orders: LandingOrders;
  /** Level of the fortification's turrets (0: none). */
  fort: number;
}

/** Index of the beacon's tower in the setup's buildings. */
export const TOWER = 0;

const TURRETS: BuildingType[] = ['seedTurret', 'skyTurret'];

export function beaconSetup(
  state: GameState,
  guards: readonly Villager[],
  input: BeaconInput,
): BattleSetup {
  const { sector, origin } = input;
  const { own, field, tiles, buildings: walls, blocked } = parcelField(sector, input.buildings, 1);
  const spot = landingTile(sector, blocked);
  const key = hexKey(spot);
  const free = (h: Hex) => field.has(hexKey(h)) && !blocked.has(hexKey(h)) && hexKey(h) !== key;
  const tower: BattleBuilding = {
    ref: `beacon:${sector}`,
    type: 'beacon',
    side: 0,
    tiles: [spot],
    hp: input.fort > 0 ? BEACONS.tower.fortifiedHp : BEACONS.tower.hp,
    loot: [0, 0, 0, 0],
    priority: BEACONS.tower.priority,
  };
  const buildings = [tower, ...walls];
  blocked.add(key);

  const units: BattleUnitSetup[] = [];
  // The fortification: a ground and a sky turret beside the tower.
  if (input.fort > 0) {
    const spots = hexNeighbors(spot).filter(free);
    TURRETS.forEach((type, i) => {
      const at = spots[i];
      if (!at) return;
      const b: Building = {
        id: `fort:${sector}:${i}` as BuildingId,
        type,
        q: at.q,
        r: at.r,
        level: input.fort,
        richness: 1,
        builtAt: 0,
      };
      const u = turretUnit(b, state, 1, TOWER);
      if (u) units.push(u);
    });
  }
  // The guard stands around the tower, closest tiles first.
  const around = tiles
    .filter((t) => free(t) && own.some((h) => h.q === t.q && h.r === t.r))
    .sort((a, b) => hexDistance(a, spot) - hexDistance(b, spot) || a.q - b.q || a.r - b.r);
  guards.forEach((v, i) => {
    const at = around[Math.floor(i / 2) % Math.max(1, around.length)] ?? spot;
    units.push(kiwiUnit(v, state, 'guard', at, null, 0));
  });

  // The attackers come in from their parcel's side of the margin (or the far edge).
  const gate = tiles.filter((t) => free(t) && sectorOf(t.q, t.r) === origin);
  const far = [...tiles]
    .filter((t) => free(t))
    .sort((a, b) => hexDistance(b, spot) - hexDistance(a, spot) || a.q - b.q || a.r - b.r)
    .slice(0, 8);
  const entry = gate.length > 0 ? gate : far;
  let n = 0;
  for (const { unit, count, k } of capped(input.attackers))
    for (let i = 0; i < count; i++, n++) {
      const base = alienUnit(unit, k, `a${n}`, entry[n % entry.length]!, n * BATTLE.enterGap);
      units.push({
        ...base,
        side: 1,
        role: 'raider',
        power: ENEMIES[unit.kind].power * k,
        // A raider with nothing to carry heads home at once: a token load keeps it on the tower.
        carry: 1,
        hold: 0,
      });
    }
  const last = Math.max(0, n - 1) * BATTLE.enterGap;
  for (const u of units) if (u.side === 1) u.hold = last + BATTLE.gather;
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => entry.some((e) => e.q === t.q && e.r === t.r))
    .map(({ i }) => i);
  return {
    tiles,
    exits,
    buildings,
    units,
    orders: [
      {
        posture: input.orders.posture,
        retreatBelow: guards.length > 0 ? 1 - input.orders.retreatAt + 1e-6 : 0,
      },
      { posture: 'bold', retreatBelow: BATTLE.retreatBelow },
    ],
  };
}

/** The beacon still stands at the end of the battle. */
export function beaconHeld(log: BattleLog): boolean {
  return !log.result.damaged.includes(TOWER);
}

/** The default orders of a beacon's guard. */
export const GUARD_ORDERS: LandingOrders = { ...LANDING.defaultOrders };
