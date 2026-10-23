import { takenKeys } from './footprint';
import type { ResourceId } from '../data/resources';
import { METEORS, THREATS } from '../data/threats';
import { hexKey } from '../hex/hex';
import type { TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import { seasonOf } from './calendar';
import { nest } from './selectors';
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
  for (const m of sky.meteors) next = Math.min(next, m.expiresAt);
  return next;
}

/** Plans the next fall (the first one a few hours after the start, then about one a day). */
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
      const free = map.tiles.filter(
        (t) =>
          (METEORS.tiles as readonly string[]).includes(t.type) &&
          t.rho >= 0.25 &&
          t.rho <= 0.92 &&
          !taken.has(hexKey(t)) &&
          !isFlooded(t, s.params.biome, season),
      );
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
    next.stock = meteorStock(s, next.at);
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
    });
  }
  for (const m of sky.meteors) {
    if (m.expiresAt !== at) continue;
    events.push({ type: 'meteorFaded', at, q: m.q, r: m.r, resource: m.resource });
    leaveWreck(s, m, at, events);
  }
  sky.meteors = sky.meteors.filter((m) => m.expiresAt > at);
}
