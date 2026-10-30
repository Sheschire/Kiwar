import {
  BufferGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Vector3,
  type Material,
} from 'three';

export type ParticleKind =
  | 'pulp'
  | 'chip'
  | 'juice'
  | 'smoke'
  | 'spark'
  | 'gold'
  // Chantier 34: fire, soot, impacts.
  | 'flame'
  | 'ember'
  | 'soot'
  | 'feather'
  | 'star'
  | 'dust'
  // Chantier 49: the depths — sap drops, raphide glints, actinidine steam.
  | 'drop'
  | 'glint'
  | 'steam';

/** Shapes: a round blob, a flat feather, a little star. */
type ParticleShape = 'blob' | 'feather' | 'star';

interface KindDef {
  color: string;
  /** Colour at the end of the life (flames cool down), else `color`. */
  endColor?: string;
  size: number;
  /** Size at the end of the life (smoke grows). */
  endSize: number;
  life: number;
  up: number;
  spread: number;
  gravity: number;
  shape?: ParticleShape;
  /** Unlit: glows (flames, embers, stars). */
  glow?: boolean;
  /** Spin speed (rad/s); feathers also flutter. */
  spin?: number;
  /** Air drag per second (feathers float down). */
  drag?: number;
  /** Half transparent (dust, soot). */
  soft?: boolean;
}

const KINDS: Record<ParticleKind, KindDef> = {
  pulp: {
    color: '#a8d65a',
    size: 0.04,
    endSize: 0.025,
    life: 0.55,
    up: 0.4,
    spread: 0.45,
    gravity: -4,
  },
  chip: {
    color: '#2a1d16',
    size: 0.035,
    endSize: 0.03,
    life: 0.6,
    up: 1.3,
    spread: 0.9,
    gravity: -6,
  },
  juice: {
    color: '#c9dc2e',
    size: 0.035,
    endSize: 0.02,
    life: 0.5,
    up: 0.2,
    spread: 0.25,
    gravity: -4,
  },
  smoke: {
    color: '#ece6da',
    size: 0.05,
    endSize: 0.17,
    life: 2.6,
    up: 0.4,
    spread: 0.06,
    gravity: 0,
  },
  spark: {
    color: '#ffae3d',
    size: 0.025,
    endSize: 0.01,
    life: 0.8,
    up: 0.7,
    spread: 0.2,
    gravity: 0.4,
  },
  gold: { color: '#f7d36a', size: 0.03, endSize: 0, life: 1.1, up: 0.35, spread: 0.25, gravity: 0 },
  flame: {
    color: '#ffd25a',
    endColor: '#e2462a',
    size: 0.09,
    endSize: 0.025,
    life: 0.75,
    up: 0.9,
    spread: 0.12,
    gravity: 0.6,
    glow: true,
  },
  ember: {
    color: '#ffb347',
    endColor: '#c2341f',
    size: 0.018,
    endSize: 0.006,
    life: 1.2,
    up: 1.1,
    spread: 0.35,
    gravity: -0.4,
    glow: true,
  },
  soot: {
    color: '#6e6462',
    endColor: '#c9c1ba',
    size: 0.05,
    endSize: 0.16,
    life: 2,
    up: 0.6,
    spread: 0.08,
    gravity: 0.1,
    soft: true,
  },
  feather: {
    color: '#9a7048',
    size: 0.08,
    endSize: 0.07,
    life: 1.6,
    up: 1.1,
    spread: 0.7,
    gravity: -1.6,
    shape: 'feather',
    spin: 5,
    drag: 2.2,
  },
  star: {
    color: '#ffe066',
    endColor: '#ffb347',
    size: 0.06,
    endSize: 0.02,
    life: 0.7,
    up: 0.9,
    spread: 1.1,
    gravity: -1.5,
    shape: 'star',
    glow: true,
    spin: 6,
    drag: 1.5,
  },
  dust: {
    color: '#e3d5b8',
    size: 0.04,
    endSize: 0.12,
    life: 0.9,
    up: 0.25,
    spread: 0.7,
    gravity: 0,
    drag: 2.5,
    soft: true,
  },
  drop: {
    color: '#f0b23a',
    size: 0.035,
    endSize: 0.03,
    life: 0.9,
    up: 0,
    spread: 0.04,
    gravity: -5,
    glow: true,
  },
  glint: {
    color: '#ffffff',
    endColor: '#bfe9f5',
    size: 0.05,
    endSize: 0.005,
    life: 0.6,
    up: 0.05,
    spread: 0.25,
    gravity: 0,
    shape: 'star',
    glow: true,
    spin: 3,
  },
  steam: {
    color: '#c9df7a',
    endColor: '#e9f2d0',
    size: 0.05,
    endSize: 0.22,
    life: 2.2,
    up: 0.35,
    spread: 0.12,
    gravity: 0.05,
    drag: 0.8,
    soft: true,
  },
};

/**
 * Chantier 34: grouped emitters, the effects other views reuse (wave impacts, and later fires
 * and spells): a list of particle kinds and counts, emitted at once. A fire is `fire` a few
 * times a second plus `soot` twice a second.
 */
export const EFFECTS = {
  /** A predator hit by the defenders: stars and a puff. */
  hit: [
    ['star', 5],
    ['dust', 3],
  ],
  /** A kiwi or a building bitten: feathers fly. */
  feathers: [
    ['feather', 6],
    ['star', 2],
  ],
  /** A seed or a hammer on stone. */
  sparks: [
    ['spark', 6],
    ['ember', 3],
  ],
  /** Something lands hard. */
  puff: [['dust', 6]],
  /** One beat of a fire (call it a few times a second). */
  fire: [
    ['flame', 3],
    ['ember', 1],
  ],
  /** The smoke above a fire (call it about twice a second). */
  soot: [['soot', 1]],
  /** Chantier 36: a fireball bursting. */
  fireball: [
    ['flame', 6],
    ['ember', 4],
    ['dust', 2],
  ],
  /** Chantier 36: loot snatched from a store. */
  loot: [['gold', 6]],
  /** Chantier 49: a pick bites into the flesh of a gallery. */
  dig: [
    ['dust', 3],
    ['chip', 1],
  ],
  /** Chantier 49: a drop of sap falls from a room's ceiling. */
  sap: [['drop', 1]],
  /** Chantier 49: the crystal needles of raphides catch the light. */
  glint: [['glint', 2]],
  /** Chantier 49: an actinidine lake smokes. */
  steam: [['steam', 1]],
} as const satisfies Record<string, readonly (readonly [ParticleKind, number])[]>;
export type EffectId = keyof typeof EFFECTS;

const CAPACITY = 240;

/** A feather: a flat, slightly curved leaf shape with its shaft. */
function featherGeometry(): BufferGeometry {
  const pos: number[] = [];
  const outline: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const w = Math.sin(t * Math.PI) * 0.35 * (1 - t * 0.3);
    outline.push([w, t * 2 - 1]);
  }
  for (let i = 0; i < 8; i++) {
    const [w0, y0] = outline[i]!;
    const [w1, y1] = outline[i + 1]!;
    const z0 = (y0 * y0 - 1) * 0.15;
    const z1 = (y1 * y1 - 1) * 0.15;
    pos.push(-w0, y0, z0, w0, y0, z0, w1, y1, z1, -w0, y0, z0, w1, y1, z1, -w1, y1, z1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function starGeometry(): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15);
}

/** One instanced mesh of particles of one shape and lighting; the oldest are recycled. */
class Pool {
  readonly mesh: InstancedMesh;
  private readonly pos = new Float32Array(CAPACITY * 3);
  private readonly vel = new Float32Array(CAPACITY * 3);
  private readonly axis = new Float32Array(CAPACITY * 3);
  private readonly age = new Float32Array(CAPACITY);
  private readonly kind: ParticleKind[] = [];
  count = 0;
  private readonly tmp = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();

  constructor(
    geometry: BufferGeometry,
    material: Material,
    private readonly colors: Record<ParticleKind, [Color, Color]>,
  ) {
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
  }

  emit(kind: ParticleKind, at: Vector3): void {
    const d = KINDS[kind];
    // Full pool: recycle a random slot rather than growing.
    const i = this.count < CAPACITY ? this.count++ : Math.floor(Math.random() * CAPACITY);
    const a = Math.random() * Math.PI * 2;
    const s = d.spread * (0.4 + Math.random() * 0.6);
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([Math.cos(a) * s, d.up * (0.7 + Math.random() * 0.6), Math.sin(a) * s], i * 3);
    this.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.axis.set([this.v.x, this.v.y, this.v.z], i * 3);
    this.age[i] = 0;
    this.kind[i] = kind;
  }

  update(dt: number): void {
    if (this.count === 0) {
      this.mesh.count = 0;
      return;
    }
    let i = 0;
    while (i < this.count) {
      const d = KINDS[this.kind[i]!];
      this.age[i]! += dt;
      if (this.age[i]! >= d.life) {
        this.moveLast(i);
        continue;
      }
      const j = i * 3;
      const drag = d.drag ? Math.max(0, 1 - d.drag * dt) : 1;
      this.vel[j]! *= drag;
      this.vel[j + 2]! *= drag;
      this.vel[j + 1]! += d.gravity * dt;
      if (d.drag && this.vel[j + 1]! < 0) this.vel[j + 1]! *= drag;
      const age = this.age[i]!;
      // Feathers sway from side to side as they float down.
      const sway = d.shape === 'feather' ? Math.sin(age * 7 + i) * 0.5 * dt : 0;
      this.pos[j]! += this.vel[j]! * dt + sway;
      this.pos[j + 1]! += this.vel[j + 1]! * dt;
      this.pos[j + 2]! += this.vel[j + 2]! * dt;
      const k = age / d.life;
      // Grow (or shrink) along the life, and pop out at the very end.
      const size = (d.size + (d.endSize - d.size) * k) * Math.min(1, (1 - k) * 6);
      if (d.spin) {
        this.v.set(this.axis[j]!, this.axis[j + 1]!, this.axis[j + 2]!);
        this.q.setFromAxisAngle(this.v, age * d.spin + i);
      } else this.q.identity();
      this.tmp.compose(
        this.v.set(this.pos[j]!, this.pos[j + 1]!, this.pos[j + 2]!),
        this.q,
        this.s.set(size, size, size),
      );
      this.mesh.setMatrixAt(i, this.tmp);
      const [from, to] = this.colors[this.kind[i]!];
      this.mesh.setColorAt(i, from === to ? from : this.c.copy(from).lerp(to, k));
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.mesh.count = 0;
  }

  /** Removes particle i by moving the last one into its slot. */
  private moveLast(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.axis.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.age[i] = this.age[last]!;
      this.kind[i] = this.kind[last]!;
    }
  }
}

/**
 * Tiny instanced particles: drops, chips and smoke of the working buildings, campfire sparks,
 * and since chantier 34 flames, embers, soot, feathers, stars and dust. One draw call per
 * shape × lighting in use; each pool is fixed and the oldest particles are recycled.
 */
export class Particles {
  /** Add this to the scene. */
  readonly mesh = new Group();
  private readonly pools = new Map<string, Pool>();
  private readonly materials: Material[] = [];
  private enabled = true;
  private readonly colors: Record<ParticleKind, [Color, Color]>;

  constructor() {
    this.colors = Object.fromEntries(
      Object.entries(KINDS).map(([k, d]) => {
        const from = new Color(d.color);
        return [k, [from, d.endColor ? new Color(d.endColor) : from]];
      }),
    ) as Record<ParticleKind, [Color, Color]>;
  }

  /** The pool of a kind, made on first use. */
  private poolOf(kind: ParticleKind): Pool {
    const d = KINDS[kind];
    const shape = d.shape ?? 'blob';
    const look = d.glow ? 'glow' : d.soft ? 'soft' : 'lit';
    const key = `${shape}/${look}`;
    let pool = this.pools.get(key);
    if (!pool) {
      const geometry =
        shape === 'feather'
          ? featherGeometry()
          : shape === 'star'
            ? starGeometry()
            : new IcosahedronGeometry(1, 0);
      const material = d.glow
        ? // Unlit, so it reads as glowing by day and by night (additive washed out to white).
          new MeshBasicMaterial({ transparent: true, opacity: 0.92, depthWrite: false })
        : new MeshStandardMaterial({
            roughness: 1,
            flatShading: true,
            side: 2,
            transparent: !!d.soft,
            opacity: d.soft ? 0.55 : 1,
            depthWrite: !d.soft,
          });
      this.materials.push(material);
      pool = new Pool(geometry, material, this.colors);
      this.pools.set(key, pool);
      this.mesh.add(pool.mesh);
    }
    return pool;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) for (const p of this.pools.values()) p.clear();
  }

  /** True while some particle is alive (the frame loop stays awake). */
  get active(): boolean {
    for (const p of this.pools.values()) if (p.count > 0) return true;
    return false;
  }

  emit(kind: ParticleKind, at: Vector3, n = 1): void {
    if (!this.enabled) return;
    const pool = this.poolOf(kind);
    for (let k = 0; k < n; k++) pool.emit(kind, at);
  }

  /** Chantier 34: a grouped effect (`EFFECTS`) at a point; `scale` multiplies the counts. */
  effect(id: EffectId, at: Vector3, scale = 1): void {
    for (const [kind, n] of EFFECTS[id]) this.emit(kind, at, Math.max(1, Math.round(n * scale)));
  }

  update(dt: number): void {
    for (const p of this.pools.values()) p.update(dt);
  }

  dispose(): void {
    for (const p of this.pools.values()) p.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
