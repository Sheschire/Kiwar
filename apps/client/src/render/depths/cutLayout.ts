import { isLocule, type DepthRoom, type DepthsMap } from '@kiwar/shared';

/**
 * Chantier 49: where the depths stand in the cut of the dome. Pure (no three.js): the same
 * layout feeds the painted section, the hollows of the rooms, the kiwis and the delve show.
 *
 * The section is a half-ellipse in normalised units: `s` across (−1 left … 1 right, ×
 * the half-width of the dome along the face) and `t` down (0 at the surface, 1 at the
 * bottom of the skin), inside `s² + t² ≤ 1`. The quarter of the dome that opens shows the
 * left half (`s < 0`) on one face and the right half on the other; the tunnel comes down
 * where the two faces meet (`s = 0`).
 */

/** Depth of each row of rooms (index = depth − 1), in `t`. */
export const ROW_T = [0.32, 0.51, 0.69] as const;
/** Radius of a room, in `t` units (× the dome's depth in world units). */
export const ROOM_T = 0.085;
/** Chantier 50's locules are small cells around the core, like the seeds they hold. */
export const LOCULE_T = 0.015;
/**
 * The dome's half-width over its depth, for what must be round in the world (the locules ring
 * around the core): the faces differ from it by the face's ellipse only (≤ 12 %).
 */
export const CUT_ASPECT = 1 / 0.55;
/** The locules stand on two staggered rings (radii in depth units around the bottom pole). */
const LOCULE_RINGS = [0.225, 0.315] as const;
/** Rooms keep this far from the seam of the two faces, in `s`. */
const SEAM = 0.2;
/** The locules ring and the core, around the bottom pole (0, 1), in section units. */
export const LOCULES = { inner: 0.17, outer: 0.37 } as const;
export const CORE = 0.16;
/** The entrance shaft: from the surface down to this `t`, at `s = 0`. */
export const SHAFT_T = 0.2;

export interface CutPoint {
  s: number;
  t: number;
}

/** Least gap between two rooms of a row, in `s`. */
const GAP = 0.14;

/** Where a room would stand on its own (before its row is spread out). */
function basePoint(room: Pick<DepthRoom, 'x' | 'depth'>): CutPoint {
  const t: number = ROW_T[room.depth - 1] ?? ROW_T[2];
  const side = room.x < 0 ? -1 : 1;
  const across = SEAM + (1 - SEAM - 0.08) * Math.min(1, Math.abs(room.x));
  return { s: side * Math.min(across, rowEdge(t)), t };
}

/** The farthest a room's middle goes across at depth `t` (room for the hollow). */
function rowEdge(t: number): number {
  return Math.sqrt(Math.max(0, 1 - t * t)) - ROOM_T * 1.6;
}

const pointsCache = new WeakMap<DepthsMap, Map<string, CutPoint>>();

/**
 * Every room's place in the section: its row's depth, across by its `x`, the rooms of a side
 * spread at least `GAP` apart between the seam and the rim (memoized per network).
 */
export function roomPoints(map: DepthsMap): Map<string, CutPoint> {
  let out = pointsCache.get(map);
  if (out) return out;
  out = new Map();
  const groups = new Map<string, DepthRoom[]>();
  placeLocules(map.rooms.filter(isLocule), out);
  for (const r of map.rooms) {
    if (isLocule(r)) continue;
    const key = `${r.depth}/${r.x < 0 ? -1 : 1}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const rooms of groups.values()) {
    const pts = rooms
      .map((r) => ({ r, p: basePoint(r) }))
      .sort((a, b) => Math.abs(a.p.s) - Math.abs(b.p.s));
    const edge = rowEdge(pts[0]!.p.t);
    // Outwards from the seam, then back in from the rim if the row ran out of room.
    let last = -Infinity;
    for (const x of pts) {
      const a = Math.max(Math.abs(x.p.s), last + GAP);
      x.p.s = Math.sign(x.p.s) * a;
      last = a;
    }
    let next = Infinity;
    for (let i = pts.length - 1; i >= 0; i--) {
      const x = pts[i]!;
      const a = Math.max(SEAM * 0.75, Math.min(Math.abs(x.p.s), edge, next - GAP));
      x.p.s = Math.sign(x.p.s) * a;
      next = a;
    }
    for (const x of pts) out.set(x.r.id, x.p);
  }
  pointsCache.set(map, out);
  return out;
}

/** Radius of a room in depth units (a locule is a small cell). */
export function roomRadius(room: Pick<DepthRoom, 'depth'>): number {
  return isLocule(room) ? LOCULE_T : ROOM_T;
}

/**
 * Chantier 50: the locules around the core, in the order of their `x` (each opens onto the
 * next), on two rings so that their cells never touch.
 */
function placeLocules(rooms: DepthRoom[], out: Map<string, CutPoint>): void {
  const sorted = [...rooms].sort((a, b) => a.x - b.x);
  sorted.forEach((r, i) => {
    const a = Math.PI * (0.06 + (0.88 * (i + 0.5)) / sorted.length);
    const ring = LOCULE_RINGS[i % 2]!;
    out.set(r.id, { s: (-Math.cos(a) * ring) / CUT_ASPECT, t: 1 - Math.sin(a) * ring });
  });
}

/** A room's place in the section. */
export function roomPoint(map: DepthsMap, room: Pick<DepthRoom, 'id'>): CutPoint {
  return roomPoints(map).get(room.id) ?? { s: SEAM, t: ROW_T[0] };
}

/** The foot of the entrance shaft, where the passages to the first rooms start. */
export const SHAFT_FOOT: CutPoint = { s: 0, t: SHAFT_T };

/** A passage between two points, as a short polyline (a gentle sag, like a dug gallery). */
export function passage(a: CutPoint, b: CutPoint, steps = 8): CutPoint[] {
  const out: CutPoint[] = [];
  const sag = 0.025 + 0.04 * Math.abs(a.s - b.s);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push({
      s: a.s + (b.s - a.s) * u,
      t: a.t + (b.t - a.t) * u + Math.sin(u * Math.PI) * sag,
    });
  }
  return out;
}

/** Every passage of the network: from the shaft to the first rooms, then between rooms. */
export interface CutLink {
  a: string | null;
  b: string;
  points: CutPoint[];
}

export function cutLinks(map: DepthsMap): CutLink[] {
  const out: CutLink[] = [];
  for (const r of map.rooms) {
    if (r.entrance) out.push({ a: null, b: r.id, points: passage(SHAFT_FOOT, roomPoint(map, r)) });
    for (const id of r.links) {
      if (id <= r.id) continue;
      const o = map.byId.get(id);
      if (o) out.push({ a: r.id, b: id, points: passage(roomPoint(map, r), roomPoint(map, o)) });
    }
  }
  return out;
}

/**
 * The way down to a room: the shaft, then the passages through rooms already known (breadth
 * first from the entrance), then the last passage. Used to walk kiwis down and up.
 */
export function wayTo(map: DepthsMap, roomId: string, open: (id: string) => boolean): CutPoint[] {
  const target = map.byId.get(roomId);
  if (!target) return [];
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const r of map.rooms)
    if (r.entrance) {
      prev.set(r.id, null);
      queue.push(r.id);
    }
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === roomId) break;
    if (!open(id)) continue;
    for (const n of map.byId.get(id)!.links)
      if (!prev.has(n)) {
        prev.set(n, id);
        queue.push(n);
      }
  }
  const chain: string[] = [];
  let at: string | null | undefined = prev.has(roomId) ? roomId : undefined;
  if (at === undefined) chain.push(roomId);
  while (at) {
    chain.unshift(at);
    at = prev.get(at) ?? null;
  }
  const points: CutPoint[] = [{ s: 0, t: 0 }, SHAFT_FOOT];
  let from = SHAFT_FOOT;
  for (const id of chain) {
    const p = roomPoint(map, map.byId.get(id)!);
    points.push(...passage(from, p).slice(1));
    from = p;
  }
  return points;
}

/** A point along a polyline at `u` (0–1 of its length). */
export function along(points: readonly CutPoint[], u: number, out: CutPoint): CutPoint {
  if (points.length === 0) return out;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  let left = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (left <= d || i === points.length - 1) {
      const k = d > 0 ? Math.min(1, left / d) : 0;
      out.s = a.s + (b.s - a.s) * k;
      out.t = a.t + (b.t - a.t) * k;
      return out;
    }
    left -= d;
  }
  return out;
}

function dist(a: CutPoint, b: CutPoint): number {
  return Math.hypot(a.s - b.s, a.t - b.t);
}
