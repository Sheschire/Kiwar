import type { ClassId } from './classes';
import type { TechId } from './research';
import type { ResourceCost } from './resources';

/**
 * Chantier 38: the Forge and the gear. Every kiwi has two slots, a weapon and an armour. A weapon
 * belongs to a family that follows the class lines (a sword is no use to a mage); armours fit
 * everybody, light (hit points) or heavy (more hit points and armour, slower). Three tiers come
 * with the ages and the technologies: wood and stone, iron (meteoric iron), steel.
 */

export const WEAPON_FAMILIES = ['blade', 'mace', 'bow', 'staff'] as const;
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number];

export const ARMOR_KINDS = ['light', 'heavy'] as const;
export type ArmorKind = (typeof ARMOR_KINDS)[number];

export type GearKind = WeaponFamily | ArmorKind;
export const GEAR_KINDS: readonly GearKind[] = [...WEAPON_FAMILIES, ...ARMOR_KINDS];

export const GEAR_TIERS = ['stone', 'iron', 'steel'] as const;
export type GearTier = (typeof GEAR_TIERS)[number];

export const GEAR_SLOTS = ['weapon', 'armor'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export const ITEM_IDS = [
  'blade-stone',
  'blade-iron',
  'blade-steel',
  'mace-stone',
  'mace-iron',
  'mace-steel',
  'bow-stone',
  'bow-iron',
  'bow-steel',
  'staff-stone',
  'staff-iron',
  'staff-steel',
  'light-stone',
  'light-iron',
  'light-steel',
  'heavy-stone',
  'heavy-iron',
  'heavy-steel',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/**
 * Weapon family of each class (its line's weapon: blades for warriors and scouts, maces for
 * builders, slings and bows for gatherers, staves and instruments for mages and bards). The
 * mayor and the kiwis without a class carry no weapon.
 */
export const CLASS_FAMILY: Record<ClassId | 'none', WeaponFamily | null> = {
  none: null,
  builder: 'mace',
  warrior: 'blade',
  mage: 'staff',
  scout: 'blade',
  mayor: null,
  gatherer: 'bow',
  bard: 'staff',
  architect: 'mace',
  navigator: 'blade',
  champion: 'blade',
  archmage: 'staff',
  herbalist: 'bow',
  minstrel: 'staff',
  engineer: 'mace',
  paladin: 'blade',
  druid: 'staff',
  ranger: 'bow',
  titan: 'mace',
  oracle: 'staff',
};

export interface ItemDef {
  id: ItemId;
  kind: GearKind;
  slot: GearSlot;
  tier: GearTier;
  /** Paid when ordered (refunded on cancel). */
  cost: ResourceCost;
  /** Whole units of meteoric iron paid when ordered. */
  iron: number;
  /** Hours of work of one average smith at a level-1 Forge. */
  workH: number;
  /** The technology that opens it. */
  tech: TechId;
  /** Weapons: damage multiplier. */
  damage?: number;
  /** Armours: hit points multiplier, armour added, speed multiplier. */
  hp?: number;
  armor?: number;
  speed?: number;
}

/** Index of a tier (0 stone, 1 iron, 2 steel). */
export function tierIndex(tier: GearTier): number {
  return GEAR_TIERS.indexOf(tier);
}

const WEAPON = {
  damage: [1.25, 1.5, 1.8],
  cost: [{ pulp: 300, fiber: 400, seeds: 150 }, { fiber: 800, seeds: 300 }, { seeds: 1500 }],
  iron: [0, 6, 12],
  workH: [1, 2, 3],
  tech: ['forge', 'smelting', 'firearms'],
} as const;

const ARMOR = {
  light: { hp: [1.15, 1.3, 1.45], armor: [0, 0, 0], speed: 1, iron: [0, 5, 10] },
  heavy: { hp: [1.3, 1.55, 1.8], armor: [0.05, 0.1, 0.15], speed: 0.85, iron: [0, 8, 15] },
  cost: [{ pulp: 200, fiber: 500, seeds: 100 }, { fiber: 1000, juice: 300 }, { seeds: 1500 }],
  workH: [1, 2, 3],
  tech: ['forge', 'armor', 'machines'],
} as const;

function item(kind: GearKind, tier: GearTier): ItemDef {
  const t = tierIndex(tier);
  const id = `${kind}-${tier}` as ItemId;
  if (kind === 'light' || kind === 'heavy') {
    const a = ARMOR[kind];
    return {
      id,
      kind,
      slot: 'armor',
      tier,
      cost: ARMOR.cost[t]!,
      iron: a.iron[t]!,
      workH: ARMOR.workH[t]!,
      tech: ARMOR.tech[t]!,
      hp: a.hp[t]!,
      armor: a.armor[t]!,
      speed: a.speed,
    };
  }
  return {
    id,
    kind,
    slot: 'weapon',
    tier,
    cost: WEAPON.cost[t]!,
    iron: WEAPON.iron[t]!,
    workH: WEAPON.workH[t]!,
    tech: WEAPON.tech[t]!,
    damage: WEAPON.damage[t]!,
  };
}

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries(
  ITEM_IDS.map((id) => {
    const [kind, tier] = id.split('-') as [GearKind, GearTier];
    return [id, item(kind, tier)];
  }),
) as Record<ItemId, ItemDef>;

/** Forge rules. */
export const FORGE = {
  /** A smith's power: +4 % per point of Strength and of Dexterity above the average. */
  strength: 0.04,
  dexterity: 0.04,
  /** Work of a smith in raw units per ms (one average smith: `rate`, an integer). */
  rate: 100,
  /** Pieces kept at most in the armory (per piece). */
  armoryMax: 99,
} as const;

/** Raw units of work of an order (an average smith works `FORGE.rate` units per ms). */
export function orderWork(id: ItemId): number {
  return Math.round(ITEMS[id].workH * 3_600_000 * FORGE.rate);
}
