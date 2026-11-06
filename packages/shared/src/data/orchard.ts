import type { ResourceId } from './resources';

/**
 * Chantier 54: the cosmic orchard. Fruit planets reached through a wormhole that follows the
 * Mother Vine; the same orchard for a whole universe (drawn from its seed), but every colony keeps
 * its own views, standing and trading post. The raspberry comes first (chantier 55 adds the apple
 * and the pineapple). Every number is a hypothesis, checked with the balance bot.
 */

export const FRUIT_IDS = ['raspberry'] as const;
export type FruitId = (typeof FRUIT_IDS)[number];

/** The target id of every voyage to the orchard (no face: the raspberry's drupelets). */
export const ORCHARD_TARGET = 'orchard:raspberry';

export const ORCHARD = {
  /** The launchpad level a ship needs to go through the wormhole (with the technology). */
  padLevel: 10,
  /**
   * One way through the wormhole, before the launchpad's speed (× 0.55 at level 10), fuel,
   * technologies and the dock: about 3 h at level 10.
   */
  travelMs: 6 * 3_600_000,
  /** A hop from one drupelet to the next (low gravity: short). */
  hopMs: 10 * 60_000,
  /** Drupelets one visit can call at (the crew carries two at a time). */
  maxStops: 2,
  /** Trips to the raspberry with a trading post standing there (it is a relay). */
  relay: 0.75,
  /** Kiwis aboard (a Kikiwiwi never goes through the wormhole). */
  crew: { min: 1, max: 8 },
} as const;

export const RASPBERRY = {
  /** Drupelets in the cluster, clans sharing them, drupelets a clan holds (about). */
  drupelets: [60, 90] as const,
  clans: [8, 12] as const,
  /** A drupelet's neighbours: those closer than this many times the mean spacing. */
  neighbourSpan: 1.45,
  /** Share of the sphere at the top left bare where the vine holds the fruit. */
  stemCap: 0.12,
  /** What a clan asks for in trade (a public draw per clan). */
  wants: ['pulp', 'fiber', 'juice', 'seeds'] as readonly ResourceId[],
  /**
   * The rings of the cluster, from the tip (0, the far end from the vine: young clans) to the
   * shoulders by the stem (2: the oldest, strongest clans). By ring: garrison power, level,
   * nectar stored on a drupelet (± `nectarSpread`).
   */
  rings: {
    power: [40, 60, 85] as readonly number[],
    level: [16, 18, 20] as readonly number[],
    nectar: [20, 35, 55] as readonly number[],
  },
  /** The garrison drawn around its ring's power (× 1 ± spread), and a nest's weight. */
  powerSpread: 0.2,
  nectarSpread: 0.3,
  nestChance: 0.25,
  nestPower: 1.5,
  /** Shares of a garrison's power by kind (beetles, armoured guards, flying adults). */
  mix: { beetle: 0.6, beetleGuard: 0.25, byturus: 0.15 },
  /** A pillaged drupelet's garrison grows back to full over this time (public). */
  regrowMs: 72 * 3_600_000,
  /** Help from each neighbouring drupelet of the same clan in a battle (share, delay). */
  help: { share: 0.25, delayS: 25 },
} as const;

/** Chantier 54: the standing of each clan with this colony (public, shown to the player). */
export const STANDING = {
  min: -100,
  max: 100,
  /** At or above: a friendly clan (a post may stand there); at or below: hostile. */
  friendly: 30,
  hostile: -30,
  /** A trade, a gift (per call), a pillage (the clan, then each clan next to it). */
  trade: 3,
  gift: 8,
  pillage: -60,
  pillageNeighbours: -20,
  /** Points a day it drifts back toward 0 (a punishment is recoverable, a friendship fades). */
  driftPerDay: 2,
} as const;

export const TRADE = {
  /** Nectar a clan pays for 1000 units of what it asks for (a public draw per clan). */
  rate: [4, 7] as const,
  /** Our own sales lower our rate: × 1 / (1 + sold / `soften`), sold fading over `fadeMs`. */
  soften: 20000,
  fadeMs: 72 * 3_600_000,
  /** A gift: the share of the cargo given for nothing (it buys standing, not nectar). */
  giftShare: 1,
} as const;

/** Chantier 54: red nectar, a stock of its own (raw integer units, like the crystal). */
export const NECTAR = {
  /** Stock cap (units) by Nest level (index 0–15). */
  cap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 150, 200, 250, 320, 400] as readonly number[],
} as const;

/** Raw nectar units per unit (a stall's rate is `1000 × perHour × work` raw units per ms). */
export const NECTAR_SCALE = 1000 * 3_600_000;

export function nectarUnits(raw: number): number {
  return Math.floor(raw / NECTAR_SCALE + 1e-9);
}

export const POST_MODULE_TYPES = ['hut', 'stall', 'palisade'] as const;
export type PostModuleType = (typeof POST_MODULE_TYPES)[number];

export interface PostModuleDef {
  nectar: number;
  iron: number;
  durationMs: number;
  /** Kiwis it houses. */
  housing?: number;
  /** Kiwis who can work in it. */
  workSlots?: number;
  /** Levels of fortification it adds to the post's defence. */
  fort?: number;
}

/** Chantier 54: a trading post, a small map on a friendly or taken drupelet (one per fruit). */
export const POST = {
  /** What founding it costs (paid at launch), and the time to set it up on arrival. */
  cost: { nectar: 40, crystal: 40, iron: 20 },
  buildMs: 2 * 3_600_000,
  /** Its small map (`smallMap`): a disc of radius 2, a rock or two on the ring. */
  radius: 2,
  rocks: [1, 2] as const,
  maxModules: 5,
  modules: {
    hut: { nectar: 10, iron: 5, durationMs: 3_600_000, housing: 2 },
    stall: { nectar: 15, iron: 5, durationMs: 3_600_000, workSlots: 2 },
    palisade: { nectar: 20, iron: 10, durationMs: 2 * 3_600_000, fort: 1 },
  } as Record<PostModuleType, PostModuleDef>,
  /** Nectar an average kiwi gathers in a stall per hour; the store's cap (units). */
  perHour: 0.6,
  storeCap: 60,
  /** A ruined post rises again at this share of its founding cost. */
  rebuild: 0.5,
  /** A module taken down gives this share back. */
  refund: 0.25,
} as const;

/** Chantier 54: attacks on a trading post by a hostile clan next to it. */
export const POST_ATTACK = {
  /** Time between two attacks (drawn from a public stream), and the notice. */
  intervalMs: [36 * 3_600_000, 60 * 3_600_000] as const,
  noticeMs: 8 * 3_600_000,
  /** The attackers: this share of the clan's drupelets' garrisons next to the post. */
  share: 0.5,
  /** A defeat: share of the store taken. */
  loot: 1,
  /** Wounds of the guards who fall in an attack held. */
  woundMs: 6 * 3_600_000,
} as const;
