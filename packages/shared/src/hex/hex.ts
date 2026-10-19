/**
 * Hexagonal grid helpers (axial coordinates, pointy-top orientation).
 * Reference: https://www.redblobgames.com/grids/hexagons/
 */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

export type HexKey = `${number},${number}`;

export const hex = (q: number, r: number): Hex => ({ q, r });

export const hexKey = (h: Hex): HexKey => `${h.q},${h.r}`;

export function parseHexKey(key: string): Hex {
  const [q, r] = key.split(',').map(Number);
  if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) {
    throw new Error(`Invalid hex key: ${key}`);
  }
  return { q, r };
}

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

/** The six axial directions, starting east and turning counter-clockwise (pointy-top). */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });
export const hexScale = (a: Hex, k: number): Hex => ({ q: a.q * k, r: a.r * k });

export function hexNeighbor(h: Hex, direction: number): Hex {
  const d = HEX_DIRECTIONS[((direction % 6) + 6) % 6]!;
  return hexAdd(h, d);
}

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d));
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All hexes at exactly `radius` steps from `center` (radius 0 → [center]). */
export function hexRing(center: Hex, radius: number): Hex[] {
  if (radius === 0) return [center];
  const results: Hex[] = [];
  let current = hexAdd(center, hexScale(HEX_DIRECTIONS[4]!, radius));
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push(current);
      current = hexNeighbor(current, side);
    }
  }
  return results;
}

/** All hexes within `radius` steps of `center`, center first then ring by ring. */
export function hexDisk(center: Hex, radius: number): Hex[] {
  const results: Hex[] = [];
  for (let k = 0; k <= radius; k++) results.push(...hexRing(center, k));
  return results;
}

const SQRT3 = Math.sqrt(3);

/** Center of the hex in the 2D plane, for a hex of circumradius `size`. */
export function hexToPixel(h: Hex, size = 1): { x: number; y: number } {
  return {
    x: size * (SQRT3 * h.q + (SQRT3 / 2) * h.r),
    y: size * (1.5 * h.r),
  };
}

export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Normalise -0 to 0 so keys are stable.
  return { q: rq + 0, r: rr + 0 };
}

export function pixelToHex(x: number, y: number, size = 1): Hex {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

/** Hexes on the straight line from `a` to `b` (inclusive), without gaps. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const out: Hex[] = [];
  // Nudge to avoid ambiguous rounding exactly on hex edges.
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}
