import {
  buildCost,
  buildLock,
  canAfford,
  CRYSTAL,
  crystalOf,
  giantSeedCap,
  lensLock,
  maxTrees,
  treeCount,
  seedTurrets,
  techEffects,
  treeSeedCost,
  type BuildingType,
  type Command,
  type GameState,
} from '@kiwar/shared';
import { monumentCrystal, monumentSeeds } from './economy';

/**
 * Chantier 50: what the bot does with the locules' stocks. Crystal: the crystal ammunition on
 * as soon as it is known (paid at each strike, the returning sink), then a lens on each turret
 * while two strikes of ammunition stay in store. Giant seeds: a locule tree whenever the seeds
 * pay for the next one; a locule egg only when the stock is full (`hatchLocule`).
 */
export function loculeOrders(state: GameState): Command | null {
  const e = techEffects(state);
  if (e.crystalAmmo && !state.threats.crystalAmmo) return { type: 'setCrystalAmmo', on: true };
  if (e.lenses) {
    // Chantier 51: the monument of the stars' crystal is kept too.
    const keep = 2 * CRYSTAL.ammo.perTurret * seedTurrets(state) + monumentCrystal(state);
    const turret = state.buildings.find((b) => !lensLock(state, b));
    if (turret && crystalOf(state) - CRYSTAL.lens.crystal >= keep)
      return { type: 'fitLens', buildingId: turret.id };
  }
  return null;
}

/** A locule tree when the giant seeds pay for the next one. */
export function treeDecision(
  state: GameState,
  build: (type: BuildingType) => Command | null,
): Command | null {
  // Chantier 51: the giant seeds of the monument of the stars come first.
  if (state.giantSeeds - treeSeedCost(state, 'loculeTree') < monumentSeeds(state)) return null;
  if (buildLock(state, 'loculeTree')) return null;
  if (!canAfford(state.resources, buildCost(state, 'loculeTree'))) return null;
  return build('loculeTree');
}

/** The next egg is a locule egg once the trees are all planted, or the stock is full. */
export function hatchLocule(state: GameState): boolean {
  if (state.giantSeeds <= monumentSeeds(state)) return false;
  return treeCount(state) >= maxTrees(state) || state.giantSeeds >= giantSeedCap(state);
}
