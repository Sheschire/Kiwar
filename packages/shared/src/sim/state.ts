import type { BuildingType } from '../data/buildings';
import { NAME_SYLLABLES, START } from '../data/start';
import { calendarStartFor } from '../data/cycles';
import { drawBiomes, type BiomeId } from '../data/biomes';
import { ALIEN_TWIN_FACE } from '../data/expeditions';
import type { ResourceId, Resources } from '../data/resources';
import { INCIDENTS, type IncidentKind } from '../data/threats';
import { HEART, type FaceParams, DEFAULT_FACE_PARAMS } from '../worldgen/generateFace';
import { createRng, type Rng, type RngState } from '../rng/rng';
import type { Masteries, ShinyColor, Stats, TraitId } from '../data/kiwis';
import type { ClassId, SkillId } from '../data/classes';
import { newKiwi, rollKiwi } from './kiwis';
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

export const SCHEMA_VERSION = 10;

export type Job =
  | { kind: 'idle' }
  | { kind: 'work'; buildingId: BuildingId }
  /** Building a queued construction; returns to `returnTo` afterwards if it still has room. */
  | { kind: 'build'; queueItemId: QueueItemId; returnTo: BuildingId | null }
  /** Away on an expedition. */
  | { kind: 'expedition'; expeditionId: string }
  /** Learning a class at the School until `until` (`paid` is refunded if the School goes). */
  | {
      kind: 'train';
      schoolId: BuildingId;
      classId: ClassId;
      until: TimeMs;
      paid: Partial<Resources>;
    }
  /** Hurt by predators: rests at home until `until`, then looks for work. */
  | { kind: 'injured'; until: TimeMs };

export interface KiwiHistory {
  expeditions: number;
  victories: number;
  /** Constructions this kiwi completed as the builder. */
  built: number;
}

export interface Villager {
  id: VillagerId;
  name: string;
  bornAt: TimeMs;
  job: Job;
  /** Innate stats (drawn at hatching) plus the points earned by levelling up. */
  stats: Stats;
  trait: TraitId | null;
  /** Very rare colour variant (cosmetic). */
  shiny: ShinyColor | null;
  level: number;
  /** Experience in raw units (XP_SCALE per point); integers keep offline progress exact. */
  xp: number;
  /** Stat points earned on even levels, to be placed by the player. */
  statPoints: number;
  /** Practice per mastery in raw units (PRACTICE_SCALE per hour). */
  mastery: Masteries;
  history: KiwiHistory;
  /** Class taught at the School (null: none yet). */
  classId: ClassId | null;
  /** When each active skill can be used again. */
  skillReadyAt: Partial<Record<SkillId, TimeMs>>;
}

/** A kiwi lost for good (expeditions), remembered in the village screen. */
export interface Memorial {
  id: VillagerId;
  name: string;
  level: number;
  shiny: ShinyColor | null;
  classId?: ClassId | null;
  bornAt: TimeMs;
  diedAt: TimeMs;
  /**
   * `starvation`: on the way home from an expedition; `famine`: in the colony; `predator`: a
   * wave of ferrets or bats.
   */
  cause: 'battle' | 'starvation' | 'famine' | 'predator';
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
  /**
   * Producers only: the deposit tiles this building harvests (its catchment, as hex keys) and
   * their pooled stock. Kept in sync by `syncPools` whenever the layout changes.
   */
  pool?: Pool;
  /** Hit by predators: works at `THREATS.damagedWork` until repaired. */
  damaged?: boolean;
}

export interface Pool {
  stock: number;
  tiles: string[];
}

/** A deposit nobody harvests, last seen below full at `at` (it regrows on its own). */
export interface FreeDeposit {
  stock: number;
  at: TimeMs;
}

export interface QueueItem {
  id: QueueItemId;
  /** `repair`: mends a damaged building (same level). */
  kind: 'build' | 'upgrade' | 'repair';
  buildingType: BuildingType;
  q: number;
  r: number;
  /** For upgrades and repairs: the building concerned. */
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

/** A face that expeditions can target (aliens for now; other players later). */
export interface ExpeditionTarget {
  id: string;
  owner: 'aliens';
  kiwiIndex: number;
  face: Face;
  /** Kiwi distance from home (0 = the other face of our own kiwi). */
  distance: number;
  defense: number;
  reinforce: number;
  loot: Resources;
  travelMs: number;
}

export interface ExpeditionResult {
  victory: boolean;
  /** The target was gone on arrival (claimed by a player): the ship came back without fighting. */
  aborted?: boolean;
  strength: number;
  defense: number;
  /** Share of the outbound rations the crew actually had (0–1). */
  fed: number;
  lostInBattle: string[];
  lostOnReturn: string[];
  loot: Resources;
}

export interface Expedition {
  id: string;
  targetId: string;
  launchpadId: BuildingId;
  /** Kiwis still aboard (alive). */
  crew: VillagerId[];
  /** Everyone who boarded, kept for the report even if some kiwis are lost. */
  roster: {
    id: VillagerId;
    name: string;
    level?: number;
    shiny?: ShinyColor | null;
    classId?: ClassId | null;
  }[];
  /** Provisions still on board. */
  provisions: Resources;
  cargo: number;
  departedAt: TimeMs;
  arriveAt: TimeMs;
  returnAt: TimeMs;
  status: 'outbound' | 'returning' | 'done';
  result: ExpeditionResult | null;
}

/** A big wave on its way: planned (time only), then announced (composition). */
export interface PlannedWave {
  id: string;
  announceAt: TimeMs;
  at: TimeMs;
  announced: boolean;
  /** Ferret (ground) and bat (air) power, drawn at the announcement (0 before). */
  ground: number;
  air: number;
}

export interface WaveReport {
  id: string;
  at: TimeMs;
  victory: boolean;
  sheltered: boolean;
  /** Threat on the day (luck included) and the defense it met. */
  threat: { ground: number; air: number };
  defense: { ground: number; air: number };
  /** 0 (repelled) to 1 (nothing stood in the way). */
  severity: number;
  /** Seeds fired by the turrets. */
  ammoUsed: number;
  damaged: { id: BuildingId; type: BuildingType }[];
  loot: Resources;
  injured: { id: VillagerId; name: string }[];
  dead: { id: VillagerId; name: string }[];
  pathsLost: number;
}

export interface IncidentReport {
  at: TimeMs;
  kind: IncidentKind;
  /** Stopped by the defenders (nothing lost). */
  blocked: boolean;
  resource: ResourceId | null;
  /** Resources lost, or path tiles blown away. */
  amount: number;
}

/** Predators (chantier 06). Draws use their own RNG stream, apart from the colony's. */
export interface ThreatState {
  rng: RngState;
  next: PlannedWave | null;
  /** Last wave strike (0: none yet). */
  lastWaveAt: TimeMs;
  /** No wave strikes before then (after a defeat). */
  shieldUntil: TimeMs;
  /** Everybody stays in the Nest until then (no harvest). */
  shelterUntil: TimeMs;
  nextIncidentAt: TimeMs;
  waves: number;
  reports: WaveReport[];
  incidents: IncidentReport[];
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
  /** Dawn of the first spring day (game creation, or universe creation when shared). */
  calendarStart: TimeMs;
  /** Simulation time reached by the last `advance`. */
  now: TimeMs;
  resources: Resources;
  buildings: Building[];
  villagers: Villager[];
  /** Kiwis lost in expeditions, newest last (capped). */
  memorial: Memorial[];
  /** The mayor's speech boosts the harvest until then (0: no speech). */
  speechUntil: TimeMs;
  /** Colony hunger gauge in raw units (HUNGER_SCALE per ms of full privation). */
  hunger: number;
  /** The colony mourns a lost kiwi until then (morale malus; 0: no mourning). */
  mourningUntil: TimeMs;
  queue: QueueItem[];
  egg: Egg | null;
  /** Index of the current tutorial objective in OBJECTIVES. */
  objectiveIndex: number;
  stats: GameStats;
  /** Faces reachable by expeditions (set by the universe the game belongs to). */
  targets: ExpeditionTarget[];
  /** Victories per target (aliens reinforce after each). */
  victories: Record<string, number>;
  /** In flight and recent expeditions (the last few finished ones are kept for reports). */
  expeditions: Expedition[];
  /** Tiles with a path (hex keys). */
  paths: string[];
  /** Unharvested deposits that are not full yet (hex key → stock); absent means full. */
  deposits: Record<string, FreeDeposit>;
  threats: ThreatState;
  nextId: number;
  rng: RngState;
}

export interface NewGameOptions {
  seed: string;
  face: Face;
  now: TimeMs;
  params?: FaceParams;
  /** Biome of the face when `params` is absent (default: drawn from the seed). */
  biome?: BiomeId;
  playerId?: string;
  universeId?: string;
  kiwiId?: string;
  /** Calendar start (defaults to a spring morning: see `calendarStartFor`). */
  calendarStart?: TimeMs;
  /** Expedition targets; defaults to the alien-held other face of our kiwi. */
  targets?: ExpeditionTarget[];
}

/** Default targets of a solo game: the aliens on the other face of our own kiwi. */
export function soloTargets(face: Face): ExpeditionTarget[] {
  const other: Face = face === 'kiwisu' ? 'kiwino' : 'kiwisu';
  return [
    {
      id: `aliens:0:${other}`,
      owner: 'aliens',
      kiwiIndex: 0,
      face: other,
      distance: 0,
      ...ALIEN_TWIN_FACE,
    },
  ];
}

export function newGame(opts: NewGameOptions): GameState {
  const rng = createRng(`${opts.seed}/${opts.face}/game`);
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    universeId: (opts.universeId ?? 'local') as UniverseId,
    kiwiId: (opts.kiwiId ?? 'local-kiwi') as KiwiId,
    playerId: (opts.playerId ?? 'local-player') as PlayerId,
    seasonId: 'preseason' as SeasonId,
    face: opts.face,
    seed: opts.seed,
    // Each face of a planet has the biome drawn from the planet seed (chantier 05).
    params: opts.params ?? {
      ...DEFAULT_FACE_PARAMS,
      biome: opts.biome ?? drawBiomes(opts.seed)[opts.face],
    },
    createdAt: opts.now,
    calendarStart: opts.calendarStart ?? calendarStartFor(opts.now),
    now: opts.now,
    resources: { ...START.resources },
    buildings: [],
    villagers: [],
    memorial: [],
    speechUntil: 0,
    hunger: 0,
    mourningUntil: 0,
    queue: [],
    egg: null,
    objectiveIndex: 0,
    stats: {
      produced: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
      constructionsCompleted: 0,
      eggsHatched: 0,
    },
    targets: opts.targets ?? soloTargets(opts.face),
    victories: {},
    expeditions: [],
    paths: [],
    deposits: {},
    threats: newThreats(opts.seed, opts.face, opts.now),
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

/** Predators of a new colony: nothing planned, the first incident at a fixed time. */
export function newThreats(seed: string, face: Face, now: TimeMs): ThreatState {
  return {
    rng: createRng(`${seed}/${face}/threats`).state(),
    next: null,
    lastWaveAt: 0,
    shieldUntil: 0,
    shelterUntil: 0,
    nextIncidentAt: now + INCIDENTS.firstMs,
    waves: 0,
    reports: [],
    incidents: [],
  };
}

/** Runs `fn` with the predators' RNG stream. */
export function withThreatRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = createRng(state.threats.rng);
  const out = fn(rng);
  state.threats.rng = rng.state();
  return out;
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
  const taken = new Set(state.villagers.map((v) => v.name));
  const { name, roll } = withRng(state, (rng) => ({
    name: drawName(rng, taken, state),
    roll: rollKiwi(rng),
  }));
  const v: Villager = {
    id: nextId(state, 'v') as VillagerId,
    name,
    bornAt: at,
    job: { kind: 'idle' },
    ...newKiwi(roll),
  };
  state.villagers.push(v);
  return v;
}

function drawName(rng: Rng, taken: Set<string>, state: GameState): string {
  // A few tries for a name nobody in the colony has (then longer names).
  for (let attempt = 0; attempt < 12; attempt++) {
    const parts = 2 + (attempt >= 6 || rng.chance(0.3) ? 1 : 0);
    let n = '';
    for (let i = 0; i < parts; i++) n += rng.pick(NAME_SYLLABLES);
    n = n.charAt(0).toUpperCase() + n.slice(1);
    if (!taken.has(n)) return n;
  }
  return `Kiwi ${state.villagers.length + 1}`;
}

/** Deep copy of a state (plain data only). */
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    params: { ...state.params },
    resources: { ...state.resources },
    buildings: state.buildings.map((b) =>
      b.pool ? { ...b, pool: { stock: b.pool.stock, tiles: [...b.pool.tiles] } } : { ...b },
    ),
    villagers: state.villagers.map(cloneVillager),
    memorial: state.memorial.map((m) => ({ ...m })),
    queue: state.queue.map((q) => ({ ...q, paid: { ...q.paid } })),
    egg: state.egg ? { ...state.egg } : null,
    stats: { ...state.stats, produced: { ...state.stats.produced } },
    targets: state.targets.map((t) => ({ ...t, loot: { ...t.loot } })),
    victories: { ...state.victories },
    paths: [...state.paths],
    deposits: Object.fromEntries(Object.entries(state.deposits).map(([k, d]) => [k, { ...d }])),
    threats: cloneThreats(state.threats),
    expeditions: state.expeditions.map((e) => ({
      ...e,
      crew: [...e.crew],
      roster: e.roster.map((r) => ({ ...r })),
      provisions: { ...e.provisions },
      result: e.result
        ? {
            ...e.result,
            lostInBattle: [...e.result.lostInBattle],
            lostOnReturn: [...e.result.lostOnReturn],
            loot: { ...e.result.loot },
          }
        : null,
    })),
    rng: [...state.rng] as RngState,
  };
}

export function cloneThreats(t: ThreatState): ThreatState {
  return {
    ...t,
    rng: [...t.rng] as RngState,
    next: t.next ? { ...t.next } : null,
    reports: t.reports.map((r) => ({
      ...r,
      threat: { ...r.threat },
      defense: { ...r.defense },
      damaged: r.damaged.map((d) => ({ ...d })),
      loot: { ...r.loot },
      injured: r.injured.map((k) => ({ ...k })),
      dead: r.dead.map((k) => ({ ...k })),
    })),
    incidents: t.incidents.map((i) => ({ ...i })),
  };
}

export function cloneVillager(v: Villager): Villager {
  return {
    ...v,
    job: v.job.kind === 'train' ? { ...v.job, paid: { ...v.job.paid } } : { ...v.job },
    stats: { ...v.stats },
    skillReadyAt: { ...v.skillReadyAt },
    mastery: { ...v.mastery },
    history: { ...v.history },
  };
}
