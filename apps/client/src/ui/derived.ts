// Shared selectors memoized per game state. The controller replaces the state object at every
// tick (and never mutates a state it has emitted), so a WeakMap keyed on it computes each
// number once per tick, however many components and selectors ask for it.
import {
  capacity as sharedCapacity,
  forecastWave as sharedForecastWave,
  defenseOf as sharedDefenseOf,
  homeKiwis as sharedHomeKiwis,
  housing as sharedHousing,
  hungerStage as sharedHungerStage,
  idleVillagers as sharedIdleVillagers,
  missingBeds as sharedMissingBeds,
  moraleOf as sharedMoraleOf,
  population as sharedPopulation,
  researchPerHour as sharedResearchPerHour,
  staffing as sharedStaffing,
} from '@kiwar/shared';

import { bedsOf, perGame } from '../game/perState';

// The harvest-based numbers are shared with the 3D views (`game/perState.ts`).
export {
  bedsOf,
  consumption,
  harvestOf,
  netRates,
  perGame,
  productionRates,
  storageFull,
} from '../game/perState';

export const capacity = perGame(sharedCapacity);
export const housing = perGame(sharedHousing);
export const population = perGame(sharedPopulation);
export const hungerStage = perGame(sharedHungerStage);
export const homeKiwis = perGame(sharedHomeKiwis);
export const idleVillagers = perGame(sharedIdleVillagers);
export const forecastWave = perGame(sharedForecastWave);
/** Defense without a wave (chantier 12: by sector, for the defense screen). */
export const defenseNow = perGame((state) => sharedDefenseOf(state));
export const researchPerHour = perGame(sharedResearchPerHour);
/** Workers by kind of post, kiwis without a post, free places (chantier 09). */
export const staffing = perGame(sharedStaffing);
export const moraleOf = perGame((state) => sharedMoraleOf(state, bedsOf(state)));
export const missingBeds = perGame((state) => sharedMissingBeds(state, bedsOf(state)));
