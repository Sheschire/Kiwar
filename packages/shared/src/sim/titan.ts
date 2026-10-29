import { SMASH, TERRAFORM, TITAN, type TerraformKind, type TitanWork } from '../data/titan';
import { hexKey } from '../hex/hex';
import { cutsLand, occupancy } from './footprint';
import type { TimeMs } from '../types/ids';
import { getTile, HEART, type FaceMap } from '../worldgen/generateFace';
import type { GameEvent } from './advance';
import { autoAssign } from './advance';
import { obstacleAt, removeObstacle } from './obstacles';
import { ageOf, techEffects } from './research';
import { meteorAt } from './sky';
import type { GameState, Villager } from './state';
import { faceMapOf, syncPools } from './territory';

/** Chantier 08: titan works — Kikiwiwis smash obstacles and reshape a few tiles. */

/** Tiles the colony may still reshape at its age. */
export function terraformLeft(state: GameState): number {
  const caps = TITAN.maxTerraform;
  const cap = caps[Math.min(ageOf(state), caps.length - 1)] ?? 0;
  const pending = state.villagers.filter(
    (v) => v.job.kind === 'titan' && v.job.work !== 'smash',
  ).length;
  const reshaped = Object.values(state.terraform).filter(
    (k) => k !== 'canal' && k !== 'land',
  ).length;
  return Math.max(0, cap - reshaped - pending);
}

/** The Kikiwiwi (if any) at work on a tile. */
export function titanAt(state: GameState, q: number, r: number): Villager | undefined {
  return state.villagers.find((v) => v.job.kind === 'titan' && v.job.q === q && v.job.r === r);
}

/** Juice drunk and time taken by a work on a tile (null: it does not apply there). */
export function titanCost(
  state: GameState,
  work: TitanWork,
  q: number,
  r: number,
): { juice: number; durationMs: number } | null {
  if (work === 'smash') {
    const o = obstacleAt(state, q, r);
    return o ? { ...SMASH[o.kind] } : null;
  }
  const def = TERRAFORM[work];
  const k = techEffects(state).build;
  return { juice: def.juice, durationMs: Math.round(def.durationMs * k) };
}

/** Whether a tile can be reshaped this way (land type and nothing standing on it). */
export function canReshape(
  state: GameState,
  map: FaceMap,
  kind: TerraformKind,
  q: number,
  r: number,
): boolean {
  const tile = getTile(map, { q, r });
  if (!tile) return false;
  const def = TERRAFORM[kind];
  const fits = def.tiles === 'flood' ? !!tile.flood : def.tiles.includes(tile.type);
  if (!fits) return false;
  if (q === HEART.q && r === HEART.r) return false;
  if (occupancy(state).tiles.has(hexKey({ q, r }))) return false;
  if (state.queue.some((i) => i.q === q && i.r === r)) return false;
  if (obstacleAt(state, q, r) || meteorAt(state, q, r)) return false;
  // A spring must not cut the walkable land in two.
  if (kind === 'spring' && splitsLand(map, q, r, state)) return false;
  return true;
}

/**
 * True when turning this tile into juice leaves some walkable land cut off (chantier 35: big
 * buildings' covered tiles are walls too).
 */
export function splitsLand(map: FaceMap, q: number, r: number, state?: GameState): boolean {
  return cutsLand(map, [hexKey({ q, r })], state ? occupancy(state).blocked : undefined);
}

export function nextTitanEnd(state: GameState): TimeMs {
  let next = Infinity;
  for (const v of state.villagers) if (v.job.kind === 'titan') next = Math.min(next, v.job.until);
  return next;
}

/** Works finishing at `at`: the obstacle goes (loot), or the tile takes its new shape. */
export function finishTitanWorks(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const v of s.villagers) {
    const job = v.job;
    if (job.kind !== 'titan' || job.until !== at) continue;
    v.job = { kind: 'idle' };
    if (job.work === 'smash') {
      const o = obstacleAt(s, job.q, job.r);
      if (o) removeObstacle(s, o, at, events, 'titan');
    } else {
      const key = hexKey(job);
      // A new object: cached map keys follow the object (`terraformKey`).
      s.terraform = { ...s.terraform, [key]: job.work };
      // The tile starts over as a full deposit of its new kind.
      delete s.deposits[key];
      s.paths = job.work === 'spring' ? s.paths.filter((p) => p !== key) : s.paths;
      syncPools(s, faceMapOf(s), at);
      events.push({
        type: 'terraformed',
        at,
        q: job.q,
        r: job.r,
        kind: job.work,
        villagerId: v.id,
      });
    }
    events.push({ type: 'titanDone', at, villagerId: v.id, name: v.name, work: job.work });
    autoAssign(s, v);
  }
}
