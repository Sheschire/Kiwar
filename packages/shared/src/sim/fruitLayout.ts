import type { Rng } from '../rng/rng';

/**
 * Chantier 55: the pieces every fruit's layout shares (chantier 54 drew them for the raspberry):
 * linking points closer than a reach, never a lonely point, and clans grown together over the
 * links from seeds spread far apart. Pure: the draws come from the caller's stream, in order.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export function dist3(p: Point3, q: Point3): number {
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

/** Links between points closer than `reach` (both ways). */
export function linkWithin(points: readonly Point3[], reach: number): number[][] {
  const n = points.length;
  const links: number[][] = points.map(() => []);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (dist3(points[i]!, points[j]!) <= reach) {
        links[i]!.push(j);
        links[j]!.push(i);
      }
  return links;
}

/** Links a point with no link to its nearest one. */
export function linkLonely(points: readonly Point3[], links: number[][]): void {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    if (links[i]!.length > 0) continue;
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = dist3(points[i]!, points[j]!);
      if (d < bestD) [best, bestD] = [j, d];
    }
    links[i]!.push(best);
    links[best]!.push(i);
  }
}

/** Links two points (both ways, once). */
export function link(links: number[][], i: number, j: number): void {
  if (i === j || links[i]!.includes(j)) return;
  links[i]!.push(j);
  links[j]!.push(i);
}

/**
 * Grows `k` clans over the links: seeds spread by farthest-point sampling (the first one drawn),
 * then each clan takes the next free neighbour of its oldest points in turn (compact clans).
 * Returns the owner of each point and the seeds.
 */
export function growClans(
  points: readonly Point3[],
  links: readonly number[][],
  k: number,
  rng: Rng,
): { owner: number[]; seeds: number[] } {
  const n = points.length;
  const owner = new Array<number>(n).fill(-1);
  const seeds: number[] = [rng.int(0, n - 1)];
  while (seeds.length < k) {
    let far = 0;
    let farD = -1;
    for (let i = 0; i < n; i++) {
      if (seeds.includes(i)) continue;
      const d = Math.min(...seeds.map((s) => dist3(points[i]!, points[s]!)));
      if (d > farD) [far, farD] = [i, d];
    }
    seeds.push(far);
  }
  const fronts = seeds.map((s, c) => {
    owner[s] = c;
    return [s];
  });
  for (let grown = k; grown < n;) {
    let moved = false;
    for (let c = 0; c < k; c++) {
      const front = fronts[c]!;
      for (const i of front) {
        const free = links[i]!.filter((j) => owner[j] === -1).sort((a, b) => a - b);
        if (free.length === 0) continue;
        owner[free[0]!] = c;
        front.push(free[0]!);
        grown++;
        moved = true;
        break;
      }
    }
    if (!moved) {
      // Islands left out (cannot happen with linked points, but stay safe): a neighbour's clan.
      for (let i = 0; i < n; i++)
        if (owner[i] === -1) {
          owner[i] = owner[links[i]![0]!] === -1 ? 0 : owner[links[i]![0]!]!;
          grown++;
        }
    }
  }
  return { owner, seeds };
}

export function shuffled<T>(list: T[], rng: Pick<Rng, 'int'>): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
