import { createNoise2D } from 'simplex-noise';
import { TILES, type TileType } from '../data/tiles';
import {
  hex,
  hexDisk,
  hexDistance,
  hexKey,
  hexLine,
  hexNeighbors,
  hexToPixel,
  pixelToHex,
  type Hex,
  type HexKey,
} from '../hex/hex';
import { createRng } from '../rng/rng';
import { BIOMES, biomeProfile, drawBiomes, type BiomeId } from '../data/biomes';
import { otherFace, type Face } from '../types/ids';

export interface FaceParams {
  /** Radius of the disc, in hexes. */
  radius: number;
  /** Biome of the face (chantier 05); `classic` is the generation of the first milestones. */
  biome: BiomeId;
}

export const DEFAULT_FACE_PARAMS: FaceParams = { radius: 12, biome: 'classic' };

export interface Tile {
  readonly q: number;
  readonly r: number;
  readonly type: TileType;
  /** Surface height in world units. */
  readonly height: number;
  /** Production multiplier of a building placed on this tile (0.8 – 1.25). */
  readonly richness: number;
  /** Stable random value in [0, 1) used for cosmetic variations. */
  readonly variant: number;
  /** Normalised distance from the centre (0 = heart, 1 = skin). */
  readonly rho: number;
  /** Floods in the biome's flood season (lagoons): no walking, building or harvest then. */
  readonly flood?: true;
  /** Chantier 45: a juice canal dug by the builders (a smaller deposit than a river). */
  readonly canal?: true;
}

export interface FaceMap {
  readonly seed: string;
  readonly face: Face;
  readonly params: FaceParams;
  /** Horizontal stretch actually used. */
  readonly ellipse: number;
  readonly tiles: readonly Tile[];
  readonly index: ReadonlyMap<HexKey, number>;
}

export const HEART: Hex = { q: 0, r: 0 };

export function getTile(map: FaceMap, h: Hex): Tile | undefined {
  const i = map.index.get(hexKey(h));
  return i === undefined ? undefined : map.tiles[i];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Generates a complete face (deterministic for a given seed / face / params).
 * Layout follows a kiwi slice: white heart, rays, seed ring, green flesh, down groves
 * near the edge, juice pools, and a furry skin rim closing the world.
 */
export function generateFace(
  seed: string,
  face: Face,
  params: FaceParams = DEFAULT_FACE_PARAMS,
): FaceMap {
  const biome = BIOMES[params.biome];
  const profile = biomeProfile(face, params.biome);
  const relief = biome.generation.relief ?? 1;
  const rng = createRng(`${seed}/${face}/r${params.radius}`);
  const noiseRng = rng.fork('noise');
  const noise = createNoise2D(() => noiseRng.next());
  const noise2 = createNoise2D(() => noiseRng.next());
  const fbm = (x: number, y: number) =>
    0.6 * noise(x, y) + 0.3 * noise(x * 2.1 + 13, y * 2.1 - 7) + 0.1 * noise(x * 4.3, y * 4.3);

  const ellipse = round2(rng.range(profile.ellipse[0], profile.ellipse[1]));
  const worldRadius = params.radius * Math.sqrt(3) * 0.96;
  const ax = worldRadius * ellipse;
  const az = worldRadius / Math.sqrt(ellipse);

  const rhoOf = (h: Hex) => {
    const p = hexToPixel(h);
    return Math.sqrt((p.x / ax) ** 2 + (p.y / az) ** 2);
  };

  // 1. Footprint of the disc.
  const inside = new Map<HexKey, Hex>();
  for (const h of hexDisk(HEART, params.radius + 3)) {
    if (rhoOf(h) <= 1) inside.set(hexKey(h), h);
  }

  const types = new Map<HexKey, TileType>();
  for (const [k, h] of inside) {
    const outerEdge = hexNeighbors(h).some((n) => !inside.has(hexKey(n)));
    types.set(k, outerEdge ? 'skin' : 'flesh');
  }

  const setIf = (h: Hex, type: TileType, allowed: (t: TileType) => boolean) => {
    const k = hexKey(h);
    const current = types.get(k);
    if (current !== undefined && allowed(current)) types.set(k, type);
  };

  // 2. Seed ring.
  const seedRng = rng.fork('seeds');
  const seedPhase = seedRng.range(0, 100);
  for (const [k, h] of inside) {
    if (types.get(k) !== 'flesh') continue;
    const rho = rhoOf(h);
    const { inner, outer, density } = profile.seedRing;
    if (rho < inner || rho > outer) continue;
    const p = hexToPixel(h);
    const angle = Math.atan2(p.y, p.x);
    // Seeds cluster in angular "pockets" between rays, like in a real kiwi.
    const n = 0.5 + 0.5 * noise2(Math.cos(angle) * 2.2 + seedPhase, Math.sin(angle) * 2.2);
    if (n < density + 0.15 * seedRng.next()) types.set(k, 'seedRing');
  }

  // 3. Down groves near the rim (and a few scattered tufts).
  const groveRng = rng.fork('groves');
  for (const [k, h] of inside) {
    if (types.get(k) !== 'flesh') continue;
    const rho = rhoOf(h);
    const p = hexToPixel(h);
    const n = 0.5 + 0.5 * fbm(p.x * 0.18 + 40, p.y * 0.18 - 20);
    if (rho >= profile.groves.inner) {
      const edgeBoost = (rho - profile.groves.inner) / (1 - profile.groves.inner);
      if (n + edgeBoost * 0.25 > 1 - profile.groves.density) types.set(k, 'grove');
    } else if (rho > 0.45 && groveRng.chance(profile.groves.scattered)) {
      types.set(k, 'grove');
    }
  }

  // 4. Rays: slightly wavy white lines from the heart outwards.
  const rayRng = rng.fork('rays');
  const rayCount = rayRng.int(profile.rays[0], profile.rays[1]);
  const rayOffset = rayRng.range(0, Math.PI * 2);
  for (let i = 0; i < rayCount; i++) {
    const baseAngle = rayOffset + (i / rayCount) * Math.PI * 2 + rayRng.range(-0.12, 0.12);
    const length = rayRng.range(0.5, 0.7);
    const wobble = rayRng.range(-0.25, 0.25);
    let prev: Hex = HEART;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const angle = baseAngle + wobble * t * t;
      const x = Math.cos(angle) * ax * length * t;
      const y = Math.sin(angle) * az * length * t;
      const next = pixelToHex(x, y);
      for (const h of hexLine(prev, next)) setIf(h, 'ray', (cur) => cur !== 'skin');
      prev = next;
    }
  }

  // 5. Juice pools, grown from random centres in the flesh.
  const juiceRng = rng.fork('juice');
  const poolCount = juiceRng.int(profile.juicePools.count[0], profile.juicePools.count[1]);
  const canBecomeJuice = (h: Hex) => {
    const t = types.get(hexKey(h));
    if (t !== 'flesh' && t !== 'grove') return false;
    // Keep pools away from the rim and the rays.
    return hexNeighbors(h).every((n) => {
      const nt = types.get(hexKey(n));
      return nt !== undefined && nt !== 'skin' && nt !== 'ray' && nt !== 'heart';
    });
  };
  const candidates = juiceRng.shuffle(
    [...inside.values()].filter((h) => {
      const rho = rhoOf(h);
      return rho > 0.4 && rho < 0.85 && canBecomeJuice(h);
    }),
  );
  const centers: Hex[] = [];
  for (const c of candidates) {
    if (centers.length >= poolCount) break;
    if (centers.some((o) => hexDistance(o, c) < 5)) continue;
    const size = juiceRng.int(profile.juicePools.size[0], profile.juicePools.size[1]);
    const pool: Hex[] = [];
    const frontier: Hex[] = [c];
    while (pool.length < size && frontier.length > 0) {
      const idx = juiceRng.int(0, frontier.length - 1);
      const h = frontier.splice(idx, 1)[0]!;
      if (!canBecomeJuice(h)) continue;
      types.set(hexKey(h), 'juice');
      pool.push(h);
      frontier.push(...hexNeighbors(h));
    }
    centers.push(c);
  }

  // 5b. Juice rivers (delta): from the rim towards the centre, with a ford every few tiles.
  const rivers = biome.generation.rivers;
  if (rivers) {
    const riverRng = rng.fork('rivers');
    const count = riverRng.int(rivers.count[0], rivers.count[1]);
    const offset = riverRng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const base = offset + (i / count) * Math.PI * 2 + riverRng.range(-0.3, 0.3);
      const bend = riverRng.range(-0.6, 0.6);
      const phase = riverRng.range(0, Math.PI * 2);
      const course: Hex[] = [];
      let prev: Hex | null = null;
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const rho = 0.97 - 0.6 * t;
        const angle = base + bend * t + 0.12 * Math.sin(phase + t * 6);
        const next = pixelToHex(Math.cos(angle) * ax * rho, Math.sin(angle) * az * rho);
        for (const h of prev ? hexLine(prev, next).slice(1) : [next]) course.push(h);
        prev = next;
      }
      course.forEach((h, n) => {
        if (n % rivers.fordEvery === rivers.fordEvery - 1) return;
        setIf(h, 'juice', (cur) => cur === 'flesh' || cur === 'grove');
      });
    }
  }

  // 6. Heart (columella) last, so it always wins.
  for (const h of hexDisk(HEART, 1)) types.set(hexKey(h), 'heart');

  // 7. Heights, richness and variants.
  const detailRng = rng.fork('detail');
  const tiles: Tile[] = [];
  const index = new Map<HexKey, number>();
  const ordered = [...inside.values()].sort((a, b) => a.r - b.r || a.q - b.q);
  for (const h of ordered) {
    const k = hexKey(h);
    const type = types.get(k)!;
    const def = TILES[type];
    const p = hexToPixel(h);
    const rho = rhoOf(h);
    const n = 0.5 + 0.5 * fbm(p.x * 0.11, p.y * 0.11);
    let height = def.baseHeight + def.heightNoise * relief * n;
    // Highlands: broad plateaus separated by small cliffs.
    if (relief > 1 && (type === 'flesh' || type === 'grove' || type === 'seedRing')) {
      const plateau = 0.5 + 0.5 * noise2(p.x * 0.09 - 31, p.y * 0.09 + 17);
      height += (relief - 1) * 0.42 * Math.round(plateau * 3);
    }
    if (type === 'flesh' || type === 'grove' || type === 'seedRing') height += (1 - rho) * 0.18;
    if (type === 'skin') height += 0.25 * Math.sin(Math.atan2(p.y, p.x) * 5 + n * 4);
    // Gentle terracing gives the low-poly diorama look.
    height = Math.round(height / 0.06) * 0.06;
    const flood =
      biome.floods !== null &&
      type === 'flesh' &&
      rho < 0.92 &&
      hexNeighbors(h).some((nb) => types.get(hexKey(nb)) === 'juice');
    const richness = round2(0.8 + 0.45 * (0.5 + 0.5 * noise2(p.x * 0.3 + 5, p.y * 0.3 + 9)));
    index.set(k, tiles.length);
    tiles.push({
      q: h.q,
      r: h.r,
      type,
      height: round2(height),
      richness: Math.min(1.25, Math.max(0.8, richness)),
      variant: detailRng.next(),
      rho: round2(rho),
      ...(flood ? { flood: true as const } : {}),
    });
  }

  return { seed, face, params, ellipse, tiles, index };
}

/**
 * Generation parameters of the other half of our kiwi (same planet seed): its biome is drawn
 * with ours; worlds older than the biomes keep a classic twin.
 */
export function twinParams(seed: string, face: Face, params: FaceParams): FaceParams {
  const biome = params.biome === 'classic' ? 'classic' : drawBiomes(seed)[otherFace(face)];
  return { ...params, biome };
}

/** Counts tiles per type (used by tests and the balance tool). */
export function countTiles(map: FaceMap): Record<TileType, number> {
  const counts = { heart: 0, ray: 0, seedRing: 0, flesh: 0, grove: 0, juice: 0, skin: 0 };
  for (const t of map.tiles) counts[t.type]++;
  return counts;
}

/** Utility for consumers that need a quick key → tile lookup. */
export function tileAt(map: FaceMap, q: number, r: number): Tile | undefined {
  return getTile(map, hex(q, r));
}
