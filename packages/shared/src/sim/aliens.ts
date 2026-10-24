import { CALENDAR } from '../data/cycles';
import { ALIENS, alienDefOf, INTEL } from '../data/expeditions';
import { RESOURCE_IDS, emptyResources } from '../data/resources';
import { createRng } from '../rng/rng';
import { hexDistance, hexRing } from '../hex/hex';
import { drawBiomes } from '../data/biomes';
import { planetSeedOf, type UniverseMember } from '../server/universes';
import {
  DEFAULT_FACE_PARAMS,
  getTile,
  twinParams,
  type FaceMap,
  type FaceParams,
  type Tile,
} from '../worldgen/generateFace';
import type { TimeMs } from '../types/ids';
import { counterAwaited, mergeSiegeIntel } from './siege';
import { civDay, newCiv } from './civ';
import type {
  AlienGarrison,
  AlienStructure,
  Expedition,
  ExpeditionTarget,
  GameState,
  IntelRange,
  IntelReport,
} from './state';

/**
 * Chantier 07: hidden alien garrisons and the player's intel. The truth (`state.aliens`) is
 * drawn from a secret seed and never leaves the server; the client only sees `state.intel`.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const fromHeart = (q: number, r: number) => hexDistance({ q, r }, { q: 0, r: 0 });

/** Sector of a tile: 6 slices around the heart × inner/outer ring (see `INTEL`). */
export function sectorOf(q: number, r: number): number {
  const x = Math.sqrt(3) * (q + r / 2);
  const y = 1.5 * r;
  const angle = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
  const slice = Math.min(5, Math.floor(angle / (Math.PI / 3)));
  return (fromHeart(q, r) <= INTEL.innerRadius ? 0 : 6) + slice;
}

/** Draws the real garrison of a target around its public base numbers. */
export function drawGarrison(target: ExpeditionTarget, seed: string, since: TimeMs): AlienGarrison {
  const rng = createRng(seed);
  const def = alienDefOf(target.distance);
  const defense = round1(def.defense * rng.range(...ALIENS.defenseSpread));
  const growth = round3(defense * rng.range(...ALIENS.growthPerDay));
  const loot = emptyResources();
  for (const id of RESOURCE_IDS)
    loot[id] = Math.floor(def.loot[id] * rng.range(...ALIENS.lootSpread));
  const ferretShare = Math.round(rng.range(...ALIENS.ferretShare) * 100) / 100;
  const count = ALIENS.structures.base + ALIENS.structures.perDistance * target.distance;
  const [near, far] = ALIENS.structureRing;
  const structures: AlienStructure[] = [];
  const taken = new Set<string>();
  for (let tries = 0; structures.length < count && tries < 500; tries++) {
    const q = rng.int(-far, far);
    const r = rng.int(-far, far);
    const d = fromHeart(q, r);
    if (d < near || d > far || taken.has(`${q},${r}`)) continue;
    taken.add(`${q},${r}`);
    structures.push({ kind: rng.chance(ferretShare) ? 'den' : 'roost', q, r });
  }
  return {
    seed,
    defense,
    reinforce: def.reinforce,
    growth,
    loot,
    ferretShare,
    since,
    structures,
    civ: newCiv(seed, target.distance),
  };
}

/** Adds the garrisons missing for the current targets (new targets, migrated games). */
export function ensureAliens(state: GameState, seed: string): boolean {
  const aliens = state.aliens ?? {};
  let changed = !state.aliens;
  for (const t of state.targets) {
    const g = aliens[t.id];
    if (g && !g.civ) {
      // Chantier 39: garrisons drawn before the civilisation get theirs from their own seed
      // (its first daily look comes after the current time).
      g.civ = { ...newCiv(g.seed, t.distance), day: civDay(g, state.now) };
      changed = true;
    }
    if (g) continue;
    aliens[t.id] = drawGarrison(t, `${seed}/${t.id}`, state.createdAt);
    changed = true;
  }
  state.aliens = aliens;
  return changed;
}

/** The state as the client may see it: without the real garrisons. */
export function publicState(state: GameState): GameState {
  if (!state.aliens) return state;
  const copy = { ...state };
  delete copy.aliens;
  return copy;
}

/** Real defense of a garrison at a time (null when hidden from us). */
export function alienDefense(state: GameState, targetId: string, at: TimeMs): number | null {
  const g = state.aliens?.[targetId];
  if (!g) return null;
  const days = Math.max(0, at - g.since) / CALENDAR.dayMs;
  const growth = Math.min(g.growth * days, (ALIENS.maxGrowth - 1) * g.defense);
  return round1(g.defense + g.reinforce * (state.victories[targetId] ?? 0) + growth);
}

/** Ferrets and bats behind a defense value. */
export function alienEnemies(
  g: Pick<AlienGarrison, 'ferretShare'>,
  defense: number,
): { ferrets: number; bats: number } {
  const total = Math.max(0, Math.round(defense / ALIENS.defensePerEnemy));
  const ferrets = Math.round(total * g.ferretShare);
  return { ferrets, bats: total - ferrets };
}

/** True when this client can resolve the arrival itself (truth held, face gone, or broken down). */
export function canResolveArrival(state: GameState, e: Expedition): boolean {
  return (
    !!e.broken ||
    // Chantier 19: a reinforcement meets no alien on its bridgehead.
    e.mission === 'reinforce' ||
    // …nor does a settlers' ship on a conquered face.
    e.mission === 'found' ||
    !!state.aliens?.[e.targetId] ||
    !state.targets.some((t) => t.id === e.targetId)
  );
}

/** Chantier 19: something happened that only the server can tell (a landing, a counter-attack). */
export function awaitingServer(state: GameState, now: TimeMs): boolean {
  return awaitingReport(state, now).length > 0 || counterAwaited(state, now);
}

/** Times of the hidden events due by `now` (the server resolves them on `load`). */
export function hiddenDue(state: GameState, now: TimeMs): TimeMs[] {
  const out = state.expeditions
    .filter((e) => e.status === 'outbound' && e.arriveAt <= now)
    .map((e) => e.arriveAt);
  const c = state.siege.counter;
  if (c && c.at <= now) out.push(c.at);
  return out;
}

/** Expeditions that have landed but wait for the server to tell what happened. */
export function awaitingReport(state: GameState, now: TimeMs): Expedition[] {
  return state.expeditions.filter(
    (e) => e.status === 'outbound' && e.arriveAt <= now && !canResolveArrival(state, e),
  );
}

export type Freshness = 'fresh' | 'stale' | 'old';

export interface IntelView {
  report: IntelReport;
  /** Age of the report in ms and in game days. */
  age: number;
  days: number;
  freshness: Freshness;
  /** Ranges widened for what may have changed since (growth, reinforcements after victories). */
  defense: IntelRange;
  ferrets: IntelRange;
  bats: IntelRange;
}

/** The latest report on a target, aged to `now` (null when nothing is known). */
export function intelView(state: GameState, targetId: string, now: TimeMs): IntelView | null {
  const report = state.intel[targetId];
  const target = state.targets.find((t) => t.id === targetId);
  if (!report || !target) return null;
  const age = Math.max(0, now - report.at);
  const days = age / CALENDAR.dayMs;
  const wins = Math.max(0, (state.victories[targetId] ?? 0) - report.victoriesAt);
  const reinforced = alienDefOf(target.distance).reinforce * wins;
  const grow = Math.min(1 + ALIENS.growthPerDay[1] * days, ALIENS.maxGrowth);
  const defense = {
    min: round1(report.defense.min + reinforced),
    max: round1(report.defense.max * grow + reinforced),
  };
  const scale = report.defense.max > 0 ? defense.max / report.defense.max : 1;
  const widen = (r: IntelRange): IntelRange => ({ min: r.min, max: Math.round(r.max * scale) });
  return {
    report,
    age,
    days,
    freshness: days < INTEL.fresh ? 'fresh' : days < INTEL.stale ? 'stale' : 'old',
    defense,
    ferrets: widen(report.ferrets),
    bats: widen(report.bats),
  };
}

/** Merges a new report into the target's intel (sectors and structures accumulate). */
export function recordIntel(
  state: GameState,
  targetId: string,
  report: Omit<IntelReport, 'sectors' | 'structures'> & {
    sectors?: number[];
    structures?: AlienStructure[];
  },
): void {
  const prev = state.intel[targetId];
  const sectors = [...new Set([...(prev?.sectors ?? []), ...(report.sectors ?? [])])].sort(
    (a, b) => a - b,
  );
  const seen = new Map<string, AlienStructure>();
  for (const s of [...(prev?.structures ?? []), ...(report.structures ?? [])])
    seen.set(`${s.q},${s.r}`, { ...s });
  const siege = mergeSiegeIntel(prev?.siege, report.siege);
  state.intel[targetId] = {
    ...report,
    sectors,
    structures: [...seen.values()],
    ...(siege ? { siege } : {}),
  };
}

/** The land tile where a structure stands on screen: its own, or the nearest dry one. */
export function landTileNear(map: FaceMap, q: number, r: number): Tile | undefined {
  for (let radius = 0; radius <= 3; radius++) {
    const ring = radius === 0 ? [{ q, r }] : hexRing({ q, r }, radius);
    for (const h of ring) {
      const tile = getTile(map, h);
      if (tile && tile.type !== 'juice') return tile;
    }
  }
  return undefined;
}

/** Face map of a target: our twin half, or a face of another kiwi of the universe. */
export function targetFaceParams(
  state: Pick<GameState, 'seed' | 'face' | 'params' | 'kiwiId'>,
  target: ExpeditionTarget,
  universe: { seed: string; members: Pick<UniverseMember, 'kiwiIndex' | 'planetSeed'>[] } | null,
): { seed: string; params: FaceParams } | null {
  const mine = Number(state.kiwiId.replace(/^k/, ''));
  if (target.distance === 0 || (Number.isFinite(mine) && mine === target.kiwiIndex))
    return { seed: state.seed, params: twinParams(state.seed, state.face, state.params) };
  if (!universe) return null;
  const seed = planetSeedOf(universe, target.kiwiIndex);
  return { seed, params: { ...DEFAULT_FACE_PARAMS, biome: drawBiomes(seed)[target.face] } };
}
