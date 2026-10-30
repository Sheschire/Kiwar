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

export const ROOM_KINDS = ['bundle', 'sap', 'nest', 'scree', 'raphides'] as const;
/**
 * `bundle`: a vascular bundle (a natural gallery, fibre); `sap`: a sap pocket (juice); `nest`:
 * a nest of Grouillants (more of them; feeds the upwellings until taken); `scree`: fallen flesh
 * (hazard: falls); `raphides`: a pocket of crystal needles (hazard: cuts).
 */
export type RoomKind = (typeof ROOM_KINDS)[number];

export const HAZARD_KINDS = ['fall', 'cuts'] as const;
/** `fall`: lessened by Endurance; `cuts`: lessened by Dexterity. */
export type HazardKind = (typeof HAZARD_KINDS)[number];

export const DEPTHS = {
  /** Layers of the network (chantiers 50 and 52 add the locules, then the core). */
  layers: ['flesh'] as const,
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
  ] as readonly Record<RoomKind, number>[],
  /** Grouillants of a room: power by depth (threat points, `ENEMIES.power`), × spread. */
  power: [9, 20, 36] as readonly number[],
  spread: [0.75, 1.25] as const,
  /** A nest holds this many times more. */
  nestPower: 1.8,
  /** Share of each kind in a room's power. */
  mix: { larva: 0.55, fruitFly: 0.25, woodlouse: 0.2 },
  /** Level of the Grouillants by depth. */
  level: [3, 7, 11] as readonly number[],
  /**
   * Hazards: scree always falls, raphides always cut; any other room has this chance of one
   * (drawn between the two). Strength = share of a kiwi's hit points lost by one hit, × spread.
   */
  hazard: {
    otherChance: 0.3,
    strength: [0.25, 0.32, 0.4] as readonly number[],
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
  travelMs: [ms.h(1), ms.h(3), ms.h(5)] as readonly number[],
  /** Loot of a room won, by depth, then by kind (raw resource units). */
  loot: [300, 550, 900] as readonly number[],
  lootKind: {
    bundle: { fiber: 1, pulp: 0.3 },
    sap: { juice: 1, pulp: 0.3 },
    nest: { pulp: 1, fiber: 0.5, juice: 0.5 },
    scree: { seeds: 0.6, pulp: 0.5 },
    raphides: { seeds: 0.8, fiber: 0.3 },
  } as Record<RoomKind, Partial<Record<ResourceId, number>>>,
  /** Meteoric iron of a room won (whole units), by depth. */
  iron: [1, 2, 3] as readonly number[],
  /** Galleries: what a taken room yields, places for miners by depth, rate per miner per hour. */
  gallery: {
    resource: {
      bundle: 'fiber',
      sap: 'juice',
      nest: 'pulp',
      scree: 'seeds',
      raphides: 'seeds',
    } as Record<RoomKind, ResourceId>,
    slots: [2, 3, 3] as readonly number[],
    /**
     * Output of a miner: this share (by depth) of what a worker yields in the producer of the
     * gallery's resource at the level `6 + tunnel level` (7–9) — less than a workshop, but no
     * deposit to drain, no walk to a depot, day and night, in every season.
     */
    perMiner: [0.5, 0.7, 0.9] as readonly number[],
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
    /** Spread of the announced numbers, and of the luck at the strike. */
    spread: 0.15,
    /** Share of fruit flies (air), the rest larvae and woodlice. */
    airShare: 0.25,
  },
} as const;
