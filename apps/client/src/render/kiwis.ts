import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  RingGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  CLASS_IDS,
  type Villager,
  type VillagerId,
  seasonOf,
  kiwiRhythm,
  type KiwiRhythm,
  nearestDepotOf,
  tileWalkCost,
  workersOf,
} from '@kiwar/shared';
import { findPath } from './pathfinding';
import { TitansView } from './kikiwiwi';
import { DropLabels } from './dropLabels';
import { WATER_LEVEL } from './water';
import { bedsOf, harvestOf } from '../game/perState';

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

/** "+N/h" colours (readable on the parchment-dark outline). */
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
}

/** Shiny kiwis: the body colour is multiplied towards these (vertex colours stay in shape). */
export const SHINY_HEX: Record<ShinyColor, string> = {
  red: '#e0503c',
  yellow: '#f4c430',
  green: '#4cb04a',
  blue: '#3f7fe0',
};
const BODY_BROWN = new Color('#8a6440');

function shinyTint(color: ShinyColor): Color {
  const c = new Color(SHINY_HEX[color]);
  return new Color(c.r / BODY_BROWN.r, c.g / BODY_BROWN.g, c.b / BODY_BROWN.b);
}

/** Sturdier kiwis look a little bigger. */
function sizeOf(v: Villager, jitter: number): number {
  return (0.9 + (v.stats.strength + v.stats.endurance) * 0.008) * jitter;
}

const RESOURCE_COLORS: Record<ResourceId, Color> = {
  pulp: new Color('#a8d65a'),
  fiber: new Color('#e5cf9c'),
  seeds: new Color('#2a1f1a'),
  juice: new Color('#d6e43a'),
};

function colored(geo: BufferGeometry, color: string, matrix: Matrix4): BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(matrix);
  g.deleteAttribute('uv');
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return g;
}

const mat = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(sx, sy, sz),
  );

/** Kiwi bird body (body + head + beak + eyes), facing +Z, feet at y = 0. */
function createBodyGeometry(): BufferGeometry {
  const parts = [
    colored(new SphereGeometry(1, 12, 9), '#8a6440', mat(0, 0.2, 0, 0.19, 0.16, 0.23)),
    colored(new SphereGeometry(1, 10, 8), '#7d5a39', mat(0, 0.27, 0.17, 0.1, 0.095, 0.1)),
    colored(
      new ConeGeometry(1, 1, 6),
      '#e3c07a',
      mat(0, 0.2, 0.36, 0.022, 0.26, 0.022, Math.PI / 2 + 0.55),
    ),
    colored(new SphereGeometry(1, 6, 5), '#1a120e', mat(0.06, 0.3, 0.24, 0.018, 0.018, 0.018)),
    colored(new SphereGeometry(1, 6, 5), '#1a120e', mat(-0.06, 0.3, 0.24, 0.018, 0.018, 0.018)),
  ];
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/** Class outfits, in the body's frame (merged with vertex colours, one instanced mesh each). */
function createOutfitGeometry(cls: ClassId): BufferGeometry {
  const halfSphere = () => new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const parts: BufferGeometry[] = [];
  switch (cls) {
    case 'builder':
      parts.push(colored(halfSphere(), '#f2c14e', mat(0, 0.33, 0.17, 0.105, 0.08, 0.105)));
      parts.push(
        colored(new CylinderGeometry(1, 1, 1, 12), '#d9a82e', mat(0, 0.335, 0.2, 0.12, 0.01, 0.13)),
      );
      break;
    case 'warrior':
      parts.push(colored(halfSphere(), '#a8a296', mat(0, 0.32, 0.17, 0.108, 0.09, 0.108)));
      parts.push(
        colored(new ConeGeometry(1, 1, 4), '#c0504a', mat(0, 0.43, 0.16, 0.02, 0.06, 0.02)),
      );
      parts.push(
        colored(
          new CylinderGeometry(1, 1, 1, 4),
          '#e6e6e6',
          mat(0.2, 0.2, 0.02, 0.012, 0.3, 0.012, 0.5, 0, 0),
        ),
      );
      parts.push(
        colored(
          new CylinderGeometry(1, 1, 1, 4),
          '#7a5233',
          mat(0.2, 0.08, -0.05, 0.01, 0.08, 0.04, 0.5, 0, 0),
        ),
      );
      break;
    case 'mage':
      parts.push(
        colored(
          new ConeGeometry(1, 1, 8),
          '#6a4fb3',
          mat(0, 0.45, 0.15, 0.075, 0.24, 0.075, -0.2, 0, 0),
        ),
      );
      parts.push(
        colored(
          new CylinderGeometry(1, 1, 1, 12),
          '#4a3590',
          mat(0, 0.34, 0.17, 0.13, 0.012, 0.13),
        ),
      );
      parts.push(
        colored(new IcosahedronGeometry(1, 0), '#f2c14e', mat(0, 0.45, 0.205, 0.016, 0.016, 0.016)),
      );
      break;
    case 'scout':
      for (const side of [-1, 1]) {
        parts.push(
          colored(
            new CylinderGeometry(1, 1, 1, 3),
            '#c9c0ae',
            mat(side * 0.2, 0.27, -0.05, 0.1, 0.012, 0.16, 0, 0, side * 0.5),
          ),
        );
      }
      parts.push(
        colored(new SphereGeometry(1, 6, 5), '#bfe3ff', mat(0.05, 0.31, 0.24, 0.03, 0.03, 0.02)),
      );
      parts.push(
        colored(new SphereGeometry(1, 6, 5), '#bfe3ff', mat(-0.05, 0.31, 0.24, 0.03, 0.03, 0.02)),
      );
      break;
    case 'mayor':
      parts.push(
        colored(new CylinderGeometry(1, 1, 1, 12), '#2b2522', mat(0, 0.42, 0.16, 0.06, 0.13, 0.06)),
      );
      parts.push(
        colored(new CylinderGeometry(1, 1, 1, 12), '#2b2522', mat(0, 0.36, 0.16, 0.1, 0.012, 0.1)),
      );
      parts.push(
        colored(
          new CylinderGeometry(1, 1, 1, 12),
          '#c0504a',
          mat(0, 0.38, 0.16, 0.062, 0.02, 0.062),
        ),
      );
      parts.push(
        colored(
          new CylinderGeometry(1, 1, 1, 6),
          '#c0504a',
          mat(0, 0.2, 0.02, 0.2, 0.025, 0.035, 0, 0.7, 0.9),
        ),
      );
      break;
  }
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

/**
 * The villagers: round kiwi birds that waddle between the Nest and their workplace.
 * Their positions are cosmetic (not part of the game state). All kiwis are drawn with four
 * instanced meshes: bodies, legs, blob shadows and carried loads.
 */
export class KiwisView {
  readonly group = new Group();
  private readonly bodies: InstancedMesh;
  private readonly legs: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly loads: InstancedMesh;
  private readonly agents = new Map<VillagerId, Agent>();
  private readonly outfits = new Map<ClassId, InstancedMesh>();
  private readonly classOf = new Map<VillagerId, ClassId | null>();
  /** Villagers of the last state by id (rebuilt by `sync`, read every frame). */
  private villagers = new Map<VillagerId, Villager>();
  /** Instances used per outfit mesh this frame (reused, not reallocated). */
  private readonly outfitCount = new Map<InstancedMesh, number>();
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
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor(private readonly map: FaceMap) {
    this.bodies = new InstancedMesh(
      createBodyGeometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
      MAX_KIWIS,
    );
    this.legs = new InstancedMesh(
      new CylinderGeometry(0.014, 0.012, 0.13, 5).translate(0, -0.065, 0),
      new MeshStandardMaterial({ color: '#d9a35f', roughness: 0.8 }),
      MAX_KIWIS * 2,
    );
    this.shadows = new InstancedMesh(
      new CircleGeometry(0.2, 16).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: '#2b1a24',
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
      MAX_KIWIS,
    );
    this.loads = new InstancedMesh(
      new IcosahedronGeometry(0.075, 0),
      new MeshStandardMaterial({ roughness: 0.6 }),
      MAX_KIWIS,
    );
    for (const mesh of [this.bodies, this.legs, this.shadows, this.loads]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
    this.shadows.renderOrder = 1;
    const outfitMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      flatShading: true,
    });
    for (const cls of CLASS_IDS) {
      const mesh = new InstancedMesh(createOutfitGeometry(cls), outfitMaterial, MAX_KIWIS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.outfits.set(cls, mesh);
      this.group.add(mesh);
    }
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
      tint,
      jitter,
      scale: sizeOf(v, jitter) * (v.kikiwiwi ? TITAN_SIZE : 1),
      spawn: 0,
      rng,
      rhythm: 'work',
      // Spread over a second, so all the kiwis do not reconsider their rhythm in one frame.
      rhythmTimer: rng.range(0, 1),
      inside: false,
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
    const hexes = findPath(this.map, from, target, this.paths, season) ?? [from, target];
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

  /** Chantier 12: "+N/h" over the depot, this kiwi's share of its workplace's output. */
  private showDrop(agent: Agent, villager: Villager): void {
    if (!this.state || villager.job.kind !== 'work' || !agent.carrying) return;
    const b = getBuilding(this.state, villager.job.buildingId);
    const h = b ? harvestOf(this.state, b.id) : null;
    const crew = b ? workersOf(this.state, b.id).length : 0;
    if (!h || crew === 0 || h.output <= 0) return;
    const perKiwi = h.output / crew;
    const text = `+${perKiwi >= 10 ? Math.round(perKiwi) : Math.round(perKiwi * 10) / 10}/h`;
    this.drops.spawn(
      agent.pos.x,
      agent.pos.y + 0.5,
      agent.pos.z,
      text,
      LABEL_COLORS[agent.carrying],
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
        job.kind === 'titan')
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
    if (this.thinkRest(agent, villager)) return;
    const job = villager.job;
    const sig =
      job.kind === 'work'
        ? `w:${job.buildingId}`
        : job.kind === 'build'
          ? `b:${job.queueItemId}`
          : job.kind === 'train'
            ? `t:${job.schoolId}`
            : job.kind === 'guard'
              ? 'g'
              : job.kind === 'transform'
                ? `x:${job.labId}`
                : job.kind === 'titan'
                  ? `T:${job.q},${job.r}`
                  : 'idle';
    const changed = sig !== agent.plan;
    agent.plan = sig;
    const work = this.workTile(villager);

    // In the vat: walks to the laboratory and floats inside until the infusion ends.
    if (job.kind === 'transform' && work) {
      if (changed) {
        agent.carrying = null;
        agent.inside = false;
        this.walkTo(agent, work.hex, 0.2);
      } else if (agent.activity === 'walk' && agent.path.length === 0) {
        agent.activity = 'sleep';
        agent.timer = 1e9;
        agent.inside = true;
      }
      return;
    }

    if ((job.kind === 'build' || job.kind === 'train' || job.kind === 'titan') && work) {
      if (changed || (agent.activity !== 'walk' && agent.activity !== 'build')) {
        agent.carrying = null;
        this.walkTo(agent, work.hex, 0.55);
        agent.leg = 'toWork';
      } else if (agent.activity === 'walk' && agent.path.length === 0) {
        agent.activity = 'build';
        agent.timer = 1e9;
      }
      return;
    }

    if (job.kind === 'work' && work) {
      if (changed) {
        agent.carrying = null;
        this.walkTo(agent, work.hex);
        agent.leg = 'toWork';
        return;
      }
      if (agent.activity === 'walk' && agent.path.length === 0) {
        if (agent.leg === 'toWork') {
          agent.activity = 'work';
          agent.timer = agent.rng.range(3.5, 7);
        } else {
          agent.activity = 'drop';
          agent.timer = agent.rng.range(0.6, 1.4);
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

    // On guard: stand at the foot of a turret (or around the Nest) and watch.
    if (job.kind === 'guard') {
      if (changed) {
        agent.carrying = null;
        agent.leg = 'toWork';
        this.walkTo(agent, this.guardPost(agent), 0.45);
      } else if (agent.activity === 'walk' && agent.path.length === 0) {
        agent.activity = 'idle';
        agent.timer = 1e9;
      }
      return;
    }

    // Idle: potter around the Nest.
    if (changed) {
      agent.carrying = null;
      agent.leg = 'none';
      this.walkTo(agent, this.nestRing(agent), 0.45);
      return;
    }
    if (agent.activity === 'walk' && agent.path.length === 0) {
      agent.activity = 'idle';
      agent.timer = agent.rng.range(2, 6);
    } else if (agent.activity === 'idle' && agent.timer <= 0) {
      const target = agent.rng.chance(0.7) ? this.nestRing(agent) : this.randomNear(agent);
      this.walkTo(agent, target, 0.45);
    }
  }

  /** Land next to a turret (one picked per kiwi), or the Nest ring without turrets. */
  private guardPost(agent: Agent): Hex {
    const turrets = (this.state?.buildings ?? []).filter((b) => isTurret(b.type));
    if (turrets.length === 0) return this.nestRing(agent);
    const t = agent.rng.pick(turrets);
    const land = hexRing(t, 1).filter((h) => {
      const tile = getTile(this.map, h);
      return !!tile && TILES[tile.type].walkable;
    });
    return land.length ? agent.rng.pick(land) : this.nestRing(agent);
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
    const outfitCount = this.outfitCount;
    for (const mesh of this.outfits.values()) outfitCount.set(mesh, 0);
    const weak = this.state.resources.juice <= 1e-6;
    const beds = bedsOf(this.state);
    this.pathsThisFrame = 0;
    this.titans.update(dt, weak);
    this.drops.update(dt);
    let i = 0;
    this.drawn.length = 0;
    for (const agent of this.agents.values()) {
      const villager = villagers.get(agent.id);
      // Kiwis away on an expedition are not on the map.
      if (!villager || villager.job.kind === 'expedition') {
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
      let bob = 0;
      let roll = 0;
      let pitch = 0;
      let yawWobble = 0;
      if (moving) {
        bob = Math.abs(Math.sin(ph)) * 0.045;
        roll = Math.sin(ph) * 0.18;
      } else if (agent.activity === 'work') {
        pitch = Math.max(0, Math.sin(ph * 1.6)) * 0.55; // pecking
      } else if (agent.activity === 'build') {
        bob = Math.abs(Math.sin(ph)) * 0.07; // hopping hammer dance
        pitch = Math.max(0, Math.sin(ph)) * 0.35;
      } else if (agent.activity === 'sleep') {
        // Asleep outside: curled up, breathing.
        roll = 1.2;
        bob = -0.05 + Math.sin(time * 1.5 + agent.phase) * 0.008;
      } else {
        yawWobble = Math.sin(time * 0.8 + agent.scale * 20) * 0.5;
        bob = Math.max(0, Math.sin(ph * 0.5)) * 0.01;
      }

      const sc = agent.scale * (0.4 + 0.6 * easeOutBack(agent.spawn));
      const legLift = 0.13 * sc;
      const cosH = Math.cos(agent.heading);
      const sinH = Math.sin(agent.heading);
      this.e.set(pitch, agent.heading + yawWobble, roll, 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(agent.pos.x, agent.pos.y + legLift * 0.85 + bob, agent.pos.z);
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.bodies.setColorAt(i, agent.tint);
      const cls = this.classOf.get(agent.id);
      const outfit = cls ? this.outfits.get(cls) : undefined;
      if (outfit) {
        const n = outfitCount.get(outfit) ?? 0;
        outfit.setMatrixAt(n, this.m);
        outfitCount.set(outfit, n + 1);
      }

      // Legs swing alternately.
      for (let l = 0; l < 2; l++) {
        const side = l === 0 ? 1 : -1;
        const swing = moving ? Math.sin(ph + l * Math.PI) * 0.7 : 0;
        // The hip offset turned with the heading (a rotation about Y, without allocating).
        const hip = 0.06 * side * sc;
        this.e.set(swing, agent.heading, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.v.set(
          agent.pos.x + hip * cosH,
          agent.pos.y + legLift * 0.9 + bob,
          agent.pos.z - hip * sinH,
        );
        this.m.compose(this.v, this.q, this.s);
        this.legs.setMatrixAt(i * 2 + l, this.m);
      }

      // Blob shadow.
      this.q.identity();
      this.v.set(agent.pos.x, agent.pos.y + 0.012, agent.pos.z);
      this.s.set(sc * (1 - bob * 2), 1, sc * (1 - bob * 2));
      this.m.compose(this.v, this.q, this.s);
      this.shadows.setMatrixAt(i, this.m);

      // Load carried on the back.
      if (agent.carrying) {
        const back = -0.06 * sc;
        this.m.compose(
          this.v.set(
            agent.pos.x + back * sinH,
            agent.pos.y + 0.36 * sc + legLift * 0.85 + bob,
            agent.pos.z + back * cosH,
          ),
          this.q.identity(),
          this.s.set(sc, sc, sc),
        );
        this.loads.setColorAt(i, RESOURCE_COLORS[agent.carrying]);
      } else {
        this.m.makeScale(0, 0, 0);
      }
      this.loads.setMatrixAt(i, this.m);
      i++;
    }
    for (const [mesh, n] of outfitCount) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    const lit = this.highlightId ? this.agents.get(this.highlightId as VillagerId) : undefined;
    const shown = !!lit && this.drawn.includes(lit);
    this.ring.visible = shown;
    if (lit && shown) {
      const pulse = 1 + Math.sin(time * 4) * 0.08;
      this.ring.position.set(lit.pos.x, lit.pos.y + 0.02, lit.pos.z);
      this.ring.scale.setScalar(lit.scale * pulse);
    }
    for (const mesh of [this.bodies, this.shadows, this.loads]) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.legs.count = i * 2;
    this.legs.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.bodies, this.legs, this.shadows, this.loads, this.ring]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    for (const mesh of this.outfits.values()) mesh.geometry.dispose();
    this.titans.dispose();
    this.drops.dispose();
    (this.outfits.get('builder')?.material as MeshStandardMaterial | undefined)?.dispose();
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
