import { ms } from './curves';

/**
 * Chantier 19: the siege of the twin face. Reconnaissance locates the alien holds and the
 * ferret queen, assaults take bridgeheads on the outer sectors (the kiwis posted there hold
 * them against announced counter-attacks), a Kikiwiwi fortifies one, then the final assault
 * brings the queen down. The real strengths are drawn from the garrison's secret seed: only
 * the server resolves the fights.
 */
export const SIEGE = {
  /** Opens at the Iron age (index 2) with at least one Kikiwiwi in the colony. */
  minAge: 2,
  /** Bridgeheads held at once, and how many the final assault needs. */
  maxBridgeheads: 3,
  neededBridgeheads: 2,
  /** Bridgeheads stand on the outer sectors (`INTEL` sectors 6–11); the queen in an inner one. */
  outerSectors: [6, 7, 8, 9, 10, 11] as readonly number[],
  /** Real strength of the aliens holding an outer sector (× spread, × the garrison's growth). */
  hold: { base: 9, spread: [0.75, 1.3] as const },
  /** The ferret queen: ground (ferrets) and air (bats) power, very strong. */
  queen: {
    ground: 26,
    air: 16,
    spread: [0.85, 1.2] as const,
    /** Each bridgehead held weakens her (share of her power). */
    perBridgehead: 0.15,
    /** A bridgehead on the outer sector of her own slice weakens her this much more. */
    besideQueen: 0.1,
  },
  /** Kiwis posted on a bridgehead fight from cover (× their strength). */
  holdBonus: 1.2,
  /** Counter-attacks: one every `intervalMs`, announced `noticeMs` before the strike. */
  counter: {
    intervalMs: [ms.h(20), ms.h(30)] as const,
    noticeMs: ms.h(6),
    /** Strength: the sector's hold × this share × (1 + `perCounter` × counters, up to `max`). */
    share: [0.5, 0.9] as const,
    perCounter: 0.1,
    maxEscalation: 2,
  },
  /** A Kikiwiwi posted on a bridgehead fortifies it (needed by the final assault). */
  fortify: { durationMs: ms.h(12), juice: 400, bonus: 1.5 },
  /** Share of the posted kiwis lost when a counter-attack takes a bridgehead (owner: heavy). */
  fallLosses: [0.5, 0.9] as const,
} as const;
