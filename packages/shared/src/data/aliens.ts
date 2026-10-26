import { CALENDAR } from './cycles';
import { ms } from './curves';
import type { EnemyKind } from './units';
import type { ArmorKind, WeaponFamily } from './gear';

/**
 * Chantier 39: the alien civilisation of a face. It lives on its own clock — the same dates for
 * everybody, counted from the start of the colony — slowed down by what we burn and fed by our
 * defeats. Its 12 parcels (6 slices × the outer and the inner ring, `INTEL.sectors`) hold
 * buildings and a garrison; the edge is weak, the centre strong and better equipped. Everything
 * here is public code; what a given face really holds comes from its secret seed (hidden).
 */

/** Ages of the civilisation (same indices as ours: Eden, Stone, Iron, Industry). */
export const CIV_AGE_COUNT = 4;

export const ALIEN_BUILDINGS = [
  'burrow',
  'roost',
  'workshop',
  'totem',
  'barracks',
  'store',
  'royal',
] as const;
export type AlienBuildingKind = (typeof ALIEN_BUILDINGS)[number];

/** Buildings the civilisation hides from our eyes (the AI places and moves them). */
export const CIV_KEYS = ['royal', 'barracks', 'store'] as const;
export type CivKeyKind = (typeof CIV_KEYS)[number];

export const CIV = {
  /** Hours of development at which each age begins (Stone at day 1, Iron day 4, Industry day 12). */
  ageAtH: [0, 24, 96, 288] as readonly number[],
  /** Faces further away in a shared universe are older (hours ahead per kiwi of distance). */
  leadPerDistanceH: 24,
  /** Garrison of an outer parcel around the face's base defense (× drawn, mean 1). */
  outerSpread: [0.75, 1.25] as const,
  /** An inner parcel holds this many times an outer one (drawn per parcel). */
  innerMultiple: [2, 3] as const,
  /** Garrisons grow with the age of the parcel (chantier 46: Industry 2.2 → 1.9, the conquest
   * stalled at 8–9 beacons in a third of the probe runs)… */
  ageMultiple: [1, 1.25, 1.6, 1.9] as readonly number[],
  /** …and with every day of development, up to `maxDays`. */
  perDay: 0.12,
  maxDays: 14,
  /** A burnt parcel loses hours of development (the civilisation a few as well). */
  burn: { sectorH: 24, civH: 6, maxSectorH: 96, maxCivH: 72, keyMs: ms.h(36) },
  /** A crew lost gives hours of development (food, ship parts, gear), per kiwi lost too. */
  defeat: { civH: 4, perKiwiH: 2, maxCivH: 120 },
  /** Garrison lost in a fight comes back over this time. */
  rebuildMs: ms.h(12),
  /** Share of a parcel's garrison lost on a lost fight (× how close it was) and on a won one. */
  fightLoss: { victory: 0.6, defeat: 0.3 },
  /** The AI looks at the map once a game day. */
  tickMs: CALENDAR.dayMs,
  /** Key buildings standing at each age (one royal burrow always). */
  keys: { barracks: [2, 3, 4, 5], store: [1, 1, 2, 2] } as {
    barracks: readonly number[];
    store: readonly number[];
  },
  /** Ordinary buildings per parcel: base + per age, one more in the centre. */
  buildings: { base: 2, perAge: 1, inner: 1 },
  /** Waves: every barracks lost (conquered or burnt) takes some power away, down to `floor`. */
  barracksFloor: 0.6,
  /** Waves grow with the age of the civilisation. */
  waveAge: [1, 1.05, 1.1, 1.2] as readonly number[],
  /** Level of the aliens: base + per age, more in the centre. */
  level: { base: 1, perAge: 2, inner: 2 },
  /** Buildings stand at these distances from the heart (outer ring beyond `INTEL.innerRadius`). */
  ring: { min: 1, max: 11 },
} as const;

/** Weapon and armour of each alien kind (gear tiers follow the age, chantier 38). */
export const ALIEN_GEAR: Record<
  EnemyKind,
  { weapon: WeaponFamily | null; armor: ArmorKind | null }
> = {
  soldier: { weapon: 'blade', armor: 'light' },
  scout: { weapon: 'bow', armor: null },
  brute: { weapon: 'mace', armor: 'heavy' },
  diver: { weapon: null, armor: 'light' },
  spitter: { weapon: 'staff', armor: null },
};

/** Share of each kind in a parcel's garrison (ground and air). */
export const ALIEN_MIX = {
  ground: { soldier: 0.6, scout: 0.15, brute: 0.25 },
  air: { diver: 0.7, spitter: 0.3 },
} as const;
