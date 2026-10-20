// Shared selectors memoized per game state. The controller replaces the state object at every
// tick (and never mutates a state it has emitted), so a WeakMap keyed on it computes each
// number once per tick, however many components and selectors ask for it.
import {
  bedsOf as sharedBedsOf,
  capacity as sharedCapacity,
  consumption as sharedConsumption,
  forecastWave as sharedForecastWave,
  homeKiwis as sharedHomeKiwis,
  housing as sharedHousing,
  hungerStage as sharedHungerStage,
  idleVillagers as sharedIdleVillagers,
  moraleOf as sharedMoraleOf,
  netRates as sharedNetRates,
  population as sharedPopulation,
  productionRates as sharedProductionRates,
  researchPerHour as sharedResearchPerHour,
  staffing as sharedStaffing,
  type GameState,
} from '@kiwar/shared';

/** Wraps a one-argument selector of the game state with a per-state cache. */
export function perGame<R>(fn: (state: GameState) => R): (state: GameState) => R {
  const cache = new WeakMap<GameState, R>();
  return (state) => {
    if (cache.has(state)) return cache.get(state)!;
    const value = fn(state);
    cache.set(state, value);
    return value;
  };
}

export const netRates = perGame(sharedNetRates);
export const productionRates = perGame(sharedProductionRates);
export const capacity = perGame(sharedCapacity);
export const consumption = perGame(sharedConsumption);
export const housing = perGame(sharedHousing);
export const population = perGame(sharedPopulation);
export const hungerStage = perGame(sharedHungerStage);
export const homeKiwis = perGame(sharedHomeKiwis);
export const idleVillagers = perGame(sharedIdleVillagers);
export const forecastWave = perGame(sharedForecastWave);
export const researchPerHour = perGame(sharedResearchPerHour);
/** Workers by kind of post, kiwis without a post, free places (chantier 09). */
export const staffing = perGame(sharedStaffing);
/** Beds of the kiwis (default map of the state). */
export const bedsOf = perGame((state) => sharedBedsOf(state));
export const moraleOf = perGame((state) => sharedMoraleOf(state, bedsOf(state)));
