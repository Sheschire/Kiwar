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
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BUILDINGS,
  createRng,
  getBuilding,
  getTile,
  hexRing,
  hexToPixel,
  HEART,
  levelDef,
  pixelToHex,
  RESOURCE_IDS,
  TILES,
  type FaceMap,
  type GameState,
  type Hex,
  type ResourceId,
  type Rng,
  type Villager,
  type VillagerId,
} from '@kiwar/shared';
import { findPath } from './pathfinding';
import { WATER_LEVEL } from './water';

const MAX_KIWIS = 64;
const WALK_SPEED = 1.15; // world units per second
const RAY_SPEEDUP = 1.6;

type Activity = 'walk' | 'work' | 'idle' | 'build' | 'drop';

interface Agent {
  id: VillagerId;
  pos: Vector3;
  heading: number;
  /** World waypoints still to visit. */
  path: Vector3[];
  /** Ray flags for the segments (faster walking). */
  fastPath: boolean[];
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
  spawn: number;
  rng: Rng;
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
  private state: GameState | null = null;
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
  }

  sync(state: GameState): void {
    this.state = state;
    const ids = new Set(state.villagers.map((v) => v.id));
    for (const id of this.agents.keys()) if (!ids.has(id)) this.agents.delete(id);
    for (const v of state.villagers) {
      if (!this.agents.has(v.id) && this.agents.size < MAX_KIWIS)
        this.agents.set(v.id, this.spawn(v));
    }
  }

  private spawn(v: Villager): Agent {
    const rng = createRng(`kiwi/${v.id}`);
    // Brightness-only variation so beaks and eyes keep their colours.
    const tint = new Color(1, 1, 1).multiplyScalar(rng.range(0.82, 1.15));
    return {
      id: v.id,
      pos: this.nestPoint(rng),
      heading: rng.range(0, Math.PI * 2),
      path: [],
      fastPath: [],
      activity: 'idle',
      timer: rng.range(0.2, 1.5),
      phase: rng.range(0, 6),
      plan: '',
      leg: 'none',
      carrying: null,
      tint,
      scale: rng.range(0.92, 1.08),
      spawn: 0,
      rng,
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
    const hexes = findPath(this.map, from, target) ?? [from, target];
    const pts: Vector3[] = [];
    const fast: boolean[] = [];
    for (let i = 1; i < hexes.length; i++) {
      const h = hexes[i]!;
      const last = i === hexes.length - 1;
      pts.push(last ? this.worldOf(h, agent.rng, spread) : this.worldOf(h, agent.rng, 0.22));
      fast.push(getTile(this.map, h)?.type === 'ray');
    }
    if (pts.length === 0) pts.push(this.worldOf(target, agent.rng, spread));
    agent.path = pts;
    agent.fastPath = fast;
    agent.activity = 'walk';
  }

  private workTile(villager: Villager): { hex: Hex; resource: ResourceId | null } | null {
    if (!this.state) return null;
    if (villager.job.kind === 'work') {
      const b = getBuilding(this.state, villager.job.buildingId);
      if (!b) return null;
      const prod =
        levelDef(b.type, b.level)?.production ?? BUILDINGS[b.type].levels[0]!.production ?? {};
      const resource = RESOURCE_IDS.find((r) => (prod[r] ?? 0) > 0) ?? null;
      return { hex: { q: b.q, r: b.r }, resource };
    }
    if (villager.job.kind === 'build') {
      const jobId = villager.job.queueItemId;
      const item = this.state.queue.find((i) => i.id === jobId);
      return item ? { hex: { q: item.q, r: item.r }, resource: null } : null;
    }
    return null;
  }

  /** Decides what an agent does next, according to its villager's job. */
  private think(agent: Agent, villager: Villager): void {
    const job = villager.job;
    const sig =
      job.kind === 'work'
        ? `w:${job.buildingId}`
        : job.kind === 'build'
          ? `b:${job.queueItemId}`
          : 'idle';
    const changed = sig !== agent.plan;
    agent.plan = sig;
    const work = this.workTile(villager);

    if (job.kind === 'build' && work) {
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
          agent.carrying = null;
        }
        return;
      }
      if (agent.timer <= 0) {
        if (agent.activity === 'work') {
          agent.carrying = work.resource;
          this.walkTo(agent, this.nestRing(agent), 0.4);
          agent.leg = 'toNest';
        } else if (agent.activity === 'drop' || agent.activity === 'idle') {
          this.walkTo(agent, work.hex);
          agent.leg = 'toWork';
        }
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

  /** A tile of the heart ring around the Nest (the Nest itself fills the centre). */
  private nestRing(agent: Agent): Hex {
    return agent.rng.pick(hexRing(HEART, 1));
  }

  private randomNear(agent: Agent): Hex {
    const options = this.map.tiles.filter((t) => t.rho < 0.3 && TILES[t.type].walkable);
    const t = options.length ? agent.rng.pick(options) : HEART;
    return { q: t.q, r: t.r };
  }

  update(dt: number, time: number): void {
    if (!this.state) return;
    const villagers = new Map(this.state.villagers.map((v) => [v.id, v]));
    let i = 0;
    for (const agent of this.agents.values()) {
      const villager = villagers.get(agent.id);
      if (!villager) continue;
      agent.timer -= dt;
      agent.spawn = Math.min(1, agent.spawn + dt * 2);
      this.think(agent, villager);

      // Movement.
      let speed = 0;
      if (agent.activity === 'walk' && agent.path.length > 0) {
        const target = agent.path[0]!;
        const fast = agent.fastPath[0] ? RAY_SPEEDUP : 1;
        speed = WALK_SPEED * fast;
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
          agent.fastPath.shift();
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
      } else {
        yawWobble = Math.sin(time * 0.8 + agent.scale * 20) * 0.5;
        bob = Math.max(0, Math.sin(ph * 0.5)) * 0.01;
      }

      const sc = agent.scale * (0.4 + 0.6 * easeOutBack(agent.spawn));
      const legLift = 0.13 * sc;
      this.e.set(pitch, agent.heading + yawWobble, roll, 'YXZ');
      this.q.setFromEuler(this.e);
      this.v.set(agent.pos.x, agent.pos.y + legLift * 0.85 + bob, agent.pos.z);
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.bodies.setColorAt(i, agent.tint);

      // Legs swing alternately.
      for (let l = 0; l < 2; l++) {
        const side = l === 0 ? 1 : -1;
        const swing = moving ? Math.sin(ph + l * Math.PI) * 0.7 : 0;
        const offset = new Vector3(0.06 * side * sc, legLift * 0.9 + bob, 0).applyEuler(
          new Euler(0, agent.heading, 0),
        );
        this.e.set(swing, agent.heading, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        this.v.set(agent.pos.x + offset.x, agent.pos.y + offset.y, agent.pos.z + offset.z);
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
        const back = new Vector3(0, 0.36 * sc + legLift * 0.85 + bob, -0.06 * sc).applyEuler(
          new Euler(0, agent.heading, 0),
        );
        this.m.compose(
          this.v.set(agent.pos.x + back.x, agent.pos.y + back.y, agent.pos.z + back.z),
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
    for (const mesh of [this.bodies, this.legs, this.shadows, this.loads]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
