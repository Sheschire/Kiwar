import { Color, Group, Mesh, RingGeometry, MeshBasicMaterial, Vector3 } from 'three';
import {
  createRng,
  DEPOSITS,
  getBuilding,
  getTile,
  hexKey,
  hexRing,
  hexToPixel,
  HEART,
  harvestedTileType,
  isTurret,
  pixelToHex,
  TILES,
  type FaceMap,
  type GameState,
  type Hex,
  type ResourceId,
  type Rng,
  type ShinyColor,
  type ClassId,
  type Villager,
  type VillagerId,
  seasonOf,
  kiwiRhythm,
  type KiwiRhythm,
  nearestDepotOf,
  tileWalkCost,
  workerPower,
  workersOf,
  HOUR_MS,
  meteorRate,
  minersOf,
  defenseOf,
  rampartSectorOf,
  rampartSectors,
  type SectorId,
  occupancy,
  footprintTiles,
  atCabaretTonight,
  calendarAt,
  hexDistance,
  LEISURE,
  suppedTonight,
  type Building,
  type BuildingType,
} from '@kiwar/shared';
import { findPath } from './pathfinding';
import { TitansView } from './kikiwiwi';
import { DropLabels } from './dropLabels';
import { WATER_LEVEL } from './water';
import { bedsOf, harvestOf, perGame } from '../game/perState';
import { ClipPlayer, type ClipId } from './anim/clips';
import { KiwiRig } from './anim/kiwiRig';

const MAX_KIWIS = 64;
/** Path searches (A*) per frame; the other kiwis decide on the next frames. */
const MAX_PATHS_PER_FRAME = 6;
/** A Kikiwiwi stands this much taller than its kiwi self. */
const TITAN_SIZE = 1.6;
const WALK_SPEED = 1.15; // world units per second
/** Chantier 12: kiwis walk at a pace that follows the walking cost (paths are fastest). */
function stepSpeed(cost: number): number {
  return Number.isFinite(cost) ? Math.min(1.8, Math.max(0.6, 1 / Math.sqrt(cost))) : 1;
}

/** Chantier 34: where builders stand, from the centre of the site's tile. */
const FOOT = 0.72;

/** Chantier 43: kiwis who go and listen to a speech (at home, not hurt or in a vat). */
function gathers(v: Villager): boolean {
  const k = v.job.kind;
  return (
    k !== 'expedition' && k !== 'outpost' && k !== 'injured' && k !== 'transform' && k !== 'mine'
  );
}

/**
 * Chantier 43: where a listener stands before the Town Hall — rows of six in front of the door
 * (the anchor, away from the hall's other tiles), facing it; `-1` is the mayor on the steps.
 */
function crowdSpot(hall: Building, place: number): { point: Vector3; face: number } {
  const tiles = footprintTiles(hall).map((h) => hexToPixel(h));
  const cx = tiles.reduce((sum, p) => sum + p.x, 0) / tiles.length;
  const cz = tiles.reduce((sum, p) => sum + p.y, 0) / tiles.length;
  const door = hexToPixel(hall);
  let dx = door.x - cx;
  let dz = door.y - cz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  if (place < 0)
    return {
      point: new Vector3(door.x + dx * 0.6, 0, door.y + dz * 0.6),
      face: Math.atan2(dx, dz),
    };
  const row = Math.floor(place / 6);
  const col = (place % 6) - 2.5 + (row % 2 ? 0.5 : 0);
  const out = 1.25 + row * 0.42;
  return {
    point: new Vector3(door.x + dx * out - dz * col * 0.38, 0, door.y + dz * out + dx * col * 0.38),
    face: Math.atan2(-dx, -dz),
  };
}
/** Researchers' places around the Library (shelves, desks) and their distance. */
/** Chantier 44: what a kiwi does at each game (the game's own rig moves on its own). */
const PLAY_CLIPS: Partial<Record<BuildingType, readonly ClipId[]>> = {
  swing: ['joy', 'clap', 'sit', 'dance'],
  skittles: ['sling', 'sling', 'joy', 'clap'],
  skipPond: ['sling', 'look', 'joy', 'sit'],
  slide: ['joy', 'dance', 'clap', 'stretch'],
};

const LIBRARY_SPOTS = 6;
const LIBRARY_RING = 0.78;
/** The lesson at the School: the leader stands this far out, the class around them. */
const SCHOOL_FRONT = 0.95;
const SCHOOL_RADIUS = 0.62;
const SCHOOL_ARC = 2.6;
/** The move each class practises (School, guards' drills). */
const CLASS_CLIP: Record<ClassId, ClipId> = {
  builder: 'hammer',
  warrior: 'sword',
  mage: 'spell',
  scout: 'dagger',
  mayor: 'teach',
  gatherer: 'sling',
  bard: 'sing',
  architect: 'mace',
  navigator: 'dagger',
  champion: 'sword',
  archmage: 'spell',
  herbalist: 'sling',
  minstrel: 'sing',
  engineer: 'hammer',
  paladin: 'sword',
  druid: 'spell',
  ranger: 'sling',
  titan: 'mace',
  oracle: 'spell',
};
/** Guards' sectors (shared `defenseOf`), once per state. */
const guardSectors = perGame((state) => defenseOf(state));

/** A drop never counts more than this much game time (after a pause or a long jump). */
const MAX_LOAD_MS = 10 * 60_000;

/** Drop label colours (readable on the parchment-dark outline). */
const LABEL_COLORS: Record<ResourceId, string> = {
  pulp: '#c6ef7a',
  fiber: '#f3e2b8',
  seeds: '#f2d7a6',
  juice: '#eef56a',
};

type Activity = 'walk' | 'work' | 'idle' | 'build' | 'drop' | 'sleep';

interface Agent {
  id: VillagerId;
  pos: Vector3;
  heading: number;
  /** World waypoints still to visit. */
  path: Vector3[];
  /** Pace of each segment (walking cost of its tile, chantier 12). */
  stepSpeed: number[];
  activity: Activity;
  timer: number;
  phase: number;
  /** Job signature the current plan was made for. */
  plan: string;
  /** Where the agent is heading in its work loop. */
  leg: 'toWork' | 'toNest' | 'none';
  carrying: ResourceId | null;
  /** Chantier 16: game time since which the load being gathered accrues (last drop). */
  loadSince: number;
  tint: Color;
  scale: number;
  /** Random part of the size (the rest comes from the stats). */
  jitter: number;
  spawn: number;
  rng: Rng;
  /** Rest rhythm (shared `kiwiRhythm`), refreshed every second. */
  rhythm: KiwiRhythm;
  rhythmTimer: number;
  /** Asleep inside its home (not drawn). */
  inside: boolean;
  /** Chantier 34: the clips it plays. */
  player: ClipPlayer;
  /** Clip played while standing (null: the activity's default). */
  clip: ClipId | null;
  /** Heading to turn to while standing (null: keep). */
  face: number | null;
  /** Place in a round (Library shelves, guard posts). */
  spot: number;
  /** The kiwi it chats with. */
  partner: VillagerId | null;
}

/** "+12", "+3.4", "+0,4" in French (one decimal below 10, never below 0.1). */
export function formatDrop(amount: number, lang = document.documentElement.lang): string {
  if (amount >= 10) return `+${Math.round(amount)}`;
  const text = String(Math.max(0.1, Math.round(amount * 10) / 10));
  return `+${lang === 'fr' ? text.replace('.', ',') : text}`;
}

/** Shiny kiwis: the body colour is multiplied towards these (vertex colours stay in shape). */
export const SHINY_HEX: Record<ShinyColor, string> = {
  red: '#e0503c',
  yellow: '#f4c430',
  green: '#4cb04a',
  blue: '#3f7fe0',
  star: '#ffd86b',
};
const BODY_BROWN = new Color('#8a6440');

export function shinyTint(color: ShinyColor): Color {
  const c = new Color(SHINY_HEX[color]);
  return new Color(c.r / BODY_BROWN.r, c.g / BODY_BROWN.g, c.b / BODY_BROWN.b);
}

/** Sturdier kiwis look a little bigger. */
export function sizeOf(v: Villager, jitter: number): number {
  return (0.9 + (v.stats.strength + v.stats.endurance) * 0.008) * jitter;
}

const RESOURCE_COLORS: Record<ResourceId, Color> = {
  pulp: new Color('#a8d65a'),
  fiber: new Color('#e5cf9c'),
  seeds: new Color('#2a1f1a'),
  juice: new Color('#d6e43a'),
};

/**
 * The villagers: round kiwi birds that waddle between the Nest and their workplace.
 * Their positions are cosmetic (not part of the game state). All kiwis are drawn with four
 * instanced meshes: bodies, legs, blob shadows and carried loads.
 */
export class KiwisView {
  readonly group = new Group();
  /** Chantier 34: every part of every kiwi, posed from the clips. */
  private readonly rig = new KiwiRig(MAX_KIWIS);
  private readonly agents = new Map<VillagerId, Agent>();
  private readonly classOf = new Map<VillagerId, ClassId | null>();
  /** Villagers of the last state by id (rebuilt by `sync`, read every frame). */
  private villagers = new Map<VillagerId, Villager>();
  /** Path searches started this frame (`walkTo`), capped so a nightfall spreads its replans. */
  private pathsThisFrame = 0;
  private readonly ring: Mesh;
  /** Kikiwiwis have their own animated models (chantier 08). */
  private readonly titans = new TitansView();
  private readonly drops = new DropLabels();
  private highlightId: string | null = null;
  /** Kiwis drawn at the last update (for taps and sounds). */
  private drawn: Agent[] = [];
  private state: GameState | null = null;
  private paths = new Set<string>();
  /**
   * Chantier 34: each kiwi's place in its group, from the last state — a researcher's
   * shelf, "index/count" at the School (0 leads), a guard's sector. Part of the plan
   * signature, so a change of group sends the kiwi to its new place.
   */
  private readonly roles = new Map<VillagerId, string>();
  /** Chantier 43: each listener's place in the crowd before the Town Hall during a speech. */
  private readonly crowd = new Map<VillagerId, number>();
  /** Chantier 43: who sits at which campfire tonight, and its place in the circle. */
  private readonly campers = new Map<VillagerId, { fire: Hex; place: number; count: number }>();
  /** Chantier 44: who plays at which game while resting by day, and its spot around it. */
  private readonly players = new Map<VillagerId, { game: Building; angle: number }>();
  /** Guard posts by sector, rebuilt when the turrets change. */
  private readonly posts = new Map<string, { point: Vector3; face: number }[]>();
  private turretsKey = '';

  constructor(private readonly map: FaceMap) {
    this.group.add(this.rig.group);
    this.ring = new Mesh(
      new RingGeometry(0.3, 0.4, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: '#ffcf3a',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.group.add(this.titans.group);
    this.group.add(this.drops.group);
  }

  sync(state: GameState): void {
    if (state.paths.length !== this.paths.size || state.paths.some((k) => !this.paths.has(k)))
      this.paths = new Set(state.paths);
    this.state = state;
    this.villagers = new Map(state.villagers.map((v) => [v.id, v]));
    for (const id of this.agents.keys()) if (!this.villagers.has(id)) this.agents.delete(id);
    this.titans.keep(new Set(state.villagers.filter((v) => v.kikiwiwi).map((v) => v.id)));
    this.assignRoles(state);
    this.classOf.clear();
    for (const v of state.villagers) {
      this.classOf.set(v.id, v.classId);
      const agent = this.agents.get(v.id);
      if (agent) {
        agent.scale = sizeOf(v, agent.jitter) * (v.kikiwiwi ? TITAN_SIZE : 1);
        if (v.shiny) agent.tint.copy(shinyTint(v.shiny));
      } else if (this.agents.size < MAX_KIWIS) this.agents.set(v.id, this.spawn(v));
    }
  }

  private assignRoles(state: GameState): void {
    this.roles.clear();
    const groups = new Map<string, Villager[]>();
    const join = (key: string, v: Villager) => {
      const list = groups.get(key);
      if (list) list.push(v);
      else groups.set(key, [v]);
    };
    for (const v of state.villagers) {
      if (v.job.kind === 'work') join(`w:${v.job.buildingId}`, v);
      else if (v.job.kind === 'train') join(`t:${v.job.schoolId}`, v);
    }
    for (const [key, list] of groups) {
      if (key.startsWith('t:')) {
        // The student closest to the end of the class leads the lesson.
        const until = (v: Villager) => (v.job.kind === 'train' ? v.job.until : 0);
        list.sort((a, b) => until(a) - until(b) || a.id.localeCompare(b.id));
        list.forEach((v, i) => this.roles.set(v.id, `${i}/${list.length}`));
      } else {
        list.sort((a, b) => a.id.localeCompare(b.id));
        // Researchers spread around the Library (every other shelf first).
        list.forEach((v, i) =>
          this.roles.set(v.id, String((i * 2 + (i >= 3 ? 1 : 0)) % LIBRARY_SPOTS)),
        );
      }
    }
    this.assignCampers(state);
    this.assignPlayers(state);
    this.crowd.clear();
    if (state.speech.until > state.now)
      state.villagers
        .filter((v) => gathers(v))
        .map((v) => v.id)
        .sort((a, b) => a.localeCompare(b))
        .forEach((id, i) => this.crowd.set(id, i));
    if (state.villagers.some((v) => v.job.kind === 'guard'))
      for (const g of guardSectors(state).guards) this.roles.set(g.id, g.sector);
    const turrets = state.buildings
      .filter((b) => isTurret(b.type))
      .map((b) => `${b.q},${b.r}`)
      .join(';');
    if (turrets !== this.turretsKey) {
      this.turretsKey = turrets;
      this.posts.clear();
    }
  }

  /** Chantier 36: kiwis drawn by the battle show meanwhile (not here). */
  private hidden: ReadonlySet<string> = new Set();

  setHidden(ids: Iterable<string> | null): void {
    this.hidden = new Set(ids ?? []);
  }

  /** Shows a pulsing ring under one kiwi (null hides it). */
  setHighlight(id: string | null): void {
    this.highlightId = id;
  }

  private spawn(v: Villager): Agent {
    const rng = createRng(`kiwi/${v.id}`);
    // Brightness-only variation so beaks and eyes keep their colours.
    const brightness = rng.range(0.82, 1.15);
    const tint = v.shiny ? shinyTint(v.shiny) : new Color(1, 1, 1).multiplyScalar(brightness);
    const jitter = rng.range(0.96, 1.04);
    return {
      id: v.id,
      pos: this.nestPoint(rng),
      heading: rng.range(0, Math.PI * 2),
      path: [],
      stepSpeed: [],
      activity: 'idle',
      timer: rng.range(0.2, 1.5),
      phase: rng.range(0, 6),
      plan: '',
      leg: 'none',
      carrying: null,
      loadSince: this.state?.now ?? 0,
      tint,
      jitter,
      scale: sizeOf(v, jitter) * (v.kikiwiwi ? TITAN_SIZE : 1),
      spawn: 0,
      rng,
      rhythm: 'work',
      // Spread over a second, so all the kiwis do not reconsider their rhythm in one frame.
      rhythmTimer: rng.range(0, 1),
      inside: false,
      player: new ClipPlayer(rng.range(0, 10)),
      clip: null,
      face: null,
      spot: 0,
      partner: null,
    };
  }

  private tileTopY(h: Hex): number {
    const t = getTile(this.map, h);
    if (!t) return 0;
    return t.type === 'juice' ? t.height + WATER_LEVEL + 0.12 : t.height;
  }

  private worldOf(h: Hex, rng: Rng, spread = 0.35): Vector3 {
    const p = hexToPixel(h);
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, spread);
    return new Vector3(p.x + Math.cos(a) * d, this.tileTopY(h), p.y + Math.sin(a) * d);
  }

  private nestPoint(rng: Rng): Vector3 {
    // Around the Nest, on the heart ring.
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(1.3, 1.9);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const p = new Vector3(x, 0, z);
    p.y = this.surfaceY(p);
    return p;
  }

  private hexAt(p: Vector3): Hex {
    return pixelToHex(p.x, p.z);
  }

  private surfaceY(p: Vector3): number {
    return this.tileTopY(this.hexAt(p));
  }

  /** Plans a walk from the agent position to a target tile. */
  private walkTo(agent: Agent, target: Hex, spread = 0.35): void {
    const from = this.hexAt(agent.pos);
    const season = this.state ? seasonOf(this.state) : 'spring';
    this.pathsThisFrame++;
    const blocked = this.state ? occupancy(this.state).blocked : undefined;
    const hexes = findPath(this.map, from, target, this.paths, season, blocked) ?? [from, target];
    const pts: Vector3[] = [];
    const speeds: number[] = [];
    const biome = this.map.params.biome;
    for (let i = 1; i < hexes.length; i++) {
      const h = hexes[i]!;
      const last = i === hexes.length - 1;
      pts.push(last ? this.worldOf(h, agent.rng, spread) : this.worldOf(h, agent.rng, 0.22));
      const tile = getTile(this.map, h);
      speeds.push(
        tile ? stepSpeed(tileWalkCost(tile.type, this.paths.has(hexKey(h)), season, biome)) : 1,
      );
    }
    if (pts.length === 0) pts.push(this.worldOf(target, agent.rng, spread));
    agent.path = pts;
    agent.stepSpeed = speeds;
    agent.activity = 'walk';
    agent.clip = null;
  }

  private workTile(villager: Villager): { hex: Hex; resource: ResourceId | null } | null {
    if (!this.state) return null;
    if (villager.job.kind === 'work') {
      const b = getBuilding(this.state, villager.job.buildingId);
      if (!b) return null;
      const type = harvestedTileType(this.map, b);
      const resource = (type && DEPOSITS[type]?.resource) ?? null;
      return { hex: { q: b.q, r: b.r }, resource };
    }
    if (villager.job.kind === 'train') {
      const school = getBuilding(this.state, villager.job.schoolId);
      return school ? { hex: { q: school.q, r: school.r }, resource: null } : null;
    }
    if (villager.job.kind === 'titan')
      return { hex: { q: villager.job.q, r: villager.job.r }, resource: null };
    if (villager.job.kind === 'stardust') {
      const patchId = villager.job.patchId;
      const p = this.state.comets.patches.find((x) => x.id === patchId);
      return p ? { hex: { q: p.q, r: p.r }, resource: null } : null;
    }
    if (villager.job.kind === 'meteor') {
      // Chantier 15: a crater is harvested like a workplace (loads carried to the depot).
      const meteorId = villager.job.meteorId;
      const m = this.state.sky.meteors.find((x) => x.id === meteorId);
      return m ? { hex: { q: m.q, r: m.r }, resource: m.resource } : null;
    }
    if (villager.job.kind === 'transform') {
      const lab = getBuilding(this.state, villager.job.labId);
      return lab ? { hex: { q: lab.q, r: lab.r }, resource: null } : null;
    }
    if (villager.job.kind === 'build') {
      const jobId = villager.job.queueItemId;
      const item = this.state.queue.find((i) => i.id === jobId);
      return item ? { hex: { q: item.q, r: item.r }, resource: null } : null;
    }
    return null;
  }

  /**
   * Chantier 16: "+0.4" and the resource icon over the depot: what this kiwi gathered since its
   * last drop (its own worker power's share of the building's output × the game time elapsed),
   * so the drops of an hour add up to the real rate.
   */
  private showDrop(agent: Agent, villager: Villager): void {
    if (!this.state || !agent.carrying) return;
    const now = this.state.now;
    const elapsed = Math.min(MAX_LOAD_MS, Math.max(0, now - agent.loadSince));
    agent.loadSince = now;
    if (villager.job.kind === 'meteor') {
      // Chantier 15: this miner's share of the crater's harvest.
      const meteorId = villager.job.meteorId;
      const m = this.state.sky.meteors.find((x) => x.id === meteorId);
      if (!m || elapsed <= 0) return;
      const crew = minersOf(this.state, m.id);
      const total = crew.reduce((sum, v) => sum + workerPower(v, m.resource), 0);
      const share = total > 0 ? workerPower(villager, m.resource) / total : 0;
      const amount = (meteorRate(this.state, m) * share * elapsed) / HOUR_MS;
      if (amount > 0)
        this.drops.spawn(
          agent.pos.x,
          agent.pos.y + 0.5,
          agent.pos.z,
          formatDrop(amount),
          m.resource,
          LABEL_COLORS[m.resource],
        );
      return;
    }
    if (villager.job.kind !== 'work') return;
    const b = getBuilding(this.state, villager.job.buildingId);
    const h = b ? harvestOf(this.state, b.id) : null;
    if (!h || h.output <= 0 || elapsed <= 0) return;
    const resource = agent.carrying;
    const crew = workersOf(this.state, villager.job.buildingId);
    const total = crew.reduce((sum, v) => sum + workerPower(v, resource), 0);
    const share =
      total > 0 ? workerPower(villager, resource) / total : 1 / Math.max(1, crew.length);
    const amount = (h.output * share * elapsed) / HOUR_MS;
    this.drops.spawn(
      agent.pos.x,
      agent.pos.y + 0.5,
      agent.pos.z,
      formatDrop(amount),
      resource,
      LABEL_COLORS[resource],
    );
  }

  /** The depot the harvest goes to: the nearest by walk, as in the simulation (null: Nest). */
  private nearestDepot(from: Hex): Hex | null {
    if (!this.state) return null;
    const depot = nearestDepotOf(this.state, this.map, from)?.building;
    return !depot || depot.type === 'nest' ? null : { q: depot.q, r: depot.r };
  }

  /** Tired or sleepy kiwis go to their bed (inside their hut or the Nest). */
  private thinkRest(agent: Agent, villager: Villager): boolean {
    const job = villager.job;
    // Taking shelter from a wave: everybody runs into the Nest.
    const shelter = !!this.state && this.state.threats.shelterUntil > this.state.now;
    if (
      !shelter &&
      job.kind !== 'injured' &&
      (agent.rhythm === 'work' ||
        job.kind === 'build' ||
        job.kind === 'train' ||
        job.kind === 'transform' ||
        job.kind === 'titan' ||
        job.kind === 'stardust')
    ) {
      agent.inside = false;
      return false;
    }
    const bedId = shelter
      ? this.state?.buildings.find((b) => b.type === 'nest')?.id
      : this.state
        ? bedsOf(this.state).get(villager.id)?.buildingId
        : null;
    const home = bedId ? this.state?.buildings.find((b) => b.id === bedId) : undefined;
    const sig = `${shelter ? 'shelter' : 'rest'}:${bedId ?? '-'}`;
    if (sig !== agent.plan) {
      agent.plan = sig;
      agent.carrying = null;
      agent.leg = 'none';
      agent.inside = false;
      if (home) this.walkTo(agent, home, 0.2);
      else {
        agent.activity = 'sleep';
        agent.clip = job.kind === 'injured' ? 'hurt' : null;
        agent.timer = 1e9;
      }
      return true;
    }
    if (agent.activity === 'walk' && agent.path.length === 0) {
      agent.activity = 'sleep';
      agent.timer = 1e9;
      agent.inside = !!home;
    }
    return true;
  }

  /** Decides what an agent does next, according to its villager's job. */
  private think(agent: Agent, villager: Villager): void {
    if (this.thinkSpeech(agent, villager)) return;
    if (this.thinkCabaret(agent, villager)) return;
    if (this.thinkVigil(agent, villager)) return;
    if (this.thinkPlay(agent, villager)) return;
    if (this.thinkRest(agent, villager)) return;
    const job = villager.job;
    const role = this.roles.get(villager.id) ?? '';
    const sig =
      job.kind === 'work'
        ? `w:${job.buildingId}:${role}`
        : job.kind === 'build'
          ? `b:${job.queueItemId}`
          : job.kind === 'train'
            ? `t:${role}`
            : job.kind === 'guard'
              ? `g:${role}`
              : job.kind === 'transform'
                ? `x:${job.labId}`
                : job.kind === 'titan'
                  ? `T:${job.q},${job.r}`
                  : job.kind === 'stardust'
                    ? `d:${job.patchId}`
                    : job.kind === 'meteor'
                      ? `m:${job.meteorId}`
                      : 'idle';
    const changed = sig !== agent.plan;
    if (changed) this.leavePartner(agent);
    agent.plan = sig;
    const work = this.workTile(villager);
    const arrived = agent.activity === 'walk' && agent.path.length === 0;

    // In the vat: walks to the laboratory and floats inside until the infusion ends.
    if (job.kind === 'transform' && work) {
      if (changed) {
        agent.carrying = null;
        agent.inside = false;
        this.walkTo(agent, work.hex, 0.2);
      } else if (arrived) {
        agent.activity = 'sleep';
        agent.timer = 1e9;
        agent.inside = true;
      }
      return;
    }

    // Chantier 37: trainees drill their class's move around the training camp.
    if (
      job.kind === 'work' &&
      work &&
      getBuilding(this.state!, job.buildingId)?.type === 'trainingCamp'
    ) {
      this.thinkCamp(agent, villager, work.hex, role, changed, arrived);
      return;
    }

    // Chantier 34: researchers live around the Library — reading, writing, changing shelves.
    if (job.kind === 'work' && work && !work.resource) {
      this.thinkLibrary(agent, work.hex, role, changed, arrived);
      return;
    }

    // Chantier 34: a class at the School — the most advanced student leads the lesson.
    if (job.kind === 'train' && work) {
      this.thinkSchool(agent, villager, work.hex, role, changed, arrived);
      return;
    }

    // Chantier 34: builders and repairers hammer at the foot of the site.
    if (job.kind === 'build' && work) {
      if (changed || (agent.activity !== 'walk' && agent.activity !== 'build')) {
        agent.carrying = null;
        const site = hexToPixel(work.hex);
        let dx = agent.pos.x - site.x;
        let dz = agent.pos.z - site.y;
        const d = Math.hypot(dx, dz);
        const a =
          (d > 1e-3 ? Math.atan2(dx, dz) : agent.rng.range(0, Math.PI * 2)) +
          agent.rng.range(-0.6, 0.6);
        dx = Math.sin(a);
        dz = Math.cos(a);
        const spot = new Vector3(site.x + dx * FOOT, 0, site.y + dz * FOOT);
        this.walkToPoint(agent, spot);
        agent.face = Math.atan2(-dx, -dz);
        agent.leg = 'toWork';
      } else if (arrived) {
        this.settle(agent, 'build', 'hammer', 1e9);
      }
      return;
    }

    if ((job.kind === 'titan' || job.kind === 'stardust') && work) {
      if (changed || (agent.activity !== 'walk' && agent.activity !== 'build')) {
        agent.carrying = null;
        this.walkTo(agent, work.hex, 0.55);
        agent.leg = 'toWork';
      } else if (arrived) {
        // Stardust is picked up grain by grain; titans stomp.
        this.settle(agent, 'build', job.kind === 'stardust' ? 'peck' : 'hammer', 1e9);
      }
      return;
    }

    if ((job.kind === 'work' || job.kind === 'meteor') && work) {
      if (changed) {
        agent.carrying = null;
        agent.loadSince = this.state?.now ?? 0;
        this.walkTo(agent, work.hex);
        agent.leg = 'toWork';
        return;
      }
      if (arrived) {
        if (agent.leg === 'toWork') {
          this.settle(agent, 'work', 'peck', agent.rng.range(3.5, 7));
        } else {
          this.settle(agent, 'drop', 'idle', agent.rng.range(0.6, 1.4));
          if (agent.carrying) this.showDrop(agent, villager);
          agent.carrying = null;
        }
        return;
      }
      if (agent.timer <= 0) {
        if (agent.activity === 'work') {
          agent.carrying = work.resource;
          // Harvests go to the nearest depot (the Nest or a Warehouse).
          const depot = this.nearestDepot(work.hex);
          this.walkTo(agent, depot ?? this.nestRing(agent), 0.4);
          agent.leg = 'toNest';
        } else if (agent.activity === 'drop' || agent.activity === 'idle') {
          this.walkTo(agent, work.hex);
          agent.leg = 'toWork';
        }
      }
      return;
    }

    // Chantier 34: on guard, a round between the posts of the kiwi's own sector.
    if (job.kind === 'guard') {
      this.thinkGuard(agent, villager, role, changed, arrived);
      return;
    }

    this.thinkIdle(agent, changed, arrived);
  }

  /**
   * Chantier 43: during a speech every kiwi at home stands in rows before the Town Hall's door
   * and listens (now and then it claps); the mayor speaks from the steps.
   */
  private thinkSpeech(agent: Agent, villager: Villager): boolean {
    const s = this.state;
    const place = this.crowd.get(villager.id);
    if (!s || place === undefined) return false;
    const hall = s.buildings.find((b) => b.type === 'townHall');
    if (!hall) return false;
    const mayor = villager.classId === 'mayor';
    const sig = `speech:${hall.id}:${place}`;
    if (agent.plan !== sig) {
      agent.plan = sig;
      agent.carrying = null;
      agent.leg = 'none';
      agent.inside = false;
      this.leavePartner(agent);
      const { point, face } = crowdSpot(hall, mayor ? -1 : place);
      this.walkToPoint(agent, point);
      agent.face = face;
      return true;
    }
    const arrived = agent.activity === 'walk' && agent.path.length === 0;
    if (arrived || (agent.activity !== 'walk' && agent.timer <= 0)) {
      const clip: ClipId = mayor
        ? agent.rng.chance(0.3)
          ? 'joy'
          : 'teach'
        : agent.clip === 'listen' && agent.rng.chance(0.35)
          ? 'clap'
          : 'listen';
      this.settle(agent, 'idle', clip, agent.rng.range(2.5, 6));
    }
    return true;
  }

  /**
   * Chantier 43: in the first half of the night, the kiwis who supped at a campfire sit in a
   * circle around it — eating from the basket, singing, clapping, dancing — then go to bed.
   */
  private assignCampers(state: GameState): void {
    this.campers.clear();
    const fires = state.buildings.filter((b) => b.type === 'campfire');
    if (fires.length === 0) return;
    const c = calendarAt(state.calendarStart, state.now);
    if (!c.night || state.now > c.nightAt + (c.dawnAt - c.nightAt) / 2) return;
    const radius = LEISURE.campfire?.radius ?? 0;
    const beds = bedsOf(state);
    const circles = new Map<Building, VillagerId[]>();
    for (const v of state.villagers) {
      if (!suppedTonight(state, v) || v.job.kind === 'injured' || v.job.kind === 'guard') continue;
      const hutId = beds.get(v.id)?.buildingId;
      const hut = hutId ? state.buildings.find((b) => b.id === hutId) : undefined;
      if (!hut) continue;
      let best: Building | null = null;
      for (const f of fires) {
        const d = hexDistance(f, hut);
        if (d <= radius && (!best || d < hexDistance(best, hut))) best = f;
      }
      if (!best) continue;
      const list = circles.get(best) ?? [];
      list.push(v.id);
      circles.set(best, list);
    }
    for (const [fire, ids] of circles) {
      ids.sort((a, b) => a.localeCompare(b));
      ids.forEach((id, place) =>
        this.campers.set(id, { fire: { q: fire.q, r: fire.r }, place, count: ids.length }),
      );
    }
  }

  /**
   * Chantier 44: about half of the kiwis whose bed lies within reach of a game play there when
   * they rest by day (instead of going to bed) or have no post (always the same game for a
   * kiwi).
   */
  private assignPlayers(state: GameState): void {
    this.players.clear();
    const games = state.buildings.filter((b) => b.type !== 'campfire' && LEISURE[b.type]);
    if (games.length === 0) return;
    const beds = bedsOf(state);
    const homes = new Map(state.buildings.map((b) => [b.id, b]));
    for (const v of state.villagers) {
      const hash = createRng(`play/${v.id}`).next();
      if (hash < 0.5) continue;
      const hutId = beds.get(v.id)?.buildingId;
      const hut = hutId ? homes.get(hutId) : undefined;
      if (!hut) continue;
      const near = games.filter((g) => hexDistance(g, hut) <= LEISURE[g.type]!.radius);
      if (near.length === 0) continue;
      const game = near[Math.floor(hash * 2 * near.length) % near.length]!;
      this.players.set(v.id, { game, angle: hash * 97 });
    }
  }

  private thinkPlay(agent: Agent, villager: Villager): boolean {
    const spot = this.players.get(villager.id);
    const state = this.state;
    const job = villager.job;
    if (!spot || !state || (agent.rhythm !== 'rest' && job.kind !== 'idle')) return false;
    if (job.kind === 'injured' || job.kind === 'guard' || state.threats.shelterUntil > state.now)
      return false;
    if (calendarAt(state.calendarStart, state.now).night) return false;
    const { game, angle } = spot;
    const sig = `play:${game.id}`;
    if (agent.plan !== sig) {
      agent.plan = sig;
      agent.carrying = null;
      agent.leg = 'none';
      agent.inside = false;
      this.leavePartner(agent);
      this.walkToPoint(agent, this.around(game, angle, 0.55));
      agent.face = angle + Math.PI;
      return true;
    }
    const arrived = agent.activity === 'walk' && agent.path.length === 0;
    if (arrived || (agent.activity !== 'walk' && agent.timer <= 0)) {
      const clips = PLAY_CLIPS[game.type] ?? PLAY_CLIPS.swing!;
      this.settle(agent, 'idle', agent.rng.pick(clips), agent.rng.range(3, 7));
      agent.face = angle + Math.PI;
    }
    return true;
  }

  /**
   * Chantier 44: in the first half of the night, the cabaret's guests walk to its door and spend
   * the evening inside (then go to bed).
   */
  private thinkCabaret(agent: Agent, villager: Villager): boolean {
    const state = this.state;
    if (!state || !atCabaretTonight(state, villager)) return false;
    if (villager.job.kind === 'injured' || villager.job.kind === 'guard') return false;
    const c = calendarAt(state.calendarStart, state.now);
    if (!c.night || state.now > c.nightAt + (c.dawnAt - c.nightAt) / 2) return false;
    const hall = state.buildings.find((b) => b.type === 'cabaret');
    if (!hall) return false;
    const sig = `cabaret:${hall.id}`;
    if (agent.plan !== sig) {
      agent.plan = sig;
      agent.carrying = null;
      agent.leg = 'none';
      agent.inside = false;
      this.leavePartner(agent);
      this.walkTo(agent, hall, 0.2);
      return true;
    }
    if (agent.activity === 'walk' && agent.path.length === 0) {
      agent.activity = 'sleep';
      agent.timer = 1e9;
      agent.inside = true;
    }
    return true;
  }

  private thinkVigil(agent: Agent, villager: Villager): boolean {
    const seat = this.campers.get(villager.id);
    if (!seat) return false;
    // Two rings when the circle is crowded.
    const inner = Math.min(seat.count, 8);
    const ring = seat.place < inner ? 0 : 1;
    const n = ring ? seat.count - inner : inner;
    const k = ring ? seat.place - inner : seat.place;
    const angle = (k / Math.max(1, n)) * Math.PI * 2 + ring * 0.4;
    const sig = `vigil:${seat.fire.q},${seat.fire.r}:${seat.place}:${seat.count}`;
    if (agent.plan !== sig) {
      agent.plan = sig;
      agent.carrying = null;
      agent.leg = 'none';
      agent.inside = false;
      this.leavePartner(agent);
      this.walkToPoint(agent, this.around(seat.fire, angle, 0.78 + ring * 0.4));
      agent.face = angle + Math.PI;
      return true;
    }
    const arrived = agent.activity === 'walk' && agent.path.length === 0;
    if (arrived || (agent.activity !== 'walk' && agent.timer <= 0)) {
      const roll = agent.rng.next();
      const clip: ClipId =
        roll < 0.3
          ? 'eat'
          : roll < 0.5
            ? 'sing'
            : roll < 0.65
              ? 'clap'
              : roll < 0.75
                ? 'dance'
                : roll < 0.85
                  ? 'joy'
                  : 'sit';
      this.settle(agent, 'idle', clip, agent.rng.range(3, 7));
    }
    return true;
  }

  /** Stops walking and plays a clip in place for `timer` seconds. */
  private settle(agent: Agent, activity: Activity, clip: ClipId, timer: number): void {
    agent.activity = activity;
    agent.clip = clip;
    agent.timer = timer;
  }

  /** Walks to an exact point (A* to its tile, then straight to the point). */
  private walkToPoint(agent: Agent, point: Vector3): void {
    point.y = this.surfaceY(point);
    this.walkTo(agent, this.hexAt(point), 0);
    agent.path[agent.path.length - 1] = point;
  }

  /** A point at `dist` from the centre of a tile, in direction `angle` (world azimuth). */
  private around(h: Hex, angle: number, dist: number): Vector3 {
    const c = hexToPixel(h);
    return new Vector3(c.x + Math.sin(angle) * dist, 0, c.y + Math.cos(angle) * dist);
  }

  private thinkCamp(
    agent: Agent,
    villager: Villager,
    camp: Hex,
    role: string,
    changed: boolean,
    arrived: boolean,
  ): void {
    const drill = villager.classId ? CLASS_CLIP[villager.classId] : 'peck';
    if (changed) {
      agent.carrying = null;
      agent.leg = 'toWork';
      const angle = ((Number(role) || 0) / LIBRARY_SPOTS) * Math.PI * 2 + 0.8;
      this.walkToPoint(agent, this.around(camp, angle, LIBRARY_RING));
      agent.face = angle + Math.PI;
      return;
    }
    if (arrived || (agent.activity === 'work' && agent.timer <= 0)) {
      // Drills, with a breather now and then.
      const rest = agent.clip === drill && agent.rng.chance(0.3);
      this.settle(agent, 'work', rest ? 'idle' : drill, agent.rng.range(4, 9));
    }
  }

  private thinkLibrary(
    agent: Agent,
    library: Hex,
    role: string,
    changed: boolean,
    arrived: boolean,
  ): void {
    const go = (spot: number) => {
      agent.spot = spot;
      const angle = (spot / LIBRARY_SPOTS) * Math.PI * 2 + 0.3;
      this.walkToPoint(agent, this.around(library, angle, LIBRARY_RING));
      // Back to the shelves, the book towards the light.
      agent.face = angle + agent.rng.range(-0.5, 0.5);
    };
    if (changed) {
      agent.carrying = null;
      agent.leg = 'toWork';
      go(Number(role) % LIBRARY_SPOTS || 0);
      return;
    }
    if (arrived) {
      this.settle(agent, 'work', agent.rng.chance(0.55) ? 'read' : 'write', agent.rng.range(6, 12));
      return;
    }
    if (agent.activity === 'work' && agent.timer <= 0) {
      if (agent.rng.chance(0.3)) {
        // Another shelf: one or two places along.
        const step = agent.rng.chance(0.5) ? 1 : 2;
        go((agent.spot + (agent.rng.chance(0.5) ? step : LIBRARY_SPOTS - step)) % LIBRARY_SPOTS);
      } else {
        this.settle(
          agent,
          'work',
          agent.clip === 'read' ? 'write' : 'read',
          agent.rng.range(6, 12),
        );
      }
    }
  }

  private thinkSchool(
    agent: Agent,
    villager: Villager,
    school: Hex,
    role: string,
    changed: boolean,
    arrived: boolean,
  ): void {
    // role = "index/count": index 0 leads, the others sit in a half circle facing them.
    const [index = 0, count = 1] = role.split('/').map(Number);
    const demo = villager.job.kind === 'train' ? CLASS_CLIP[villager.job.classId] : 'teach';
    if (changed) {
      const out = this.lessonSide(school);
      const front = this.around(school, out, SCHOOL_FRONT);
      agent.carrying = null;
      agent.leg = 'toWork';
      if (index === 0) {
        this.walkToPoint(agent, front.clone());
        agent.face = out;
      } else {
        const students = count - 1;
        const t = students === 1 ? 0 : (index - 1) / (students - 1) - 0.5;
        const a = out + t * SCHOOL_ARC;
        const seat = new Vector3(
          front.x + Math.sin(a) * SCHOOL_RADIUS,
          0,
          front.z + Math.cos(a) * SCHOOL_RADIUS,
        );
        this.walkToPoint(agent, seat);
        agent.face = a + Math.PI;
      }
      return;
    }
    const lead = index === 0;
    if (arrived) {
      this.settle(agent, 'work', lead ? (count > 1 ? 'teach' : demo) : 'listen', 3);
      return;
    }
    if (agent.activity === 'work' && agent.timer <= 0) {
      if (lead) {
        // Explains, then shows the move.
        const next = agent.clip === 'teach' || count === 1 ? demo : 'teach';
        this.settle(
          agent,
          'work',
          next,
          next === 'teach' ? agent.rng.range(5, 8) : agent.rng.range(3, 5),
        );
        if (count === 1 && agent.clip === demo && agent.rng.chance(0.4))
          this.settle(agent, 'work', 'read', agent.rng.range(4, 7));
      } else {
        // Listens, and now and then tries the move.
        const practise = agent.clip === 'listen' && agent.rng.chance(0.35);
        this.settle(
          agent,
          'work',
          practise ? demo : 'listen',
          practise ? agent.rng.range(3, 5) : agent.rng.range(5, 10),
        );
      }
    }
  }

  /**
   * The side of the School where the lesson is given: towards a free neighbouring tile
   * (walkable, no building), the one closest to the heart of the village.
   */
  private lessonSide(school: Hex): number {
    const c = hexToPixel(school);
    let best = Math.hypot(c.x, c.y) > 1e-3 ? Math.atan2(-c.x, -c.y) : 0;
    let bestD = Infinity;
    const taken = new Set((this.state?.buildings ?? []).map((b) => hexKey(b)));
    for (const h of hexRing(school, 1)) {
      const t = getTile(this.map, h);
      if (!t || !TILES[t.type].walkable || taken.has(hexKey(h))) continue;
      const p = hexToPixel(h);
      const d = Math.hypot(p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = Math.atan2(p.x - c.x, p.y - c.y);
      }
    }
    return best;
  }

  private thinkGuard(
    agent: Agent,
    villager: Villager,
    role: string,
    changed: boolean,
    arrived: boolean,
  ): void {
    const posts = this.guardPosts(role as SectorId);
    const go = () => {
      agent.spot = (agent.spot + 1) % Math.max(1, posts.length);
      const post = posts[agent.spot];
      if (!post) {
        this.walkTo(agent, this.nestRing(agent), 0.45);
        agent.face = null;
        return;
      }
      // Several guards at one post stand side by side.
      const a = agent.rng.range(0, Math.PI * 2);
      const d = agent.rng.range(0.1, 0.3);
      this.walkToPoint(
        agent,
        new Vector3(post.point.x + Math.sin(a) * d, 0, post.point.z + Math.cos(a) * d),
      );
      agent.face = post.face + agent.rng.range(-0.4, 0.4);
    };
    if (changed) {
      agent.carrying = null;
      agent.leg = 'toWork';
      agent.spot = agent.rng.int(0, Math.max(1, posts.length) - 1);
      go();
      return;
    }
    if (arrived) {
      this.settle(agent, 'idle', 'look', agent.rng.range(5, 10));
      return;
    }
    if (agent.activity === 'idle' && agent.timer <= 0) {
      const drill = villager.classId ? CLASS_CLIP[villager.classId] : null;
      if (agent.clip === 'look' && drill && drill !== 'teach' && agent.rng.chance(0.25)) {
        this.settle(agent, 'idle', drill, agent.rng.range(2.5, 4));
      } else if (posts.length > 1 && agent.rng.chance(0.6)) {
        go();
      } else {
        this.settle(agent, 'idle', 'look', agent.rng.range(5, 10));
      }
    }
  }

  /**
   * Posts of a sector's round: beside its turrets (on the village side), or on its rampart
   * without turrets; each with the direction the guard watches (outwards).
   */
  private guardPosts(sector: SectorId | ''): { point: Vector3; face: number }[] {
    if (!this.state || !sector) return [];
    const key = `${sector}`;
    const cached = this.posts.get(key);
    if (cached) return cached;
    const walkable = (p: Vector3) => {
      const t = getTile(this.map, this.hexAt(p));
      return !!t && TILES[t.type].walkable;
    };
    const posts: { point: Vector3; face: number }[] = [];
    for (const b of this.state.buildings) {
      if (!isTurret(b.type) || rampartSectorOf(b) !== sector) continue;
      const c = hexToPixel(b);
      const outward = Math.atan2(c.x, c.y);
      // Turrets stand on the rampart: the guard stands just inside, on the walkable side.
      for (const turn of [0, 0.5, -0.5, 1, -1]) {
        const p = this.around(b, outward + Math.PI + turn, 1.15);
        if (walkable(p)) {
          posts.push({ point: p, face: outward });
          break;
        }
      }
    }
    if (posts.length === 0) {
      const ramparts = rampartSectors(this.map);
      const tiles = ramparts.tiles.filter((_, i) => ramparts.sectors[i] === sector);
      // Three spots spread along the sector's rampart (angles from its middle: no wrap).
      const angles = tiles.map((t) => Math.atan2(hexToPixel(t).x, hexToPixel(t).y));
      const mid = Math.atan2(
        angles.reduce((sum, a) => sum + Math.sin(a), 0),
        angles.reduce((sum, a) => sum + Math.cos(a), 0),
      );
      const sorted = tiles
        .map((t, i) => ({
          t,
          a: angles[i]!,
          d: Math.atan2(Math.sin(angles[i]! - mid), Math.cos(angles[i]! - mid)),
        }))
        .sort((x, y) => x.d - y.d);
      for (const k of [0.2, 0.5, 0.8]) {
        const pick = sorted[Math.floor(k * sorted.length)];
        if (!pick) continue;
        const p = this.around(pick.t, pick.a + Math.PI, 1.15);
        if (walkable(p)) posts.push({ point: p, face: pick.a });
      }
    }
    this.posts.set(key, posts);
    return posts;
  }

  /** Idle kiwis potter about the Nest: peck, stretch, sit, look around, chat in pairs. */
  private thinkIdle(agent: Agent, changed: boolean, arrived: boolean): void {
    if (changed) {
      agent.carrying = null;
      agent.leg = 'none';
      agent.face = null;
      this.walkTo(agent, this.nestRing(agent), 0.45);
      return;
    }
    if (arrived) {
      const partner = agent.partner ? this.agents.get(agent.partner) : undefined;
      if (partner && partner.partner === agent.id) {
        // Reached the friend: both chat, facing each other.
        const t = agent.rng.range(6, 11);
        this.settle(agent, 'idle', 'chat', t);
        this.settle(partner, 'idle', 'chat', t);
        agent.face = Math.atan2(partner.pos.x - agent.pos.x, partner.pos.z - agent.pos.z);
        partner.face = agent.face + Math.PI;
        return;
      }
      agent.partner = null;
      this.settle(agent, 'idle', this.pastime(agent), agent.rng.range(4, 9));
      return;
    }
    if (agent.activity === 'idle' && agent.timer <= 0) {
      this.leavePartner(agent);
      const roll = agent.rng.next();
      if (roll < 0.25 && this.startChat(agent)) return;
      if (roll < 0.6) {
        this.settle(agent, 'idle', this.pastime(agent), agent.rng.range(4, 9));
        return;
      }
      agent.face = null;
      const target = agent.rng.chance(0.7) ? this.nestRing(agent) : this.randomNear(agent);
      this.walkTo(agent, target, 0.45);
    }
  }

  private pastime(agent: Agent): ClipId {
    const roll = agent.rng.next();
    agent.face = agent.heading + agent.rng.range(-1, 1);
    return roll < 0.3
      ? 'peck'
      : roll < 0.45
        ? 'stretch'
        : roll < 0.6
          ? 'sit'
          : roll < 0.65
            ? 'dance'
            : 'idle';
  }

  /** Walks over to another idle kiwi nearby for a chat; false if nobody is free. */
  private startChat(agent: Agent): boolean {
    for (const other of this.drawn) {
      if (other === agent || other.partner || other.activity !== 'idle' || other.plan !== 'idle')
        continue;
      const dx = agent.pos.x - other.pos.x;
      const dz = agent.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.5 || d < 1e-3) continue;
      agent.partner = other.id;
      other.partner = agent.id;
      // The friend waits, looking our way.
      this.settle(other, 'idle', 'idle', 30);
      other.face = Math.atan2(dx, dz);
      this.walkToPoint(
        agent,
        new Vector3(other.pos.x + (dx / d) * 0.36, 0, other.pos.z + (dz / d) * 0.36),
      );
      return true;
    }
    return false;
  }

  /** Ends a chat: the friend goes back to its own pastimes. */
  private leavePartner(agent: Agent): void {
    const partner = agent.partner ? this.agents.get(agent.partner) : undefined;
    agent.partner = null;
    if (partner && partner.partner === agent.id) {
      partner.partner = null;
      if (partner.activity === 'idle') partner.timer = Math.min(partner.timer, 0.5);
    }
  }

  /** A tile of the heart ring around the Nest (the Nest itself fills the centre). */
  private nestRing(agent: Agent): Hex {
    return agent.rng.pick(hexRing(HEART, 1));
  }

  private randomNear(agent: Agent): Hex {
    const options = this.map.tiles.filter((t) => t.rho < 0.3 && TILES[t.type].walkable);
    const t = options.length ? agent.rng.pick(options) : HEART;
    return { q: t.q, r: t.r };
  }

  /** Kiwis currently on the map, with their world position. */
  visible(): readonly { id: VillagerId; pos: Vector3 }[] {
    return this.drawn;
  }

  update(dt: number, time: number, now: number): void {
    if (!this.state) return;
    const villagers = this.villagers;
    const weak = this.state.resources.juice <= 1e-6;
    const beds = bedsOf(this.state);
    this.pathsThisFrame = 0;
    this.titans.update(dt, weak);
    this.drops.update(dt);
    this.drawn.length = 0;
    for (const agent of this.agents.values()) {
      const villager = villagers.get(agent.id);
      // Kiwis away on an expedition or posted on the twin (chantier 19) are not on the map;
      // nor are the miners below (chantier 48; the cut of chantier 49 shows them).
      if (
        !villager ||
        villager.job.kind === 'expedition' ||
        villager.job.kind === 'outpost' ||
        villager.job.kind === 'mine' ||
        this.hidden.has(agent.id)
      ) {
        this.titans.hide(agent.id);
        continue;
      }
      agent.timer -= dt;
      agent.rhythmTimer -= dt;
      if (agent.rhythmTimer <= 0) {
        agent.rhythmTimer = 1;
        agent.rhythm = kiwiRhythm(this.state, villager, now, beds).rhythm;
      }
      agent.spawn = Math.min(1, agent.spawn + dt * 2);
      // Past a few path searches, the others think next frame (no visible delay).
      if (this.pathsThisFrame < MAX_PATHS_PER_FRAME) this.think(agent, villager);
      // Asleep inside its hut: not drawn.
      if (agent.inside) {
        this.titans.hide(agent.id);
        continue;
      }
      this.drawn.push(agent);

      // Movement.
      let speed = 0;
      if (agent.activity === 'walk' && agent.path.length > 0) {
        const target = agent.path[0]!;
        const fast = agent.stepSpeed[0] ?? 1;
        // Kikiwiwis stride slower, but further.
        speed = WALK_SPEED * fast * (villager.kikiwiwi ? 0.8 : 1);
        const dx = target.x - agent.pos.x;
        const dz = target.z - agent.pos.z;
        const dist = Math.hypot(dx, dz);
        const step = speed * dt;
        const desired = Math.atan2(dx, dz);
        let diff = desired - agent.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        agent.heading += diff * Math.min(1, dt * 10);
        if (dist <= step) {
          agent.pos.x = target.x;
          agent.pos.z = target.z;
          agent.path.shift();
          agent.stepSpeed.shift();
        } else {
          agent.pos.x += (dx / dist) * step;
          agent.pos.z += (dz / dist) * step;
        }
        // Smoothly follow terrain heights (small hop between tiles).
        const ground = this.surfaceY(agent.pos);
        agent.pos.y += (ground - agent.pos.y) * Math.min(1, dt * 14);
      }

      // Animation.
      const moving = speed > 0;
      agent.phase +=
        dt * (moving ? 13 * (speed / WALK_SPEED) : agent.activity === 'build' ? 16 : 5);
      const ph = agent.phase;
      if (villager.kikiwiwi) {
        this.titans.pose(
          agent.id,
          {
            x: agent.pos.x,
            y: agent.pos.y,
            z: agent.pos.z,
            heading: agent.heading,
            phase: ph,
            moving,
            activity: agent.activity,
            scale: agent.scale * (0.4 + 0.6 * easeOutBack(agent.spawn)),
            weak,
          },
          dt,
        );
        continue;
      }
      if (!moving && agent.face !== null) {
        // Standing: turn smoothly towards what it is busy with.
        const diff = Math.atan2(
          Math.sin(agent.face - agent.heading),
          Math.cos(agent.face - agent.heading),
        );
        agent.heading += diff * Math.min(1, dt * 5);
      }
      agent.player.play(moving ? 'walk' : (agent.clip ?? clipOf(agent.activity)));
      const pose = agent.player.pose(dt, moving ? speed / WALK_SPEED : 1);
      this.rig.draw({
        x: agent.pos.x,
        y: agent.pos.y,
        z: agent.pos.z,
        heading: agent.heading,
        scale: agent.scale * (0.4 + 0.6 * easeOutBack(agent.spawn)),
        pose,
        tint: agent.tint,
        classId: this.classOf.get(agent.id) ?? null,
        load: agent.carrying ? RESOURCE_COLORS[agent.carrying] : null,
        weapon: this.villagers.get(agent.id)?.gear?.weapon ?? null,
        armor: this.villagers.get(agent.id)?.gear?.armor ?? null,
      });
    }
    this.rig.end();
    const lit = this.highlightId ? this.agents.get(this.highlightId as VillagerId) : undefined;
    const shown = !!lit && this.drawn.includes(lit);
    this.ring.visible = shown;
    if (lit && shown) {
      const pulse = 1 + Math.sin(time * 4) * 0.08;
      this.ring.position.set(lit.pos.x, lit.pos.y + 0.02, lit.pos.z);
      this.ring.scale.setScalar(lit.scale * pulse);
    }
  }

  dispose(): void {
    this.rig.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    this.titans.dispose();
    this.drops.dispose();
  }
}

/** The clip that shows an activity. */
function clipOf(activity: Activity): ClipId {
  switch (activity) {
    case 'work':
      return 'peck';
    case 'build':
      return 'hammer';
    case 'sleep':
      return 'sleep';
    default:
      return 'idle';
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
