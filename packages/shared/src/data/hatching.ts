import { ms, geometric } from './curves';
import type { ResourceCost } from './resources';

/** Eggs get more expensive and take longer as the population grows. */
const BASE_POPULATION = 3;

export const HATCHING = {
  basePopulation: BASE_POPULATION,
  cost(population: number): ResourceCost {
    const n = Math.max(0, population - BASE_POPULATION);
    return { pulp: geometric(25, 1.3, n, 5), juice: geometric(10, 1.35, n) };
  },
  durationMs(population: number): number {
    const n = Math.max(0, population - BASE_POPULATION);
    return Math.min(ms.h(2), geometric(ms.s(20), 1.55, n, 1000));
  },
};
