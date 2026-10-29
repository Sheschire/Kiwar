import { takenKeys } from './footprint';
import type { ResourceId } from '../data/resources';
import { IRON, IRON_SCALE, ironUnits } from '../data/iron';
import { METEORS, THREATS } from '../data/threats';
import { hexKey } from '../hex/hex';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import { seasonOf } from './calendar';
import { capacity, nest } from './selectors';
import { ironCap } from './iron';
import { ageOf, techEffects } from './research';
import { leaveWreck } from './obstacles';
import { withThreatRng, type GameState, type Meteor, type Villager } from './state';
import {
  cycleHarvest,
  depotDistance,
  faceMapOf,
  isFlooded,
  logisticsEfficiency,
} from './territory';
import { crewWork, workerPower } from './kiwis';

const DAY = 24 * 3_600_000;
const EPS = 1e-6;

/** Stock of a meteorite falling at `at`: colony size × play time, like the threats. */
export function meteorStock(state: GameState, at: TimeMs): number {
  const f = METEORS.nestFactor;
  const factor = f[Math.min(nest(state).level, f.length - 1)] ?? 1;
  const age = METEORS.ageFactor[ageOf(state)] ?? 1;
  const days = Math.min(THREATS.maxDays, Math.max(0, (at - state.createdAt) / DAY));
  const tech = techEffects(state).meteorStock;
  return Math.round(METEORS.stock * factor * age * tech * (1 + METEORS.perDay * days));
}

/** Iron in a crater falling now (raw units, whole units × the age and `starIron`). */
export function craterIron(state: GameState): number {
  const age = METEORS.ageFactor[ageOf(state)] ?? 1;
  return Math.round(IRON.crater * age * techEffects(state).meteorStock) * IRON_SCALE;
}

/**
 * Raw iron units per ms dug from a crater: an integer (small steps add up exactly like a big
 * one), with the same multipliers as its resource (miners' work, walk to the depot, hour and
 * season, drill). 0 once empty or when the iron stock is full.
 */
export function meteorIronRate(state: GameState, m: Meteor): number {
  if (m.iron <= 0 || state.meteorIron >= ironCap(state)) return 0;
  const miners = minersOf(state, m.id);
  if (miners.length === 0) return 0;
  const work = crewWork(state, miners, m.resource);
  if (work <= 0) return 0;
  const map = faceMapOf(state);
  const f =
    work *
    logisticsEfficiency(depotDistance(state, map, m)) *
    cycleHarvest(state, m.resource) *
    drillFactor(state);
  if (f <= 0) return 0;
  return Math.max(1, Math.round(1000 * IRON.perHour * f));
}

/** Iron per hour dug by the whole colony right now (units, for the UI). */
export function meteorIronPerHour(state: GameState): number {
  let rate = 0;
  for (const m of state.sky.meteors) rate += meteorIronRate(state, m);
  return (rate * 3_600_000) / IRON_SCALE;
}

/**
 * Whether a crater is worth its miners: iron left with room in the iron stock, or some of its
 * resource left below the storage cap ("at the cap" changes only at events: exact offline).
 */
export function craterWorth(state: GameState, m: Meteor, cap = capacity(state)): boolean {
  if (m.iron > 0 && state.meteorIron < ironCap(state)) return true;
  return m.stock > EPS && state.resources[m.resource] < cap[m.resource] - EPS;
}

/**
 * Digs `dtMs` of iron from the craters at the rates of the interval's start (read before any
 * stock moved: integer units, clamped by each crater's stock and the cap).
 */
export function accrueIron(
  s: GameState,
  rates: readonly { m: Meteor; rate: number }[],
  dtMs: number,
  at: TimeMs,
  events: GameEvent[],
): void {
  const cap = ironCap(s);
  const before = s.meteorIron;
  for (const { m, rate } of rates) {
    const take = Math.min(rate * dtMs, m.iron, cap - s.meteorIron);
    if (take <= 0) continue;
    m.iron -= take;
    s.meteorIron += take;
  }
  if (before < cap && s.meteorIron >= cap) events.push({ type: 'ironFull', at });
}

/** Kiwis harvesting a crater (chantier 15). */
export function minersOf(state: GameState, meteorId: string): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'meteor' && v.job.meteorId === meteorId);
}

/** Harvest multiplier of the meteorite drill (1 without the technology). */
export function drillFactor(state: GameState): number {
  if (!techEffects(state).meteorDrill) return 1;
  const d = METEORS.drill;
  return d[Math.min(ageOf(state), d.length - 1)] ?? 1;
}

/**
 * Harvest per hour taken from a crater (chantier 15: a temporary post): the rate of its
 * resource × the miners' power × the walk to the nearest depot × the hour and season × the
 * drill. No climate: a gift from the sky. 0 once empty.
 */
export function meteorRate(state: GameState, m: Meteor): number {
  if (m.stock <= EPS) return 0;
  const miners = minersOf(state, m.id);
  if (miners.length === 0) return 0;
  const work = crewWork(state, miners, m.resource);
  if (work <= 0) return 0;
  const map = faceMapOf(state);
  const efficiency = logisticsEfficiency(depotDistance(state, map, m));
  return (
    METEORS.rates[m.resource] *
    work *
    efficiency *
    cycleHarvest(state, m.resource) *
    drillFactor(state)
  );
}

/**
 * The crew "send the best" picks for a crater: the miners already there, then the kiwis with
 * the most power for its resource (Dexterity and mastery; idle ones first on ties; locked
 * kiwis are never borrowed).
 */
export function bestMeteorCrew(state: GameState, meteorId: string): VillagerId[] {
  const m = state.sky.meteors.find((x) => x.id === meteorId);
  if (!m) return [];
  const here = minersOf(state, meteorId).map((v) => v.id);
  const others = state.villagers
    .map((v, i) => ({ v, i }))
    .filter(
      ({ v }) => canMine(v) && v.job.kind !== 'meteor' && (v.job.kind === 'idle' || !v.locked),
    )
    .sort(
      (a, b) =>
        workerPower(b.v, m.resource) - workerPower(a.v, m.resource) ||
        Number(b.v.job.kind === 'idle') - Number(a.v.job.kind === 'idle') ||
        a.i - b.i,
    )
    .map(({ v }) => v.id);
  return [...here, ...others].slice(0, METEORS.slots);
}

/** Who can be sent to a crater: kiwis at home, at work or picking (not the Kikiwiwis). */
export function canMine(v: Villager): boolean {
  if (v.kikiwiwi) return false;
  return (
    v.job.kind === 'idle' ||
    v.job.kind === 'work' ||
    v.job.kind === 'stardust' ||
    v.job.kind === 'meteor'
  );
}

/** The crater on a tile, if any. */
export function meteorAt(state: GameState, q: number, r: number): Meteor | undefined {
  return state.sky.meteors.find((m) => m.q === q && m.r === r);
}

/** Next shooting star, impact or crater fading away. */
export function nextSkyEvent(state: GameState): TimeMs {
  const sky = state.sky;
  let next = Infinity;
  if (sky.next) next = sky.next.announced ? sky.next.at : sky.next.announceAt;
  let total = 0;
  for (const m of sky.meteors) {
    next = Math.min(next, m.expiresAt);
    // Chantier 38: a crater running out of iron, the iron stock filling up.
    const rate = meteorIronRate(state, m);
    if (rate <= 0) continue;
    total += rate;
    next = Math.min(next, state.now + Math.max(1, Math.ceil(m.iron / rate)));
  }
  if (total > 0) {
    const room = ironCap(state) - state.meteorIron;
    next = Math.min(next, state.now + Math.max(1, Math.ceil(room / total)));
  }
  return next;
}

/** Plans the next fall (the first one a few hours after the start, then about two a day). */
export function planMeteor(s: GameState): void {
  const sky = s.sky;
  if (sky.next) return;
  withThreatRng(s, (rng) => {
    const gap = Math.round(rng.range(METEORS.intervalMs[0], METEORS.intervalMs[1]));
    const earliest = sky.falls === 0 ? s.createdAt + METEORS.firstMs : sky.lastFallAt + gap;
    const at = Math.max(earliest, s.now + METEORS.noticeMs);
    sky.next = {
      id: `m${sky.falls + 1}`,
      announceAt: at - METEORS.noticeMs,
      at,
      announced: false,
      q: 0,
      r: 0,
      resource: 'seeds',
      stock: 0,
      iron: 0,
    };
  });
}

export function skyTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const sky = s.sky;
  const next = sky.next;
  if (next && !next.announced && next.announceAt === at) {
    // The shooting star: where it will land and what it carries.
    const spot = withThreatRng(s, (rng) => {
      const map = faceMapOf(s);
      const season = seasonOf(s);
      const taken = new Set([
        ...takenKeys(s),
        ...sky.meteors.map((m) => hexKey(m)),
        ...s.obstacles.map((o) => hexKey(o)),
      ]);
      const open = map.tiles.filter(
        (t) =>
          t.rho >= 0.25 &&
          t.rho <= 0.92 &&
          !taken.has(hexKey(t)) &&
          !isFlooded(t, s.params.biome, season),
      );
      // Chantier 38 (no blocked game): a crowded colony still gets its iron on any free tile.
      const preferred = open.filter((t) => (METEORS.tiles as readonly string[]).includes(t.type));
      const free = preferred.length > 0 ? preferred : open.filter((t) => t.type !== 'heart');
      const weights = Object.entries(METEORS.resources) as [ResourceId, number][];
      let roll = rng.next() * weights.reduce((sum, [, w]) => sum + w, 0);
      let resource = weights[0]![0];
      for (const [id, w] of weights) {
        roll -= w;
        if (roll < 0) {
          resource = id;
          break;
        }
      }
      return { tile: free.length > 0 ? rng.pick(free) : null, resource };
    });
    if (!spot.tile) {
      // Nowhere to land: the star burns up (a new one is planned).
      sky.next = null;
      sky.lastFallAt = next.at;
      return;
    }
    next.announced = true;
    next.q = spot.tile.q;
    next.r = spot.tile.r;
    next.resource = spot.resource;
    next.stock = Math.round(meteorStock(s, next.at) * IRON.resourceShare);
    next.iron = craterIron(s);
    events.push({
      type: 'meteorAnnounced',
      at,
      strikeAt: next.at,
      q: next.q,
      r: next.r,
      resource: next.resource,
    });
  }
  if (next && next.announced && next.at === at) {
    if (sky.meteors.length >= METEORS.max) {
      const old = sky.meteors.shift()!;
      leaveWreck(s, old, at, events);
    }
    sky.meteors.push({
      id: next.id,
      q: next.q,
      r: next.r,
      resource: next.resource,
      stock: next.stock,
      max: next.stock,
      iron: next.iron,
      ironMax: next.iron,
      landedAt: at,
      expiresAt: at + METEORS.lifeMs,
    });
    sky.falls++;
    sky.lastFallAt = at;
    sky.next = null;
    events.push({
      type: 'meteorLanded',
      at,
      q: next.q,
      r: next.r,
      resource: next.resource,
      stock: next.stock,
      iron: ironUnits(next.iron),
    });
  }
  for (const m of sky.meteors) {
    if (m.expiresAt !== at) continue;
    events.push({ type: 'meteorFaded', at, q: m.q, r: m.r, resource: m.resource });
    leaveWreck(s, m, at, events);
  }
  sky.meteors = sky.meteors.filter((m) => m.expiresAt > at);
}
