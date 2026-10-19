import type { Resources } from './resources';

export const START = {
  resources: { pulp: 60, fiber: 40, seeds: 0, juice: 15 } satisfies Resources,
  villagers: 3,
};

/** Syllables used to name newborn kiwis (seeded, cosmetic). */
export const NAME_SYLLABLES = [
  'ki',
  'wi',
  'po',
  'lu',
  'mo',
  'ri',
  'ta',
  'nu',
  'pi',
  'ko',
  'zu',
  'la',
  'mi',
  'fe',
  'ro',
  'bi',
  'no',
  'sa',
] as const;
