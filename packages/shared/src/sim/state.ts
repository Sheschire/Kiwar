import type { BuildingType } from '../data/buildings';
import { NAME_SYLLABLES, START } from '../data/start';
import { calendarStartFor } from '../data/cycles';
import { drawBiomes, type BiomeId } from '../data/biomes';
import { drawGarrison } from './aliens';
import { alienDefOf } from '../data/expeditions';
import type { ResourceId, Resources } from '../data/resources';
import { INCIDENTS, METEORS, type IncidentKind } from '../data/threats';
import { COMETS } from '../data/comets';
import { DEFAULT_FACE_PARAMS, HEART, type FaceParams } from '../worldgen/generateFace';
import { hexKey } from '../hex/hex';
import type { ObstacleKind } from '../data/obstacles';
import type { TerraformKind, TitanWork } from '../data/titan';
import { generateObstacles } from './obstacles';
import { faceMapOf } from './territory';
import { createRng, type Rng, type RngState } from '../rng/rng';
import type { Masteries, ShinyColor, Stats, TraitId } from '../data/kiwis';
import type { ClassId, SkillId } from '../data/classes';
import type { TechId } from '../data/research';
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

export const SCHEMA_VERSION = 19;

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
  /** Posted on the rampart against predators (no harvest). */
  | { kind: 'guard' }
  /** Hurt by predators: rests at home until `until`, then looks for work. */
  | { kind: 'injured'; until: TimeMs }
  /**
   * Chantier 08: in a vat of the laboratory against nature until `until` (`risk` of failure,
   * set when it starts; `paid` is refunded if the laboratory goes).
   */
  | { kind: 'transform'; labId: BuildingId; until: TimeMs; risk: number; paid: Partial<Resources> }
  /** Chantier 08: a Kikiwiwi at work on a tile (smashing an obstacle, reshaping the land). */
  | { kind: 'titan'; work: TitanWork; q: number; r: number; until: TimeMs }
  /** Chantier 13: picking up stardust on a tile where a comet dropped some. */
  | { kind: 'stardust'; patchId: string; returnTo: BuildingId | null };

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
  /** Chantier 08: transformed by juice into a Kikiwiwi (absent for ordinary kiwis). */
  kikiwiwi?: { since: TimeMs };
  /** Chantier 09: never moved automatically (no borrowing, no redirection). */
  locked?: true;
  /** Chantier 09: goes to every new construction site first. */
  builderPriority?: true;
  /** Chantier 09: workplace left when its stock was full, to go back to later. */
  homeJob?: BuildingId;
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
  /**
   * `repair`: mends a damaged building (same level). `clear`: a builder clears the stump at
   * q, r (chantier 08; `buildingType` is unused, `camp`).
   */
  kind: 'build' | 'upgrade' | 'repair' | 'clear';
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

/** An ally of the universe our ship can fly to. */
export interface Friend {
  /** `ally:<user id>`. */
  id: string;
  owner: string;
  kiwiIndex: number;
  /** Kiwi distance from home (0: the other half of our own kiwi, older universes). */
  distance: number;
  /** Base one-way flight time (the launchpad and technologies shorten it). */
  travelMs: number;
}

/** Our ship carrying resources to an ally (no crew, no risk), then flying back empty. */
export interface Shipment {
  id: string;
  launchpadId: BuildingId;
  friendId: string;
  owner: string;
  kiwiIndex: number;
  resources: Resources;
  departedAt: TimeMs;
  arriveAt: TimeMs;
  returnAt: TimeMs;
  status: 'outbound' | 'returning';
}

/** Resources an ally sent us, landing at `arriveAt`. */
export interface Delivery {
  id: string;
  from: string;
  resources: Resources;
  departedAt: TimeMs;
  arriveAt: TimeMs;
}

export interface Egg {
  startedAt: TimeMs;
  readyAt: TimeMs;
}

/**
 * A face that expeditions can target (aliens for now; other players later). Public: what the
 * garrison really is lives in `GameState.aliens`, which the server never sends (chantier 07).
 */
export interface ExpeditionTarget {
  id: string;
  owner: 'aliens';
  kiwiIndex: number;
  face: Face;
  /** Kiwi distance from home (0 = the other face of our own kiwi). */
  distance: number;
  travelMs: number;
}

export type AlienStructureKind = 'den' | 'roost';

/** A ferret den or a bat roost on an alien face (axial coordinates, snapped to land on screen). */
export interface AlienStructure {
  kind: AlienStructureKind;
  q: number;
  r: number;
}

/** The real alien garrison of a target: secret, server-side only when online. */
export interface AlienGarrison {
  /** Secret seed it was drawn from. */
  seed: string;
  /** Base defense (before growth and reinforcements). */
  defense: number;
  /** Defense added after each of our victories. */
  reinforce: number;
  /** Defense gained per game day (up to `ALIENS.maxGrowth` × base). */
  growth: number;
  /** Loot available on a victory (before cargo limits). */
  loot: Resources;
  /** Share of ferrets among the enemies (the rest are bats). */
  ferretShare: number;
  /** The garrison grows from this time on. */
  since: TimeMs;
  structures: AlienStructure[];
}

export interface IntelRange {
  min: number;
  max: number;
}

/** What missions told us about a target (public: it is the player's own knowledge). */
export interface IntelReport {
  /** Time the information was gathered. */
  at: TimeMs;
  source: 'recon' | 'raid';
  defense: IntelRange;
  ferrets: IntelRange;
  bats: IntelRange;
  /** Our victories against the target at that time (it reinforces after each). */
  victoriesAt: number;
  /** Sectors of the face seen so far (cumulative, see `INTEL.sectors`). */
  sectors: number[];
  /** Dens and roosts seen in those sectors. */
  structures: AlienStructure[];
  /** The scouts were spotted (incomplete report). */
  spotted?: boolean;
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
  /** The ship broke down and turned back half-way. */
  broken?: boolean;
  /** Reconnaissance: the scouts were spotted (skirmish, worse report). */
  spotted?: boolean;
  /** Reconnaissance: sectors seen for the first time. */
  sectors?: number[];
  /** Kiwis back home wounded (ids, see `roster` for their names). */
  injured?: VillagerId[];
}

export type MissionKind = 'raid' | 'recon';

export interface Expedition {
  id: string;
  /** Raid (fight and loot) or reconnaissance (bring back information). */
  mission: MissionKind;
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
  /** The ship broke down at take-off: it turns back half-way (chantier 07). */
  broken?: boolean;
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

/** A meteorite: a short-lived deposit on a land tile (chantier 06). */
export interface Meteor {
  id: string;
  q: number;
  r: number;
  resource: ResourceId;
  stock: number;
  max: number;
  landedAt: TimeMs;
  expiresAt: TimeMs;
}

/** Gifts from the sky: the next shooting star and the craters on the ground. */
export interface SkyState {
  /** Planned fall; the tile and the stock are drawn when the shooting star is seen. */
  next: {
    id: string;
    announceAt: TimeMs;
    at: TimeMs;
    announced: boolean;
    q: number;
    r: number;
    resource: ResourceId;
    stock: number;
  } | null;
  lastFallAt: TimeMs;
  falls: number;
  meteors: Meteor[];
}

/** Stardust lying on a tile after a comet (chantier 13), in raw units (`STARDUST_SCALE`). */
export interface DustPatch {
  id: string;
  q: number;
  r: number;
  stock: number;
  max: number;
  landedAt: TimeMs;
  expiresAt: TimeMs;
}

/** Comets (chantier 13): the next one and the stardust on the ground. */
export interface CometState {
  /** Planned comet; the tiles are drawn when it passes. */
  next: { id: string; announceAt: TimeMs; at: TimeMs; announced: boolean } | null;
  /** Last passage (0: none yet). */
  lastAt: TimeMs;
  passes: number;
  patches: DustPatch[];
}

/** A rock, a stump or a meteorite wreck blocking a land tile (chantier 08). */
export interface Obstacle {
  /** `<kind>:<q>,<r>`. */
  id: string;
  kind: ObstacleKind;
  q: number;
  r: number;
  /** What removing it yields. */
  loot: Partial<Resources>;
}

/** Research (chantier 08): points in raw units (`RESEARCH_SCALE` per point). */
export interface ResearchState {
  /** Points towards the current technology, or banked when none is chosen. */
  points: number;
  current: TechId | null;
  /** Researched technologies, in order. */
  done: TechId[];
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
  /**
   * The real alien garrisons per target. Hidden: absent from every state the server sends; the
   * simulation waits for the server to resolve arrivals when it is missing (chantier 07).
   */
  aliens?: Record<string, AlienGarrison>;
  /** What missions reported, per target. */
  intel: Record<string, IntelReport>;
  /** In flight and recent expeditions (the last few finished ones are kept for reports). */
  expeditions: Expedition[];
  /** Allies the ship can deliver to (set by the server from the universe; empty solo). */
  friends: Friend[];
  /** Our ship carrying a gift to an ally, until it is back. */
  shipments: Shipment[];
  /** Gifts on their way to us, credited when they land. */
  incoming: Delivery[];
  /** Tiles with a path (hex keys). */
  paths: string[];
  /** Unharvested deposits that are not full yet (hex key → stock); absent means full. */
  deposits: Record<string, FreeDeposit>;
  /** Rocks, stumps and wrecks blocking tiles. */
  obstacles: Obstacle[];
  /** Tiles reshaped by the Kikiwiwis (hex key → what they became; see `faceMapOf`). */
  terraform: Record<string, TerraformKind>;
  threats: ThreatState;
  sky: SkyState;
  comets: CometState;
  /** Stardust in raw units (`STARDUST_SCALE` per point), apart from the shared storage. */
  stardust: number;
  research: ResearchState;
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
  /** Secret seed of the alien garrisons (the server draws it; solo games derive it). */
  alienSeed?: string;
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
      travelMs: alienDefOf(0).travelMs,
    },
  ];
}

/** Seed of the alien garrisons of a local game (online games get a secret one from the server). */
export function localAlienSeed(state: Pick<GameState, 'seed' | 'face'>): string {
  return `${state.seed}/${state.face}/aliens`;
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
    intel: {},
    expeditions: [],
    friends: [],
    shipments: [],
    incoming: [],
    paths: [],
    deposits: {},
    obstacles: [],
    terraform: {},
    threats: newThreats(opts.seed, opts.face, opts.now),
    sky: newSky(opts.now),
    comets: newComets(opts.now),
    stardust: 0,
    research: { points: 0, current: null, done: [] },
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
  state.obstacles = generateObstacles(faceMapOf(state), new Set([hexKey(HEART)]));
  const alienSeed = opts.alienSeed ?? localAlienSeed(state);
  state.aliens = Object.fromEntries(
    state.targets.map((t) => [t.id, drawGarrison(t, `${alienSeed}/${t.id}`, opts.now)]),
  );
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

/** The first fall is planned at a fixed time (no draw at game creation). */
export function newSky(now: TimeMs): SkyState {
  const at = now + METEORS.firstMs;
  return {
    next: {
      id: 'm1',
      announceAt: at - METEORS.noticeMs,
      at,
      announced: false,
      q: 0,
      r: 0,
      resource: 'seeds',
      stock: 0,
    },
    lastFallAt: 0,
    falls: 0,
    meteors: [],
  };
}

/** The first comet is planned at a fixed time (no draw at game creation). */
export function newComets(now: TimeMs): CometState {
  const at = now + COMETS.firstMs;
  return {
    next: { id: 'c1', announceAt: at - COMETS.firstNoticeMs, at, announced: false },
    lastAt: 0,
    passes: 0,
    patches: [],
  };
}

/** Runs `fn` with the predators' RNG stream (also used by the gifts from the sky). */
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
    targets: state.targets.map((t) => ({ ...t })),
    victories: { ...state.victories },
    ...(state.aliens ? { aliens: cloneAliens(state.aliens) } : {}),
    intel: Object.fromEntries(Object.entries(state.intel).map(([k, i]) => [k, cloneIntel(i)])),
    paths: [...state.paths],
    deposits: Object.fromEntries(Object.entries(state.deposits).map(([k, d]) => [k, { ...d }])),
    obstacles: state.obstacles.map((o) => ({ ...o, loot: { ...o.loot } })),
    terraform: { ...state.terraform },
    threats: cloneThreats(state.threats),
    sky: {
      ...state.sky,
      next: state.sky.next ? { ...state.sky.next } : null,
      meteors: state.sky.meteors.map((m) => ({ ...m })),
    },
    comets: {
      ...state.comets,
      next: state.comets.next ? { ...state.comets.next } : null,
      patches: state.comets.patches.map((p) => ({ ...p })),
    },
    research: { ...state.research, done: [...state.research.done] },
    friends: state.friends.map((f) => ({ ...f })),
    shipments: state.shipments.map((x) => ({ ...x, resources: { ...x.resources } })),
    incoming: state.incoming.map((d) => ({ ...d, resources: { ...d.resources } })),
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
            ...(e.result.sectors ? { sectors: [...e.result.sectors] } : {}),
            ...(e.result.injured ? { injured: [...e.result.injured] } : {}),
          }
        : null,
    })),
    rng: [...state.rng] as RngState,
  };
}

export function cloneAliens(a: Record<string, AlienGarrison>): Record<string, AlienGarrison> {
  return Object.fromEntries(
    Object.entries(a).map(([k, g]) => [
      k,
      { ...g, loot: { ...g.loot }, structures: g.structures.map((x) => ({ ...x })) },
    ]),
  );
}

export function cloneIntel(i: IntelReport): IntelReport {
  return {
    ...i,
    defense: { ...i.defense },
    ferrets: { ...i.ferrets },
    bats: { ...i.bats },
    sectors: [...i.sectors],
    structures: i.structures.map((x) => ({ ...x })),
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
    job:
      v.job.kind === 'train' || v.job.kind === 'transform'
        ? { ...v.job, paid: { ...v.job.paid } }
        : { ...v.job },
    ...(v.kikiwiwi ? { kikiwiwi: { ...v.kikiwiwi } } : {}),
    stats: { ...v.stats },
    skillReadyAt: { ...v.skillReadyAt },
    mastery: { ...v.mastery },
    history: { ...v.history },
  };
}
