import type { Face } from '../types/ids';
import { createRng } from '../rng/rng';
import { FACE_PROFILES, type FaceProfile } from './faceProfiles';
import type { ResourceId, Resources } from './resources';
import type { Season } from './cycles';
import type { TileType } from './tiles';

/**
 * Chantier 05: biomes. Every face of a kiwi planet gets one biome drawn from its seed (both
 * halves of a fruit are known before the player picks one). A biome changes the generation of
 * the face, its deposits, its climate and how harsh its seasons are (never their length: a
 * shared universe lives one calendar). Biomes are play styles, not power levels: the balance
 * report checks every biome against the others (±10 %).
 */
export const BIOME_IDS = [
  'classic',
  'orchard',
  'highlands',
  'delta',
  'seedCrown',
  'lagoons',
  'tundra',
] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

type PerResource = Partial<Record<ResourceId, number>>;

/** Multipliers applied on top of the base season effects (`CYCLES.seasons`). */
export interface BiomeSeason {
  harvest?: PerResource;
  regen?: PerResource & { all?: number };
  walk?: number;
  /** Extra tiles kiwis cannot walk on. */
  blocked?: readonly TileType[];
}

export interface BiomeDef {
  id: BiomeId;
  /** Face it belongs to; `null` for the classic biome (both faces, never drawn). */
  face: Face | null;
  /** Overrides of the face generation profile. */
  generation: Partial<Omit<FaceProfile, 'face' | 'yieldMultiplier'>> & {
    /** Juice rivers flowing from the rim towards the centre, with fords every few tiles. */
    rivers?: { count: readonly [number, number]; fordEvery: number };
    /** Height noise multiplier of the land (1 = classic). */
    relief?: number;
  };
  /** Multiplies the face climate (production multiplier per resource). */
  yield: PerResource;
  /** Deposit size and regrowth multipliers per resource. */
  deposits: { stock: PerResource; regen: PerResource };
  /** Walking cost multiplier of the land (rugged terrain). */
  walk: number;
  seasons: Partial<Record<Season, BiomeSeason>>;
  /** Flesh around the juice pools floods in this season: no walking, building or harvest. */
  floods: Season | null;
  /** Predators (chantier 06): attack frequency multipliers. Data only for now. */
  threats: { ferrets: number; bats: number };
}

const NONE = { stock: {}, regen: {} };

export const BIOMES: Record<BiomeId, BiomeDef> = {
  classic: {
    id: 'classic',
    face: null,
    generation: {},
    yield: {},
    deposits: NONE,
    walk: 1,
    seasons: {},
    floods: null,
    threats: { ferrets: 1, bats: 1 },
  },
  // Kiwisu, the generous face.
  orchard: {
    id: 'orchard',
    face: 'kiwisu',
    generation: {
      groves: { inner: 0.74, density: 0.24, scattered: 0.02 },
      juicePools: { count: [3, 4], size: [2, 4] },
    },
    yield: {},
    deposits: { stock: {}, regen: { pulp: 1.25 } },
    walk: 1,
    seasons: {},
    floods: null,
    threats: { ferrets: 1.5, bats: 1 },
  },
  highlands: {
    id: 'highlands',
    face: 'kiwisu',
    generation: {
      groves: { inner: 0.5, density: 0.5, scattered: 0.1 },
      juicePools: { count: [2, 3], size: [2, 3] },
      relief: 2,
    },
    yield: {},
    deposits: { stock: { fiber: 1.2 }, regen: {} },
    walk: 1.15,
    seasons: {
      autumn: { regen: { all: 0.8 } },
      winter: { walk: 1.3, harvest: { juice: 0.6, fiber: 0.8 } },
    },
    floods: null,
    threats: { ferrets: 1, bats: 0.8 },
  },
  delta: {
    id: 'delta',
    face: 'kiwisu',
    generation: {
      juicePools: { count: [1, 2], size: [2, 3] },
      rivers: { count: [2, 3], fordEvery: 5 },
    },
    yield: {},
    deposits: { stock: { pulp: 1.15 }, regen: { pulp: 1.15 } },
    walk: 1,
    seasons: { summer: { regen: { all: 0.7 } } },
    floods: null,
    threats: { ferrets: 1.2, bats: 1 },
  },
  // Kiwino, the precious face.
  seedCrown: {
    id: 'seedCrown',
    face: 'kiwino',
    generation: { seedRing: { inner: 0.18, outer: 0.52, density: 0.72 } },
    yield: {},
    deposits: { stock: { pulp: 0.8 }, regen: { pulp: 0.85 } },
    walk: 1,
    seasons: {},
    floods: null,
    threats: { ferrets: 1, bats: 1.5 },
  },
  lagoons: {
    id: 'lagoons',
    face: 'kiwino',
    generation: { juicePools: { count: [7, 9], size: [2, 5] } },
    yield: {},
    deposits: NONE,
    walk: 1,
    seasons: { spring: { regen: { all: 1.4 } } },
    floods: 'spring',
    threats: { ferrets: 1, bats: 1.2 },
  },
  tundra: {
    id: 'tundra',
    face: 'kiwino',
    generation: {},
    yield: {},
    deposits: {
      stock: { pulp: 1.6, fiber: 1.6, seeds: 1.6, juice: 1.6 },
      regen: { pulp: 0.7, fiber: 0.7, seeds: 0.7, juice: 0.7 },
    },
    walk: 1,
    seasons: { winter: { walk: 1.3, harvest: { juice: 0.6 } } },
    floods: null,
    threats: { ferrets: 0.5, bats: 0.5 },
  },
};

/** Biomes a new world can draw for a face. */
export function biomesOf(face: Face): BiomeId[] {
  return BIOME_IDS.filter((id) => BIOMES[id].face === face);
}

/** A biome can live on a face if it belongs to it (the classic biome fits both). */
export function biomeFits(face: Face, biome: BiomeId): boolean {
  const f = BIOMES[biome].face;
  return f === null || f === face;
}

/** Biome of each face of a kiwi planet, drawn from the planet seed (deterministic). */
export function drawBiomes(seed: string): Record<Face, BiomeId> {
  const rng = createRng(`${seed}/biomes`);
  const pick = (face: Face) => rng.pick(biomesOf(face));
  return { kiwisu: pick('kiwisu'), kiwino: pick('kiwino') };
}

/** Generation profile of a face with its biome. */
export function biomeProfile(face: Face, biome: BiomeId): FaceProfile {
  const { rivers: _r, relief: _h, ...overrides } = BIOMES[biome].generation;
  return { ...FACE_PROFILES[face], ...overrides };
}

/** Production multiplier per resource of a face with its biome. */
export function climateOf(face: Face, biome: BiomeId): Resources {
  const base = FACE_PROFILES[face].yieldMultiplier;
  const y = BIOMES[biome].yield;
  return {
    pulp: base.pulp * (y.pulp ?? 1),
    fiber: base.fiber * (y.fiber ?? 1),
    seeds: base.seeds * (y.seeds ?? 1),
    juice: base.juice * (y.juice ?? 1),
  };
}
