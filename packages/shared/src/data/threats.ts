import { ms } from './curves';
import type { ClassId } from './classes';
import type { Season } from './cycles';

/**
 * Chantier 06: predators. Ferrets (packs, on the ground) and bats (swarms, in the air) raid the
 * colony in big waves announced hours ahead, and in small incidents without notice. A wave is
 * resolved at once in `advance` (exact offline); the colony is never razed.
 */
export const THREATS = {
  /** No big wave before this much play time… */
  protectionMs: ms.h(24),
  /** …nor before the Nest reaches this level. */
  protectionNestLevel: 2,
  /** Time between two waves (drawn in this range). */
  intervalMs: [ms.h(20), ms.h(28)],
  /** How long before the strike a wave is announced (drawn in this range). */
  noticeMs: [ms.h(8), ms.h(12)],
  /** No wave strikes until this long after a defeat. */
  shieldMs: ms.h(24),
  /** Chantier 14: no wave for a solo colony that just joined a universe. */
  importShieldMs: ms.h(48),
  /** Total wave power: base × Nest level factor × play time × provocation. */
  basePower: 6,
  nestFactor: [0, 0.6, 1, 1.6, 2.2, 2.9, 3.6] as readonly number[],
  /** Chantier 08: the predators grow with the age of the colony (index = age). */
  ageFactor: [1, 1.15, 1.3, 1.5] as readonly number[],
  /** Power gained per day of play, up to `maxDays`. */
  perDay: 0.25,
  maxDays: 14,
  /** Power gained per expedition victory (the aliens strike back), up to `maxProvocation`. */
  perVictory: 0.08,
  maxProvocation: 0.8,
  /** Share of the power that flies (bats) at night and by day. */
  airShare: { night: 0.7, day: 0.25 },
  /** Hungry ferrets in winter, thirsty bats in summer. */
  season: {
    spring: { ferrets: 1, bats: 1 },
    summer: { ferrets: 1, bats: 1.3 },
    autumn: { ferrets: 1, bats: 1 },
    winter: { ferrets: 1.3, bats: 1 },
  } satisfies Record<Season, { ferrets: number; bats: number }>,
  /** ± swing of the announced composition, then ± luck on the day (like expeditions). */
  spread: 0.15,
  luck: 0.15,
  /** Kiwis at home defend the ground a little, even unposted (no one reaches the bats). */
  militia: 0.15,
  /** A kiwi may die only when the threat exceeds this many times the defense. */
  deathRatio: 2,
  /** …and never when it would leave fewer kiwis than this. */
  minKiwis: 4,
  maxDeaths: 1,
  /** Share of the kiwis at home hurt at full severity, and how long they rest. */
  injuryShare: 0.4,
  injuryMs: [ms.h(2), ms.h(6)],
  /** Share of the unprotected stock carried away at full severity. */
  lootShare: 0.35,
  /** Share of their storage that the Nest and the Warehouses keep safe from looting. */
  protectedShare: { nest: 0.3, warehouse: 0.6 } as Partial<Record<string, number>>,
  /** Buildings damaged at full severity (at least one on any defeat; never the Nest). */
  maxDamaged: 4,
  /** Path tiles trampled by ferrets at full ground severity. */
  maxPathsLost: 4,
  /** Damaged buildings work at this rate until repaired. */
  damagedWork: 0.5,
  /** Repairs cost this share of the building's current level, and this share of its time. */
  repairCost: 0.3,
  repairTime: 0.4,
  /** Wave reports kept for the UI. */
  history: 5,
} as const;

/** Turrets (both models together) allowed by Nest level (index = level). */
export const TURRETS = {
  max: [0, 2, 4, 6, 7, 8, 9] as readonly number[],
} as const;

/**
 * Garrison: kiwis posted on the rampart (they no longer harvest). Swords hit ferrets, never
 * bats; mages and flying scouts reach the bats.
 */
export const GARRISON = {
  /** Defense of a posted kiwi: its fighting strength × this × its class affinity. */
  power: 1.5,
  affinity: {
    none: { ground: 0.4, air: 0 },
    builder: { ground: 0.5, air: 0 },
    warrior: { ground: 1, air: 0 },
    mage: { ground: 0.8, air: 1 },
    scout: { ground: 0.5, air: 0.8 },
    mayor: { ground: 0.4, air: 0 },
  } satisfies Record<ClassId | 'none', { ground: number; air: number }>,
  /** Chantier 08: with firearms, warriors shoot the bats too. */
  firearmsAir: 0.8,
  /** Posted kiwis stand in the front line: more often hurt. */
  exposure: 1.5,
} as const;

/** Taking shelter in the Nest: no one is hurt, the harvest stops for the strike. */
export const SHELTER = {
  /** Possible this long before the strike… */
  beforeMs: ms.min(45),
  /** …and kiwis stay inside this long after it. */
  afterMs: ms.min(15),
} as const;

export const INCIDENT_KINDS = ['thief', 'bat', 'storm'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/** Small incidents: minor, without notice, about three a day. */
export const INCIDENTS = {
  /** The first one comes this long after the start (no draw at game creation). */
  firstMs: ms.h(4),
  intervalMs: [ms.h(5), ms.h(11)],
  /** A lone ferret steals this share of the pulp (or fiber) stock. */
  thiefShare: [0.02, 0.05],
  /** A bat drinks this share of the juice stock. */
  batShare: [0.03, 0.06],
  /** A storm blows away this many path tiles. */
  stormPaths: [1, 3],
  /** Chance that defenders stop a thief or a bat: defense / (defense + this), capped. */
  blockHalf: 4,
  maxBlock: 0.8,
  history: 8,
} as const;

/**
 * Gifts from the sky: a shooting star announces a meteorite, which lands on a free tile as a
 * short-lived deposit (no regrowth). A camp on it, or a producer of the same resource that
 * reaches it, harvests it on top of its usual work.
 */
export const METEORS = {
  /** The first one falls this long after the start; then about one a day. */
  firstMs: ms.h(6),
  intervalMs: [ms.h(18), ms.h(30)],
  /** The shooting star is seen this long before the impact. */
  noticeMs: ms.h(1),
  /** The crater fades away this long after the impact. */
  lifeMs: ms.h(48),
  /** Stock: base × Nest level factor × (1 + perDay × days played, capped like the threats). */
  stock: 300,
  nestFactor: [0, 1, 1.5, 2.2, 3, 3.8, 4.6] as readonly number[],
  /** Chantier 08: richer gifts in later ages (index = age). */
  ageFactor: [1, 1.3, 1.7, 2.2] as readonly number[],
  perDay: 0.15,
  /** What falls (weights). */
  resources: { seeds: 2, juice: 1, fiber: 1 } as const,
  /** Land types it can land on (a camp can be set up there). */
  tiles: ['flesh', 'grove', 'seedRing'] as const,
  /** A producer of the same resource reaching the crater takes this share of its base rate. */
  producerShare: 0.5,
  /** Craters kept at once. */
  max: 3,
} as const;
