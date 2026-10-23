import type { ClassId } from './classes';

/**
 * Chantier 36: the units of the battle engine. Everything a fighter does comes from these
 * tables: hit points, armour, speed, dodge, size on a tile, and one weapon (damage, range in
 * tiles, reload in seconds, melee / ranged / area, what it can reach). Kiwis get their profile
 * from their stats, level and class (`kiwiUnit`, battle/units.ts); predators from their kind,
 * scaled to the power of the wave.
 */

export const WEAPON_IDS = [
  'beak',
  'mace',
  'sword',
  'fireball',
  'sling',
  'musket',
  'stomp',
  'claw',
  'bite',
  'slam',
  'dive',
  'spit',
  'seedShot',
  'skyShot',
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponStyle = 'melee' | 'ranged' | 'area';

export interface Weapon {
  /** Hit points taken by one hit (before armour). */
  damage: number;
  /** Reach in tiles (1: the next tile). */
  range: number;
  /** Seconds between two attacks. */
  reload: number;
  style: WeaponStyle;
  /** Chance to hit before the target's dodge. */
  accuracy: number;
  hitsGround: boolean;
  hitsAir: boolean;
}

const melee = (damage: number, reload: number, hitsAir = false): Weapon => ({
  damage,
  range: 1,
  reload,
  style: 'melee',
  accuracy: 0.9,
  hitsGround: true,
  hitsAir,
});

export const WEAPONS: Record<WeaponId, Weapon> = {
  // Kiwis: a peck for everybody, then the weapon of the class.
  beak: melee(1, 1.5),
  mace: melee(2.4, 1.6),
  sword: melee(3.2, 1.1),
  fireball: {
    damage: 2.6,
    range: 3,
    reload: 2.2,
    style: 'area',
    accuracy: 0.8,
    hitsGround: true,
    hitsAir: true,
  },
  sling: {
    damage: 1.6,
    range: 2,
    reload: 1.2,
    style: 'ranged',
    accuracy: 0.75,
    hitsGround: true,
    hitsAir: true,
  },
  musket: {
    damage: 4,
    range: 3,
    reload: 2.4,
    style: 'ranged',
    accuracy: 0.75,
    hitsGround: true,
    hitsAir: true,
  },
  stomp: { ...melee(6, 1.6, true), style: 'area' },
  // Predators.
  claw: melee(2, 1.2),
  bite: melee(1.5, 1),
  slam: melee(5, 1.8),
  dive: melee(2, 1.4),
  spit: {
    damage: 1.6,
    range: 2,
    reload: 1.6,
    style: 'ranged',
    accuracy: 0.8,
    hitsGround: true,
    hitsAir: false,
  },
  // Turrets: the damage of a shot is set from the turret's defense (`TURRET_SHOT`).
  seedShot: {
    damage: 1,
    range: 3,
    reload: 0.8,
    style: 'ranged',
    accuracy: 0.85,
    hitsGround: true,
    hitsAir: false,
  },
  skyShot: {
    damage: 1,
    range: 4,
    reload: 0.8,
    style: 'ranged',
    accuracy: 0.85,
    hitsGround: false,
    hitsAir: true,
  },
};

export const ENEMY_KINDS = ['soldier', 'scout', 'brute', 'diver', 'spitter'] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export interface EnemyProfile {
  body: 'ferret' | 'bat';
  hp: number;
  /** Share of each hit absorbed. */
  armor: number;
  /** Tiles per second on a tile of walk cost 1. */
  speed: number;
  dodge: number;
  /** Places taken on a tile (3 per tile). */
  size: number;
  weapon: WeaponId;
  /** Threat points it is worth (the wave's `ground` / `air` buys units with them). */
  power: number;
  /** Loot it carries, relative to the others. */
  carry: number;
  /** Fights back the defenders who attack it (a scout runs for the loot). */
  fightsBack: boolean;
  /** Prefers kiwis to buildings (spitters). */
  huntsKiwis: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyProfile> = {
  soldier: {
    body: 'ferret',
    hp: 10,
    armor: 0,
    speed: 0.8,
    dodge: 0.05,
    size: 1,
    weapon: 'claw',
    power: 1,
    carry: 1,
    fightsBack: true,
    huntsKiwis: false,
  },
  scout: {
    body: 'ferret',
    hp: 6,
    armor: 0,
    speed: 1.3,
    dodge: 0.15,
    size: 1,
    weapon: 'bite',
    power: 0.6,
    carry: 1.5,
    fightsBack: false,
    huntsKiwis: false,
  },
  brute: {
    body: 'ferret',
    hp: 28,
    armor: 0.2,
    speed: 0.55,
    dodge: 0,
    size: 2,
    weapon: 'slam',
    power: 2.5,
    carry: 0.5,
    fightsBack: true,
    huntsKiwis: false,
  },
  diver: {
    body: 'bat',
    hp: 7,
    armor: 0,
    speed: 1.4,
    dodge: 0.15,
    size: 0,
    weapon: 'dive',
    power: 1,
    carry: 0.8,
    fightsBack: true,
    huntsKiwis: false,
  },
  spitter: {
    body: 'bat',
    hp: 6,
    armor: 0,
    speed: 1.2,
    dodge: 0.1,
    size: 0,
    weapon: 'spit',
    power: 1.1,
    carry: 0.4,
    fightsBack: false,
    huntsKiwis: true,
  },
};

/** Weapon of a kiwi by class (firearms turn warriors into musketeers, chantier 08). */
export const CLASS_WEAPONS: Record<ClassId | 'none', WeaponId> = {
  none: 'beak',
  builder: 'mace',
  warrior: 'sword',
  mage: 'fireball',
  scout: 'sling',
  mayor: 'beak',
};

/** How the stats of a kiwi become a fighter (5 is an average stat). */
export const KIWI_UNIT = {
  hp: 14,
  /** Per stat point above or below the average. */
  enduranceHp: 0.06,
  strengthDamage: 0.06,
  spiritDamage: 0.06,
  dexterityAccuracy: 0.03,
  agilitySpeed: 0.04,
  agilityDodge: 0.015,
  /** Per level above 1, on hit points and damage. */
  perLevel: 0.04,
  speed: 1.3,
  dodge: 0.05,
  maxDodge: 0.35,
  accuracy: [0.4, 0.97] as const,
  /** A Kikiwiwi: this many times the hit points, two places on a tile, stomps (chantier 08). */
  titanHp: 4,
  titanSize: 2,
  /** Kiwis at home who were not posted fight only near their workplace, and run home hurt. */
  militiaLeash: 1,
  militiaFlee: 0.4,
  militiaDamage: 0.8,
} as const;

export const POSTURES = ['cautious', 'bold'] as const;
export type Posture = (typeof POSTURES)[number];

export const BATTLE = {
  /** Length of a step, in seconds. */
  dt: 0.5,
  /** A battle never lasts longer (the attackers left run away). */
  maxS: 240,
  /** Places on a tile (a ferret takes 1, a brute or a Kikiwiwi 2; bats fly over). */
  tileCap: 3,
  /** Guards stay this close to their post when cautious; bold, they chase anywhere. */
  leash: { cautious: 3, bold: 99 } satisfies Record<Posture, number>,
  /** Splash of an area attack: share of the damage dealt to the others around the target. */
  splash: 0.6,
  /** Damage drawn in ± this share. */
  spread: 0.15,
  /**
   * A pack can carry this many times what lies in the open: most of it empties the stores,
   * the others break the buildings.
   */
  carry: 1.2,
  /** A raider takes this share of its load in one hit on a store. */
  grab: 1 / 3,
  /** Attackers run away when their side has less than this share of its power left. */
  retreatBelow: 0.3,
  /** Bats spot kiwis this far away. */
  huntRange: 4,
  /** A unit waiting this long for a free tile squeezes through (seconds). */
  unstick: 2,
  /** Units retarget at most this often (seconds). */
  retarget: 1,
  /** Units of a wave at most (more power makes them stronger, not more numerous). */
  maxGround: 36,
  maxAir: 24,
  /** A pack comes in over the rampart tiles this far from its gate. */
  packWidth: 1,
  /** A pack waits this long at its gate after its last member came in. */
  gather: 1,
  /** Seconds between two attackers entering by the same sector. */
  enterGap: 0.5,
  /** Tiles of the attackers' trail kept for the trampled paths. */
  struckTiles: 12,
  /** Hit points of a building before it is damaged (Nest, camps and monument never are). */
  buildingHp: { base: 30, perLevel: 10 },
} as const;

/** How a wave spends its power on kinds (shares of the power, by age). */
export const WAVE_UNITS = {
  brute: [0.08, 0.15, 0.22, 0.3] as readonly number[],
  scout: 0.2,
  spitter: [0.15, 0.25, 0.3, 0.35] as readonly number[],
} as const;

/** A turret shot deals its defense × this (the ammo bounds how long it fires). */
export const TURRET_SHOT = 0.8;
