import {
  FRUIT_DEFS,
  FRUIT_IDS,
  NECTAR,
  NECTAR_SCALE,
  ORCHARD,
  RASPBERRY,
  STANDING,
  TRADE,
  fruitOfId,
  nectarUnits,
  type FruitId,
} from '../data/orchard';
import type { ResourceId } from '../data/resources';
import { ENEMIES, type EnemyKind } from '../data/units';
import { createRng } from '../rng/rng';
import type { TimeMs } from '../types/ids';
import type { AlienUnit } from './civ';
import { hasTech } from './research';
import { nest } from './selectors';
import { localAlienSeed, newOrchard, type Building, type GameState } from './state';

/**
 * Chantier 54: the cosmic orchard and its first fruit, the raspberry. Its layout (drupelets,
 * neighbours, clans and what each clan asks for) is public, drawn from `state.orchard.seed` —
 * the universe's seed, so every member sees the same fruit. What a drupelet holds (its beetles,
 * its nectar, a nest) is drawn from the hidden `orchardSeed`, which only the server (online) or
 * the client (solo) holds; anything that reads it resolves only there.
 */

/**
 * Chantier 55: a parcel of a fruit — a drupelet of the raspberry, a gallery of the apple, a scale
 * of the pineapple. Every fruit's map has the same shape: parcels with links, held by clans.
 */
export interface Parcel {
  id: string;
  /** Index in the fruit (0 at the tip, the far end from the vine). */
  index: number;
  /** Position on the unit sphere of the fruit (y up, toward the vine). */
  x: number;
  y: number;
  z: number;
  /** 0 at the tip (young clans), 1, 2 at the shoulders by the stem (the oldest, strongest). */
  ring: 0 | 1 | 2;
  clan: string;
  links: string[];
}

/** The raspberry's parcels. */
export type Drupelet = Parcel;

export interface Clan {
  id: string;
  /** Index of its name (`orchard.clans.<n>` in the client) and of its colour. */
  name: number;
  parcels: string[];
  /** What it asks for in trade, and the nectar it pays for 1000 units (before our own sales). */
  wants: ResourceId;
  rate: number;
}

export interface FruitMap {
  fruit: FruitId;
  seed: string;
  parcels: Parcel[];
  clans: Clan[];
  byId: ReadonlyMap<string, Parcel>;
  clanById: ReadonlyMap<string, Clan>;
}

export type Raspberry = FruitMap;

/** Number of clan names the client knows (`orchard.clanNames`). */
export const CLAN_NAMES = 16;

const mapCache = new Map<string, Raspberry>();

/** The raspberry of an orchard seed (memoized; public). */
export function raspberryOf(seed: string): Raspberry {
  const hit = mapCache.get(seed);
  if (hit) return hit;
  const rng = createRng(`${seed}/raspberry`);
  const R = RASPBERRY;
  const n = rng.int(R.drupelets[0], R.drupelets[1]);
  // Equal-area rows from the tip (y = −1) to under the stem's cap, turned by the golden angle.
  const top = 1 - 2 * R.stemCap;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const turn = rng.range(0, 2 * Math.PI);
  const points = Array.from({ length: n }, (_, i) => {
    const y = -1 + ((i + 0.5) / n) * (top + 1) + rng.range(-0.15, 0.15) / n;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const a = turn + i * golden + rng.range(-0.08, 0.08);
    return { x: rr * Math.cos(a), y, z: rr * Math.sin(a) };
  });
  const spacing = Math.sqrt((4 * Math.PI * (1 - R.stemCap)) / n);
  const reach = spacing * R.neighbourSpan;
  const links: number[][] = points.map(() => []);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const p = points[i]!;
      const q = points[j]!;
      if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= reach) {
        links[i]!.push(j);
        links[j]!.push(i);
      }
    }
  // Never a lonely drupelet: link it to its nearest one.
  for (let i = 0; i < n; i++) {
    if (links[i]!.length > 0) continue;
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const p = points[i]!;
      const q = points[j]!;
      const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      if (d < bestD) [best, bestD] = [j, d];
    }
    links[i]!.push(best);
    links[best]!.push(i);
  }
  // Clans: seeds spread by farthest-point sampling, then grown together over the links.
  const k = rng.int(R.clans[0], R.clans[1]);
  const owner = new Array<number>(n).fill(-1);
  const seeds: number[] = [rng.int(0, n - 1)];
  while (seeds.length < k) {
    let far = 0;
    let farD = -1;
    for (let i = 0; i < n; i++) {
      if (seeds.includes(i)) continue;
      const d = Math.min(
        ...seeds.map((s) =>
          Math.hypot(
            points[i]!.x - points[s]!.x,
            points[i]!.y - points[s]!.y,
            points[i]!.z - points[s]!.z,
          ),
        ),
      );
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
      // The next free neighbour of this clan's oldest drupelets first (compact clans).
      let took = false;
      for (const i of front) {
        const free = links[i]!.filter((j) => owner[j] === -1).sort((a, b) => a - b);
        if (free.length === 0) continue;
        owner[free[0]!] = c;
        front.push(free[0]!);
        grown++;
        took = moved = true;
        break;
      }
      if (!took) continue;
    }
    if (!moved) {
      // Islands left out (cannot happen with the links above, but stay safe): the nearest clan.
      for (let i = 0; i < n; i++)
        if (owner[i] === -1) {
          owner[i] = owner[links[i]![0]!] === -1 ? 0 : owner[links[i]![0]!]!;
          grown++;
        }
    }
  }
  const names = shuffled(
    Array.from({ length: CLAN_NAMES }, (_, i) => i),
    rng,
  );
  const clans: Clan[] = seeds.map((_, c) => ({
    id: `c${c}`,
    name: names[c]!,
    parcels: [],
    wants: rng.pick(R.wants),
    rate: Math.round(rng.range(TRADE.rate[0], TRADE.rate[1]) * 10) / 10,
  }));
  const drupelets: Drupelet[] = points.map((p, i) => ({
    id: `d${i}`,
    index: i,
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    ring: Math.min(2, Math.floor((3 * i) / n)) as 0 | 1 | 2,
    clan: `c${owner[i]}`,
    links: links[i]!.map((j) => `d${j}`).sort(),
  }));
  for (const d of drupelets) clans[Number(d.clan.slice(1))]!.parcels.push(d.id);
  const out: Raspberry = {
    fruit: 'raspberry',
    seed,
    parcels: drupelets,
    clans,
    byId: new Map(drupelets.map((d) => [d.id, d])),
    clanById: new Map(clans.map((c) => [c.id, c])),
  };
  if (mapCache.size > 16) mapCache.clear();
  mapCache.set(seed, out);
  return out;
}

/** The raspberry this colony knows (its public seed). */
export function raspberryOfState(state: Pick<GameState, 'orchard'>): Raspberry {
  return raspberryOf(state.orchard.seed);
}

/** Chantier 55: a fruit of an orchard seed (public, memoized). */
export function fruitMapOf(seed: string, fruit: FruitId): FruitMap {
  switch (fruit) {
    case 'raspberry':
      return raspberryOf(seed);
  }
}

/** A fruit of the orchard this colony knows. */
export function fruitOfState(state: Pick<GameState, 'orchard'>, fruit: FruitId): FruitMap {
  return fruitMapOf(state.orchard.seed, fruit);
}

/** The parcel of an id, on its fruit (null: none). */
export function parcelOf(
  state: Pick<GameState, 'orchard'>,
  id: string,
): { map: FruitMap; parcel: Parcel } | null {
  const fruit = fruitOfId(id);
  if (!fruit) return null;
  const map = fruitOfState(state, fruit);
  const parcel = map.byId.get(id);
  return parcel ? { map, parcel } : null;
}

/** The clan of an id, on its fruit (null: none). */
export function clanOf(state: Pick<GameState, 'orchard'>, id: string): Clan | null {
  const fruit = fruitOfId(id);
  return fruit ? (fruitOfState(state, fruit).clanById.get(id) ?? null) : null;
}

/** Every fruit's map this colony knows. */
export function allFruits(state: Pick<GameState, 'orchard'>): FruitMap[] {
  return FRUIT_IDS.map((f) => fruitOfState(state, f));
}

/** Clans next to a clan (one of their parcels touches one of its own). */
export function clanNeighbours(map: FruitMap, clanId: string): string[] {
  const out = new Set<string>();
  for (const id of map.clanById.get(clanId)?.parcels ?? [])
    for (const l of map.byId.get(id)!.links) {
      const c = map.byId.get(l)!.clan;
      if (c !== clanId) out.add(c);
    }
  return [...out].sort();
}

// --- What a parcel holds (hidden) -------------------------------------------------------------

export interface DrupeletTruth {
  units: AlienUnit[];
  /** Nectar stored there (whole units). */
  nectar: number;
  nest: boolean;
}

export type FruitTruth = DrupeletTruth;

const truthCache = new Map<string, DrupeletTruth>();

/** What a parcel holds at full strength (from the hidden seed). */
export function fruitTruth(seed: string, d: Parcel): FruitTruth {
  const fruit = fruitOfId(d.id) ?? 'raspberry';
  // The raspberry's stream keeps its chantier 54 name.
  const key = fruit === 'raspberry' ? `${seed}/drupelet/${d.id}` : `${seed}/${fruit}/${d.id}`;
  let t = truthCache.get(key);
  if (!t) {
    const rng = createRng(key);
    const R = FRUIT_DEFS[fruit];
    const nestHere = rng.chance(R.nestChance);
    const power =
      R.rings.power[d.ring]! *
      rng.range(1 - R.powerSpread, 1 + R.powerSpread) *
      (nestHere ? R.nestPower : 1);
    const nectar = Math.round(
      R.rings.nectar[d.ring]! * rng.range(1 - R.nectarSpread, 1 + R.nectarSpread),
    );
    t = { units: fruitGarrison(fruit, power, R.rings.level[d.ring]!), nectar, nest: nestHere };
    if (truthCache.size > 512) truthCache.clear();
    truthCache.set(key, t);
  }
  return t;
}

/** What a drupelet holds at full strength (from the hidden seed). */
export const drupeletTruth = fruitTruth;

/** The inhabitants of a fruit's garrison worth this much power (at least one of the first kind). */
export function fruitGarrison(fruit: FruitId, power: number, level: number): AlienUnit[] {
  const mix = FRUIT_DEFS[fruit].mix;
  const kinds = Object.keys(mix) as EnemyKind[];
  return kinds
    .map((kind, i) => ({
      kind,
      count: Math.max(i === 0 ? 1 : 0, Math.round((power * mix[kind]!) / ENEMIES[kind].power)),
      level,
    }))
    .filter((u) => u.count > 0);
}

/** The beetles of a garrison worth this much power (at least one beetle). */
export function beetles(power: number, level: number): AlienUnit[] {
  return fruitGarrison('raspberry', power, level);
}

/** The public estimate of a parcel's garrison (its ring × k, regrown since our pillage). */
export function guessGarrison(
  state: Pick<GameState, 'orchard'>,
  d: Parcel,
  k: number,
  at: TimeMs,
): AlienUnit[] {
  const fruit = fruitOfId(d.id) ?? 'raspberry';
  const R = FRUIT_DEFS[fruit];
  return fruitGarrison(
    fruit,
    R.rings.power[d.ring]! * k * regrowth(state, d.id, at),
    R.rings.level[d.ring]!,
  );
}

/** Share of its garrison a pillaged parcel has grown back at a time (1: never pillaged). */
export function regrowth(state: Pick<GameState, 'orchard'>, id: string, at: TimeMs): number {
  const t = state.orchard.taken[id];
  if (t === undefined) return 1;
  const R = FRUIT_DEFS[fruitOfId(id) ?? 'raspberry'];
  return Math.max(0.1, Math.min(1, (at - t) / R.regrowMs));
}

/** A parcel's garrison and store at a time (truth × its regrowth after a pillage). */
export function parcelNow(state: GameState, seed: string, d: Parcel, at: TimeMs): FruitTruth {
  const t = fruitTruth(seed, d);
  const f = regrowth(state, d.id, at);
  if (f >= 1) return t;
  return {
    units: t.units
      .map((u, i) => ({ ...u, count: Math.max(i === 0 ? 1 : 0, Math.round(u.count * f)) }))
      .filter((u) => u.count > 0),
    nectar: Math.round(t.nectar * f),
    nest: t.nest,
  };
}

/** A drupelet's garrison and nectar at a time. */
export const drupeletNow = parcelNow;

// --- Standing (public) -------------------------------------------------------------------------

export type Attitude = 'friendly' | 'neutral' | 'hostile';

/** A clan's standing with us at a time (it drifts toward 0 by `driftPerDay`). */
export function standingOf(state: Pick<GameState, 'orchard'>, clan: string, at: TimeMs): number {
  const s = state.orchard.standing[clan];
  if (!s) return 0;
  const drift = (STANDING.driftPerDay * Math.max(0, at - s.at)) / 86_400_000;
  const v = s.value > 0 ? Math.max(0, s.value - drift) : Math.min(0, s.value + drift);
  return Math.round(v * 10) / 10;
}

export function attitudeOf(state: Pick<GameState, 'orchard'>, clan: string, at: TimeMs): Attitude {
  const v = standingOf(state, clan, at);
  return v >= STANDING.friendly ? 'friendly' : v <= STANDING.hostile ? 'hostile' : 'neutral';
}

/** Changes a clan's standing at a time (bounded). */
export function addStanding(s: GameState, clan: string, delta: number, at: TimeMs): void {
  const v = Math.max(STANDING.min, Math.min(STANDING.max, standingOf(s, clan, at) + delta));
  s.orchard.standing[clan] = { value: v, at };
}

/** A pillage: the clan turns against us, and the clans next to it too (visible to the player). */
export function pillageStanding(s: GameState, clan: string, at: TimeMs): void {
  const map = fruitOfState(s, fruitOfId(clan) ?? 'raspberry');
  addStanding(s, clan, STANDING.pillage, at);
  for (const c of clanNeighbours(map, clan)) addStanding(s, c, STANDING.pillageNeighbours, at);
}

// --- Trade (public) ----------------------------------------------------------------------------

/** What we sold to a clan, still weighing on our rate at a time. */
export function soldTo(state: Pick<GameState, 'orchard'>, clan: string, at: TimeMs): number {
  const s = state.orchard.sold[clan];
  if (!s) return 0;
  return Math.max(0, s.value * (1 - Math.max(0, at - s.at) / TRADE.fadeMs));
}

/** Nectar this clan pays us for 1000 units of what it asks for, now. */
export function tradeRate(state: Pick<GameState, 'orchard'>, clan: string, at: TimeMs): number {
  const c = clanOf(state, clan);
  if (!c) return 0;
  return Math.round((c.rate / (1 + soldTo(state, clan, at) / TRADE.soften)) * 100) / 100;
}

/** Sells `amount` of what the clan asks for: the nectar paid (whole units, before the cap). */
export function sellTo(s: GameState, clan: string, amount: number, at: TimeMs): number {
  const rate = tradeRate(s, clan, at);
  s.orchard.sold[clan] = { value: soldTo(s, clan, at) + amount, at };
  return Math.floor((amount * rate) / 1000);
}

// --- Nectar (a stock of its own) ---------------------------------------------------------------

/** Nectar cap of the colony in raw units (grows with the Nest). */
export function nectarCap(state: GameState): number {
  const c = NECTAR.cap;
  return (c[Math.min(nest(state).level, c.length - 1)] ?? 0) * NECTAR_SCALE;
}

export function nectarOf(state: Pick<GameState, 'nectar'>): number {
  return nectarUnits(state.nectar);
}

/** Credits whole units up to the cap; returns the whole units that fitted. */
export function addNectar(s: GameState, units: number): number {
  const room = Math.max(0, nectarCap(s) - s.nectar);
  const got = Math.min(units * NECTAR_SCALE, room);
  s.nectar += got;
  return nectarUnits(got);
}

export function payNectar(s: GameState, units: number): void {
  s.nectar = Math.max(0, s.nectar - units * NECTAR_SCALE);
}

// --- Opening the orchard, and its seeds --------------------------------------------------------

/** The wormhole is open to this colony (the home colony with the technology). */
export function orchardOpen(state: GameState): boolean {
  return state.colony.index === 0 && hasTech(state, 'wormholes');
}

/** A launchpad high enough to go through the wormhole. */
export function wormholePads(state: GameState): Building[] {
  return state.buildings.filter((b) => b.type === 'launchpad' && b.level >= ORCHARD.padLevel);
}

/** Seed of what the drupelets hold in a local game (online games get the universe's secret). */
export function localOrchardSeed(state: Pick<GameState, 'seed' | 'face'>): string {
  return `${localAlienSeed(state)}/orchard`;
}

/** The public layout seed of a universe's orchard. */
export function universeOrchardSeed(universeSeed: string): string {
  return `${universeSeed}/orchard`;
}

/**
 * Gives a home colony its hidden seed (migrated games, or the universe's secret online); a
 * sister colony has none. True when something changed.
 */
export function ensureOrchard(state: GameState, secret: string, force = false): boolean {
  if (state.colony.index !== 0) {
    const had = state.orchardSeed !== undefined;
    delete state.orchardSeed;
    return had;
  }
  if (state.orchardSeed !== undefined && (!force || state.orchardSeed === secret)) return false;
  state.orchardSeed = secret;
  return true;
}

/** True when this side holds the truth of the orchard (solo, or the server). */
export function orchardKnown(state: GameState): boolean {
  return state.orchardSeed !== undefined;
}

/**
 * Sets the public layout of the orchard (a colony entering a universe meets the universe's
 * raspberry): what it knew of another layout is forgotten, its post and voyages come home.
 */
export function rebaseOrchard(s: GameState, seed: string): boolean {
  if (s.orchard.seed === seed) return false;
  forgetOrchard(s, seed);
  return true;
}

/**
 * Forgets the orchard (an imported save cannot be checked, a new layout): voyages in flight are
 * dropped (their crew is home at once), the post's kiwis come home, nothing is known any more.
 * The nectar stock stays (bounded by its cap).
 */
export function forgetOrchard(s: GameState, seed = s.orchard.seed): void {
  const flying = new Set(
    s.expeditions
      .filter((e) => (e.mission === 'visit' || e.mission === 'pillage') && e.status !== 'done')
      .map((e) => e.id),
  );
  s.expeditions = s.expeditions.filter((e) => !flying.has(e.id));
  for (const v of s.villagers)
    if (v.job.kind === 'post' || (v.job.kind === 'expedition' && flying.has(v.job.expeditionId)))
      v.job = { kind: 'idle' };
  s.orchard = newOrchard(seed);
}

function shuffled<T>(list: T[], rng: { int(min: number, max: number): number }): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
