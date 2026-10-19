import type { BuildingType } from '../data/buildings';
import { NAME_SYLLABLES, START } from '../data/start';
import type { Resources } from '../data/resources';
import { HEART, type FaceParams, DEFAULT_FACE_PARAMS } from '../worldgen/generateFace';
import { createRng, type Rng, type RngState } from '../rng/rng';
import type {
  BuildingId,
  Face,
  KiwiId,
  PlayerId,
  QueueItemId,
  SeasonId,
  TimeMs,
  UniverseId,
  VillagerId,
} from '../types/ids';

export const SCHEMA_VERSION = 1;

export type Job =
  | { kind: 'idle' }
  | { kind: 'work'; buildingId: BuildingId }
  /** Building a queued construction; returns to `returnTo` afterwards if it still has room. */
  | { kind: 'build'; queueItemId: QueueItemId; returnTo: BuildingId | null };

export interface Villager {
  id: VillagerId;
  name: string;
  bornAt: TimeMs;
  job: Job;
}

export interface Building {
  id: BuildingId;
  type: BuildingType;
  q: number;
  r: number;
  level: number;
  /** Tile richness copied at placement, so the simulation does not need the map. */
  richness: number;
  builtAt: TimeMs;
}

export interface QueueItem {
  id: QueueItemId;
  kind: 'build' | 'upgrade';
  buildingType: BuildingType;
  q: number;
  r: number;
  /** For upgrades: the building being upgraded. */
  buildingId: BuildingId | null;
  targetLevel: number;
  richness: number;
  durationMs: number;
  /** null while waiting in the queue. */
  startedAt: TimeMs | null;
  /** Resources paid when ordered (refunded on cancel). */
  paid: Partial<Resources>;
  orderedAt: TimeMs;
}

export interface Egg {
  startedAt: TimeMs;
  readyAt: TimeMs;
}

export interface GameStats {
  produced: Resources;
  constructionsCompleted: number;
  eggsHatched: number;
}

export interface GameState {
  schemaVersion: number;
  // Multiplayer-ready identifiers (unused in milestone 1).
  universeId: UniverseId;
  kiwiId: KiwiId;
  playerId: PlayerId;
  seasonId: SeasonId;
  face: Face;
  seed: string;
  params: FaceParams;
  createdAt: TimeMs;
  /** Simulation time reached by the last `advance`. */
  now: TimeMs;
  resources: Resources;
  buildings: Building[];
  villagers: Villager[];
  queue: QueueItem[];
  egg: Egg | null;
  /** Index of the current tutorial objective in OBJECTIVES. */
  objectiveIndex: number;
  stats: GameStats;
  nextId: number;
  rng: RngState;
}

export interface NewGameOptions {
  seed: string;
  face: Face;
  now: TimeMs;
  params?: FaceParams;
  playerId?: string;
  universeId?: string;
}

export function newGame(opts: NewGameOptions): GameState {
  const rng = createRng(`${opts.seed}/${opts.face}/game`);
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    universeId: (opts.universeId ?? 'local') as UniverseId,
    kiwiId: 'local-kiwi' as KiwiId,
    playerId: (opts.playerId ?? 'local-player') as PlayerId,
    seasonId: 'preseason' as SeasonId,
    face: opts.face,
    seed: opts.seed,
    params: opts.params ?? DEFAULT_FACE_PARAMS,
    createdAt: opts.now,
    now: opts.now,
    resources: { ...START.resources },
    buildings: [],
    villagers: [],
    queue: [],
    egg: null,
    objectiveIndex: 0,
    stats: {
      produced: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
      constructionsCompleted: 0,
      eggsHatched: 0,
    },
    nextId: 1,
    rng: rng.state(),
  };
  state.buildings.push({
    id: nextId(state, 'b') as BuildingId,
    type: 'nest',
    q: HEART.q,
    r: HEART.r,
    level: 1,
    richness: 1,
    builtAt: opts.now,
  });
  for (let i = 0; i < START.villagers; i++) addVillager(state, opts.now);
  return state;
}

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

/** Runs `fn` with the state's RNG and stores the advanced RNG state back. */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = createRng(state.rng);
  const out = fn(rng);
  state.rng = rng.state();
  return out;
}

export function addVillager(state: GameState, at: TimeMs): Villager {
  const name = withRng(state, (rng) => {
    const a = rng.pick(NAME_SYLLABLES);
    const b = rng.pick(NAME_SYLLABLES);
    const n = a + b + (rng.chance(0.3) ? rng.pick(NAME_SYLLABLES) : '');
    return n.charAt(0).toUpperCase() + n.slice(1);
  });
  const v: Villager = {
    id: nextId(state, 'v') as VillagerId,
    name,
    bornAt: at,
    job: { kind: 'idle' },
  };
  state.villagers.push(v);
  return v;
}

/** Deep copy of a state (plain data only). */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    params: { ...state.params },
    resources: { ...state.resources },
    buildings: state.buildings.map((b) => ({ ...b })),
    villagers: state.villagers.map((v) => ({ ...v, job: { ...v.job } })),
    queue: state.queue.map((q) => ({ ...q, paid: { ...q.paid } })),
    egg: state.egg ? { ...state.egg } : null,
    stats: { ...state.stats, produced: { ...state.stats.produced } },
    rng: [...state.rng] as RngState,
  };
}
