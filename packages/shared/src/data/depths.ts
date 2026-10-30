import { ms } from './curves';
import type { BuildingType } from './buildings';
import type { ResourceId } from './resources';

/**
 * Chantier 48: the depths under our half of the kiwi. The first layer, the green flesh (outer
 * pericarp), opens in the Iron age: a network of rooms under fog, explored by delves from the
 * tunnel entrance. The shape of the network is public (drawn from the face's seed); what a room
 * holds is drawn from a secret seed and resolved only where the truth is held (`depthSeed`).
 * Every number here is a hypothesis, checked with the balance bot.
 */

export const ROOM_KINDS = ['bundle', 'sap', 'nest', 'scree', 'raphides', 'forest', 'lake'] as const;
/**
 * `bundle`: a vascular bundle (a natural gallery, fibre); `sap`: a sap pocket (juice); `nest`:
 * a nest of Grouillants (more of them; feeds the upwellings until taken); `scree`: fallen flesh
 * (hazard: falls); `raphides`: a pocket of crystal needles (hazard: cuts).
 * Chantier 50, the locules: `forest`: a forest of raphides (crystal; hazard: cuts); `lake`: a
 * lake of actinidine (its enzyme, while mined; hazard: acid). A locule may also hold a nest.
 */
export type RoomKind = (typeof ROOM_KINDS)[number];

export const HAZARD_KINDS = ['fall', 'cuts', 'acid'] as const;
/** `fall` and `acid` (chantier 50): lessened by Endurance; `cuts`: lessened by Dexterity. */
export type HazardKind = (typeof HAZARD_KINDS)[number];

export const DEPTHS = {
  /** Layers of the network (chantier 50 adds the locules at depth 4, 52 the core). */
  layers: ['flesh', 'locules'] as const,
  /** Rooms of the flesh by depth (1, 2, 3): [min, max] each. */
  rooms: [
    [3, 4],
    [4, 5],
    [3, 5],
  ] as readonly (readonly [number, number])[],
  /** Chance that two rooms side by side at the same depth are linked. */
  sideLink: 0.4,
  /** Chance that a room also links to its second nearest room above. */
  secondLink: 0.35,
  /** Draw weights of the room kinds, by depth (index 0 = depth 1). */
  kindWeights: [
    { bundle: 4, sap: 3, nest: 1, scree: 1.5, raphides: 0.5 },
    { bundle: 3, sap: 3, nest: 2, scree: 1.5, raphides: 1 },
    { bundle: 2, sap: 3, nest: 3, scree: 1.5, raphides: 1.5 },
    { forest: 3, lake: 2 },
  ] as readonly Partial<Record<RoomKind, number>>[],
  /** Grouillants of a room: power by depth (threat points, `ENEMIES.power`), × spread. */
  power: [9, 20, 36, 50] as readonly number[],
  spread: [0.75, 1.25] as const,
  /** A nest holds this many times more. */
  nestPower: 1.8,
  /** Share of each kind in a room's power. */
  mix: { larva: 0.55, fruitFly: 0.25, woodlouse: 0.2 },
  /** Level of the Grouillants by depth. */
  level: [3, 7, 11, 13] as readonly number[],
  /**
   * Hazards: scree always falls, raphides always cut; any other room has this chance of one
   * (drawn between the two). Strength = share of a kiwi's hit points lost by one hit, × spread.
   */
  hazard: {
    otherChance: 0.3,
    strength: [0.25, 0.32, 0.4, 0.45] as readonly number[],
    /** Chance for each kiwi to be hit, before its stat. */
    chance: 0.6,
    /** Each point of the matching stat above 5 lowers the chance and the harm by this share. */
    perStat: 0.05,
    /** At most this much lowered by the stat. */
    statCap: 0.6,
    /** A hazard never takes a kiwi below this share of its hit points. */
    floor: 0.2,
  },
  /** Delves: one-way time by depth, and the XP of a room won (× `LANDING.victoryXp`). */
  travelMs: [ms.h(1), ms.h(3), ms.h(5), ms.h(7)] as readonly number[],
  /** Loot of a room won, by depth, then by kind (raw resource units). */
  loot: [300, 550, 900, 1300] as readonly number[],
  lootKind: {
    bundle: { fiber: 1, pulp: 0.3 },
    sap: { juice: 1, pulp: 0.3 },
    nest: { pulp: 1, fiber: 0.5, juice: 0.5 },
    scree: { seeds: 0.6, pulp: 0.5 },
    raphides: { seeds: 0.8, fiber: 0.3 },
    forest: { seeds: 0.6, fiber: 0.4 },
    lake: { juice: 0.6, pulp: 0.4 },
  } as Record<RoomKind, Partial<Record<ResourceId, number>>>,
  /** Meteoric iron of a room won (whole units), by depth. */
  iron: [1, 2, 3, 4] as readonly number[],
  /** Galleries: what a taken room yields, places for miners by depth, rate per miner per hour. */
  gallery: {
    resource: {
      bundle: 'fiber',
      sap: 'juice',
      nest: 'pulp',
      scree: 'seeds',
      raphides: 'seeds',
    } as Partial<Record<RoomKind, ResourceId>>,
    /**
     * Chantier 50: the mastery a miner uses in each gallery (a locule's crystal is cut like
     * seeds are quarried; a lake is worked like a juice well).
     */
    workAs: {
      bundle: 'fiber',
      sap: 'juice',
      nest: 'pulp',
      scree: 'seeds',
      raphides: 'seeds',
      forest: 'seeds',
      lake: 'juice',
    } as Record<RoomKind, ResourceId>,
    slots: [2, 3, 3, 3] as readonly number[],
    /**
     * Output of a miner: this share (by depth) of what a worker yields in the producer of the
     * gallery's resource at the level `6 + tunnel level` (7–9) — less than a workshop, but no
     * deposit to drain, no walk to a depot, day and night, in every season.
     */
    perMiner: [0.5, 0.7, 0.9, 1] as readonly number[],
    producer: {
      pulp: 'pulpery',
      fiber: 'fiberWorkshop',
      juice: 'juiceWell',
      seeds: 'seedQuarry',
    } as Record<ResourceId, BuildingType>,
    /** The automation sends at most this share of the colony down the mines. */
    autoShare: 0.2,
    /** A damaged door (an upwelling broke it) halves the work below. */
    damagedWork: 0.5,
  },
  /**
   * Chantier 50: the locules (depth 4), an arc of rooms around the core, each with its giant
   * seeds. Public like the flesh (drawn after it, on a stream of their own: the flesh's network
   * never moves); open from the Industry age.
   */
  locules: {
    count: [30, 42] as const,
    /** Chance that a depth-3 room also opens onto its second nearest locule. */
    secondLink: 0.35,
    /** Chance that a locule opens onto the depth-3 room nearest to it (on top of the above). */
    upLink: 0.15,
    /** Chance that a locule holds a nest of Grouillants (`DEPTHS.nestPower` times more). */
    nestChance: 0.4,
    /** Giant seeds found in a locule won: [min, max]. */
    giantSeeds: [1, 3] as const,
    /** Age that opens them (Industry). */
    age: 3,
    /** A crew told to skirt the lakes takes this much longer to a locule (and meets no acid). */
    skirtTravel: 1.5,
  },
  /**
   * Chantier 50: an actinidine lake worked by at least one miner (the door open) halves the
   * laboratory's infusion risk, and with the technology Enzymes the wounded heal faster.
   */
  actinidine: { infusionRisk: 0.5 },
  /** The tunnel entrance's levels (index = level): most kiwis on a delve, door strength. */
  crew: [0, 4, 6, 8] as readonly number[],
  door: [0, 8, 14, 20] as readonly number[],
  /**
   * Fortifying the door: strength added, time, and its cost as a share of a beacon's (half of a
   * seed and a sky turret of the first level of our age, which stand at the door in a battle).
   */
  fortify: { strength: 10, durationMs: ms.h(4), costFactor: 0.5 },
  /** Upwellings: own calendar once the entrance stands. */
  upwell: {
    /** First one at least this long after the entrance is finished. */
    firstMs: ms.h(24),
    intervalMs: [ms.h(36), ms.h(60)] as const,
    noticeMs: ms.h(6),
    /** Never this close to a surface wave's strike. */
    gapMs: ms.h(6),
    /** Power: base × the colony's age factor × (1 + perNest × untaken nests near our works). */
    base: 6,
    perNest: 0.35,
    /** Chantier 50: the locules hold the strongest nests. */
    perLoculeNest: 0.6,
    /** Spread of the announced numbers, and of the luck at the strike. */
    spread: 0.15,
    /** Share of fruit flies (air), the rest larvae and woodlice. */
    airShare: 0.25,
  },
} as const;
