/** Chantier 09: how the kiwis move between workplaces on their own. */
export const JOBS = {
  /**
   * Kiwis redirected from a full stock go back to their workplace once it falls below this
   * share of the storage (a gap, so they do not shuttle back and forth).
   */
  returnBelow: 0.9,
  /**
   * Idle kiwis pick the workplace with the best affinity minus this weight × its staffing
   * ratio: a kiwi gifted for pulp still spreads to an empty workshop rather than crowding.
   */
  ratioWeight: 0.5,
} as const;

/**
 * Chantier 15: tasks the automation fills with the best kiwis for them (each can be switched to
 * manual in the Automation panel). `redirect` is the chantier 09 move away from a full stock.
 */
export const AUTO_TASKS = [
  'build',
  'research',
  'meteor',
  'stardust',
  'repair',
  'garrison',
  'redirect',
] as const;
export type AutoTask = (typeof AUTO_TASKS)[number];

export const TASKS = {
  /** Constructions under way at once, by Nest level (index = level). */
  buildSlots: [0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3] as readonly number[],
} as const;
