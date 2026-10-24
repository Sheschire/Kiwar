import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Points,
  PointsMaterial,
  Vector3,
  type Camera,
} from 'three';
import { createRng, type FireworksPattern, type Rng } from '@kiwar/shared';

/**
 * Chantier 44: the fireworks show — rockets rise from the cannon and burst over the village:
 * bouquets of coloured sparks, then for the big patterns a kiwi fruit (brown skin, green flesh,
 * a ring of seeds, a white heart) or a kiwi bird drawn in gold. One `Points` cloud, every
 * particle computed from its own start time (no state but the clock), additive and unlit.
 */

const MAX = 2400;
/**
 * World units: the highest the bursts open above the cannon (lower when the camera looks down
 * steeply, so the show stays on screen), how big a shape is.
 */
const HEIGHT = 9;
const SHAPE = 2.6;
const GRAVITY = 1.6;
const RISE = 1.1;

type Kind = 'rocket' | 'spark' | 'shape';

interface Particle {
  kind: Kind;
  /** Show time at which it appears. */
  t0: number;
  /** Rocket: from `from` to `at`; spark: velocity `v` from `at`; shape: `at` + `v` (offset). */
  from: Vector3;
  at: Vector3;
  v: Vector3;
  color: Color;
  life: number;
}

const PALETTE = ['#ff5a5a', '#ffd95a', '#7cff6b', '#6bc8ff', '#ff8af0', '#ffffff', '#ffa23c'];

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** Points of the kiwi fruit's slice in the unit disc, with their colour. */
function kiwiFruit(rng: Rng): [number, number, string][] {
  const out: [number, number, string][] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    out.push([Math.cos(a), Math.sin(a), '#ffb060']);
    if (i % 2) out.push([Math.cos(a) * 0.95, Math.sin(a) * 0.95, '#d08040']);
  }
  for (let i = 0; i < 260; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 0.9;
    // A ring of seeds: gaps in the flesh, with dark seeds.
    const seedRing = r > 0.38 && r < 0.52 && Math.cos(a * 14) > 0.3;
    if (r < 0.22) out.push([Math.cos(a) * r, Math.sin(a) * r, '#fff8d0']);
    else if (!seedRing) out.push([Math.cos(a) * r, Math.sin(a) * r, '#6bdc3a']);
  }
  for (let i = 0; i < 14; i++) {
    const a = ((i + 0.5) / 14) * Math.PI * 2;
    out.push([Math.cos(a) * 0.45, Math.sin(a) * 0.45, '#5a2a6e']);
  }
  return out;
}

/** The kiwi bird in profile (body, head, long beak, legs, an eye), in about the unit disc. */
function kiwiBird(): [number, number, string][] {
  const out: [number, number, string][] = [];
  const gold = '#ffc04a';
  const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number, color = gold) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, color]);
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number, n: number, color = gold) => {
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      out.push([x1 + (x2 - x1) * k, y1 + (y2 - y1) * k, color]);
    }
  };
  ellipse(-0.15, 0, 0.62, 0.45, 90);
  ellipse(0.5, 0.22, 0.2, 0.2, 34);
  line(0.68, 0.18, 1.15, -0.3, 22, '#ffe7a0');
  line(-0.25, -0.43, -0.3, -0.8, 10);
  line(0.05, -0.43, 0.1, -0.8, 10);
  line(-0.42, -0.8, -0.2, -0.8, 6);
  line(-0.02, -0.8, 0.2, -0.8, 6);
  ellipse(0.55, 0.27, 0.035, 0.035, 6, '#ffffff');
  // A few feathers inside.
  for (let i = 0; i < 4; i++) line(-0.6 + i * 0.25, 0.25, -0.45 + i * 0.25, -0.2, 6, '#ff9a3c');
  return out;
}

/** How high above `origin` the show opens: as high as `HEIGHT`, but still in the upper screen. */
function showHeight(origin: Vector3, camera: Camera): number {
  camera.updateMatrixWorld();
  const base = origin.clone().project(camera).y;
  for (let h = 2; h <= HEIGHT; h += 0.5) {
    const y = origin
      .clone()
      .add(new Vector3(0, h, 0))
      .project(camera).y;
    if (y > Math.min(0.55, base + 0.6)) return Math.max(2, h - 0.5);
  }
  return HEIGHT;
}

export class FireworksView {
  readonly group = new Group();
  /** A burst opened (world x, z): its sound. */
  onBurst: ((x: number, z: number) => void) | null = null;
  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(MAX * 3);
  private readonly colors = new Float32Array(MAX * 3);
  private readonly material: PointsMaterial;
  private particles: Particle[] = [];
  private bursts: { t: number; x: number; z: number; done: boolean }[] = [];
  private time = 0;
  private end = 0;

  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new PointsMaterial({
      size: 0.4,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    points.renderOrder = 60;
    this.group.add(points);
    this.group.visible = false;
  }

  get playing(): boolean {
    return this.group.visible;
  }

  /** Starts a show over `origin` (the cannon); shapes face the camera. */
  play(pattern: FireworksPattern, origin: Vector3, camera: Camera, seed: string): void {
    const rng = createRng(`fireworks/${seed}`);
    this.particles = [];
    this.bursts = [];
    this.time = 0;
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const height = showHeight(origin, camera);
    const up = new Vector3(0, 1, 0);
    const bouquets = pattern === 'bouquet' ? 8 : 4;
    let t = 0;
    for (let i = 0; i < bouquets; i++) {
      const at = origin
        .clone()
        .add(new Vector3(rng.range(-3, 3), height + rng.range(-1, 1.5), rng.range(-3, 3)));
      this.rocket(origin, at, t);
      this.sparkBurst(at, t + RISE, rng, 90);
      t += rng.range(0.45, 0.9);
    }
    if (pattern !== 'bouquet') {
      t += 0.8;
      const at = origin.clone().add(new Vector3(0, height + 1, 0));
      this.rocket(origin, at, t);
      const shape = pattern === 'kiwiFruit' ? kiwiFruit(rng) : kiwiBird();
      for (const [x, y, color] of shape) {
        if (this.particles.length >= MAX) break;
        const offset = right
          .clone()
          .multiplyScalar(x * SHAPE)
          .addScaledVector(up, y * SHAPE);
        this.particles.push({
          kind: 'shape',
          t0: t + RISE,
          from: at,
          at,
          v: offset,
          color: new Color(color),
          life: 4.2,
        });
      }
      this.bursts.push({ t: t + RISE, x: at.x, z: at.z, done: false });
      // A crown of sparks around the shape.
      this.sparkBurst(at, t + RISE + 0.1, rng, 30);
    }
    this.end = Math.max(...this.particles.map((p) => p.t0 + p.life)) + 0.2;
    this.geometry.setDrawRange(0, this.particles.length);
    this.group.visible = true;
  }

  private rocket(from: Vector3, at: Vector3, t0: number): void {
    // The head and three trailing sparks, a little late each.
    for (let k = 0; k < 4; k++)
      this.particles.push({
        kind: 'rocket',
        t0: t0 + k * 0.05,
        from,
        at,
        v: new Vector3(),
        color: new Color(k === 0 ? '#fff2c0' : '#ffa23c').multiplyScalar(1 - k * 0.2),
        life: RISE,
      });
  }

  private sparkBurst(at: Vector3, t0: number, rng: Rng, count: number): void {
    const base = new Color(rng.pick(PALETTE));
    const second = new Color(rng.pick(PALETTE));
    const speed = rng.range(2.6, 3.6);
    for (let i = 0; i < count && this.particles.length < MAX; i++) {
      // Even directions on the sphere.
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      this.particles.push({
        kind: 'spark',
        t0,
        from: at,
        at,
        v: new Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(speed),
        color: (i % 3 === 0 ? second : base).clone(),
        life: rng.range(1.6, 2.2),
      });
    }
    this.bursts.push({ t: t0, x: at.x, z: at.z, done: false });
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    const t = this.time;
    const pos = this.positions;
    const col = this.colors;
    this.particles.forEach((p, i) => {
      const tau = t - p.t0;
      let fade = 0;
      let x = p.at.x;
      let y = p.at.y;
      let z = p.at.z;
      if (tau >= 0 && tau <= p.life) {
        if (p.kind === 'rocket') {
          const k = tau / p.life;
          const e = 1 - (1 - k) * (1 - k);
          x = p.from.x + (p.at.x - p.from.x) * e;
          y = p.from.y + (p.at.y - p.from.y) * e;
          z = p.from.z + (p.at.z - p.from.z) * e;
          fade = 1;
        } else if (p.kind === 'spark') {
          const drag = (1 - Math.exp(-2.2 * tau)) / 2.2;
          x += p.v.x * drag;
          y += p.v.y * drag - 0.5 * GRAVITY * tau * tau;
          z += p.v.z * drag;
          const k = tau / p.life;
          // Twinkle at the end.
          fade = (1 - k) * (k > 0.6 ? 0.6 + 0.4 * Math.sin(tau * 40 + i) : 1);
        } else {
          const open = Math.min(1, tau / 0.55);
          const e = 1 - (1 - open) ** 3;
          const fall = Math.max(0, tau - 2.6);
          x += p.v.x * e;
          y += p.v.y * e - 0.5 * GRAVITY * fall * fall - 0.08 * tau;
          z += p.v.z * e;
          fade = tau < 2.6 ? 1 : Math.max(0, 1 - (tau - 2.6) / (p.life - 2.6));
        }
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      col[i * 3] = p.color.r * fade;
      col[i * 3 + 1] = p.color.g * fade;
      col[i * 3 + 2] = p.color.b * fade;
    });
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
    for (const b of this.bursts)
      if (!b.done && t >= b.t) {
        b.done = true;
        this.onBurst?.(b.x, b.z);
      }
    if (t > this.end) {
      this.group.visible = false;
      this.particles = [];
      this.geometry.setDrawRange(0, 0);
    }
  }

  /** Steps the show to `time` seconds (screenshots). */
  seek(time: number): void {
    this.update(time - this.time);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}
