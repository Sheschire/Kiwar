import { APPLE, APPLE_STAGES, CLAN_NAME_COUNT, TRADE, type AppleStage } from '../data/orchard';
import { createRng } from '../rng/rng';
import type { TimeMs } from '../types/ids';
import { dist3, growClans, link, round3, shuffled, type Point3 } from './fruitLayout';
import type { Clan, FruitMap, Parcel } from './orchard';

/**
 * Chantier 55: the apple. Its galleries (public, drawn from the orchard's seed like the
 * raspberry) lie in three layers — the skin (ring 0), the flesh (1) and the core (2) — linked
 * along a layer and toward the layer above; colonies of worms hold them. Its rule is ripeness:
 * a public calendar (green, ripe, overripe) the same for everyone in a universe.
 */

const cache = new Map<string, FruitMap>();

/** The apple of an orchard seed (memoized; public). */
export function appleOf(seed: string): FruitMap {
  const hit = cache.get(seed);
  if (hit) return hit;
  const rng = createRng(`${seed}/apple`);
  const A = APPLE;
  const n = rng.int(A.galleries[0], A.galleries[1]);
  // Galleries per layer (at least two in each).
  const inCore = Math.max(2, Math.round(n * A.layers[2]!));
  const inFlesh = Math.max(2, Math.round(n * A.layers[1]!));
  const counts = [n - inCore - inFlesh, inFlesh, inCore];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const top = 1 - 2 * A.stemCap;
  const points: (Point3 & { layer: number })[] = [];
  counts.forEach((count, layer) => {
    const turn = rng.range(0, 2 * Math.PI);
    for (let i = 0; i < count; i++) {
      const y = -1 + ((i + 0.5) / count) * (top + 1) + rng.range(-0.2, 0.2) / count;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const a = turn + i * golden + rng.range(-0.1, 0.1);
      const r = A.radius[layer]! * rng.range(0.92, 1.05);
      points.push({ x: rr * Math.cos(a) * r, y: y * r, z: rr * Math.sin(a) * r, layer });
    }
  });
  const links: number[][] = points.map(() => []);
  const nearest = (i: number, pool: number[], k: number) =>
    pool
      .filter((j) => j !== i)
      .sort((a, b) => dist3(points[i]!, points[a]!) - dist3(points[i]!, points[b]!) || a - b)
      .slice(0, k);
  const byLayer = [0, 1, 2].map((l) => points.flatMap((p, i) => (p.layer === l ? [i] : [])));
  for (let i = 0; i < points.length; i++) {
    const layer = points[i]!.layer;
    for (const j of nearest(i, byLayer[layer]!, A.sideLinks)) link(links, i, j);
    if (layer > 0) for (const j of nearest(i, byLayer[layer - 1]!, A.upLinks)) link(links, i, j);
  }
  const k = rng.int(A.clans[0], A.clans[1]);
  const { owner, seeds } = growClans(points, links, k, rng);
  const names = shuffled(
    Array.from({ length: CLAN_NAME_COUNT.apple }, (_, i) => i),
    rng,
  );
  const clans: Clan[] = seeds.map((_, c) => ({
    id: `w${c}`,
    name: names[c % names.length]!,
    parcels: [],
    wants: rng.pick(A.wants),
    rate: Math.round(rng.range(TRADE.rate[0], TRADE.rate[1]) * 10) / 10,
  }));
  const parcels: Parcel[] = points.map((p, i) => ({
    id: `g${i}`,
    index: i,
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    ring: p.layer as 0 | 1 | 2,
    clan: `w${owner[i]}`,
    links: links[i]!.map((j) => `g${j}`).sort(),
  }));
  for (const g of parcels) clans[Number(g.clan.slice(1))]!.parcels.push(g.id);
  const out: FruitMap = {
    fruit: 'apple',
    seed,
    parcels,
    clans,
    byId: new Map(parcels.map((g) => [g.id, g])),
    clanById: new Map(clans.map((c) => [c.id, c])),
  };
  if (cache.size > 16) cache.clear();
  cache.set(seed, out);
  return out;
}

// --- Ripeness (public) -------------------------------------------------------------------------

const CYCLE_MS = APPLE_STAGES.reduce((a, st) => a + APPLE.stageMs[st], 0);
const offsets = new Map<string, number>();

/** The public offset of the apple's calendar (whole minutes into the cycle at time 0). */
function offsetOf(seed: string): number {
  let o = offsets.get(seed);
  if (o === undefined) {
    o = Math.floor(createRng(`${seed}/apple/ripeness`).range(0, CYCLE_MS) / 60_000) * 60_000;
    if (offsets.size > 16) offsets.clear();
    offsets.set(seed, o);
  }
  return o;
}

export interface AppleRipeness {
  stage: AppleStage;
  since: TimeMs;
  until: TimeMs;
}

/** The apple's stage at a time, with when it began and when it ends (public). */
export function appleStage(seed: string, at: TimeMs): AppleRipeness {
  const t = (((at + offsetOf(seed)) % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  let start = at - t;
  for (const stage of APPLE_STAGES) {
    const end = start + APPLE.stageMs[stage];
    if (at < end) return { stage, since: start, until: end };
    start = end;
  }
  // Unreachable (t < the cycle).
  return { stage: 'green', since: start, until: start + APPLE.stageMs.green };
}

/** The next stages after a time (the calendar the screen shows), `count` of them. */
export function appleCalendar(seed: string, at: TimeMs, count: number): AppleRipeness[] {
  const out = [appleStage(seed, at)];
  while (out.length < count) out.push(appleStage(seed, out[out.length - 1]!.until));
  return out;
}

/** The rules of the stage at a time: strength of the worms, richness, cider found. */
export function appleEffects(
  seed: string,
  at: TimeMs,
): { power: number; rich: number; cider: number } {
  return APPLE.stages[appleStage(seed, at).stage];
}
