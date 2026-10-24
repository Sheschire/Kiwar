import { levelDef } from '../data/buildings';
import { CYCLES } from '../data/cycles';
import { KIWI } from '../data/kiwis';
import { MORALE, REST, type MemoryKind } from '../data/needs';
import { hexKey, type Hex } from '../hex/hex';
import type { FaceMap } from '../worldgen/generateFace';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { calendarAt, seasonOf } from './calendar';
import { hungerStage } from './needs';
import { bardMorale, mayorMorale, modifiers } from './kiwis';
import { ageOf } from './research';
import { inLine } from '../data/classes';
import type { Building, GameState, Villager } from './state';
import { terraformKey, distanceIn, faceMapOf, pathsKey, walkDistances } from './territory';

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
  if (job.kind === 'transform') return at(job.labId);
  if (job.kind === 'titan') return { q: job.q, r: job.r };
  if (job.kind === 'stardust')
    return state.comets.patches.find((p) => p.id === job.patchId) ?? null;
  if (job.kind === 'meteor') return state.sky.meteors.find((m) => m.id === job.meteorId) ?? null;
  if (job.kind === 'build') return state.queue.find((i) => i.id === job.queueItemId) ?? null;
  if (job.kind === 'expedition' || job.kind === 'outpost') return null;
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
  let key = `${state.seed}|${state.face}|${terraformKey(state)}|${seasonOf(state)}|`;
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
                  : j.kind === 'transform'
                    ? `${v.id}x${j.labId};`
                    : j.kind === 'titan'
                      ? `${v.id}T${j.q},${j.r};`
                      : j.kind === 'stardust'
                        ? `${v.id}d${j.patchId};`
                        : j.kind === 'meteor'
                          ? `${v.id}m${j.meteorId};`
                          : '';
  }
  key += `|${pathsKey(state.paths)}`;
  const cached = bedCache.get(key);
  if (cached) return cached;

  const houses = homes(state);
  const kiwis = state.villagers.filter(
    (v) => v.job.kind !== 'expedition' && v.job.kind !== 'outpost',
  );
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

/** Chantier 43: what the whole colony shares in the morale of its kiwis (points). */
export interface ColonyMood {
  /** The age's base. */
  base: number;
  food: number;
  season: number;
  /** The mayor's Charisma and Organisation. */
  mayor: number;
  /** Chantier 37: the bards at home. */
  bards: number;
  speech: number;
  /** Sum of the parts above. */
  sum: number;
}

/** The colony's common morale points (constant between two events). */
export function colonyMood(state: GameState): ColonyMood {
  const base = MORALE.base[Math.min(MORALE.base.length - 1, ageOf(state))]!;
  const food = hungerStage(state) === 'fed' ? MORALE.fed : MORALE.hungry;
  const season = MORALE.season[seasonOf(state)];
  const mayor = mayorMorale(state) * MORALE.points;
  const bards = bardMorale(state) * MORALE.points;
  const speech = state.speechUntil > state.now ? MORALE.speech : 0;
  return {
    base,
    food,
    season,
    mayor,
    bards,
    speech,
    sum: base + food + season + mayor + bards + speech,
  };
}

/** Chantier 43: one kiwi's morale (0–100) and what makes it. */
export interface KiwiMorale {
  total: number;
  /** The colony's common part. */
  colony: number;
  /** Its bed: near its work, or none. */
  bed: number;
  /** Its trait and its class. */
  temper: number;
  /** Its memories (mourning…). */
  memories: number;
}

/** Points of a kiwi's bed: near its work (+), outside (−). */
function bedPoints(bed: Bed | undefined): number {
  if (!bed) return 0;
  // A kiwi without a bed sleeps outside: never "near its work" (chantier 12 fix).
  if (bed.buildingId === null) return MORALE.noBed;
  return bed.distance <= MORALE.near ? MORALE.bedNear : 0;
}

/** Points of the memories a kiwi still has at `now`. */
export function memoryPoints(v: Villager, now: TimeMs): number {
  let sum = 0;
  for (const m of v.memories ?? []) if (m.until > now) sum += m.value;
  return sum;
}

export function kiwiMorale(
  state: GameState,
  v: Villager,
  beds: ReadonlyMap<VillagerId, Bed> = bedsOf(state),
  colony: ColonyMood = colonyMood(state),
): KiwiMorale {
  const bed = bedPoints(beds.get(v.id));
  const trait = v.trait ? ((MORALE.trait as Partial<Record<string, number>>)[v.trait] ?? 0) : 0;
  const temper = trait + (inLine(v.classId, 'bard') ? MORALE.bard : 0);
  const memories = memoryPoints(v, state.now);
  const total = Math.max(0, Math.min(MORALE.max, colony.sum + bed + temper + memories));
  return { total, colony: colony.sum, bed, temper, memories };
}

/** Work multiplier of a morale (×`work.low` at 0, ×1 at neutral, ×`work.high` at the top). */
export function moraleFactor(points: number): number {
  const n = MORALE.neutral;
  if (points <= n) return MORALE.work.low + (1 - MORALE.work.low) * (points / n);
  return 1 + (MORALE.work.high - 1) * ((points - n) / (MORALE.max - n));
}

/** Work multiplier of one kiwi's morale (pass the colony mood when looping over kiwis). */
export function kiwiMoraleWork(
  state: GameState,
  v: Villager,
  beds: ReadonlyMap<VillagerId, Bed> = bedsOf(state),
  colony: ColonyMood = colonyMood(state),
): number {
  return moraleFactor(kiwiMorale(state, v, beds, colony).total);
}

/** Colony morale: the average of its kiwis at home and what makes it (village screen). */
export interface Morale extends ColonyMood {
  /** Average morale of the kiwis at home (points, 0–100). */
  average: number;
  /** Average work bonus (−0.3..+0.15). */
  work: number;
  /** Kiwis sulking (below `MORALE.sulk`). */
  low: number;
  /** Average points of the beds, the tempers and the memories. */
  comfort: number;
  temper: number;
  memories: number;
}

export function moraleOf(state: GameState, beds = bedsOf(state)): Morale {
  const colony = colonyMood(state);
  let n = 0;
  let total = 0;
  let work = 0;
  let low = 0;
  let comfort = 0;
  let temper = 0;
  let memories = 0;
  for (const v of state.villagers) {
    if (v.job.kind === 'expedition' || v.job.kind === 'outpost') continue;
    const m = kiwiMorale(state, v, beds, colony);
    n++;
    total += m.total;
    work += moraleFactor(m.total) - 1;
    if (m.total < MORALE.sulk) low++;
    comfort += m.bed;
    temper += m.temper;
    memories += m.memories;
  }
  const avg = (x: number) => (n > 0 ? x / n : 0);
  return {
    ...colony,
    average: n > 0 ? total / n : Math.max(0, Math.min(MORALE.max, colony.sum)),
    work: avg(work),
    low,
    comfort: avg(comfort),
    temper: avg(temper),
    memories: avg(memories),
  };
}

/** Chantier 43: a kiwi remembers something (one memory per kind: the stronger, the later). */
export function addMemory(v: Villager, kind: MemoryKind, value: number, until: TimeMs): void {
  const list = v.memories ?? [];
  const old = list.find((m) => m.kind === kind);
  if (old) {
    if (Math.abs(value) > Math.abs(old.value)) old.value = value;
    old.until = Math.max(old.until, until);
  } else list.push({ kind, value, until });
  v.memories = list;
}

/** When the next memory of a kiwi fades (an `advance` event). */
export function nextMemoryEnd(state: GameState): TimeMs {
  let next = Infinity;
  for (const v of state.villagers)
    for (const m of v.memories ?? []) if (m.until > state.now && m.until < next) next = m.until;
  return next;
}

/** Forgets the memories that faded by `at`. */
export function fadeMemories(state: GameState, at: TimeMs): void {
  for (const v of state.villagers) {
    if (!v.memories) continue;
    const kept = v.memories.filter((m) => m.until > at);
    if (kept.length > 0) v.memories = kept;
    else delete v.memories;
  }
}

export interface MissingBeds {
  /** Kiwis at work or idle who sleep outside. */
  count: number;
  /** Share of the colony's presence lost because of them (0–1). */
  presenceLost: number;
}

/** What the missing beds cost: kiwis sleeping outside rest twice slower. */
export function missingBeds(state: GameState, beds = bedsOf(state)): MissingBeds {
  let count = 0;
  let total = 0;
  let lost = 0;
  for (const v of state.villagers) {
    if (v.job.kind !== 'work' && v.job.kind !== 'idle') continue;
    const bed = beds.get(v.id);
    const p = presence(state, v, bed);
    if (bed && bed.buildingId === null) {
      count++;
      const housed = presence(state, v, { buildingId: 'bed' as BuildingId, distance: 0 });
      total += housed;
      lost += housed - p;
    } else total += p;
  }
  return { count, presenceLost: total > 0 ? lost / total : 0 };
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
  /** The beds of the state, when the caller already has them. */
  beds?: ReadonlyMap<VillagerId, Bed>,
): { rhythm: KiwiRhythm; fatigue: number } {
  const seed = phaseOf(v.id);
  const c = calendarAt(state.calendarStart, t);
  // Early birds always sleep at night (they rest less by day).
  if (c.night && (seed < 1 - CYCLES.nightWork || v.trait === 'earlyBird')) {
    const slept = (t - c.nightAt) / Math.max(1, c.dawnAt - c.nightAt);
    return { rhythm: 'sleep', fatigue: Math.max(0.05, 0.6 - 0.55 * slept) };
  }
  const p = presence(state, v, beds ? beds.get(v.id) : undefined);
  const x = (((t + seed * REST.cycleMs) % REST.cycleMs) + REST.cycleMs) % REST.cycleMs;
  const k = x / REST.cycleMs;
  if (k < p) return { rhythm: 'work', fatigue: 0.15 + 0.75 * (k / p) };
  return { rhythm: 'rest', fatigue: 0.9 - 0.75 * ((k - p) / (1 - p)) };
}
