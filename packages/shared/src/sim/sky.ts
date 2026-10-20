import type { ResourceId } from '../data/resources';
import { CAMPS } from '../data/territory';
import { METEORS, THREATS } from '../data/threats';
import { hexDistance, hexKey } from '../hex/hex';
import type { TimeMs } from '../types/ids';
import type { GameEvent } from './advance';
import { seasonOf } from './calendar';
import { nest } from './selectors';
import { ageOf, techEffects } from './research';
import { leaveWreck } from './obstacles';
import { withThreatRng, type Building, type GameState, type Meteor } from './state';
import { baseHarvest, catchmentRadius, faceMapOf, isFlooded, type Harvest } from './territory';

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

/**
 * Harvest per hour taken from a crater: a camp standing on it picks it at the camp rate of its
 * resource; a producer of the same resource that reaches it takes a share of its base rate.
 * Both on top of their usual harvest, with the same staff, logistics and hour of the day.
 */
export function meteorRate(m: Meteor, harvests: readonly { b: Building; h: Harvest }[]): number {
  if (m.stock <= EPS) return 0;
  let rate = 0;
  for (const { b, h } of harvests) {
    if (h.status === 'flooded' || h.status === 'idle' || h.demand <= 0) continue;
    const base = baseHarvest(b, h.resource);
    if (base <= 0) continue;
    // Staff × logistics × cycle, per slot.
    const work = h.demand / base;
    if (b.type === 'camp') {
      if (b.q === m.q && b.r === m.r) rate += CAMPS.rates[m.resource] * work;
    } else if (h.resource === m.resource && hexDistance(b, m) <= catchmentRadius(b)) {
      rate += base * METEORS.producerShare * work;
    }
  }
  return rate;
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
        ...s.buildings.map((b) => hexKey(b)),
        ...s.queue.filter((i) => i.kind === 'build').map((i) => hexKey(i)),
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
