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
