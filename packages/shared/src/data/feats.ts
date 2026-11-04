/**
 * Chantier 56: the feats of the leagues. A feat is a public, dated step a colony has passed
 * (an age, the queen, a layer of the depths, a level of a kiwi…). It is read from the state
 * the server holds (`league/feats.ts`), never from time spent connected: no daily streak,
 * nothing lost by an absence. Points grow with rarity; they only rank a season (cosmetic
 * rewards, never strength).
 *
 * Two kinds: single feats (`tiers` absent, key = the id) and tiered families (key
 * `id:threshold`), so that an advanced colony keeps steps to pass season after season.
 */

export const FEAT_RARITIES = ['common', 'notable', 'rare', 'legendary'] as const;
export type FeatRarity = (typeof FEAT_RARITIES)[number];

/** Points of a feat by its rarity. */
export const FEAT_POINTS: Record<FeatRarity, number> = {
  common: 10,
  notable: 25,
  rare: 50,
  legendary: 100,
};

export const FEAT_GROUPS = ['ages', 'conquest', 'depths', 'village', 'forge'] as const;
export type FeatGroup = (typeof FEAT_GROUPS)[number];

export const FEAT_IDS = [
  'stoneAge',
  'ironAge',
  'industryAge',
  'starsAge',
  'firstBeacon',
  'centreBeacon',
  'conquest',
  'sisterColony',
  'tunnel',
  'firstGallery',
  'locules',
  'kikiwiwi',
  'starEgg',
  'masterClass',
  'steelGear',
  'crystalGear',
  // Tiered families.
  'wavesHeld',
  'landingsWon',
  'kiwiLevel',
  'population',
  'constructions',
] as const;
export type FeatId = (typeof FEAT_IDS)[number];

export interface FeatDef {
  id: FeatId;
  group: FeatGroup;
  /** Single feat: its rarity. Tiered family: the rarity of each threshold. */
  rarity: FeatRarity | readonly FeatRarity[];
  /** Tiered family: the thresholds, increasing. */
  tiers?: readonly number[];
}

export const FEATS: Record<FeatId, FeatDef> = {
  stoneAge: { id: 'stoneAge', group: 'ages', rarity: 'common' },
  ironAge: { id: 'ironAge', group: 'ages', rarity: 'notable' },
  industryAge: { id: 'industryAge', group: 'ages', rarity: 'rare' },
  starsAge: { id: 'starsAge', group: 'ages', rarity: 'legendary' },
  firstBeacon: { id: 'firstBeacon', group: 'conquest', rarity: 'notable' },
  centreBeacon: { id: 'centreBeacon', group: 'conquest', rarity: 'rare' },
  conquest: { id: 'conquest', group: 'conquest', rarity: 'legendary' },
  sisterColony: { id: 'sisterColony', group: 'conquest', rarity: 'rare' },
  tunnel: { id: 'tunnel', group: 'depths', rarity: 'notable' },
  firstGallery: { id: 'firstGallery', group: 'depths', rarity: 'notable' },
  locules: { id: 'locules', group: 'depths', rarity: 'rare' },
  kikiwiwi: { id: 'kikiwiwi', group: 'village', rarity: 'rare' },
  starEgg: { id: 'starEgg', group: 'village', rarity: 'rare' },
  masterClass: { id: 'masterClass', group: 'village', rarity: 'notable' },
  steelGear: { id: 'steelGear', group: 'forge', rarity: 'notable' },
  crystalGear: { id: 'crystalGear', group: 'forge', rarity: 'rare' },
  wavesHeld: {
    id: 'wavesHeld',
    group: 'conquest',
    tiers: [5, 15, 40, 100, 200],
    rarity: ['common', 'notable', 'notable', 'rare', 'legendary'],
  },
  landingsWon: {
    id: 'landingsWon',
    group: 'conquest',
    tiers: [1, 5, 15, 40],
    rarity: ['common', 'notable', 'rare', 'legendary'],
  },
  kiwiLevel: {
    id: 'kiwiLevel',
    group: 'village',
    tiers: [10, 20, 30],
    rarity: ['common', 'notable', 'rare'],
  },
  population: {
    id: 'population',
    group: 'village',
    tiers: [10, 20, 40, 60],
    rarity: ['common', 'notable', 'rare', 'legendary'],
  },
  constructions: {
    id: 'constructions',
    group: 'village',
    tiers: [25, 100, 250, 500],
    rarity: ['common', 'notable', 'rare', 'legendary'],
  },
};

/** The age each age feat stands for (index in `AGE_IDS`). */
export const AGE_FEATS: readonly (readonly [FeatId, number])[] = [
  ['stoneAge', 1],
  ['ironAge', 2],
  ['industryAge', 3],
  ['starsAge', 4],
];

/**
 * Key of a feat: the id of a single feat, `id:threshold` for a step of a tiered family
 * (`wavesHeld:40`).
 */
export type FeatKey = string;

/** Every feat key, in table order (singles, then each step of the families). */
export const FEAT_KEYS: readonly FeatKey[] = FEAT_IDS.flatMap((id) => {
  const def = FEATS[id];
  return def.tiers ? def.tiers.map((t) => `${id}:${t}`) : [id];
});

export function parseFeatKey(key: FeatKey): { id: FeatId; tier: number | null } | null {
  const [id, raw] = key.split(':') as [string, string | undefined];
  const def = (FEATS as Record<string, FeatDef | undefined>)[id];
  if (!def) return null;
  if (!def.tiers) return raw === undefined ? { id: def.id, tier: null } : null;
  const tier = Number(raw);
  return def.tiers.includes(tier) ? { id: def.id, tier } : null;
}

export function isFeatKey(key: string): boolean {
  return parseFeatKey(key) !== null;
}

export function featRarity(key: FeatKey): FeatRarity {
  const parsed = parseFeatKey(key);
  if (!parsed) return 'common';
  const def = FEATS[parsed.id];
  if (typeof def.rarity === 'string') return def.rarity;
  const i = def.tiers?.indexOf(parsed.tier ?? -1) ?? -1;
  return def.rarity[Math.max(0, i)] ?? 'common';
}

/** Points a feat brings to the season it fell in. */
export function featPoints(key: FeatKey): number {
  return FEAT_POINTS[featRarity(key)];
}
