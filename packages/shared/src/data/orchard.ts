import type { ResourceId } from './resources';

/**
 * Chantier 54: the cosmic orchard. Fruit planets reached through a wormhole that follows the
 * Mother Vine; the same orchard for a whole universe (drawn from its seed), but every colony keeps
 * its own views, standing and trading post. The raspberry comes first (chantier 55 adds the apple
 * and the pineapple). Every number is a hypothesis, checked with the balance bot.
 */

export const FRUIT_IDS = ['raspberry', 'apple', 'pineapple'] as const;
export type FruitId = (typeof FRUIT_IDS)[number];

/** The target id of a voyage to a fruit of the orchard (no face: the fruit's parcels). */
export function orchardTarget(fruit: FruitId): string {
  return `orchard:${fruit}`;
}

/** The raspberry's target (the first fruit; old voyages carry it). */
export const ORCHARD_TARGET = orchardTarget('raspberry');

/**
 * Chantier 55: the first letter of a parcel's id and of a clan's id names its fruit (ids stay
 * unique across the orchard, so standing, views and pillages keep one record each).
 */
export const FRUIT_PREFIX: Record<FruitId, { parcel: string; clan: string }> = {
  raspberry: { parcel: 'd', clan: 'c' },
  apple: { parcel: 'g', clan: 'w' },
  pineapple: { parcel: 's', clan: 'n' },
};

/** Names each fruit's clans draw from (`orchard.clanNames.<fruit>.n<i>` in the client). */
export const CLAN_NAME_COUNT: Record<FruitId, number> = { raspberry: 16, apple: 8, pineapple: 10 };

/** The fruit of a parcel or clan id (null: no fruit's). */
export function fruitOfId(id: string): FruitId | null {
  const c = id[0];
  for (const f of FRUIT_IDS)
    if (FRUIT_PREFIX[f].parcel === c || FRUIT_PREFIX[f].clan === c) return f;
  return null;
}

/** The fruit of a voyage's target id (old voyages: the raspberry). */
export function fruitOfTarget(targetId: string): FruitId {
  const f = targetId.startsWith('orchard:') ? targetId.slice(8) : '';
  return (FRUIT_IDS as readonly string[]).includes(f) ? (f as FruitId) : 'raspberry';
}

/**
 * Chantier 55: what every fruit shares — its rings of clans (garrison power, level, the store of
 * a parcel by ring), the spread of a draw, nests, the mix of its inhabitants, the regrowth after
 * a pillage and the help of a clan's parcels next door.
 */
export interface FruitDef {
  rings: {
    power: readonly number[];
    level: readonly number[];
    /** What a parcel stores of the fruit's loot, by ring (units). */
    nectar: readonly number[];
  };
  powerSpread: number;
  nectarSpread: number;
  nestChance: number;
  nestPower: number;
  /** Shares of a garrison's power by kind (the first kind: at least one of it). */
  mix: Readonly<Record<string, number>>;
  regrowMs: number;
  help: { share: number; delayS: number };
  /** One way through the wormhole, before the launchpad's speed. */
  travelMs: number;
}

export const ORCHARD = {
  /** The launchpad level a ship needs to go through the wormhole (with the technology). */
  padLevel: 9,
  /**
   * One way through the wormhole, before the launchpad's speed (× 0.56 at level 9), fuel,
   * technologies and the dock: about 3.4 h at level 9.
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

/** The orchard's goods: red nectar (the currency of its trade), cider and golden fibre. */
export const ORCHARD_GOODS = ['nectar', 'cider', 'goldFiber'] as const;
export type OrchardGood = (typeof ORCHARD_GOODS)[number];

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
  travelMs: ORCHARD.travelMs,
} as const;

/** Chantier 55: the apple's stages of ripeness (a public calendar, the same for everyone). */
export const APPLE_STAGES = ['green', 'ripe', 'overripe'] as const;
export type AppleStage = (typeof APPLE_STAGES)[number];

/**
 * Chantier 55: the apple. A big sphere with a skin, a flesh and a core, dug by a people of worms
 * (after the codling moth) in galleries. Its rule is ripeness: green, ripe (rich and calm), then
 * overripe (poor, the worms angry — but the flesh ferments: the only time cider is found).
 */
export const APPLE = {
  /** Galleries, and the share of them in the skin, the flesh and the core. */
  galleries: [20, 30] as const,
  layers: [0.45, 0.35, 0.2] as readonly number[],
  /** Depth of each layer (radius on the unit sphere). */
  radius: [0.9, 0.62, 0.3] as readonly number[],
  /** A gallery's links: its nearest ones in its layer, and toward the layer above. */
  sideLinks: 2,
  upLinks: 1,
  stemCap: 0.1,
  clans: [5, 7] as const,
  wants: ['pulp', 'fiber', 'juice', 'seeds'] as readonly ResourceId[],
  /** By layer (skin 0, flesh 1, core 2): garrison power, level, nectar and cider stored. */
  rings: {
    power: [45, 70, 100] as readonly number[],
    level: [17, 19, 21] as readonly number[],
    nectar: [15, 25, 40] as readonly number[],
  },
  cider: [8, 14, 24] as readonly number[],
  powerSpread: 0.2,
  nectarSpread: 0.3,
  nestChance: 0.2,
  nestPower: 1.5,
  mix: { worm: 0.6, wormGuard: 0.25, codlingMoth: 0.15 },
  regrowMs: 72 * 3_600_000,
  help: { share: 0.3, delayS: 20 },
  travelMs: ORCHARD.travelMs,
  /** Each stage lasts this long; the cycle starts at a public offset drawn from the seed. */
  stageMs: { green: 48 * 3_600_000, ripe: 48 * 3_600_000, overripe: 48 * 3_600_000 } as Record<
    AppleStage,
    number
  >,
  /**
   * By stage: the worms' strength, the richness (trade rates and nectar stored), the cider
   * found (only overripe).
   */
  stages: {
    green: { power: 1, rich: 1, cider: 0 },
    ripe: { power: 0.7, rich: 1.3, cider: 0 },
    overripe: { power: 1.5, rich: 0.5, cider: 1 },
  } as Record<AppleStage, { power: number; rich: number; cider: number }>,
} as const;

/**
 * Chantier 55: the pineapple. A multiple fruit: 100-200 scales (each a fruitlet) in spirals, a
 * grid that is almost a face, guarded by castes of weaver ants; the crown at the top is the
 * royal parcel. Its rule is bromelain: the enzyme digests proteins, so every hour on the fruit
 * wears a crew down (hit points), unless the actinidine of a lake worked at home or golden fibre
 * gear shields it. Its resource: golden fibre, from the crown's leaves.
 */
export const PINEAPPLE = {
  scales: [100, 200] as const,
  /** Each scale's nearest ones it touches (the spirals make an almost hexagonal grid). */
  touches: 5,
  /** The crown links to that many scales of the top row. */
  crownLinks: 6,
  clans: [6, 9] as const,
  wants: ['pulp', 'fiber', 'juice', 'seeds'] as readonly ResourceId[],
  /** By height (the base 0, the middle 1, the shoulders under the crown 2). */
  rings: {
    power: [40, 60, 85] as readonly number[],
    level: [17, 19, 21] as readonly number[],
    nectar: [12, 20, 30] as readonly number[],
  },
  /** Golden fibre a scale holds by ring (the crown: × `crownFiber`). */
  goldFiber: [4, 7, 11] as readonly number[],
  crownPower: 2.5,
  crownFiber: 3,
  powerSpread: 0.2,
  nectarSpread: 0.3,
  nestChance: 0.2,
  nestPower: 1.5,
  mix: { weaverAnt: 0.55, antSoldier: 0.3, antWinged: 0.15 },
  regrowMs: 72 * 3_600_000,
  help: { share: 0.3, delayS: 20 },
  /** Further than the other fruits (8 h before the launchpad's speed). */
  travelMs: 8 * 3_600_000,
  /**
   * Bromelain: a share of a kiwi's hit points lost per hour on the fruit, the hours a landing
   * spends before the fight, the hit points always kept; Endurance above 5 shields (per point, up
   * to `enduranceCap`), the actinidine of a lake worked at home halves it; kiwis at the post are
   * worn out after `postHours` (longer when shielded) and stop working until relieved.
   */
  bromelain: {
    perHour: 0.06,
    landingHours: 3,
    floor: 0.25,
    perEndurance: 0.03,
    enduranceCap: 0.4,
    actinidine: 0.5,
    /** (A worn-out kiwi brought home is wounded like a crew back from a victory.) */
    postHours: 36,
  },
} as const;

/** Chantier 55: every fruit's shared rules. */
export const FRUIT_DEFS: Record<FruitId, FruitDef> = {
  raspberry: RASPBERRY,
  apple: APPLE,
  pineapple: PINEAPPLE,
};

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

/** Chantier 55: cider and golden fibre, stocks of their own (raw units, cap by Nest level). */
export const CIDER = {
  cap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 80, 100, 130, 160, 200] as readonly number[],
} as const;
export const GOLD_FIBER = {
  cap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 60, 80, 100, 130, 160] as readonly number[],
} as const;

/** Each good's cap by Nest level. */
export const GOOD_CAPS: Record<OrchardGood, readonly number[]> = {
  nectar: NECTAR.cap,
  cider: CIDER.cap,
  goldFiber: GOLD_FIBER.cap,
};

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
  /** Chantier 55: the caps of a post's stores of cider and golden fibre (units). */
  goodsCap: { cider: 40, goldFiber: 30 },
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

/** Chantier 55: the good each fruit is known for (its post's, its routes' upkeep). */
export const FRUIT_GOOD: Record<FruitId, OrchardGood> = {
  raspberry: 'nectar',
  apple: 'cider',
  pineapple: 'goldFiber',
};

/**
 * Chantier 55: what a kiwi gathers per hour in a stall of each fruit's post. The apple's stalls
 * gather nectar (× the ripeness's richness) and press cider only while it is overripe; the
 * pineapple's gather golden fibre (its kiwis wear out with the bromelain).
 */
export const POST_YIELD = {
  raspberry: 0.6,
  appleNectar: 0.6,
  appleCider: 0.4,
  pineapple: 0.25,
} as const;

/**
 * Chantier 55: routes between two of our posts. Each route standing (both posts working, its
 * upkeep paid) adds `bonus` to both posts' stalls and shortens trips to them (× `relay`). Its
 * upkeep, `upkeep` units a day of each end's good, is paid a day ahead; unpaid, it is cut (it
 * opens again by paying).
 */
export const ROUTE = {
  bonus: 0.25,
  relay: 0.85,
  dayMs: 24 * 3_600_000,
  upkeep: 6,
} as const;
