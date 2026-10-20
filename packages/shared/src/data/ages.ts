/**
 * Chantier 08: ages. Every colony progresses on its own (individual ages): Eden (the start),
 * then Stone, Iron and Industry. An age is reached by researching its passage technology, then
 * building its monument (see `research.ts` and the `monument` building).
 */
export const AGE_IDS = ['eden', 'stone', 'iron', 'industry'] as const;
export type AgeId = (typeof AGE_IDS)[number];

/** Age index of the last age (0 = Eden). */
export const MAX_AGE = AGE_IDS.length - 1;
