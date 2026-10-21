import { ms } from './curves';

/**
 * Chantier 19 (second half): the second colony. Once the queen has fallen, a ship of settlers
 * founds a colony on the twin face: a linked game state (same calendar, the twin's map, a
 * Nest level 1, the settlers and what they carried). Research is shared (the home colony holds
 * it; the sister's Library sends its points over), each colony has its own monument (age).
 * The last aliens still roam the new face: weaker waves at first, ferret dens that make them
 * stronger while they stand, ruins to clear for loot.
 */
export const COLONY = {
  /** Settlers needed on the founding ship. */
  minSettlers: 5,
  /** Huts the settlers raise beside the Nest for those it cannot house (level 1, at most). */
  maxHuts: 2,
  /** No wave strikes the new colony before this long after its founding. */
  shieldMs: ms.h(48),
  /** Waves start at this share of their power and reach full power after `rampMs`. */
  rampStart: 0.5,
  rampMs: ms.h(96),
  /** Traces of the aliens on the new face (public: the face is ours). */
  traces: {
    /** Placed between these normalised distances from the heart (never next to the Nest). */
    rho: [0.3, 0.92] as readonly [number, number],
    ruins: [4, 6] as readonly [number, number],
    dens: 3,
  },
  /** A ferret den still standing makes every wave this much stronger. */
  denWave: 0.15,
  /** Guards raiding a den need this much ground power (no luck: the outcome is foreseen). */
  denPower: 10,
  /** Guards hit by a raid rest this long. */
  denInjuryMs: ms.h(6),
} as const;
