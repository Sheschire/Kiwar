import type { Hex } from '../hex/hex';
import type { ClassId } from '../data/classes';
import type { Posture, Weapon, WeaponId } from '../data/units';
import type { SectorId } from '../data/threats';

/**
 * Chantier 36: the battle engine's input and output. A setup is plain data (no game state):
 * the same setup and seed always give the same log, on the server, the phone or the bot.
 */

/** 0: the side at home (buildings, turrets, kiwis); 1: the attackers. */
export type BattleSide = 0 | 1;

export type UnitBody = 'kiwi' | 'kikiwiwi' | 'ferret' | 'bat' | 'turret';

/** What a unit does in the battle (its AI). */
export type UnitRole = 'guard' | 'militia' | 'turret' | 'raider';

export interface BattleTile extends Hex {
  /** Walk cost for the ground units (Infinity: nobody walks there). */
  cost: number;
}

export interface BattleBuilding {
  /** Building id in the game. */
  ref: string;
  /** Type, for the replay. */
  type: string;
  side: BattleSide;
  /** Tiles covered (anchor first); nobody walks on them. */
  tiles: Hex[];
  /** Hit points before it is damaged; 0: it cannot be damaged (Nest, monument, already damaged). */
  hp: number;
  /** Resources the raiders can carry away from it (pulp, fiber, seeds, juice). */
  loot: [number, number, number, number];
  /** How much the raiders want it (they weigh it against the walk). */
  priority: number;
}

export interface BattleUnitSetup {
  /** Villager id, turret building id, or a predator id. */
  ref: string;
  side: BattleSide;
  body: UnitBody;
  role: UnitRole;
  /** Kind shown on the unit card: a predator kind, a class, or a turret type. */
  kind: string;
  name: string;
  level: number;
  classId: ClassId | null;
  hp: number;
  armor: number;
  /** Tiles per second on a tile of walk cost 1. */
  speed: number;
  dodge: number;
  /** Places on a tile; 0: flies. */
  size: number;
  flying: boolean;
  /** Never moves (turrets). */
  fixed: boolean;
  weaponId: WeaponId;
  /** Final weapon (damage and accuracy already scaled by the unit's stats). */
  weapon: Weapon;
  /** Shots left (turrets); null: unlimited. */
  ammo: number | null;
  /** Loot it can carry (raiders). */
  carry: number;
  /** Threat points it is worth (for the retreat threshold). */
  power: number;
  /** Start tile (a raider: where it enters). */
  at: Hex;
  /** Seconds before it enters the battle. */
  delay: number;
  /** Building a turret stands on (index in `buildings`): it fires slower once damaged. */
  building: number | null;
  fightsBack: boolean;
  huntsKiwis: boolean;
  sector: SectorId | null;
}

export interface SideOrders {
  posture: Posture;
  /** The side runs away under this share of its power (0: never). */
  retreatBelow: number;
}

export interface BattleSetup {
  tiles: BattleTile[];
  /** Tiles where the attackers come in and run away (by index in `tiles`). */
  exits: number[];
  buildings: BattleBuilding[];
  units: BattleUnitSetup[];
  orders: [SideOrders, SideOrders];
  /** Buildings damaged at most (then the others are spared: a colony is never razed). */
  maxDamaged?: number;
  /** Longest battle in seconds (`BATTLE.maxS` by default). */
  maxS?: number;
}

/** What happened, read by the game (the wave) and by the reports. */
export interface BattleResult {
  /** Seconds. */
  duration: number;
  /** The home side kept everything and nothing was damaged. */
  held: boolean;
  /** Everything the attackers could have carried away at the start. */
  lootable: number;
  /** Resources carried away, by building (index in `buildings`). */
  loot: { building: number; amounts: [number, number, number, number] }[];
  /** Buildings whose hit points reached zero (indices). */
  damaged: number[];
  /** Units of the home side that fell, in order (refs). */
  fallen: string[];
  /** Units of the home side that ran home hurt (refs). */
  fled: string[];
  attackers: { total: number; fallen: number; escaped: number };
  /** Share of the attackers' power that reached a building. */
  reached: number;
  /** Tiles the ground attackers fought from (the paths there are trampled). */
  struck: Hex[];
  /** Shots fired, by turret building ref. */
  shots: Record<string, number>;
}

/** One unit as the replay sees it (a tuple keeps the log small). */
export type LogUnit = [
  ref: string,
  side: BattleSide,
  body: UnitBody,
  kind: string,
  name: string,
  level: number,
  classId: ClassId | null,
  /** Hit points in tenths. */
  hp: number,
  q: number,
  r: number,
  weapon: WeaponId,
];

/** One building as the replay sees it. */
export type LogBuilding = [ref: string, type: string, q: number, r: number, hp: number];

/**
 * The journal of a battle: it is what happened (the client replays it, never recomputes).
 * `events` is a compact string (see codec.ts); `steps` steps of `dt` seconds.
 */
export interface BattleLog {
  v: 1;
  dt: number;
  steps: number;
  units: LogUnit[];
  buildings: LogBuilding[];
  events: string;
  result: BattleResult;
}

/** Event codes of the journal; each is followed by its arguments. */
export const EV = {
  /** n: the next events happen n steps later. */
  step: 0,
  /** unit, tile key, duration in tenths of a second: starts walking (or flying) there. */
  move: 1,
  /** unit, target (unit × 2, or building × 2 + 1), damage in tenths (0: missed). */
  attack: 2,
  /** unit, target unit, damage in tenths: caught in the splash of an area attack. */
  splash: 3,
  /** unit: falls. */
  fall: 4,
  /** unit, building, amount: takes loot. */
  loot: 5,
  /** building: damaged. */
  damaged: 6,
  /** unit: leaves the field (an attacker with its loot, a hurt kiwi running home). */
  gone: 7,
  /** unit: runs away. */
  flee: 8,
  /** unit: comes in. */
  enter: 9,
} as const;

/** Number of arguments of each event code. */
export const EV_ARGS = [1, 3, 3, 3, 1, 3, 1, 1, 1, 1] as const;

/** Tile key of the journal: q and r packed in one small number. */
export const TILE_OFFSET = 32;
export const tileCode = (h: Hex): number => (h.q + TILE_OFFSET) * 64 + (h.r + TILE_OFFSET);
export const tileOfCode = (c: number): Hex => ({
  q: Math.floor(c / 64) - TILE_OFFSET,
  r: (c % 64) - TILE_OFFSET,
});
