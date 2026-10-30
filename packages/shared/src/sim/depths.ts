import { DEPTHS, HAZARD_KINDS, ROOM_KINDS, type RoomKind } from '../data/depths';
import { DEPTH_KINDS, ENEMIES } from '../data/units';
import type { ResourceId } from '../data/resources';
import { createRng, type Rng } from '../rng/rng';
import type { AlienUnit } from './civ';
import { localAlienSeed, type GameState, type RoomHazard } from './state';

/**
 * Chantier 48: the depths. The network of rooms is public (drawn from the face's seed, the same
 * for everyone who knows the face); what a room holds is drawn from the hidden `depthSeed`,
 * which only the server (online) or the client (solo) holds.
 */

export type RoomDepth = 1 | 2 | 3;

export interface DepthRoom {
  id: string;
  depth: RoomDepth;
  /** Across the cut, from −1 (one side) to 1 (the other). */
  x: number;
  /** Rooms it opens onto (both ways). */
  links: string[];
  /** Opens onto the tunnel entrance. */
  entrance: boolean;
}

export interface DepthsMap {
  rooms: DepthRoom[];
  byId: Map<string, DepthRoom>;
}

const mapCache = new Map<string, DepthsMap>();

/** The public network of the face's flesh (memoized). */
export function depthsMapOf(state: Pick<GameState, 'seed' | 'face'>): DepthsMap {
  const key = `${state.seed}/${state.face}`;
  let map = mapCache.get(key);
  if (!map) {
    map = generateDepths(key);
    if (mapCache.size > 16) mapCache.clear();
    mapCache.set(key, map);
  }
  return map;
}

/** Draws the rooms of the flesh: depth by depth, each linked to the nearest rooms above. */
export function generateDepths(key: string): DepthsMap {
  const rng = createRng(`${key}/depths/map`);
  const rooms: DepthRoom[] = [];
  const byDepth: DepthRoom[][] = [];
  for (let d = 1; d <= DEPTHS.rooms.length; d++) {
    const [lo, hi] = DEPTHS.rooms[d - 1]!;
    const n = rng.int(lo, hi);
    const row: DepthRoom[] = [];
    for (let i = 0; i < n; i++) {
      const slot = 2 / n;
      const x = round2(-1 + slot * (i + 0.5) + rng.range(-0.3, 0.3) * slot);
      row.push({
        id: `r${rooms.length + row.length}`,
        depth: d as RoomDepth,
        x,
        links: [],
        entrance: d === 1,
      });
    }
    rooms.push(...row);
    byDepth.push(row);
  }
  const link = (a: DepthRoom, b: DepthRoom) => {
    if (a === b || a.links.includes(b.id)) return;
    a.links.push(b.id);
    b.links.push(a.id);
  };
  for (let d = 0; d < byDepth.length; d++) {
    const row = byDepth[d]!;
    for (let i = 0; i + 1 < row.length; i++)
      if (rng.chance(DEPTHS.sideLink)) link(row[i]!, row[i + 1]!);
    if (d === 0) continue;
    const above = byDepth[d - 1]!;
    for (const r of row) {
      const near = [...above].sort((a, b) => Math.abs(a.x - r.x) - Math.abs(b.x - r.x));
      link(r, near[0]!);
      if (near[1] && rng.chance(DEPTHS.secondLink)) link(r, near[1]);
    }
  }
  return { rooms, byId: new Map(rooms.map((r) => [r.id, r])) };
}

/** What a room really holds (hidden: only from the secret seed). */
export interface RoomTruth {
  kind: RoomKind;
  units: AlienUnit[];
  hazard: RoomHazard | null;
  /** Resources found there when won, and whole units of meteoric iron. */
  loot: Partial<Record<ResourceId, number>>;
  iron: number;
}

const truthCache = new Map<string, RoomTruth>();

/** Pure: the same seed and room always hold the same. */
export function roomTruth(seed: string, room: DepthRoom): RoomTruth {
  const key = `${seed}/room/${room.id}`;
  let t = truthCache.get(key);
  if (!t) {
    t = drawRoom(createRng(key), room.depth);
    if (truthCache.size > 256) truthCache.clear();
    truthCache.set(key, t);
  }
  return t;
}

function drawRoom(rng: Rng, depth: RoomDepth): RoomTruth {
  const kind = weighted(rng, DEPTHS.kindWeights[depth - 1]!);
  const power =
    DEPTHS.power[depth - 1]! *
    rng.range(DEPTHS.spread[0], DEPTHS.spread[1]) *
    (kind === 'nest' ? DEPTHS.nestPower : 1);
  const units = grouillants(power, DEPTHS.level[depth - 1]!);
  let hazard: RoomHazard | null = null;
  const forced = kind === 'scree' ? 'fall' : kind === 'raphides' ? 'cuts' : null;
  const other = rng.chance(DEPTHS.hazard.otherChance) ? rng.pick(HAZARD_KINDS) : null;
  const hk = forced ?? (kind === 'nest' ? null : other);
  if (hk)
    hazard = {
      kind: hk,
      strength: round2(
        DEPTHS.hazard.strength[depth - 1]! * rng.range(DEPTHS.spread[0], DEPTHS.spread[1]),
      ),
    };
  const amount = DEPTHS.loot[depth - 1]! * rng.range(0.8, 1.2);
  const loot: Partial<Record<ResourceId, number>> = {};
  for (const [r, share] of Object.entries(DEPTHS.lootKind[kind]) as [ResourceId, number][])
    loot[r] = Math.round(amount * share);
  return { kind, units, hazard, loot, iron: DEPTHS.iron[depth - 1]! };
}

/** Grouillants worth this much power (a larva at least). */
export function grouillants(power: number, level: number): AlienUnit[] {
  return DEPTH_KINDS.map((kind) => ({
    kind,
    count: Math.max(
      kind === 'larva' ? 1 : 0,
      Math.round((power * DEPTHS.mix[kind]) / ENEMIES[kind].power),
    ),
    level,
  })).filter((u) => u.count > 0);
}

function weighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const keys = (ROOM_KINDS as readonly string[]).filter((k) => k in weights) as K[];
  const total = keys.reduce((a, k) => a + weights[k], 0);
  let x = rng.range(0, total);
  for (const k of keys) {
    x -= weights[k];
    if (x < 0) return k;
  }
  return keys[keys.length - 1]!;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Seed of what the rooms hold in a local game (online games get a secret one). */
export function localDepthsSeed(state: Pick<GameState, 'seed' | 'face'>): string {
  return `${localAlienSeed(state)}/depths`;
}

/** Gives a home colony its hidden seed when it has none (migrated games). */
export function ensureDepths(state: GameState, seed: string): boolean {
  if (state.colony.index !== 0 || state.depthSeed !== undefined) return false;
  state.depthSeed = `${seed}/depths`;
  return true;
}

/** True when this side holds the truth of the depths (solo, or the server). */
export function depthsKnown(state: GameState): boolean {
  return state.depthSeed !== undefined;
}

/**
 * Forgets what we knew of the depths (an imported save: its seed is drawn again, so the views
 * no longer match what the rooms hold).
 */
export function resetDepths(s: GameState): void {
  s.depths = { ...s.depths, views: {}, galleries: {}, next: null };
  // Delves in flight come back up at once, miners leave the galleries.
  const delving = new Set(
    s.expeditions.filter((e) => e.mission === 'delve' && e.status !== 'done').map((e) => e.id),
  );
  s.expeditions = s.expeditions.filter((e) => !delving.has(e.id));
  for (const v of s.villagers)
    if (v.job.kind === 'mine' || (v.job.kind === 'expedition' && delving.has(v.job.expeditionId)))
      v.job = { kind: 'idle' };
}

/** Rooms a delve may reach: next to the entrance or to a gallery, and not taken yet. */
export function reachableRooms(state: GameState): DepthRoom[] {
  const map = depthsMapOf(state);
  const taken = state.depths.galleries;
  return map.rooms.filter((r) => !taken[r.id] && (r.entrance || r.links.some((id) => taken[id])));
}
