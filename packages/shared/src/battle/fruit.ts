import type { LandingOrders } from '../data/landing';
import { RASPBERRY } from '../data/orchard';
import { isFlyer } from '../data/units';
import { hexDisk, hexDistance, type Hex } from '../hex/hex';
import type { AlienUnit } from '../sim/civ';
import type { GameState, Villager } from '../sim/state';
import { delveSetup } from './delve';
import { alienUnit, capped } from './landing';
import type { BattleSetup } from './types';

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
