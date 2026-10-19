import {
  getTile,
  hexDistance,
  hexKey,
  hexNeighbors,
  TILES,
  type FaceMap,
  type Hex,
  type HexKey,
} from '@kiwar/shared';

/** Minimal binary heap keyed by priority. */
class MinHeap<T> {
  private items: { p: number; v: T }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(v: T, p: number): void {
    const a = this.items;
    a.push({ p, v });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.p <= a[i]!.p) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!.v;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.p < a[m]!.p) m = l;
        if (r < a.length && a[r]!.p < a[m]!.p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* over the hex tiles for the (purely cosmetic) villager movement. Rays are cheaper so kiwis
 * naturally use them as paths. The goal tile is always enterable (wells stand in juice pools).
 */
export function findPath(map: FaceMap, from: Hex, to: Hex): Hex[] | null {
  const goal = hexKey(to);
  const start = hexKey(from);
  if (!getTile(map, from) || !getTile(map, to)) return null;
  if (start === goal) return [from];
  const open = new MinHeap<Hex>();
  const came = new Map<HexKey, HexKey>();
  const cost = new Map<HexKey, number>([[start, 0]]);
  open.push(from, 0);
  const minCost = 0.5;
  while (open.size > 0) {
    const current = open.pop()!;
    const ck = hexKey(current);
    if (ck === goal) {
      const path: Hex[] = [current];
      let k: HexKey | undefined = came.get(ck);
      while (k) {
        const [q, r] = k.split(',').map(Number) as [number, number];
        path.push({ q, r });
        k = came.get(k);
      }
      return path.reverse();
    }
    for (const n of hexNeighbors(current)) {
      const tile = getTile(map, n);
      if (!tile) continue;
      const nk = hexKey(n);
      const def = TILES[tile.type];
      if (!def.walkable && nk !== goal) continue;
      const step = nk === goal && !def.walkable ? 1 : def.walkCost;
      const g = cost.get(ck)! + step;
      if (g < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, g);
        came.set(nk, ck);
        open.push(n, g + hexDistance(n, to) * minCost);
      }
    }
  }
  return null;
}
