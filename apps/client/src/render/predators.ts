import type { BufferGeometry } from 'three';
import {
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createRng,
  getTile,
  isRampart,
  isTurret,
  levelDef,
  pixelToHex,
  type FaceMap,
  type GameState,
  type Rng,
  type WaveReport,
} from '@kiwar/shared';
import { worldPosition } from './terrain';

const MAX = 14;
const MAX_SHOTS = 24;
/** Length of the show, in seconds. */
const SHOW_S = 9;
/** Predators are bigger than kiwis. */
const SIZE = 1.9;

interface Actor {
  kind: 'ferret' | 'bat';
  from: Vector3;
  to: Vector3;
  /** Start delay (s). */
  delay: number;
  /** Driven off by the defenders at this time (s), or never. */
  hitAt: number;
  phase: number;
}

interface Shot {
  from: Vector3;
  actor: number;
  t: number;
}

function ferretGeometry(): BufferGeometry {
  const body = new SphereGeometry(1, 8, 6);
  body.scale(0.32, 0.11, 0.11);
  const head = new SphereGeometry(1, 8, 6);
  head.scale(0.1, 0.09, 0.09);
  head.translate(0.34, 0.04, 0);
  const tail = new ConeGeometry(0.05, 0.3, 6);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-0.42, 0.03, 0);
  const g = mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), tail.toNonIndexed()])!;
  g.translate(0, 0.11, 0);
  return g;
}

function batGeometry(): BufferGeometry {
  const body = new SphereGeometry(1, 8, 6);
  body.scale(0.09, 0.08, 0.13);
  const wing = new ConeGeometry(0.14, 0.42, 3);
  const left = wing.clone();
  left.rotateZ(Math.PI / 2);
  left.scale(1, 1, 0.25);
  left.translate(-0.24, 0, 0);
  const right = wing.clone();
  right.rotateZ(-Math.PI / 2);
  right.scale(1, 1, 0.25);
  right.translate(0.24, 0, 0);
  return mergeGeometries([body.toNonIndexed(), left.toNonIndexed(), right.toNonIndexed()])!;
}

/**
 * Chantier 06: when the player is there at the strike, a short show of the wave — ferrets
 * running down from the rampart, bats diving from the sky, seeds fired by the turrets. Purely
 * cosmetic: the outcome (the report) was already decided by the simulation.
 */
export class PredatorShow {
  readonly group = new Group();
  private readonly ferrets: InstancedMesh;
  private readonly bats: InstancedMesh;
  private readonly shots: InstancedMesh;
  private actors: Actor[] = [];
  private shotsLive: Shot[] = [];
  private turrets: { pos: Vector3; air: boolean }[] = [];
  private time = Infinity;
  private shotTimer = 0;
  private rng: Rng = createRng('show');
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  /** Called for each seed fired (sounds). */
  onShot: ((x: number, z: number) => void) | null = null;

  constructor(private readonly map: FaceMap) {
    this.ferrets = new InstancedMesh(
      ferretGeometry(),
      new MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.9, flatShading: true }),
      MAX,
    );
    this.bats = new InstancedMesh(
      batGeometry(),
      new MeshStandardMaterial({ color: '#3b2f3f', roughness: 0.8, flatShading: true }),
      MAX,
    );
    this.shots = new InstancedMesh(
      new SphereGeometry(0.06, 6, 4),
      new MeshStandardMaterial({
        color: '#1f1612',
        emissive: new Color('#f2b84e'),
        emissiveIntensity: 0.4,
      }),
      MAX_SHOTS,
    );
    for (const mesh of [this.ferrets, this.bats, this.shots]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  get playing(): boolean {
    return this.time < SHOW_S;
  }

  private top(x: number, z: number): number {
    return getTile(this.map, pixelToHex(x, z))?.height ?? 0;
  }

  /** Starts the show of a wave that has just struck. */
  play(state: GameState, report: WaveReport): void {
    this.rng = createRng(`show/${report.id}`);
    const rng = this.rng;
    const ramparts = this.map.tiles.filter((t) => isRampart(this.map, t.q, t.r));
    const targets = state.buildings.map((b) => worldPosition(b));
    if (targets.length === 0) targets.push({ x: 0, z: 0 });
    this.turrets = state.buildings
      .filter((b) => isTurret(b.type))
      .map((b) => {
        const p = worldPosition(b);
        return {
          pos: new Vector3(p.x, this.top(p.x, p.z) + 0.9, p.z),
          air: (levelDef(b.type, b.level)?.defense?.air ?? 0) > 0,
        };
      });
    const count = (x: number) => Math.min(MAX, Math.max(x > 0 ? 2 : 0, Math.round(x * 1.2)));
    // How many make it through: the share of the threat the defense could not stop.
    const through = report.victory ? 0 : report.severity;
    this.actors = [];
    const add = (kind: Actor['kind'], n: number) => {
      for (let i = 0; i < n; i++) {
        const target = rng.pick(targets);
        const to = new Vector3(target.x + rng.range(-0.4, 0.4), 0, target.z + rng.range(-0.4, 0.4));
        let from: Vector3;
        if (kind === 'ferret' && ramparts.length) {
          const r = rng.pick(ramparts);
          const p = worldPosition(r);
          from = new Vector3(p.x, 0, p.z);
        } else {
          const a = rng.range(0, Math.PI * 2);
          from = new Vector3(Math.cos(a) * 14, 0, Math.sin(a) * 14);
        }
        const stopped = rng.next() >= through;
        this.actors.push({
          kind,
          from,
          to,
          delay: rng.range(0, 1.6),
          hitAt: stopped ? rng.range(2.2, 4.6) : Infinity,
          phase: rng.range(0, Math.PI * 2),
        });
      }
    };
    add('ferret', count(report.threat.ground));
    add('bat', count(report.threat.air));
    this.shotsLive = [];
    this.time = 0;
    this.shotTimer = 0;
  }

  /** Where an actor is at time `t` (s since the start); returns its visibility (0–1). */
  private place(a: Actor, t: number, out: Vector3): number {
    const RUN = 4.2;
    const local = t - a.delay;
    if (local < 0) return 0;
    const approach = (x: number) => Math.min(1, Math.max(0, x / RUN));
    let u: number;
    let fade = 1;
    if (t < a.hitAt) {
      u = approach(local);
      // Those who got through linger, then run off with their loot.
      if (local > RUN + 1.5) u = Math.max(0, 1 - (local - RUN - 1.5) / 2.5);
    } else {
      // Driven off: they turn tail and fade.
      const since = t - a.hitAt;
      u = approach(a.hitAt - a.delay) * (1 - Math.min(1, since / 1.5));
      fade = 1 - Math.min(1, since / 1.2);
    }
    out.lerpVectors(a.from, a.to, u);
    if (a.kind === 'ferret') {
      out.y = this.top(out.x, out.z) + Math.abs(Math.sin(t * 14 + a.phase)) * 0.05;
    } else {
      // Bats glide high, then dive at the target.
      const dive = Math.sin(u * Math.PI * 0.5);
      out.y = this.top(out.x, out.z) + 4.5 - dive * 3.6 + Math.sin(t * 3 + a.phase) * 0.2;
    }
    const end = Math.min(1, Math.max(0, SHOW_S - t));
    return Math.max(0, Math.min(fade, end));
  }

  update(dt: number): void {
    if (!this.playing) {
      if (this.ferrets.count || this.bats.count || this.shots.count) {
        this.ferrets.count = this.bats.count = this.shots.count = 0;
      }
      return;
    }
    this.time += dt;
    const t = this.time;
    let nf = 0;
    let nb = 0;
    const positions: (Vector3 | null)[] = [];
    for (const a of this.actors) {
      const p = new Vector3();
      const k = this.place(a, t, p);
      positions.push(k > 0.02 ? p : null);
      if (k <= 0.02) continue;
      // Face the direction of travel.
      const dir = this.v.subVectors(a.to, a.from).setY(0).normalize();
      const angle = Math.atan2(-dir.z, dir.x);
      this.q.setFromAxisAngle(this.up, angle);
      if (a.kind === 'ferret') {
        this.s.setScalar(k * SIZE);
        this.m.compose(p, this.q, this.s);
        this.ferrets.setMatrixAt(nf++, this.m);
      } else {
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 16 + a.phase));
        this.s.set(k * SIZE * (0.6 + 0.5 * flap), k * SIZE, k * SIZE);
        this.m.compose(p, this.q, this.s);
        this.bats.setMatrixAt(nb++, this.m);
      }
    }
    this.ferrets.count = nf;
    this.bats.count = nb;
    this.ferrets.instanceMatrix.needsUpdate = true;
    this.bats.instanceMatrix.needsUpdate = true;

    // The turrets fire at the predators they can reach.
    this.shotTimer -= dt;
    if (this.shotTimer <= 0 && this.turrets.length > 0 && t < SHOW_S - 2) {
      this.shotTimer = 0.35;
      for (const tur of this.turrets) {
        const i = this.actors.findIndex(
          (a, idx) => positions[idx] && (a.kind === 'bat') === tur.air && this.rng.chance(0.5),
        );
        if (i >= 0 && this.shotsLive.length < MAX_SHOTS) {
          this.shotsLive.push({ from: tur.pos.clone(), actor: i, t: 0 });
          this.onShot?.(tur.pos.x, tur.pos.z);
        }
      }
    }
    let ns = 0;
    this.shotsLive = this.shotsLive.filter((s) => {
      s.t += dt / 0.6;
      const target = positions[s.actor];
      if (!target || s.t >= 1) return false;
      this.v.lerpVectors(s.from, target, s.t);
      this.v.y += Math.sin(s.t * Math.PI) * 0.8;
      this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
      this.shots.setMatrixAt(ns++, this.m);
      return true;
    });
    this.shots.count = ns;
    this.shots.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.ferrets, this.bats, this.shots]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
  }
}
