import { OBSTACLES, OBSTACLE_KINDS, OBSTACLE_RULES, type ObstacleKind } from '../data/obstacles';
import { METEORS } from '../data/threats';
import { RESOURCE_IDS, type Resources } from '../data/resources';
import { hexKey, type HexKey } from '../hex/hex';
import { createRng } from '../rng/rng';
import type { TimeMs } from '../types/ids';
import type { FaceMap } from '../worldgen/generateFace';
import type { GameEvent } from './advance';
import { capacity } from './selectors';
import { ageOf, techEffects } from './research';
import type { GameState, Obstacle } from './state';

/** Stable id of an obstacle (one per tile). */
export function obstacleId(kind: ObstacleKind, q: number, r: number): string {
  return `${kind}:${q},${r}`;
}

/**
 * The rocks and stumps of a face, drawn from the seed (own stream: the colony RNG is left
 * untouched). The classic biome (tests, first milestones) has none. Tiles in `taken` are
 * skipped (older games: only free tiles get one).
 */
export function generateObstacles(
  map: FaceMap,
  taken: ReadonlySet<string> = new Set(),
): Obstacle[] {
  if (map.params.biome === 'classic') return [];
  const rng = createRng(`${map.seed}/${map.face}/obstacles`);
  const [lo, hi] = OBSTACLE_RULES.rho;
  const used = new Set<HexKey>();
  const out: Obstacle[] = [];
  for (const kind of OBSTACLE_KINDS) {
    const def = OBSTACLES[kind];
    if (def.count === 0) continue;
    const spots = rng.shuffle(
      map.tiles.filter((t) => def.tiles.includes(t.type) && !t.flood && t.rho >= lo && t.rho <= hi),
    );
    let placed = 0;
    for (const t of spots) {
      if (placed >= def.count) break;
      const key = hexKey(t);
      if (used.has(key)) continue;
      used.add(key);
      placed++;
      // Drawn on every candidate, so older games keep the same layout minus the taken tiles.
      if (taken.has(key)) continue;
      out.push({ id: obstacleId(kind, t.q, t.r), kind, q: t.q, r: t.r, loot: { ...def.loot } });
    }
  }
  return out;
}

export function obstacleAt(state: GameState, q: number, r: number): Obstacle | undefined {
  return state.obstacles.find((o) => o.q === q && o.r === r);
}

/** Time to clear a stump for an average builder (the builder's speed applies at the start). */
export function clearDuration(s: GameState): number {
  return Math.round(OBSTACLE_RULES.clearMs * techEffects(s).build);
}

/** A crater fades away: its wreck stays on the tile if it is still free (capped). */
export function leaveWreck(
  s: GameState,
  m: { q: number; r: number },
  at: TimeMs,
  events: GameEvent[],
): void {
  if (s.obstacles.filter((o) => o.kind === 'wreck').length >= OBSTACLE_RULES.maxWrecks) return;
  if (obstacleAt(s, m.q, m.r)) return;
  if (s.buildings.some((b) => b.q === m.q && b.r === m.r)) return;
  if (s.queue.some((i) => i.q === m.q && i.r === m.r)) return;
  const k = METEORS.ageFactor[ageOf(s)] ?? 1;
  const loot: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = OBSTACLES.wreck.loot[id];
    if (v) loot[id] = Math.round(v * k);
  }
  s.obstacles.push({ id: obstacleId('wreck', m.q, m.r), kind: 'wreck', q: m.q, r: m.r, loot });
  s.paths = s.paths.filter((p) => p !== hexKey(m));
  events.push({ type: 'wreckLeft', at, q: m.q, r: m.r });
}

/** Removes an obstacle and credits its loot (up to the storage; the rest is lost). */
export function removeObstacle(
  s: GameState,
  o: Obstacle,
  at: TimeMs,
  events: GameEvent[],
  by: 'kiwis' | 'titan',
): void {
  s.obstacles = s.obstacles.filter((x) => x.id !== o.id);
  const cap = capacity(s);
  const loot: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = o.loot[id] ?? 0;
    if (v <= 0) continue;
    const room = Math.max(0, cap[id] - s.resources[id]);
    const got = Math.min(v, room);
    s.resources[id] += got;
    if (got > 0) loot[id] = got;
  }
  events.push({ type: 'obstacleCleared', at, q: o.q, r: o.r, kind: o.kind, loot, by });
}
