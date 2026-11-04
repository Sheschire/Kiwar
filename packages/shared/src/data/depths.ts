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

export const ROOM_KINDS = [
  'bundle',
  'sap',
  'nest',
  'scree',
  'raphides',
  'forest',
  'lake',
  'cavern',
  'stem',
] as const;
/**
 * `bundle`: a vascular bundle (a natural gallery, fibre); `sap`: a sap pocket (juice); `nest`:
 * a nest of Grouillants (more of them; feeds the upwellings until taken); `scree`: fallen flesh
 * (hazard: falls); `raphides`: a pocket of crystal needles (hazard: cuts).
 * Chantier 50, the locules: `forest`: a forest of raphides (crystal; hazard: cuts); `lake`: a
 * lake of actinidine (its enzyme, while mined; hazard: acid). A locule may also hold a nest.
 * Chantier 52, the core: `cavern`: a white cavern, a huge cell with thin walls (pure sap; a
 * cave-in when the crew is heavier than its ceiling); `stem`: the stem, the deepest room, where
 * the Great Weevil guards the way to the Mother Vine.
 */
export type RoomKind = (typeof ROOM_KINDS)[number];

export const HAZARD_KINDS = ['fall', 'cuts', 'acid'] as const;
/** `fall` and `acid` (chantier 50): lessened by Endurance; `cuts`: lessened by Dexterity. */
export type HazardKind = (typeof HAZARD_KINDS)[number];

export const DEPTHS = {
  /** Layers of the network (chantier 50 adds the locules at depth 4, 52 the core and stem). */
  layers: ['flesh', 'locules', 'core'] as const,
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
    { cavern: 1 },
    { stem: 1 },
  ] as readonly Partial<Record<RoomKind, number>>[],
  /** Grouillants of a room: power by depth (threat points, `ENEMIES.power`), × spread. */
  power: [9, 20, 36, 50, 70, 0] as readonly number[],
  spread: [0.75, 1.25] as const,
  /** A nest holds this many times more. */
  nestPower: 1.8,
  /** Share of each kind in a room's power. */
  mix: { larva: 0.55, fruitFly: 0.25, woodlouse: 0.2 },
  /** Level of the Grouillants by depth. */
  level: [3, 7, 11, 13, 16, 20] as readonly number[],
  /**
   * Hazards: scree always falls, raphides always cut; any other room has this chance of one
   * (drawn between the two). Strength = share of a kiwi's hit points lost by one hit, × spread.
   */
  hazard: {
    otherChance: 0.3,
    strength: [0.25, 0.32, 0.4, 0.45, 0.5, 0.5] as readonly number[],
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
  travelMs: [ms.h(1), ms.h(3), ms.h(5), ms.h(7), ms.h(9), ms.h(10)] as readonly number[],
  /** Loot of a room won, by depth, then by kind (raw resource units). */
  loot: [300, 550, 900, 1300, 2000, 0] as readonly number[],
  lootKind: {
    bundle: { fiber: 1, pulp: 0.3 },
    sap: { juice: 1, pulp: 0.3 },
    nest: { pulp: 1, fiber: 0.5, juice: 0.5 },
    scree: { seeds: 0.6, pulp: 0.5 },
    raphides: { seeds: 0.8, fiber: 0.3 },
    forest: { seeds: 0.6, fiber: 0.4 },
    lake: { juice: 0.6, pulp: 0.4 },
    cavern: { juice: 1, pulp: 0.4 },
    stem: {},
  } as Record<RoomKind, Partial<Record<ResourceId, number>>>,
  /** Meteoric iron of a room won (whole units), by depth. */
  iron: [1, 2, 3, 4, 5, 0] as readonly number[],
  /** Galleries: what a taken room yields, places for miners by depth, rate per miner per hour. */
  gallery: {
    resource: {
      bundle: 'fiber',
      sap: 'juice',
      nest: 'pulp',
      scree: 'seeds',
      raphides: 'seeds',
      cavern: 'juice',
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
      cavern: 'juice',
      // The stem's pilgrims (chantier 52) work nothing: their mastery is never read.
      stem: 'juice',
    } as Record<RoomKind, ResourceId>,
    slots: [2, 3, 3, 3, 3, 2] as readonly number[],
    /**
     * Output of a miner: this share (by depth) of what a worker yields in the producer of the
     * gallery's resource at the level `6 + tunnel level` (7–9) — less than a workshop, but no
     * deposit to drain, no walk to a depot, day and night, in every season. Chantier 52: a
     * white cavern's pure sap doubles a mine's output.
     */
    perMiner: [0.5, 0.7, 0.9, 1, 2, 0] as readonly number[],
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
   * Chantier 52: the core, white caverns around the centre below the locules (public like the
   * rest, drawn after the locules on a stream of their own), and the stem below them. Open from
   * the Age of the stars.
   */
  core: {
    count: [6, 10] as const,
    /** Chance that two caverns side by side are linked (the first and last always are). */
    sideLink: 0.6,
    /** Chance that a cavern also opens onto its second nearest locule. */
    secondLink: 0.4,
    /** Chance that a cavern holds a nest of Grouillants. */
    nestChance: 0.35,
    /** Giant seeds found in a cavern won: [min, max]. */
    giantSeeds: [0, 2] as const,
    /** Age that opens them (the stars). */
    age: 4,
    /**
     * The thin walls: each cavern's ceiling (public), in crew weight (`crewWeight`: 10 a kiwi,
     * × its traits, + its armour's `armorWeight`). Heavier than that, the cavern caves in.
     */
    ceiling: [45, 75] as const,
    armorWeight: { light: 2, heavy: 6 } as Record<'light' | 'heavy', number>,
    /**
     * A cave-in hits every kiwi of the crew (lessened by Endurance and the spelunkers): its
     * strength is `base` + `perExcess` × the share of weight above the ceiling, at most `max`.
     */
    caveIn: { base: 0.2, perExcess: 0.8, max: 0.6 },
  },
  /**
   * Chantier 52: the stem and its Great Weevil, a giant beetle (a pest of the fruit) in three
   * phases: its shell on the ground (heavy armour), then in the air in bursts (only blows that
   * reach the air touch it), then a swarm of larvae and its last stand. Its guard is public: the
   * battle is long, readable, prepared. Every number is a hypothesis, measured with the bot.
   */
  stem: {
    /** Hit points before the level (× √ of the level factor, like a kiwi's). */
    hp: 900,
    level: 20,
    /** × the ram's damage. */
    damage: 1,
    armor: 0.45,
    speed: 0.5,
    size: 3,
    /** Under 66 % it takes to the air for 16 s, lands for 12 s, and so on. */
    flight: { below: 0.66, airS: 16, groundS: 12, armor: 0.15 },
    /** Under 33 % a swarm of larvae comes out of the walls. */
    swarm: { below: 0.33, larvae: 24, delayS: 2 },
    /** Under 20 % the last stand. */
    rage: { below: 0.2, damage: 1.5, speed: 1.3 },
    /** Grouillants by its side at the start (power, level). */
    escort: { power: 40, level: 18 },
    /** The battle lasts at most this long. */
    maxS: 480,
    /** Its wounds of a lost battle heal over this long, and never pass this share. */
    healMs: ms.h(72),
    maxWounds: 0.5,
    /** Chantier 52: the Mother Vine's treasure (up to the caps). */
    treasure: { giantSeeds: 6, crystal: 80 },
    /** Places for pilgrims at the stem's gallery (they work nothing; the colony's morale). */
    pilgrims: 2,
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
    /** Chantier 52: the core's nests, the strongest of all (silenced by the Mother Vine). */
    perCoreNest: 0.8,
    /** Spread of the announced numbers, and of the luck at the strike. */
    spread: 0.15,
    /** Share of fruit flies (air), the rest larvae and woodlice. */
    airShare: 0.25,
  },
} as const;
