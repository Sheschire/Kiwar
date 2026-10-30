import {
  buildLock,
  CRYSTAL,
  crystalOf,
  giantSeedCap,
  lensLock,
  seedTurrets,
  techEffects,
  treeSeedCost,
  type BuildingType,
  type Command,
  type GameState,
} from '@kiwar/shared';

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
    const keep = 2 * CRYSTAL.ammo.perTurret * seedTurrets(state);
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
  if (state.giantSeeds < treeSeedCost(state, 'loculeTree')) return null;
  if (buildLock(state, 'loculeTree')) return null;
  return build('loculeTree');
}

/** The next egg is a locule egg when the giant seeds would be wasted (stock full). */
export function hatchLocule(state: GameState): boolean {
  return state.giantSeeds > 0 && state.giantSeeds >= giantSeedCap(state);
}
