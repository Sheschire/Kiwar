import { CANALS } from '../data/canals';
import { RESOURCE_IDS } from '../data/resources';
import { TILES } from '../data/tiles';
import { hexKey, hexNeighbors, parseHexKey, type HexKey } from '../hex/hex';
import type { TimeMs } from '../types/ids';
import { getTile, type FaceMap } from '../worldgen/generateFace';
import type { GameEvent } from './advance';
import { dustAt } from './comets';
import { cutsLand, occupancy } from './footprint';
import { obstacleAt } from './obstacles';
import { techEffects } from './research';
import { meteorAt } from './sky';
import type { GameState, QueueItem } from './state';
import { canalFloods, faceMapOf, syncPools } from './territory';
import { titanAt } from './titan';

/** Chantier 45: juice canals dug tile by tile by the builders. */

export type CanalError =
  | 'techMissing'
  | 'notFlesh'
  | 'notByJuice'
  | 'tileOccupied'
  | 'obstacle'
  | 'canalCutsLand'
  | 'wouldFlood'
  | 'canalLimit';

/** Canal tiles allowed (a bound against cheating, out of reach in play). */
export function canalCap(_state: GameState): number {
  return CANALS.max;
}

/** Canals dug, plus those waiting in the queue. */
export function canalCount(state: GameState): number {
  const dug = Object.values(state.terraform).filter((k) => k === 'canal').length;
  return dug + state.queue.filter((i) => i.kind === 'canal').length;
}

export function canalsLeft(state: GameState): number {
  return Math.max(0, canalCap(state) - canalCount(state));
}

/** Tiles queued to become canals (they count as juice for the next tile of a chain). */
function queuedCanals(state: GameState, except?: QueueItem): string[] {
  return state.queue.filter((i) => i.kind === 'canal' && i !== except).map((i) => hexKey(i));
}

/**
 * Why a flesh tile cannot become a canal (null: it can). `item`: the queued dig being checked
 * again when it ends (its own tile and quota are then its own).
 */
export function canalError(
  state: GameState,
  map: FaceMap,
  q: number,
  r: number,
  item?: QueueItem,
): CanalError | null {
  if (!techEffects(state).canals) return 'techMissing';
  const tile = getTile(map, { q, r });
  if (!tile || tile.type !== 'flesh') return 'notFlesh';
  const key = hexKey({ q, r });
  const queued = queuedCanals(state, item);
  const near = hexNeighbors(tile).some(
    (n) => getTile(map, n)?.type === 'juice' || queued.includes(hexKey(n)),
  );
  if (!near) return 'notByJuice';
  const occ = occupancy(state).tiles;
  const held = occ.get(key as HexKey);
  if (held && !(item && held.id === item.id)) return 'tileOccupied';
  if (state.paths.includes(key) || dustAt(state, q, r) || titanAt(state, q, r))
    return 'tileOccupied';
  if (state.queue.some((i) => i !== item && i.kind === 'clear' && i.q === q && i.r === r))
    return 'tileOccupied';
  if (obstacleAt(state, q, r) || meteorAt(state, q, r)) return 'obstacle';
  if (!item && canalsLeft(state) <= 0) return 'canalLimit';
  // The flesh around a canal floods with the river in a flooding biome: never under a building.
  const base = faceMapOf({ seed: state.seed, face: state.face, params: state.params });
  const floods = canalFloods(base, state.terraform, [...queued, key]);
  for (const k of floods) {
    const o = occ.get(k as HexKey);
    if (o && !state.queue.some((i) => i.id === o.id && i.kind === 'canal')) return 'wouldFlood';
  }
  const removed = [...queued, key];
  const blocked = occupancy(state).blocked;
  if (cutsLand(map, removed, blocked)) return 'canalCutsLand';
  // In the flood season, the new floods must not cut the land either.
  if (floods.size > 0) {
    const wet = new Set(blocked);
    for (const t of map.tiles) if (t.flood) wet.add(hexKey(t));
    if (cutsLand(map, [...removed, ...floods], wet)) return 'canalCutsLand';
  }
  // A building standing in the juice (a well) keeps a shore to walk to.
  const gone = new Set(removed);
  for (const [k, o] of occ) {
    if (o.site || !o.anchor) continue;
    const at = parseHexKey(k);
    const t = getTile(map, at);
    if (!t || TILES[t.type].walkable) continue;
    if (!hexNeighbors(at).some((n) => hexKey(n) === key)) continue;
    const shore = hexNeighbors(at).some((n) => {
      const nk = hexKey(n);
      const nt = getTile(map, n);
      return !!nt && TILES[nt.type].walkable && !gone.has(nk) && !blocked.has(nk);
    });
    if (!shore) return 'canalCutsLand';
  }
  return null;
}

/**
 * Why a canal, or a juice tile of the generated map (river, lake), cannot be filled in (null:
 * it can). A natural juice tile needs the Canals research and becomes flesh (`land`).
 */
export function fillError(
  state: GameState,
  q: number,
  r: number,
  item?: QueueItem,
): 'notACanal' | 'tileOccupied' | 'techMissing' | null {
  const key = hexKey({ q, r });
  const kind = state.terraform[key];
  if (kind !== 'canal') {
    if (kind) return 'notACanal';
    const base = faceMapOf({ seed: state.seed, face: state.face, params: state.params });
    if (getTile(base, { q, r })?.type !== 'juice') return 'notACanal';
    if (!techEffects(state).canals) return 'techMissing';
  }
  if (meteorAt(state, q, r) || obstacleAt(state, q, r)) return 'tileOccupied';
  const held = occupancy(state).tiles.get(key as HexKey);
  if (held && !(item && held.id === item.id)) return 'tileOccupied';
  return null;
}

/** Builder time for a canal tile (dug or filled). */
export function canalDuration(state: GameState): number {
  return Math.round(CANALS.durationMs * techEffects(state).build);
}

/**
 * A dig or a fill ends: the tile takes its new shape (its deposit starts over full), or, if
 * the tile can no longer take it, the order is refunded.
 */
export function finishCanal(s: GameState, item: QueueItem, at: TimeMs, events: GameEvent[]): void {
  const key = hexKey(item);
  const dig = item.kind === 'canal';
  const error = dig
    ? canalError(s, faceMapOf(s), item.q, item.r, item)
    : fillError(s, item.q, item.r, item);
  if (error) {
    for (const id of RESOURCE_IDS) s.resources[id] += item.paid[id] ?? 0;
    events.push({ type: 'canal', at, q: item.q, r: item.r, dug: dig, failed: true });
    return;
  }
  // A new object: cached map keys follow the object (`terraformKey`).
  const next = { ...s.terraform };
  // Digging a filled-in river tile gives the river back; filling one in makes land.
  if (dig) {
    if (next[key] === 'land') delete next[key];
    else next[key] = 'canal';
  } else if (next[key] === 'canal') delete next[key];
  else next[key] = 'land';
  s.terraform = next;
  delete s.deposits[key];
  syncPools(s, faceMapOf(s), at);
  events.push({ type: 'canal', at, q: item.q, r: item.r, dug: dig });
}
