import { ALIEN_GEAR, ALIEN_MIX, CIV, CIV_AGE_COUNT, type AlienBuildingKind } from '../data/aliens';
import type { CivKeyKind } from '../data/aliens';
import { INTEL } from '../data/expeditions';
import { THREATS } from '../data/threats';
import { ENEMIES, type EnemyKind } from '../data/units';
import { GEAR_TIERS, type ItemId } from '../data/gear';
import { hexDistance } from '../hex/hex';
import { createRng, hashSeed } from '../rng/rng';
import type { TimeMs } from '../types/ids';
import { siegeTruth } from './siege';
import type { AlienGarrison, CivImpact, CivKey, CivState, GameState } from './state';

/**
 * Chantier 39: the alien civilisation. Everything is a pure function of the garrison's secret
 * seed, the time and the impacts recorded in `g.civ` (our burns and defeats): no step-by-step
 * simulation, exact offline. Only where the truth is held (the server online, the client in
 * solo) can these be read.
 */

const HOUR = 3_600_000;
const DAY_H = 24;
const SECTORS = INTEL.sectors;
const HALF = SECTORS / 2;
const round1 = (v: number) => Math.round(v * 10) / 10;

export const isInner = (sector: number): boolean => sector < HALF;
/** Slice of a parcel (0–5) and the parcel of the other ring in the same slice. */
export const sliceOf = (sector: number): number => sector % HALF;
export const otherRing = (sector: number): number => (sector + HALF) % SECTORS;

/** Neighbouring parcels: the other ring of the slice, the slices on each side in the same ring. */
export function neighbourSectors(sector: number): number[] {
  const ring = isInner(sector) ? 0 : HALF;
  const k = sliceOf(sector);
  return [otherRing(sector), ring + ((k + 1) % HALF), ring + ((k + HALF - 1) % HALF)];
}

/** Steps between two slices around the face (0–3). */
export function sliceGap(a: number, b: number): number {
  const d = Math.abs(sliceOf(a) - sliceOf(b));
  return Math.min(d, HALF - d);
}

// --- Shape of a face (memoized per seed) ---------------------------------------------------

interface CivShape {
  /** Garrison of each parcel at the start, as a multiple of the face's base defense. */
  weight: number[];
}

const shapes = new Map<string, CivShape>();

export function civShape(seed: string): CivShape {
  const cached = shapes.get(seed);
  if (cached) return cached;
  const rng = createRng(`${seed}/civ`);
  const outer = Array.from({ length: HALF }, () => rng.range(...CIV.outerSpread));
  const mean = outer.reduce((a, b) => a + b, 0) / HALF;
  const weight: number[] = [];
  for (let s = 0; s < HALF; s++) weight[s] = (outer[s]! / mean) * rng.range(...CIV.innerMultiple);
  for (let s = 0; s < HALF; s++) weight[HALF + s] = outer[s]! / mean;
  const shape = { weight };
  if (shapes.size > 256) shapes.clear();
  shapes.set(seed, shape);
  return shape;
}

// --- State -----------------------------------------------------------------------------------

/** A tie-breaker in [0, 1) that the player cannot guess (secret seed). */
export function civHash(seed: string, salt: string): number {
  return hashSeed(`${seed}/${salt}`)[0] / 2 ** 32;
}

/** Key buildings wanted at an age. */
export function keysWanted(age: number): Record<CivKeyKind, number> {
  const a = Math.max(0, Math.min(CIV_AGE_COUNT - 1, age));
  return { royal: 1, barracks: CIV.keys.barracks[a]!, store: CIV.keys.store[a]! };
}

/**
 * Exposure of each parcel as the AI sees it: 3 under a beacon, 2 next to one, 1 already seen by
 * our scouts, 0 hidden.
 */
export function exposureOf(beacons: readonly number[], seen: readonly number[]): number[] {
  const out = Array.from({ length: SECTORS }, () => 0);
  for (const s of seen) out[s] = Math.max(out[s]!, 1);
  for (const b of beacons) {
    for (const n of neighbourSectors(b)) out[n] = Math.max(out[n]!, 2);
    out[b] = 3;
  }
  return out;
}

/**
 * Where a key building goes: the least exposed free parcel, the centre first (the royal burrow
 * only there), far from the beacons, then the secret tie-breaker of the day.
 */
export function bestSector(
  seed: string,
  kind: CivKeyKind,
  keys: readonly CivKey[],
  exposure: readonly number[],
  beacons: readonly number[],
  salt: string,
): number | null {
  const taken = new Set(keys.map((k) => k.sector));
  let best: number | null = null;
  let bestScore = Infinity;
  for (let s = 0; s < SECTORS; s++) {
    if (taken.has(s) || exposure[s]! >= 3) continue;
    if (kind === 'royal' && !isInner(s)) continue;
    const far = beacons.length > 0 ? Math.min(...beacons.map((b) => sliceGap(s, b))) : HALF;
    const score =
      exposure[s]! * 10 + (isInner(s) ? 0 : 4) - far + civHash(seed, `${salt}/${kind}/${s}`);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Places the key buildings missing at an age (nothing seen, nothing moved). */
export function addMissingKeys(
  seed: string,
  keys: CivKey[],
  age: number,
  exposure: readonly number[],
  beacons: readonly number[],
  salt: string,
): void {
  const wanted = keysWanted(age);
  for (const kind of ['royal', 'barracks', 'store'] as const) {
    let have = keys.filter((k) => k.kind === kind).length;
    while (have < wanted[kind]) {
      const s = bestSector(seed, kind, keys, exposure, beacons, `${salt}/${have}`);
      if (s === null) break;
      keys.push({ kind, sector: s });
      have++;
    }
  }
}

/** A new civilisation (its royal burrow where the siege's queen lives, chantier 19). */
export function newCiv(seed: string, distance: number): CivState {
  const keys: CivKey[] = [{ kind: 'royal', sector: siegeTruth({ seed }).queenSector }];
  const none = Array.from({ length: SECTORS }, () => 0);
  addMissingKeys(seed, keys, civAgeOfHours(distance * CIV.leadPerDistanceH), none, [], 'd0');
  return {
    lead: distance * CIV.leadPerDistanceH,
    hours: 0,
    sectors: [...none],
    fights: [],
    keys,
    day: 0,
    log: [],
  };
}

/** The civilisation of a garrison (a fresh one for garrisons drawn before chantier 39). */
export function civOf(g: AlienGarrison): CivState {
  return g.civ ?? newCiv(g.seed, 0);
}

// --- Development -----------------------------------------------------------------------------

export function civAgeOfHours(hours: number): number {
  let age = 0;
  for (let a = 1; a < CIV.ageAtH.length; a++) if (hours >= CIV.ageAtH[a]!) age = a;
  return age;
}

/** Hours of development of the whole civilisation at a time. */
export function civHours(g: AlienGarrison, civ: CivState, at: TimeMs): number {
  return Math.max(0, Math.max(0, at - g.since) / HOUR + civ.lead + civ.hours);
}

/** Hours of development of one parcel (its burns set it back). */
export function sectorHours(g: AlienGarrison, civ: CivState, sector: number, at: TimeMs): number {
  return Math.max(0, civHours(g, civ, at) + (civ.sectors[sector] ?? 0));
}

/** Growth of a garrison with its development: age step × days. */
export function growthOfHours(hours: number): number {
  const age = civAgeOfHours(hours);
  return CIV.ageMultiple[age]! * (1 + CIV.perDay * Math.min(CIV.maxDays, hours / DAY_H));
}

/** Share of a parcel's garrison still missing after recent fights (0–1). */
export function fightLossAt(civ: CivState, sector: number, at: TimeMs): number {
  let lost = 0;
  for (const f of civ.fights) {
    if (f.sector !== sector || f.at > at) continue;
    lost += f.share * Math.max(0, 1 - (at - f.at) / CIV.rebuildMs);
  }
  return Math.min(0.9, lost);
}

export interface CivSector {
  sector: number;
  inner: boolean;
  age: number;
  /** Garrison power (same unit as the old defense: one ferret or bat = 1). */
  power: number;
}

export interface CivView {
  age: number;
  hours: number;
  sectors: CivSector[];
}

/** The civilisation at a time: its age and every parcel's garrison. */
export function civAt(g: AlienGarrison, at: TimeMs, civ: CivState = civOf(g)): CivView {
  const shape = civShape(g.seed);
  const hours = civHours(g, civ, at);
  const sectors: CivSector[] = [];
  for (let s = 0; s < SECTORS; s++) {
    const h = sectorHours(g, civ, s, at);
    sectors.push({
      sector: s,
      inner: isInner(s),
      age: civAgeOfHours(h),
      power: round1(
        g.defense * shape.weight[s]! * growthOfHours(h) * (1 - fightLossAt(civ, s, at)),
      ),
    });
  }
  return { age: civAgeOfHours(hours), hours, sectors };
}

/** Garrison of the outer ring as one number (the transition's raids fight the edge). */
export function outerPower(view: CivView): number {
  const outer = view.sectors.filter((s) => !s.inner);
  return round1(outer.reduce((a, s) => a + s.power, 0) / outer.length);
}

// --- Units and buildings -------------------------------------------------------------------

export interface AlienUnit {
  kind: EnemyKind;
  count: number;
  level: number;
  weapon?: ItemId;
  armor?: ItemId;
}

/** Gear tier of a parcel's aliens (index in `GEAR_TIERS`, -1: none). */
export function gearTierOf(age: number, inner: boolean): number {
  return Math.min(GEAR_TIERS.length - 1, inner ? age : age - 1);
}

/** The aliens of a parcel by kind, level and gear (for the battles of chantier 40). */
export function sectorUnits(sector: CivSector, ferretShare: number): AlienUnit[] {
  const level =
    CIV.level.base + CIV.level.perAge * sector.age + (sector.inner ? CIV.level.inner : 0);
  const tier = gearTierOf(sector.age, sector.inner);
  const out: AlienUnit[] = [];
  const add = (kind: EnemyKind, power: number) => {
    const count = Math.round(power / ENEMIES[kind].power);
    if (count <= 0) return;
    const gear = ALIEN_GEAR[kind];
    out.push({
      kind,
      count,
      level,
      ...(tier >= 0 && gear.weapon
        ? { weapon: `${gear.weapon}-${GEAR_TIERS[tier]}` as ItemId }
        : {}),
      ...(tier >= 0 && gear.armor ? { armor: `${gear.armor}-${GEAR_TIERS[tier]}` as ItemId } : {}),
    });
  };
  const ground = sector.power * ferretShare;
  for (const [kind, share] of Object.entries(ALIEN_MIX.ground))
    add(kind as EnemyKind, ground * share);
  const air = sector.power - ground;
  for (const [kind, share] of Object.entries(ALIEN_MIX.air)) add(kind as EnemyKind, air * share);
  return out;
}

export interface AlienBuilding {
  kind: AlienBuildingKind;
  sector: number;
  q: number;
  r: number;
}

/** A tile of a parcel, from a hash (water is skipped on screen, `landTileNear`). */
function spotIn(
  seed: string,
  sector: number,
  salt: string,
  taken: Set<string>,
): {
  q: number;
  r: number;
} {
  const rng = createRng(`${seed}/spot/${salt}`);
  const { min, max } = CIV.ring;
  const lo = isInner(sector) ? min : INTEL.innerRadius + 1;
  const hi = isInner(sector) ? INTEL.innerRadius : max;
  let last = { q: 0, r: 0 };
  for (let tries = 0; tries < 400; tries++) {
    const q = rng.int(-hi, hi);
    const r = rng.int(-hi, hi);
    const d = hexDistance({ q, r }, { q: 0, r: 0 });
    if (d < lo || d > hi || sectorOfHex(q, r) !== sector) continue;
    last = { q, r };
    if (taken.has(`${q},${r}`)) continue;
    taken.add(`${q},${r}`);
    return last;
  }
  return last;
}

/** Same as `sectorOf` in `aliens.ts` (kept here to avoid an import cycle). */
function sectorOfHex(q: number, r: number): number {
  const x = Math.sqrt(3) * (q + r / 2);
  const y = 1.5 * r;
  const angle = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
  const slice = Math.min(5, Math.floor(angle / (Math.PI / 3)));
  return (hexDistance({ q, r }, { q: 0, r: 0 }) <= INTEL.innerRadius ? 0 : HALF) + slice;
}

const ORDINARY: AlienBuildingKind[] = ['burrow', 'roost', 'workshop', 'totem'];

/** Every building of the face: the ordinary ones of each parcel and the standing key ones. */
export function civBuildings(
  g: AlienGarrison,
  civ: CivState,
  view: CivView,
  at: TimeMs,
): AlienBuilding[] {
  const out: AlienBuilding[] = [];
  const taken = new Set<string>();
  for (const k of civ.keys) {
    if (k.readyAt !== undefined && k.readyAt > at) continue;
    const index = civ.keys.filter((x) => x.kind === k.kind).indexOf(k);
    out.push({
      kind: k.kind,
      sector: k.sector,
      ...spotIn(g.seed, k.sector, `${k.kind}/${index}/${k.sector}`, taken),
    });
  }
  for (const s of view.sectors) {
    const count =
      CIV.buildings.base + CIV.buildings.perAge * s.age + (s.inner ? CIV.buildings.inner : 0);
    for (let i = 0; i < count; i++) {
      const roll = civHash(g.seed, `kind/${s.sector}/${i}`);
      // Dens and roosts follow the garrison's mix; workshops from the Stone age, totems at Iron.
      const kinds = ORDINARY.filter(
        (k) => (k !== 'workshop' || s.age >= 1) && (k !== 'totem' || s.age >= 2),
      );
      let kind: AlienBuildingKind;
      if (i === 0) kind = g.ferretShare >= 0.5 ? 'burrow' : 'roost';
      else if (kinds.length > 2 && roll < 0.35)
        kind = kinds[2 + (Math.floor(roll * 10) % (kinds.length - 2))]!;
      else kind = civHash(g.seed, `mix/${s.sector}/${i}`) < g.ferretShare ? 'burrow' : 'roost';
      out.push({
        kind,
        sector: s.sector,
        ...spotIn(g.seed, s.sector, `b/${s.sector}/${i}`, taken),
      });
    }
  }
  return out;
}

// --- Impacts ---------------------------------------------------------------------------------

const LOG = 12;

function log(civ: CivState, impact: CivImpact): void {
  civ.log.push(impact);
  if (civ.log.length > LOG) civ.log.splice(0, civ.log.length - LOG);
}

function pruneFights(civ: CivState, at: TimeMs): void {
  civ.fights = civ.fights.filter((f) => f.at + CIV.rebuildMs > at);
}

/** A fight in a parcel: the aliens lose part of its garrison (it regrows). */
export function recordFight(civ: CivState, sector: number, at: TimeMs, share: number): void {
  pruneFights(civ, at);
  if (share <= 0) return;
  civ.fights.push({ sector, at, share: Math.round(Math.min(1, share) * 100) / 100 });
}

/**
 * We burn a parcel: it loses hours of development (the civilisation a few), and its key
 * buildings burn (standing again after `CIV.burn.keyMs`, the royal burrow aside).
 */
export function recordBurn(civ: CivState, sector: number, at: TimeMs): number {
  const b = CIV.burn;
  const before = civ.sectors[sector] ?? 0;
  civ.sectors[sector] = Math.max(-b.maxSectorH, before - b.sectorH);
  const civBefore = civ.hours;
  civ.hours = Math.max(Math.min(civBefore, -b.maxCivH), civBefore - b.civH);
  for (const k of civ.keys) if (k.sector === sector && k.kind !== 'royal') k.readyAt = at + b.keyMs;
  const hours = civ.sectors[sector]! - before + (civ.hours - civBefore);
  log(civ, { at, kind: 'burn', sector, hours });
  return hours;
}

/** One of our crews lost: the civilisation feeds on it (food, ship parts, gear). */
export function recordDefeat(civ: CivState, at: TimeMs, dead: number, sector?: number): number {
  const d = CIV.defeat;
  const before = civ.hours;
  const gain = d.civH + d.perKiwiH * Math.max(0, dead);
  civ.hours = Math.max(before, Math.min(d.maxCivH, before + gain));
  const hours = civ.hours - before;
  log(civ, { at, kind: 'defeat', ...(sector !== undefined ? { sector } : {}), hours });
  return hours;
}

/** Barracks standing at a time (not burnt, not under one of our beacons). */
export function standingBarracks(civ: CivState, at: TimeMs, beacons: readonly number[]): CivKey[] {
  return civ.keys.filter(
    (k) =>
      k.kind === 'barracks' &&
      (k.readyAt === undefined || k.readyAt <= at) &&
      !beacons.includes(k.sector),
  );
}

// --- The AI that hides (chantier 39, part 2) --------------------------------------------------

/** Index of the game day of a time, counted from the civilisation's start. */
export function civDay(g: AlienGarrison, at: TimeMs): number {
  return Math.max(0, Math.floor((at - g.since) / CIV.tickMs));
}

/**
 * What the AI sees of us on a face: our beacons (the bridgeheads of the twin until chantier 40)
 * and the parcels our scouts have seen.
 */
export function civEyes(
  state: Pick<GameState, 'targets' | 'intel' | 'siege'>,
  targetId: string,
): { beacons: number[]; seen: number[]; royalSeen: boolean } {
  const twin = state.targets.find((t) => t.distance === 0)?.id === targetId;
  const intel = state.intel[targetId];
  return {
    beacons: twin ? state.siege.bridgeheads.map((b) => b.sector) : [],
    seen: intel?.sectors ?? [],
    royalSeen: !!intel?.siege?.queen,
  };
}

/**
 * The daily look at the map: key buildings exposed by a beacon (on it or next to it) move to a
 * hidden free parcel when there is one; burnt ones are rebuilt in the best place; new ones come
 * with the age, where we have seen least. The royal burrow stays put once seen.
 */
export function planCiv(
  g: AlienGarrison,
  civ: CivState,
  at: TimeMs,
  eyes: { beacons: readonly number[]; seen: readonly number[]; royalSeen: boolean },
): void {
  const day = civDay(g, at);
  civ.day = day;
  if (eyes.royalSeen) civ.royalSeen = true;
  const exposure = exposureOf(eyes.beacons, eyes.seen);
  const salt = `d${day}`;
  for (const k of civ.keys) {
    if (k.kind === 'royal' && civ.royalSeen) continue;
    const burnt = k.readyAt !== undefined && k.readyAt > at;
    if (exposure[k.sector]! < 2 && !burnt) continue;
    const others = civ.keys.filter((x) => x !== k);
    const to = bestSector(g.seed, k.kind, others, exposure, eyes.beacons, `${salt}/move`);
    if (to === null || to === k.sector) continue;
    if (!burnt && exposure[to]! >= exposure[k.sector]!) continue;
    k.sector = to;
  }
  addMissingKeys(g.seed, civ.keys, civAt(g, at, civ).age, exposure, eyes.beacons, salt);
}

/** Next daily look of any civilisation of the state (Infinity without the truth). */
export function nextCivEvent(s: GameState): TimeMs {
  let next = Infinity;
  if (!s.aliens) return next;
  for (const t of s.targets) {
    const g = s.aliens[t.id];
    if (!g?.civ || (t.distance === 0 && s.siege.conqueredAt > 0)) continue;
    next = Math.min(next, g.since + (g.civ.day + 1) * CIV.tickMs);
  }
  return Math.max(s.now, next);
}

export function civTick(s: GameState, at: TimeMs): void {
  if (!s.aliens) return;
  for (const t of s.targets) {
    const g = s.aliens[t.id];
    if (!g?.civ || (t.distance === 0 && s.siege.conqueredAt > 0)) continue;
    if (g.since + (g.civ.day + 1) * CIV.tickMs > at) continue;
    planCiv(g, g.civ, at, civEyes(s, t.id));
  }
}

// --- Its waves against us (chantier 39, part 3) -----------------------------------------------

/** The civilisation that sends us its waves: the one of our twin face, while it is alien. */
export function waveCivTarget(state: GameState): string | null {
  if (state.colony.index !== 0 || state.siege.conqueredAt > 0) return null;
  return state.targets.find((t) => t.distance === 0)?.id ?? null;
}

/** True when this state can announce its next wave (the truth is held, or no civilisation). */
export function canAnnounceWave(state: GameState): boolean {
  const id = waveCivTarget(state);
  return id === null || !!state.aliens?.[id];
}

export interface CivWave {
  /** × wave power: development days × barracks standing × age of the civilisation. */
  factor: number;
  /** Parcel the wave comes from (null without a civilisation). */
  origin: number | null;
}

/**
 * Power of the civilisation's waves at a time. Without a civilisation (a sister colony, a
 * twin held by a friend, a conquered face) the old rule: days of play and provocation.
 */
export function civWave(state: GameState, at: TimeMs, waveId: string): CivWave {
  const id = waveCivTarget(state);
  const g = id ? state.aliens?.[id] : undefined;
  if (!g) {
    const days = Math.min(THREATS.maxDays, Math.max(0, (at - state.createdAt) / (DAY_H * HOUR)));
    const victories = Object.values(state.victories).reduce((a, b) => a + b, 0);
    const provocation = Math.min(THREATS.maxProvocation, THREATS.perVictory * victories);
    return { factor: (1 + THREATS.perDay * days) * (1 + provocation), origin: null };
  }
  const civ = civOf(g);
  const view = civAt(g, at, civ);
  const beacons = state.siege.bridgeheads.map((b) => b.sector);
  const standing = standingBarracks(civ, at, beacons);
  const wanted = keysWanted(view.age).barracks;
  const barracks =
    CIV.barracksFloor + (1 - CIV.barracksFloor) * Math.min(1, standing.length / wanted);
  const time = 1 + THREATS.perDay * Math.min(THREATS.maxDays, view.hours / DAY_H);
  const roll = civHash(g.seed, `wave/${waveId}`);
  let origin: number;
  if (standing.length > 0) origin = standing[Math.floor(roll * standing.length)]!.sector;
  else {
    // No barracks left: the strongest parcel we do not hold sends what it can.
    const free = view.sectors.filter((s) => !beacons.includes(s.sector));
    origin = (free.length > 0 ? free : view.sectors).reduce((a, b) =>
      b.power > a.power ? b : a,
    ).sector;
  }
  return { factor: time * barracks * (CIV.waveAge[view.age] ?? 1), origin };
}

// --- The old missions on the civilisation (chantier 39, part 4; chantier 40 replaces them) ---

/** The civilisation of a garrison, created in place when missing (for recording impacts). */
export function liveCiv(g: AlienGarrison): CivState {
  g.civ ??= newCiv(g.seed, 0);
  return g.civ;
}

/** Parcel of the royal burrow (the queen's lair of the siege). */
export function royalSector(g: AlienGarrison): number {
  return civOf(g).keys.find((k) => k.kind === 'royal')?.sector ?? siegeTruth(g).queenSector;
}

/** Growth of a parcel's garrison since the start (age step × days). */
export function sectorGrowth(g: AlienGarrison, sector: number, at: TimeMs): number {
  return growthOfHours(sectorHours(g, civOf(g), sector, at));
}

/**
 * Hours of development on the common schedule, without our impacts: what anybody can work out
 * from the public rule (used to age our reports).
 */
export function scheduleHours(
  state: Pick<GameState, 'createdAt'>,
  distance: number,
  at: TimeMs,
): number {
  return Math.max(0, (at - state.createdAt) / HOUR) + distance * CIV.leadPerDistanceH;
}

/** How much a garrison may have grown between two times, on the common schedule. */
export function scheduleGrowth(
  state: Pick<GameState, 'createdAt'>,
  distance: number,
  from: TimeMs,
  to: TimeMs,
): number {
  const a = growthOfHours(scheduleHours(state, distance, from));
  const b = growthOfHours(scheduleHours(state, distance, Math.max(from, to)));
  return b / a;
}

/** The outer parcel a raid lands on (one we do not hold), from a secret tie-breaker. */
export function raidSector(g: AlienGarrison, salt: string, held: readonly number[]): number {
  const outer = Array.from({ length: HALF }, (_, i) => HALF + i);
  const free = outer.filter((s) => !held.includes(s));
  const pool = free.length > 0 ? free : outer;
  return pool[Math.floor(civHash(g.seed, `raid/${salt}`) * pool.length)]!;
}

/** Dens and roosts seen in some parcels (the twin's 3D shows them, chantier 07). */
export function seenStructures(
  g: AlienGarrison,
  at: TimeMs,
  sectors: readonly number[],
): { kind: 'den' | 'roost'; q: number; r: number }[] {
  const visible = new Set(sectors);
  const civ = civOf(g);
  return civBuildings(g, civ, civAt(g, at, civ), at)
    .filter((b) => visible.has(b.sector) && (b.kind === 'burrow' || b.kind === 'roost'))
    .map((b) => ({
      kind: b.kind === 'burrow' ? ('den' as const) : ('roost' as const),
      q: b.q,
      r: b.r,
    }));
}

// --- What the client may know (chantier 39, part 5) -------------------------------------------

export interface CivEstimate {
  targetId: string;
  /** Age seen by our last report (null: never seen). */
  seenAge: number | null;
  seenAt: TimeMs | null;
  /** Age it has probably reached by now on the common schedule (delays we saw kept). */
  likelyAge: number;
  /** When it probably reaches its next age (null at the last one). */
  nextAgeAt: TimeMs | null;
  /** Parcel of the announced wave, if any. */
  waveFrom: number | null;
}

/**
 * The civilisation of our twin as far as we can tell: the age our scouts saw, aged on the
 * public schedule, and where the announced wave comes from. Public data only (works online).
 */
export function civEstimate(state: GameState, now: TimeMs): CivEstimate | null {
  const id = waveCivTarget(state);
  if (id === null) return null;
  const target = state.targets.find((t) => t.id === id)!;
  const report = state.intel[id];
  const seenAge = report?.civAge ?? null;
  const seenAt = seenAge !== null ? report!.at : null;
  // A civilisation seen younger than the schedule says was held back by that much at least.
  let delay = 0;
  if (seenAge !== null && seenAt !== null) {
    const next = CIV.ageAtH[seenAge + 1];
    const then = scheduleHours(state, target.distance, seenAt);
    if (next !== undefined && then >= next) delay = then - next + 1 / 60;
  }
  const hours = Math.max(0, scheduleHours(state, target.distance, now) - delay);
  const likelyAge = Math.max(seenAge ?? 0, civAgeOfHours(hours));
  const nextH = CIV.ageAtH[likelyAge + 1];
  const w = state.threats.next;
  return {
    targetId: id,
    seenAge,
    seenAt,
    likelyAge,
    nextAgeAt: nextH === undefined ? null : now + Math.max(0, nextH - hours) * HOUR,
    waveFrom: w?.announced && w.origin !== undefined ? w.origin : null,
  };
}
