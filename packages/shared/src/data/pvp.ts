/**
 * Chantier 57: optional PvP. In a universe created with PvP on, a player may land on the home
 * colony of another member: an asynchronous landing, announced to the target at the departure,
 * played by the server against the target's turrets and garrison as a wave (the crew are the
 * raiders). The defence never loses a kiwi, only capped reserves, wounded and repairable damage;
 * the attack follows the landing's rules (a retreat or a defeat kills, a victory brings its
 * fallen home wounded). Numbers are starting points (chantier 58 calibrates them).
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const PVP = {
  /** The journey (and so the notice the target gets): 90 + 60 per kiwi of distance minutes. */
  travel: { baseMs: 90 * MIN, perDistanceMs: 60 * MIN, minMs: 2 * HOUR },
  /** A colony that suffered an attack (held or not) cannot be attacked again for this long. */
  shieldMs: 24 * HOUR,
  /** Beginners are protected until the Stone age **and** 72 h after their colony started. */
  beginner: { age: 1, ms: 72 * HOUR },
  /** A colony nobody has played for this long cannot be attacked (absence is not punished). */
  absentMs: 3 * 24 * HOUR,
  /** One attack a day from the same attacker on the same target. */
  cooldownMs: 24 * HOUR,
  /**
   * What the crew may carry away: this share of each warehouse's reserves first, then this
   * share of the stock above the protected part (never iron, crystal, giant seeds or stardust:
   * they are not in the storage). The ship's hold caps the whole.
   */
  loot: { reserve: 0.5, stock: 0.1 },
  /** The announcement gives the crew's power as a range of ± this share around a shifted middle. */
  powerSpread: 0.2,
  /** Smallest crew. */
  minCrew: 1,
  /** The fallen of a victory come home wounded for this long (the landing's rule). */
  victoryInjuryMs: 6 * HOUR,
  /** Battles kept by the defender (for the attacker's report and the replay). */
  keepMs: 14 * 24 * HOUR,
  keep: 8,
  /** The server refreshes a player's last activity at most this often (absence protection). */
  activeStepMs: HOUR,
} as const;

/** Why a colony cannot be attacked now (null: it can). */
export type PvpGuard = 'beginner' | 'shield' | 'absent';
