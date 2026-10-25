/**
 * Chantier 35: buildings on several tiles. A building keeps an anchor tile (q, r) — where its
 * kiwis go in — and covers 1, 3 or 7 tiles (`footprintOf`). The occupancy index tells which
 * building or construction site stands on any tile.
 */
import { footprintOf, type BuildingType } from '../data/buildings';
import { TILES } from '../data/tiles';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import { PATHS } from '../data/territory';
import {
  hexDisk,
  hexKey,
  hexNeighbor,
  hexNeighbors,
  parseHexKey,
  type Hex,
  type HexKey,
} from '../hex/hex';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { BuildingId, QueueItemId } from '../types/ids';
import type { Building, GameState, QueueItem } from './state';

/** Orientations a footprint can take (the triangle turns; 1 and 7 tiles look the same). */
export function rotationsOf(type: BuildingType): number[] {
  return footprintOf(type) === 3 ? [0, 1, 2, 3, 4, 5] : [0];
}

export function normalRot(rot: number | undefined): number {
  return (((rot ?? 0) % 6) + 6) % 6;
}

/** Tiles a building of `type` anchored on (q, r) would cover, the anchor first. */
export function footprintHexes(type: BuildingType, q: number, r: number, rot = 0): Hex[] {
  const anchor = { q, r };
  const size = footprintOf(type);
  if (size === 7) return hexDisk(anchor, 1);
  if (size === 3) {
    const d = normalRot(rot);
    return [anchor, hexNeighbor(anchor, d), hexNeighbor(anchor, d + 1)];
  }
  return [anchor];
}

/**
 * Covered tiles kiwis cannot cross: all but the anchor (the door) — except for the 7-tile
 * monument, whose anchor is its enclosed centre: it is walked around entirely.
 */
export function wallsOf(tiles: readonly Hex[]): Hex[] {
  return tiles.length >= 7 ? [...tiles] : tiles.slice(1);
}

/** Tiles a building covers (a cramped building only its anchor). */
export function footprintTiles(b: Building): Hex[] {
  return b.cramped ? [{ q: b.q, r: b.r }] : footprintHexes(b.type, b.q, b.r, b.rot);
}

/**
 * Tiles a queue item holds: a new building's site, or the room a cramped building takes for
 * its upgrade. Other items hold nothing of their own.
 */
export function siteTiles(item: QueueItem): Hex[] {
  // A big site from an older save without `rot` is cramped: it holds its anchor only.
  if (item.kind === 'build')
    return item.rot === undefined
      ? [{ q: item.q, r: item.r }]
      : footprintHexes(item.buildingType, item.q, item.r, item.rot);
  if (item.kind === 'upgrade' && item.rot !== undefined)
    return footprintHexes(item.buildingType, item.q, item.r, item.rot);
  // Chantier 45: a canal being dug or filled holds its tile.
  if (item.kind === 'canal' || item.kind === 'fill') return [{ q: item.q, r: item.r }];
  return [];
}

export interface Occupant {
  /** A building, or a queue item (`site`: a construction or an extension under way). */
  id: BuildingId | QueueItemId;
  site: boolean;
  /** The anchor tile (the door): walkable (`wallsOf`); the other covered tiles are not. */
  anchor: boolean;
}

export interface Occupancy {
  tiles: Map<HexKey, Occupant>;
  /** Covered tiles of standing buildings kiwis walk around (`wallsOf`). */
  blocked: Set<string>;
  /** A stable key of `blocked`, for the walk caches. */
  blockedKey: string;
}

const cache = new WeakMap<Building[], { hash: number; occupancy: Occupancy }>();

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 16777619) >>> 0;
}

function mixId(h: number, id: string): number {
  for (let i = 0; i < id.length; i++) h = mix(h, id.charCodeAt(i));
  return h;
}

/** Cheap fingerprint of everything the occupancy depends on (numbers only, no strings). */
function layoutHash(state: GameState): number {
  let h = mix(2166136261, state.buildings.length);
  for (const b of state.buildings) {
    h = mix(h, b.q * 977 + b.r);
    h = mix(h, (b.rot ?? 0) + (b.cramped ? 8 : 0) + footprintOf(b.type) * 16);
    h = mixId(h, b.id);
  }
  h = mix(h, state.queue.length);
  for (const i of state.queue) {
    const canal = i.kind === 'canal' || i.kind === 'fill';
    if (i.kind !== 'build' && i.rot === undefined && !canal) continue;
    h = mix(h, i.q * 977 + i.r);
    h = mix(
      h,
      (i.rot ?? 0) +
        footprintOf(i.buildingType) * 16 +
        (i.kind === 'build' ? 128 : 0) +
        (canal ? 256 : 0),
    );
    h = mixId(h, i.id);
  }
  return h;
}

/**
 * Which building or site stands on each tile. Cached per buildings array and layout
 * fingerprint, so the many lookups of one state cost a hash each.
 */
export function occupancy(state: GameState): Occupancy {
  const hash = layoutHash(state);
  const hit = cache.get(state.buildings);
  if (hit && hit.hash === hash) return hit.occupancy;
  const tiles = new Map<HexKey, Occupant>();
  const blocked = new Set<string>();
  for (const b of state.buildings) {
    const covered = footprintTiles(b);
    covered.forEach((h, i) => tiles.set(hexKey(h), { id: b.id, site: false, anchor: i === 0 }));
    for (const h of wallsOf(covered)) blocked.add(hexKey(h));
  }
  for (const item of state.queue) {
    siteTiles(item).forEach((h, i) => {
      const key = hexKey(h);
      if (!tiles.has(key)) tiles.set(key, { id: item.id, site: true, anchor: i === 0 });
    });
  }
  const occ: Occupancy = { tiles, blocked, blockedKey: [...blocked].sort().join(';') };
  cache.set(state.buildings, { hash, occupancy: occ });
  return occ;
}

/** Covered tiles of standing buildings (anchors included): nothing else grows or lands there. */
export function coveredKeys(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const [k, o] of occupancy(state).tiles) if (!o.site) out.add(k);
  return out;
}

/** Every tile held by a building or a site. */
export function takenKeys(state: GameState): Set<string> {
  return new Set(occupancy(state).tiles.keys());
}

/** Centre of a footprint in axial coordinates (the 3D model's centre). */
export function footprintCentre(tiles: readonly Hex[]): { q: number; r: number } {
  let q = 0;
  let r = 0;
  for (const h of tiles) {
    q += h.q;
    r += h.r;
  }
  return { q: q / tiles.length, r: r / tiles.length };
}

/**
 * True when making `removed` impassable (on top of the tiles already `blocked`) splits the
 * walkable land: some walkable tile next to them could no longer reach the others. Any piece
 * cut off borders the removed tiles, so it is enough to check that their walkable neighbours
 * still reach one another (a search that stops as soon as they are all found).
 */
export function cutsLand(
  map: FaceMap,
  removed: readonly string[],
  blocked: ReadonlySet<string> = new Set(),
): boolean {
  const gone = new Set(removed);
  const open = (k: string): boolean => {
    if (gone.has(k) || blocked.has(k)) return false;
    const t = getTile(map, parseHexKey(k));
    return !!t && TILES[t.type].walkable;
  };
  const border = new Set<string>();
  for (const k of gone)
    for (const n of hexNeighbors(parseHexKey(k))) {
      const nk = hexKey(n);
      if (open(nk)) border.add(nk);
    }
  if (border.size <= 1) return false;
  const [start] = border;
  const seen = new Set<string>([start!]);
  const stack = [start!];
  let found = 1;
  while (stack.length > 0) {
    const h = parseHexKey(stack.pop()!);
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (seen.has(k) || !open(k)) continue;
      seen.add(k);
      if (border.has(k) && ++found === border.size) return false;
      stack.push(k);
    }
  }
  return true;
}

/**
 * A site takes the paths off its tiles; those under the covered tiles (all but the anchor)
 * give their cost back.
 */
export function clearPathsUnder(s: GameState, tiles: readonly Hex[]): void {
  const keys: string[] = tiles.map((h) => hexKey(h));
  const paved = new Set(s.paths);
  if (!keys.some((k) => paved.has(k))) return;
  const refunded = keys.slice(1).filter((k) => paved.has(k)).length;
  const gone = new Set(keys);
  s.paths = s.paths.filter((k) => !gone.has(k));
  const cost: Partial<Record<ResourceId, number>> = PATHS.cost;
  for (const id of RESOURCE_IDS) s.resources[id] += (cost[id] ?? 0) * refunded;
}
