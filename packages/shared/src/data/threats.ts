import type { Resources } from './resources';
import { ms } from './curves';
import type { ClassId } from './classes';
import type { Season } from './cycles';

/**
 * Chantier 06: predators. Ferrets (packs, on the ground) and bats (swarms, in the air) raid the
 * colony in big waves announced hours ahead, and in small incidents without notice. A wave is
 * resolved at once in `advance` (exact offline); the colony is never razed.
 */
export const THREATS = {
  /** No big wave before this much play time… (chantier 31: within the first day) */
  protectionMs: ms.h(7),
  /** …nor before the Nest reaches this level. */
  protectionNestLevel: 2,
  /** Time between two waves (drawn in this range). */
  intervalMs: [ms.h(12), ms.h(18)],
  /** How long before the strike a wave is announced (drawn in this range): enough to act
   * within a session, not hours under alert (chantier 31). */
  noticeMs: [ms.h(3), ms.h(6)],
  /** No wave strikes until this long after a defeat. */
  shieldMs: ms.h(24),
  /** Chantier 14: no wave for a solo colony that just joined a universe. */
  importShieldMs: ms.h(48),
  /**
   * Total wave power: base × Nest level factor × age × play time × provocation × wealth
   * (chantier 31: the predators smell a rich colony).
   */
  basePower: 6,
  // Chantier 31: lower at Nest 2–5, the waves now come in the first day (L1 turrets reach 3 tiles).
  nestFactor: [0, 0.5, 0.7, 1, 1.5, 1.9, 2.3, 2.6, 2.9, 3.2, 3.5, 3.8, 4.1] as readonly number[],
  /** Chantier 08: the predators grow with the age of the colony (index = age). */
  ageFactor: [1, 1.15, 1.3, 1.5] as readonly number[],
  /** Power gained per day of play, up to `maxDays` (softened in chantier 31; chantier 39
   * replaces it by the alien civilisation). */
  perDay: 0.12,
  maxDays: 14,
  /** Power gained per expedition victory (the aliens strike back), up to `maxProvocation`. */
  perVictory: 0.08,
  maxProvocation: 0.8,
  /**
   * Chantier 31, wealth: + `stock` × the share of the storage filled above `fillFree` (stock
   * and reserves together, up to `maxFill`), + `levels` × ln(1 + levels of the buildings /
   * `levelsRef`), + `population` × ln(1 + kiwis / `populationRef`). About ×1.2 for a young
   * colony, ×2 for a rich industrial one.
   */
  wealth: {
    stock: 0.4,
    fillFree: 0.5,
    maxFill: 2,
    levels: 0.25,
    levelsRef: 40,
    population: 0.15,
    populationRef: 10,
  },
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
  /**
   * Share of the unprotected stock carried away at full severity. Chantier 31: the warehouse
   * reserves are not protected and are looted first.
   */
  lootShare: 0.35,
  /** Share of their storage that the Nest and the Warehouses keep safe from looting. */
  protectedShare: { nest: 0.3, warehouse: 0.6 } as Partial<Record<string, number>>,
  /** Buildings damaged at full severity (at least one on any defeat; never the Nest). */
  maxDamaged: 4,
  /**
   * Chantier 36: a wave is repelled when nothing was damaged and the predators carried away
   * at most this share of what they could have taken.
   */
  holdLoot: 0.35,
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

/**
 * Chantier 12: the waves come mostly from the alien planet. The rampart is cut in three
 * sectors around the colony: the front (facing the alien planet) and two flanks. A turret
 * defends the rampart within its range; the garrison goes where defense is missing.
 */
export const SECTOR_IDS = ['front', 'left', 'right'] as const;
export type SectorId = (typeof SECTOR_IDS)[number];

/**
 * Direction of the alien planet, the same on every face: an azimuth in the plane of the face
 * (direction (sin a, cos a) in `hexToPixel` coordinates, which the client draws as (x, z)).
 */
export const FRONT_AZIMUTH = Math.PI;

export const SECTORS = {
  /** Half the angle of the front sector (the flanks share the rest). */
  frontHalfAngle: Math.PI / 3,
  /** How a wave spreads over the sectors: ferrets mostly by the front, bats more scattered. */
  share: {
    ground: { front: 0.6, left: 0.2, right: 0.2 },
    air: { front: 0.4, left: 0.3, right: 0.3 },
  } satisfies Record<'ground' | 'air', Record<SectorId, number>>,
  /** Share of what breaks through a sector that turns to the least defended flank instead. */
  overflow: 0.5,
  /** Range of the turrets in tiles (index = level); sky turrets reach one tile further. */
  range: [0, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5] as readonly number[],
  skyRangeBonus: 1,
} as const;

/** Turrets (both models together) allowed by Nest level (index = level). */
export const TURRETS = {
  max: [0, 2, 4, 6, 7, 7, 8, 8, 8, 9, 9, 9, 9] as readonly number[],
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
    scout: { ground: 0.7, air: 0.6 },
    mayor: { ground: 0.4, air: 0 },
    gatherer: { ground: 0.6, air: 0.9 },
    bard: { ground: 0.6, air: 0.3 },
    // Chantier 37, tier 2.
    architect: { ground: 0.7, air: 0 },
    navigator: { ground: 0.8, air: 0.8 },
    champion: { ground: 1.2, air: 0 },
    archmage: { ground: 1, air: 1.2 },
    herbalist: { ground: 0.7, air: 1.1 },
    minstrel: { ground: 0.7, air: 0.4 },
    // Tier 3.
    engineer: { ground: 0.9, air: 0.6 },
    paladin: { ground: 1.4, air: 0.5 },
    druid: { ground: 0.9, air: 1.1 },
    ranger: { ground: 1, air: 1.2 },
    titan: { ground: 1.5, air: 0.2 },
    oracle: { ground: 0.9, air: 1 },
  } satisfies Record<ClassId | 'none', { ground: number; air: number }>,
  /** Chantier 08: with firearms, warriors shoot the bats too. */
  firearmsAir: 0.8,
  /** Posted kiwis stand in the front line: more often hurt. */
  exposure: 1.5,
  /**
   * Chantier 15: the automatic garrison posts its guards this long before a strike, at most
   * this share of the colony, until nothing breaks through at bad luck.
   */
  autoLeadMs: ms.min(40),
  autoShare: 0.5,
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
  /** The first one falls this long after the start; then about two a day (owner, Oct 2026). */
  firstMs: ms.h(3),
  intervalMs: [ms.h(9), ms.h(15)],
  /** The shooting star is seen this long before the impact. */
  noticeMs: ms.h(1),
  /** The crater fades away this long after the impact. */
  lifeMs: ms.h(48),
  /** Stock: base × Nest level factor × (1 + perDay × days played, capped like the threats). */
  stock: 300,
  nestFactor: [0, 1, 1.5, 2.2, 3, 3.25, 3.5, 3.8, 4.05, 4.3, 4.6, 4.85, 5.1] as readonly number[],
  /** Chantier 08: richer gifts in later ages (index = age). */
  ageFactor: [1, 1.3, 1.7, 2.2] as readonly number[],
  perDay: 0.15,
  /** What falls (weights). */
  resources: { seeds: 2, juice: 1, fiber: 1 } as const,
  /** Land types it can land on. */
  tiles: ['flesh', 'grove', 'seedRing'] as const,
  /**
   * Chantier 15: a crater is a temporary post (no camp, nothing built on it) with this many
   * places, filled by the kiwis with the most Dexterity.
   */
  slots: 3,
  /** Chantier 38: the automation sends at most this share of the colony to the craters. */
  autoShare: 0.25,
  /** Harvest per hour of one average kiwi at a crater (a level-1 workplace's rate). */
  rates: { pulp: 750, fiber: 600, seeds: 190, juice: 450 } satisfies Resources,
  /** Meteorite drill (technology `meteorDrill`): harvest multiplier by age (index = age). */
  drill: [1, 1.5, 2, 2.5] as readonly number[],
  /** Craters kept at once (about two falls a day for 48 hours each). */
  max: 5,
} as const;
