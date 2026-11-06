import { hexDisk, hexKey, type Hex, type HexKey } from '../hex/hex';
import { createRng } from '../rng/rng';

/**
 * Chantier 53: small maps apart from the face — a kiwai in orbit now, a trading post of the
 * orchard later (chantier 54). A small map is a hexagonal disc drawn from a public seed: its
 * centre is the landing pad, a few rocks block the ring, the rest is open ground. What stands on
 * it is kept by its owner (a kiwai's `modules`), never in `state.buildings`: the face's
 * `occupancy`, `faceMapOf` and `buildingAt` never see it, and a small map never sees the face.
 */

export type SiteTileKind = 'pad' | 'ground' | 'rock';

export interface SiteTile {
  readonly q: number;
  readonly r: number;
  readonly kind: SiteTileKind;
  /** Stable random value in [0, 1) for cosmetic variations. */
  readonly variant: number;
}

export interface SmallMap {
  /** The seed it was drawn from (also its identity). */
  readonly key: string;
  readonly radius: number;
  readonly tiles: readonly SiteTile[];
  readonly index: ReadonlyMap<HexKey, number>;
}

/** Something standing on one tile of a small map. */
export interface SiteThing {
  id: string;
  q: number;
  r: number;
}

const cache = new Map<string, SmallMap>();

/** Draws (memoized) the small map of a seed: pad at the centre, `rocks` rocks on the ring. */
export function smallMap(key: string, radius: number, rocks: readonly [number, number]): SmallMap {
  const id = `${key}|${radius}|${rocks[0]}-${rocks[1]}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const rng = createRng(`${key}/site`);
  const disk = hexDisk({ q: 0, r: 0 }, radius);
  // Rocks only on the outer ring, never two side by side (the ground stays in one piece).
  const ring = disk.slice(disk.length - 6 * radius);
  const rocky = new Set<HexKey>();
  const want = rng.int(rocks[0], rocks[1]);
  for (let tries = 0; rocky.size < want && tries < 40; tries++) {
    const i = rng.int(0, ring.length - 1);
    const prev = hexKey(ring[(i + ring.length - 1) % ring.length]!);
    const next = hexKey(ring[(i + 1) % ring.length]!);
    if (!rocky.has(prev) && !rocky.has(next)) rocky.add(hexKey(ring[i]!));
  }
  const tiles: SiteTile[] = disk.map((h, i) => ({
    q: h.q,
    r: h.r,
    kind: i === 0 ? 'pad' : rocky.has(hexKey(h)) ? 'rock' : 'ground',
    variant: rng.next(),
  }));
  const map: SmallMap = {
    key,
    radius,
    tiles,
    index: new Map(tiles.map((t, i) => [hexKey(t), i])),
  };
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(id, map);
  return map;
}

export function siteTile(map: SmallMap, h: Hex): SiteTile | undefined {
  const i = map.index.get(hexKey(h));
  return i === undefined ? undefined : map.tiles[i];
}

/** What stands on a tile of a small map (among its own things only). */
export function thingAt<T extends SiteThing>(things: readonly T[], h: Hex): T | undefined {
  return things.find((t) => t.q === h.q && t.r === h.r);
}

export type SiteError = 'offSite' | 'rock' | 'pad' | 'tileOccupied';

/** Why nothing can be set on that tile of a small map (null: it can). */
export function siteSpotError(
  map: SmallMap,
  things: readonly SiteThing[],
  h: Hex,
): SiteError | null {
  const tile = siteTile(map, h);
  if (!tile) return 'offSite';
  if (tile.kind === 'rock') return 'rock';
  if (tile.kind === 'pad') return 'pad';
  if (thingAt(things, h)) return 'tileOccupied';
  return null;
}

/** Free tiles where something could be set. */
export function freeSpots(map: SmallMap, things: readonly SiteThing[]): Hex[] {
  return map.tiles.filter((t) => siteSpotError(map, things, t) === null).map((t) => ({ ...t }));
}
