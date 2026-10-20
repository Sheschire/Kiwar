import { levelDef } from '../data/buildings';
import { CYCLES } from '../data/cycles';
import { KIWI } from '../data/kiwis';
import { MORALE, REST } from '../data/needs';
import { hexKey, type Hex } from '../hex/hex';
import type { FaceMap } from '../worldgen/generateFace';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { calendarAt, seasonOf } from './calendar';
import { hungerStage } from './needs';
import { mayorMorale, modifiers } from './kiwis';
import type { Building, GameState, Villager } from './state';
import { distanceIn, faceMapOf, walkDistances } from './territory';

/** Where a kiwi sleeps: a home with a free bed (null: outside) and the walk from its work. */
export interface Bed {
  buildingId: BuildingId | null;
  distance: number;
}

/** Walking distance used when no path leads from the work to the bed. */
const UNREACHABLE = 12;

/** Tile where a kiwi spends its day (its workplace, building site, School or the Nest). */
export function workSite(state: GameState, v: Villager): Hex | null {
  const job = v.job;
  const at = (id: BuildingId) => state.buildings.find((b) => b.id === id) ?? null;
  if (job.kind === 'work') return at(job.buildingId);
  if (job.kind === 'train') return at(job.schoolId);
  if (job.kind === 'build') return state.queue.find((i) => i.id === job.queueItemId) ?? null;
  if (job.kind === 'expedition') return null;
  return state.buildings.find((b) => b.type === 'nest') ?? null;
}

function homes(state: GameState): { b: Building; beds: number }[] {
  return state.buildings
    .map((b) => ({ b, beds: levelDef(b.type, b.level)?.housing ?? 0 }))
    .filter((h) => h.beds > 0);
}

const bedCache = new Map<string, Map<VillagerId, Bed>>();

/**
 * Beds of the kiwis at home: workers first (in colony order), each takes the free bed nearest
 * to its work; kiwis left without a bed sleep outside. Memoized on the layout and the jobs.
 */
export function bedsOf(state: GameState, map: FaceMap = faceMapOf(state)): Map<VillagerId, Bed> {
  // Cheap key (called for every producer at every event): homes, jobs, paths and season.
  // Building and queue item positions never change, so ids stand for the work sites.
  let key = `${state.seed}|${state.face}|${seasonOf(state)}|`;
  for (const b of state.buildings) {
    const beds = levelDef(b.type, b.level)?.housing ?? 0;
    if (beds > 0) key += `${b.id}:${beds};`;
  }
  key += '|';
  for (const v of state.villagers) {
    const j = v.job;
    key +=
      j.kind === 'work'
        ? `${v.id}w${j.buildingId};`
        : j.kind === 'build'
          ? `${v.id}b${j.queueItemId};`
          : j.kind === 'train'
            ? `${v.id}t${j.schoolId};`
            : j.kind === 'idle'
              ? `${v.id}i;`
              : j.kind === 'guard'
                ? `${v.id}g;`
                : j.kind === 'injured'
                  ? `${v.id}h;`
                  : '';
  }
  key += `|${state.paths.join(';')}`;
  const cached = bedCache.get(key);
  if (cached) return cached;

  const houses = homes(state);
  const kiwis = state.villagers.filter((v) => v.job.kind !== 'expedition');
  const workers = [
    ...kiwis.filter((v) => v.job.kind !== 'idle'),
    ...kiwis.filter((v) => v.job.kind === 'idle'),
  ];
  const sites = workers.map((v) => workSite(state, v));
  const dists = houses.map((h) => walkDistances(state, map, [hexKey(h.b)]));
  const free = houses.map((h) => h.beds);
  const out = new Map<VillagerId, Bed>();
  workers.forEach((v, i) => {
    const site = sites[i];
    let best = -1;
    let bestD = Infinity;
    for (let h = 0; h < houses.length; h++) {
      if (free[h]! <= 0) continue;
      const d = site ? distanceIn(dists[h]!, site) : 0;
      const dd = Number.isFinite(d) ? d : UNREACHABLE;
      if (best < 0 || dd < bestD) {
        best = h;
        bestD = dd;
      }
    }
    if (best < 0) out.set(v.id, { buildingId: null, distance: 0 });
    else {
      free[best]!--;
      out.set(v.id, { buildingId: houses[best]!.b.id, distance: bestD });
    }
  });
  if (bedCache.size >= 32) bedCache.delete(bedCache.keys().next().value!);
  bedCache.set(key, out);
  return out;
}

/** Share of its rest a kiwi needs (before the walk to bed). */
export function restNeed(state: GameState, v: Villager, bed: Bed | undefined): number {
  const endurance = Math.max(0.4, 1 - REST.endurance * (v.stats.endurance - KIWI.stat.average));
  const outside = !bed || bed.buildingId === null ? REST.noBed : 1;
  return REST.base * REST.season[seasonOf(state)] * endurance * outside * modifiers(v).rest;
}

/** Share of the day (night aside) a kiwi spends at work: its rest and the walk to bed. */
export function presence(state: GameState, v: Villager, bed = bedsOf(state).get(v.id)): number {
  const walk = 1 + REST.commute * (bed?.distance ?? 0);
  return Math.max(REST.minPresence, 1 - restNeed(state, v, bed) * walk);
}

export interface Morale {
  /** Total work bonus (−max..+max). */
  total: number;
  food: number;
  comfort: number;
  /** The mayor's Charisma and Organisation. */
  mayor: number;
  speech: number;
  mourning: number;
  season: number;
}

/** Colony morale and what makes it. */
export function moraleOf(state: GameState, beds = bedsOf(state)): Morale {
  const food = hungerStage(state) === 'fed' ? MORALE.fed : MORALE.hungry;
  const comfort = comfortOf(state, beds);
  const speech = state.speechUntil > state.now ? MORALE.speech : 0;
  const mourning = state.mourningUntil > state.now ? MORALE.mourning : 0;
  const season = MORALE.season[seasonOf(state)];
  const mayor = mayorMorale(state);
  const sum = food + comfort + mayor + speech + mourning + season;
  const total = Math.max(-MORALE.max, Math.min(MORALE.max, sum));
  return { total, food, comfort, mayor, speech, mourning, season };
}

const comfortCache = new WeakMap<Map<VillagerId, Bed>, number>();

/** Beds near the work (memoized per bed plan, which already depends on the jobs). */
function comfortOf(state: GameState, beds: Map<VillagerId, Bed>): number {
  const cached = comfortCache.get(beds);
  if (cached !== undefined) return cached;
  let workers = 0;
  let near = 0;
  for (const v of state.villagers) {
    if (v.job.kind !== 'work') continue;
    workers++;
    if ((beds.get(v.id)?.distance ?? Infinity) <= MORALE.near) near++;
  }
  const comfort = workers > 0 ? MORALE.comfort * ((2 * near) / workers - 1) : 0;
  comfortCache.set(beds, comfort);
  return comfort;
}

export function moraleWork(state: GameState, beds = bedsOf(state)): number {
  return 1 + moraleOf(state, beds).total;
}

// ---------------------------------------------------------------------------------------------
// Cosmetic rhythm (fatigue gauge, 3D kiwis going to bed): a deterministic function of time.

export type KiwiRhythm = 'work' | 'rest' | 'sleep';

function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  // Final avalanche: ids differ by one character (v1, v2…).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

/**
 * What a kiwi is doing at time `t` and its fatigue (0–1): at night most kiwis sleep (as many
 * as the night work cut); by day each kiwi alternates work and rest in the proportion of its
 * presence.
 */
export function kiwiRhythm(
  state: GameState,
  v: Villager,
  t: TimeMs,
): { rhythm: KiwiRhythm; fatigue: number } {
  const seed = phaseOf(v.id);
  const c = calendarAt(state.calendarStart, t);
  // Early birds always sleep at night (they rest less by day).
  if (c.night && (seed < 1 - CYCLES.nightWork || v.trait === 'earlyBird')) {
    const slept = (t - c.nightAt) / Math.max(1, c.dawnAt - c.nightAt);
    return { rhythm: 'sleep', fatigue: Math.max(0.05, 0.6 - 0.55 * slept) };
  }
  const p = presence(state, v);
  const x = (((t + seed * REST.cycleMs) % REST.cycleMs) + REST.cycleMs) % REST.cycleMs;
  const k = x / REST.cycleMs;
  if (k < p) return { rhythm: 'work', fatigue: 0.15 + 0.75 * (k / p) };
  return { rhythm: 'rest', fatigue: 0.9 - 0.75 * ((k - p) / (1 - p)) };
}
