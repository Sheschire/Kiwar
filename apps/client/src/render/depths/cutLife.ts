import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import {
  createRng,
  galleryResource,
  minersIn,
  type DepthsMap,
  type GameState,
  type ResourceId,
  type Villager,
} from '@kiwar/shared';
import { ClipPlayer, DIG, type ClipId } from '../anim/clips';
import { Particles } from '../particles';
import { KiwiRig } from '../anim/kiwiRig';
import { colored, mat, merged } from '../anim/geometry';
import { shinyTint, sizeOf } from '../kiwis';
import {
  CUT_ASPECT,
  LOCULES,
  along,
  roomPoint,
  roomRadius,
  wayTo,
  type CutPoint,
} from './cutLayout';
import { LAKES } from './cutPaint';
import type { DepthsCutView } from './DepthsCutView';

/**
 * Chantier 49: the kiwis down in the cut — the miners swinging their picks in the galleries,
 * a cart of what they dig rolling up to the shaft and back, and the crews of the delves
 * walking down to their room or back up. Cosmetic: it follows the state, never changes it.
 */

const MAX_KIWIS = 64;
const MAX_CARTS = 16;
/** Seconds of a cart's round trip between its gallery and the shaft. */
const CART_TRIP = 16;
/** A crew walks in single file, this far apart (share of the way). */
const FILE_GAP = 0.012;

const LOADS: Record<ResourceId, string> = {
  pulp: '#a8d65a',
  fiber: '#e5cf9c',
  seeds: '#2a1f1a',
  juice: '#e9b43a',
};

interface Walker {
  player: ClipPlayer;
  clip: ClipId;
}

export class CutLife {
  readonly group = new Group();
  private readonly rig = new KiwiRig(MAX_KIWIS);
  private readonly carts: InstancedMesh;
  private readonly walkers = new Map<string, Walker>();
  private readonly ways = new Map<string, CutPoint[]>();
  private waysKey = '';
  private readonly p: CutPoint = { s: 0, t: 0 };
  private readonly q: CutPoint = { s: 0, t: 0 };
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly n = new Vector3();
  private readonly m = new Matrix4();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();
  private readonly tint = new Color();
  private readonly load = new Color();
  private readonly cartColor = new Color();
  /** Chantier 49 (part 4): dust of the picks, sap drops, raphide glints, actinidine steam. */
  readonly particles = new Particles();
  private emitTimer = 0;
  /** A pick bit into a wall (sounds), at this world spot. */
  onStrike: ((at: Vector3) => void) | null = null;
  /** A delve whose battle is on show: its crew is drawn by the show, not here. */
  hidden: string | null = null;
  /** Spots of the kiwis drawn this frame (taps, the camera). */
  readonly drawn: { id: string; pos: Vector3 }[] = [];

  constructor(private readonly view: DepthsCutView) {
    this.group.add(this.rig.group);
    this.carts = new InstancedMesh(
      cartGeometry(),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
      MAX_CARTS,
    );
    this.carts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.carts.count = 0;
    this.carts.frustumCulled = false;
    this.group.add(this.carts);
    this.group.add(this.particles.mesh);
  }

  setParticles(on: boolean): void {
    this.particles.setEnabled(on);
  }

  /** Size of a kiwi down there (rooms are small at the planet's scale). */
  get kiwiScale(): number {
    return this.view.shape.ay * 0.085 * 0.62;
  }

  update(dt: number, time: number, now: number, state: GameState, map: DepthsMap): void {
    this.drawn.length = 0;
    const galleries = state.depths.galleries;
    const key = Object.keys(galleries).sort().join(',');
    if (key !== this.waysKey) {
      this.waysKey = key;
      this.ways.clear();
    }
    const way = (roomId: string) => {
      let w = this.ways.get(roomId);
      if (!w) {
        w = wayTo(map, roomId, (id) => !!galleries[id]);
        this.ways.set(roomId, w);
      }
      return w;
    };
    const villagers = new Map(state.villagers.map((v) => [v.id as string, v]));
    const scale = this.kiwiScale;
    let carts = 0;
    const seen = new Set<string>();

    // The miners: along the floor of their gallery, facing the wall they dig.
    for (const roomId of Object.keys(galleries)) {
      const room = map.byId.get(roomId);
      if (!room) continue;
      const miners = minersIn(state, roomId);
      miners.forEach((v, i) => {
        const across = miners.length === 1 ? 0 : -0.7 + (1.4 * i) / (miners.length - 1);
        this.view.floorSpot(room, across, -0.35 + (i % 2) * 0.35, this.v);
        this.view.normalOf(roomPoint(map, room), this.n);
        const heading = Math.atan2(-this.n.x, -this.n.z) + (i % 2 ? 0.35 : -0.35);
        const swing = this.drawKiwi(v, 'dig', this.v, heading, scale, dt, null);
        if (swing) {
          // The pick bites the wall in front of the miner.
          this.w.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(scale * 0.35);
          this.w.add(this.v);
          this.w.y += scale * 0.25;
          this.particles.effect('dig', this.w, scale * 1.2);
          this.onStrike?.(this.w);
        }
        seen.add(v.id);
      });
      // A cart of what they dig rolls up to the shaft and back while someone works there.
      if (miners.length > 0 && carts < MAX_CARTS) {
        const path = way(roomId);
        const phase = (time / CART_TRIP + hash(roomId)) % 1;
        // Up with a full load, down empty; a pause at each end.
        const u =
          phase < 0.45
            ? 1 - phase / 0.45
            : phase < 0.5
              ? 0
              : phase < 0.95
                ? (phase - 0.5) / 0.45
                : 1;
        const full = phase < 0.5;
        const from = Math.min(1, 2 / Math.max(2, path.length));
        this.placeOnWay(path, from + (1 - from) * u, scale * 0.9, this.v, this.w);
        const res = galleryResource(state, roomId);
        // The tint multiplies the whole cart: a soft one keeps the wood readable.
        if (full && res) this.cartColor.set('#ffffff').lerp(this.load.set(LOADS[res]), 0.65);
        else this.cartColor.setScalar(0.85);
        this.m.compose(
          this.v,
          this.quat.setFromAxisAngle(UP, Math.atan2(this.w.x, this.w.z)),
          this.scale.setScalar(scale * 1.6),
        );
        this.carts.setMatrixAt(carts, this.m);
        this.carts.setColorAt(carts, this.cartColor);
        carts++;
      }
    }

    // The delves on their way: down to the room, or back up with what they won.
    for (const e of state.expeditions) {
      if (e.mission !== 'delve' || !e.room || e.status === 'done' || e.id === this.hidden) continue;
      const path = way(e.room);
      const outbound = e.status === 'outbound';
      const span = outbound ? e.arriveAt - e.departedAt : e.returnAt - e.arriveAt;
      const since = now - (outbound ? e.departedAt : e.arriveAt);
      const u0 = span > 0 ? Math.max(0, Math.min(1, since / span)) : 1;
      const u = outbound ? u0 : 1 - u0;
      e.crew.forEach((id, i) => {
        const v = villagers.get(id);
        if (!v || seen.has(id)) return;
        const at = Math.max(0, Math.min(1, u - (outbound ? i : -i) * FILE_GAP));
        this.placeOnWay(path, at, scale * 0.5, this.v, this.w);
        if (!outbound) this.w.negate();
        const heading = Math.atan2(this.w.x, this.w.z);
        const stopped = at <= 0 || at >= 1;
        this.drawKiwi(v, stopped ? 'idle' : 'walk', this.v, heading, scale, dt, null);
        seen.add(id);
      });
    }
    this.rig.end();
    this.carts.count = carts;
    this.carts.instanceMatrix.needsUpdate = true;
    if (this.carts.instanceColor) this.carts.instanceColor.needsUpdate = true;
    for (const id of this.walkers.keys()) if (!seen.has(id)) this.walkers.delete(id);
    this.emitTimer -= dt;
    if (this.emitTimer <= 0) {
      this.emitTimer = 0.25;
      this.ambient(map);
    }
    this.particles.update(dt);
  }

  /**
   * A spot along a way of the section, in front of the face (`forward`), with the direction of
   * travel in `dir` (world, horizontal).
   */
  private placeOnWay(
    path: CutPoint[],
    u: number,
    forward: number,
    out: Vector3,
    dir: Vector3,
  ): void {
    along(path, u, this.p);
    along(path, Math.min(1, u + 0.01), this.q);
    if (this.q.s === this.p.s && this.q.t === this.p.t) along(path, Math.max(0, u - 0.01), this.q);
    const back = this.q.s === this.p.s && this.q.t === this.p.t ? 0 : u >= 1 ? -1 : 1;
    this.view.worldOf(this.p, out, forward);
    this.view
      .worldOf(this.q, dir, forward)
      .sub(out)
      .multiplyScalar(back || 1);
    dir.y = 0;
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    // The floor of a passage is a little below its middle line.
    out.y -= this.view.shape.ay * 0.012;
  }

  private drawKiwi(
    v: Villager,
    clip: ClipId,
    at: Vector3,
    heading: number,
    scale: number,
    dt: number,
    loadOf: ResourceId | null,
  ): boolean {
    let w = this.walkers.get(v.id);
    if (!w) {
      w = { player: new ClipPlayer(hash(v.id) * 3), clip };
      w.player.play(clip);
      this.walkers.set(v.id, w);
    } else if (w.clip !== clip) {
      w.clip = clip;
      w.player.play(clip);
    }
    const rng = createRng(`kiwi/${v.id}`);
    const brightness = rng.range(0.82, 1.15);
    const jitter = rng.range(0.96, 1.04);
    this.tint.copy(v.shiny ? shinyTint(v.shiny) : this.tint.setScalar(brightness));
    const before = w.player.time;
    this.rig.draw({
      x: at.x,
      y: at.y,
      z: at.z,
      heading,
      scale: scale * sizeOf(v, jitter),
      pose: w.player.pose(dt, 1),
      tint: this.tint,
      classId: v.classId ?? null,
      load: loadOf ? this.load.set(LOADS[loadOf]) : null,
      weapon: null,
      armor: v.gear?.armor ?? null,
    });
    this.drawn.push({ id: v.id, pos: at.clone() });
    // A dig swing crossed the moment its pick bites.
    if (clip !== 'dig' || dt <= 0) return false;
    const a = before * DIG.rate - DIG.at;
    const b = w.player.time * DIG.rate - DIG.at;
    return Math.floor(b) > Math.floor(a);
  }

  /** A few drops, glints and wisps of steam, a few times a second. */
  private ambient(map: DepthsMap): void {
    const k = this.view.knowledge;
    if (!k) return;
    const ay = this.view.shape.ay;
    const hollow = this.view.hollowed;
    for (const [id, kind] of k.kinds) {
      const room = map.byId.get(id);
      if (!room) continue;
      const p = roomPoint(map, room);
      const rr = roomRadius(room);
      const inside = hollow && rr > 0.05 ? -rr * ay * 0.3 : rr * ay * 0.15;
      const r = Math.random;
      if (kind === 'sap' && r() < 0.35) {
        this.p.s = p.s + ((r() - 0.5) * rr) / CUT_ASPECT;
        this.p.t = p.t - rr * 0.75;
        this.particles.effect('sap', this.view.worldOf(this.p, this.v, inside), 1.2);
      } else if ((kind === 'raphides' || kind === 'forest') && r() < 0.5) {
        this.p.s = p.s + ((r() - 0.5) * rr * 1.6) / CUT_ASPECT;
        this.p.t = p.t + (r() - 0.5) * rr * 1.4;
        this.particles.effect('glint', this.view.worldOf(this.p, this.v, inside), 1);
      } else if (kind === 'lake' && r() < 0.4) {
        this.particles.effect('steam', this.view.worldOf(p, this.v, rr * ay), 0.8);
      }
    }
    // The lakes of the closed locules smoke in silhouette.
    if (!k.loculesOpen && Math.random() < 0.5) {
      const a = LAKES[Math.floor(Math.random() * LAKES.length)]!;
      const ring = (LOCULES.inner + LOCULES.outer) / 2;
      this.p.s = (-Math.cos(a) * ring) / CUT_ASPECT;
      this.p.t = 1 - Math.sin(a) * ring;
      this.particles.effect('steam', this.view.worldOf(this.p, this.v, 0.1), 1.2);
    }
  }

  dispose(): void {
    this.rig.dispose();
    this.particles.dispose();
    this.carts.geometry.dispose();
    (this.carts.material as MeshStandardMaterial).dispose();
  }
}

const UP = new Vector3(0, 1, 0);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** A little mine cart: a wooden tub on four wheels, its load heaped on top (white: tinted). */
function cartGeometry() {
  const wheel = (x: number, z: number) =>
    colored(
      new CylinderGeometry(1, 1, 1, 8),
      '#3a2a20',
      mat(x, 0.07, z, 0.07, 0.03, 0.07, 0, 0, Math.PI / 2),
    );
  return merged([
    colored(new BoxGeometry(1, 1, 1), '#8a5a35', mat(0, 0.16, 0, 0.22, 0.14, 0.3)),
    colored(new BoxGeometry(1, 1, 1), '#ffffff', mat(0, 0.25, 0, 0.18, 0.07, 0.26)),
    wheel(-0.12, -0.1),
    wheel(0.12, -0.1),
    wheel(-0.12, 0.1),
    wheel(0.12, 0.1),
  ]);
}
