import type { LandingOrders } from '../data/landing';
import { RASPBERRY } from '../data/orchard';
import { BATTLE, ENEMIES, isFlyer } from '../data/units';
import type { BuildingType } from '../data/buildings';
import type { BuildingId } from '../types/ids';
import { hexDisk, hexDistance, type Hex } from '../hex/hex';
import type { AlienUnit } from '../sim/civ';
import type { Building, GameState, Villager } from '../sim/state';
import { delveSetup } from './delve';
import { alienUnit, capped } from './landing';
import { kiwiUnit, turretUnit } from './units';
import type { BattleBuilding, BattleLog, BattleSetup, BattleTile, BattleUnitSetup } from './types';

/**
 * Chantier 54: a pillage on a drupelet of the raspberry as a battle. The field is the round top
 * of the drupelet (the delve's room, no hazard): the crew lands on one side, the beetles wait on
 * the far side and charge. The clan's drupelets next to it send a share of their garrison, which
 * comes in after `RASPBERRY.help.delayS` from the rim. The same builder serves the truth and
 * the forecast.
 */

export interface FruitInput {
  units: AlienUnit[];
  /** One army per neighbouring drupelet of the same clan (each sends `help.share`). */
  help: AlienUnit[][];
  orders: LandingOrders;
  fed: number;
  seed: string;
}

const RADIUS = 4;

/** A share of an army (at least one of each kind that was there). */
export function shareOf(units: readonly AlienUnit[], share: number): AlienUnit[] {
  return units
    .map((u) => ({ ...u, count: Math.max(0, Math.round(u.count * share)) }))
    .filter((u) => u.count > 0);
}

export function fruitSetup(
  state: GameState,
  crew: readonly Villager[],
  input: FruitInput,
): BattleSetup {
  const setup = delveSetup(state, crew, {
    units: input.units,
    hazard: null,
    orders: input.orders,
    fed: input.fed,
    seed: input.seed,
  });
  const helpers = input.help.flatMap((army) => shareOf(army, RASPBERRY.help.share));
  if (helpers.length === 0) return setup;
  // The help climbs over the rim on the sides, away from where the crew landed.
  const rim = hexDisk({ q: 0, r: 0 }, RADIUS)
    .filter((h) => hexDistance(h, { q: 0, r: 0 }) === RADIUS && h.r <= 0)
    .sort((a, b) => a.q - b.q || a.r - b.r);
  const middle: Hex = { q: 0, r: 0 };
  let n = 0;
  for (const { unit, count, k } of capped(helpers)) {
    for (let i = 0; i < count; i++, n++) {
      const at = isFlyer(unit.kind) ? middle : rim[n % rim.length]!;
      setup.units.push(alienUnit(unit, k, `h${n}`, at, RASPBERRY.help.delayS));
    }
  }
  return setup;
}

/** Index of our trading post's store in a post battle's buildings. */
export const POST_STORE = 0;

export interface PostInput {
  attackers: AlienUnit[];
  orders: LandingOrders;
  /** Levels of palisade standing (a seed and a sky turret, stronger with each level). */
  fort: number;
}

const TURRETS: BuildingType[] = ['seedTurret', 'skyTurret'];

/**
 * Chantier 54: an attack on our trading post. The round top of its drupelet: the store in the
 * middle (what the beetles want to break), the palisade's turrets beside it, our kiwis around
 * it (they run to the pods past their retreat threshold); the beetles climb over the rim.
 */
export function postSetup(
  state: GameState,
  guards: readonly Villager[],
  input: PostInput,
): BattleSetup {
  const disk = hexDisk({ q: 0, r: 0 }, RADIUS);
  const tiles: BattleTile[] = disk.map((h) => ({ q: h.q, r: h.r, cost: 1 }));
  const centre: Hex = { q: 0, r: 0 };
  const store: BattleBuilding = {
    ref: 'post:store',
    type: 'warehouse',
    side: 0,
    tiles: [centre],
    hp: 60 + 30 * input.fort,
    loot: [0, 0, 0, 0],
    priority: 3,
  };
  const units: BattleUnitSetup[] = [];
  const ring = disk.filter((h) => hexDistance(h, centre) === 1);
  if (input.fort > 0)
    TURRETS.forEach((type, i) => {
      const at = ring[i * 3]!;
      const b: Building = {
        id: `post:fort:${i}` as BuildingId,
        type,
        q: at.q,
        r: at.r,
        level: Math.min(15, 9 + 2 * input.fort),
        richness: 1,
        builtAt: 0,
      };
      const u = turretUnit(b, state, 1, POST_STORE);
      if (u) units.push(u);
    });
  const around = disk
    .filter((h) => hexDistance(h, centre) >= 1 && hexDistance(h, centre) <= 2)
    .sort((a, b) => hexDistance(a, centre) - hexDistance(b, centre) || a.q - b.q || a.r - b.r);
  guards.forEach((v, i) => {
    units.push(kiwiUnit(v, state, 'guard', around[Math.floor(i / 2) % around.length]!, null, 0));
  });
  const rim = disk
    .filter((h) => hexDistance(h, centre) === RADIUS && h.r >= 0)
    .sort((a, b) => a.q - b.q || a.r - b.r);
  let n = 0;
  for (const { unit, count, k } of capped(input.attackers))
    for (let i = 0; i < count; i++, n++) {
      const base = alienUnit(unit, k, `a${n}`, rim[n % rim.length]!, n * BATTLE.enterGap);
      units.push({
        ...base,
        side: 1,
        role: 'raider',
        power: ENEMIES[unit.kind].power * k,
        carry: 1,
        hold: 0,
      });
    }
  const last = Math.max(0, n - 1) * BATTLE.enterGap;
  for (const u of units) if (u.side === 1) u.hold = last + BATTLE.gather;
  const exits = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => rim.some((e) => e.q === t.q && e.r === t.r))
    .map(({ i }) => i);
  return {
    tiles,
    exits,
    buildings: [store],
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

/** The post's store still stands at the end of the battle. */
export function postHeld(log: BattleLog): boolean {
  return !log.result.damaged.includes(POST_STORE);
}
