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
} from '@kiwar/shared';
import { findPath } from './pathfinding';
import { TitansView } from './kikiwiwi';
import { DropLabels } from './dropLabels';
import { WATER_LEVEL } from './water';
import { bedsOf, harvestOf } from '../game/perState';
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
                  : job.kind === 'stardust'
                    ? `d:${job.patchId}`
                    : job.kind === 'meteor'
                      ? `m:${job.meteorId}`
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

    if (
      (job.kind === 'build' ||
        job.kind === 'train' ||
        job.kind === 'titan' ||
        job.kind === 'stardust') &&
      work
    ) {
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

    if ((job.kind === 'work' || job.kind === 'meteor') && work) {
      if (changed) {
        agent.carrying = null;
        agent.loadSince = this.state?.now ?? 0;
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
    const weak = this.state.resources.juice <= 1e-6;
    const beds = bedsOf(this.state);
    this.pathsThisFrame = 0;
    this.titans.update(dt, weak);
    this.drops.update(dt);
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
      agent.player.play(clipOf(agent.activity, moving));
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
function clipOf(activity: Activity, moving: boolean): ClipId {
  if (moving) return 'walk';
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
