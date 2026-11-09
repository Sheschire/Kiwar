import { ITEMS } from '../data/gear';
import { CLAN_NAME_COUNT, PINEAPPLE, TRADE } from '../data/orchard';
import { createRng } from '../rng/rng';
import type { TimeMs } from '../types/ids';
import { dist3, growClans, link, round3, shuffled, type Point3 } from './fruitLayout';
import { actinidineActive } from './mines';
import type { Clan, FruitMap, Parcel } from './orchard';
import type { GameState, Villager } from './state';

/**
 * Chantier 55: the pineapple. Its scales (public, drawn from the orchard's seed) follow the
 * fruit's spirals on a barrel; each touches its nearest ones, which makes an almost hexagonal
 * grid. The crown sits on top: the royal parcel, the strongest and the richest in golden fibre.
 * Its rule is bromelain: every hour on the fruit costs a crew hit points (public, no roll).
 */

const cache = new Map<string, FruitMap>();

/** The pineapple of an orchard seed (memoized; public). */
export function pineappleOf(seed: string): FruitMap {
  const hit = cache.get(seed);
  if (hit) return hit;
  const rng = createRng(`${seed}/pineapple`);
  const P = PINEAPPLE;
  const n = rng.int(P.scales[0], P.scales[1]);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const turn = rng.range(0, 2 * Math.PI);
  // A barrel: wide in the middle, narrower at the base and under the crown.
  const points: Point3[] = Array.from({ length: n }, (_, i) => {
    const y = -0.95 + (1.85 * (i + 0.5)) / n;
    const r = 0.72 * Math.sqrt(Math.max(0.05, 1 - (y / 1.08) ** 4));
    const a = turn + i * golden;
    return { x: r * Math.cos(a), y, z: r * Math.sin(a) };
  });
  // The crown on top, touching the highest scales.
  points.push({ x: 0, y: 1.12, z: 0 });
  const crown = n;
  const links: number[][] = points.map(() => []);
  const nearest = (i: number, pool: number[], k: number) =>
    pool
      .filter((j) => j !== i)
      .sort((a, b) => dist3(points[i]!, points[a]!) - dist3(points[i]!, points[b]!) || a - b)
      .slice(0, k);
  const scales = Array.from({ length: n }, (_, i) => i);
  for (const i of scales) for (const j of nearest(i, scales, P.touches)) link(links, i, j);
  for (const j of nearest(crown, scales, P.crownLinks)) link(links, crown, j);
  const k = rng.int(P.clans[0], P.clans[1]);
  const { owner, seeds } = growClans(points, links, k, rng);
  const names = shuffled(
    Array.from({ length: CLAN_NAME_COUNT.pineapple }, (_, i) => i),
    rng,
  );
  const clans: Clan[] = seeds.map((_, c) => ({
    id: `n${c}`,
    name: names[c % names.length]!,
    parcels: [],
    wants: rng.pick(P.wants),
    rate: Math.round(rng.range(TRADE.rate[0], TRADE.rate[1]) * 10) / 10,
  }));
  const parcels: Parcel[] = points.map((p, i) => ({
    id: `s${i}`,
    index: i,
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    ring: (i === crown ? 2 : Math.min(2, Math.floor((3 * i) / n))) as 0 | 1 | 2,
    clan: `n${owner[i]}`,
    links: links[i]!.map((j) => `s${j}`).sort(),
    ...(i === crown ? { crown: true } : {}),
  }));
  for (const s of parcels) clans[Number(s.clan.slice(1))]!.parcels.push(s.id);
  const out: FruitMap = {
    fruit: 'pineapple',
    seed,
    parcels,
    clans,
    byId: new Map(parcels.map((s) => [s.id, s])),
    clanById: new Map(clans.map((c) => [c.id, c])),
  };
  if (cache.size > 16) cache.clear();
  cache.set(seed, out);
  return out;
}

/** The crown of a pineapple. */
export function crownOf(map: FruitMap): Parcel {
  return map.parcels[map.parcels.length - 1]!;
}

// --- Bromelain (public: no roll) ---------------------------------------------------------------

/**
 * What a kiwi still takes of the bromelain (1: everything): Endurance above 5 shields it, the
 * actinidine of a lake worked at home halves it.
 */
export function bromelainShield(state: GameState, v: Villager): number {
  const B = PINEAPPLE.bromelain;
  const end = Math.min(B.enduranceCap, Math.max(0, v.stats.endurance - 5) * B.perEndurance);
  // A golden fibre armour keeps the enzyme out.
  const armor = v.gear?.armor ? (ITEMS[v.gear.armor].bromelain ?? 1) : 1;
  return (1 - end) * (actinidineActive(state) ? B.actinidine : 1) * armor;
}

/** Shares of hit points each kiwi loses after `hours` on the pineapple (never below the floor). */
export function bromelainHarm(
  state: GameState,
  crew: readonly Villager[],
  hours: number,
): Record<string, number> {
  const B = PINEAPPLE.bromelain;
  const out: Record<string, number> = {};
  for (const v of crew) {
    const share = Math.min(1 - B.floor, B.perHour * hours * bromelainShield(state, v));
    if (share > 0) out[v.id] = Math.round(share * 100) / 100;
  }
  return out;
}

/** When a kiwi left at the pineapple's post is worn out (a shielded kiwi lasts longer). */
export function postWornAt(state: GameState, v: Villager, at: TimeMs): TimeMs {
  const shield = Math.max(0.1, bromelainShield(state, v));
  return at + Math.round((PINEAPPLE.bromelain.postHours * 3_600_000) / shield / 60_000) * 60_000;
}

/** A kiwi at a post worn out by the bromelain at a time (it stops working until relieved). */
export function wornOut(v: Villager, at: TimeMs): boolean {
  return v.job.kind === 'post' && v.job.wornAt !== undefined && v.job.wornAt <= at;
}
