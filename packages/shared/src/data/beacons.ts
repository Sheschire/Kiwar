import { ms } from './curves';

/**
 * Chantier 42: our beacons on an alien face can be attacked, announced and defensible (decision
 * of 23 October 2026). From the civilisation's Iron age it picks, now and then, a beacon close to
 * its barracks: the attack is announced `attack.noticeMs` ahead. Two answers, or both: fortify the
 * beacon from home (two turrets of the age and a stout tower, paid in resources and iron), or
 * post a guard of kiwis on it (they stay, fed by the colony, and fight with the battle engine).
 * A beacon without either falls without a fight (no kiwi dies); a beacon that falls brings the
 * fog back over its parcel, whose buildings grow again. A new landing takes it back.
 */
export const BEACONS = {
  /** The civilisation attacks our beacons from its Iron age (index 2). */
  minCivAge: 2,
  attack: {
    /** One attack per face every so often (public: hashed from the face), announced ahead. */
    intervalMs: [ms.h(20), ms.h(30)] as const,
    noticeMs: ms.h(6),
    /** Strength: the parcel it comes from × this share (drawn in secret at the strike)… */
    share: [0.5, 0.9] as const,
    /** …× (1 + this per attack already made on the face), up to `maxEscalation`. */
    perAttack: 0.1,
    maxEscalation: 2,
  },
  /** The tower of a beacon (the attackers try to bring it down): hit points, more fortified. */
  tower: { hp: 30, fortifiedHp: 160, priority: 6 },
  /**
   * Fortifying from home: two turrets (ground and sky) of the best level of our age, paid like
   * those levels (resources and iron) × `costFactor`, ready after `durationMs`.
   */
  fortify: { durationMs: ms.h(4), levelsPerAge: 3, costFactor: 1 },
  /** Kiwis posted on a beacon at most. */
  maxGuards: 12,
  /** Reports kept per face. */
  reports: 5,
} as const;
