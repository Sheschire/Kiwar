import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type Vector3,
} from 'three';

export type ParticleKind = 'pulp' | 'chip' | 'juice' | 'smoke' | 'spark' | 'gold';

interface KindDef {
  color: string;
  size: number;
  /** Size at the end of the life (smoke grows). */
  endSize: number;
  life: number;
  up: number;
  spread: number;
  gravity: number;
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
};

const CAPACITY = 240;

/**
 * Tiny instanced particles of the working buildings (pulp drops, seed chips, juice, smoke,
 * campfire sparks). One draw call; the pool is fixed and the oldest particles are recycled.
 */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly pos = new Float32Array(CAPACITY * 3);
  private readonly vel = new Float32Array(CAPACITY * 3);
  private readonly age = new Float32Array(CAPACITY);
  private readonly kind: ParticleKind[] = [];
  private count = 0;
  private enabled = true;
  private readonly tmp = new Matrix4();
  private readonly colors: Record<ParticleKind, Color>;

  constructor() {
    this.mesh = new InstancedMesh(
      new IcosahedronGeometry(1, 0),
      new MeshStandardMaterial({ roughness: 1, flatShading: true }),
      CAPACITY,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.colors = Object.fromEntries(
      Object.entries(KINDS).map(([k, d]) => [k, new Color(d.color)]),
    ) as Record<ParticleKind, Color>;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.count = 0;
      this.mesh.count = 0;
    }
  }

  emit(kind: ParticleKind, at: Vector3, n = 1): void {
    if (!this.enabled) return;
    const d = KINDS[kind];
    for (let k = 0; k < n; k++) {
      // Full pool: recycle a random slot rather than growing.
      const i = this.count < CAPACITY ? this.count++ : Math.floor(Math.random() * CAPACITY);
      const a = Math.random() * Math.PI * 2;
      const s = d.spread * (0.4 + Math.random() * 0.6);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * s, d.up * (0.7 + Math.random() * 0.6), Math.sin(a) * s], i * 3);
      this.age[i] = 0;
      this.kind[i] = kind;
      this.mesh.setColorAt(i, this.colors[kind]);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.count === 0) return;
    let i = 0;
    while (i < this.count) {
      const d = KINDS[this.kind[i]!];
      this.age[i]! += dt;
      if (this.age[i]! >= d.life) {
        this.moveLast(i);
        continue;
      }
      const j = i * 3;
      this.vel[j + 1]! += d.gravity * dt;
      this.pos[j]! += this.vel[j]! * dt;
      this.pos[j + 1]! += this.vel[j + 1]! * dt;
      this.pos[j + 2]! += this.vel[j + 2]! * dt;
      const k = this.age[i]! / d.life;
      // Grow (or shrink) along the life, and pop out at the very end.
      const size = (d.size + (d.endSize - d.size) * k) * Math.min(1, (1 - k) * 6);
      this.tmp
        .makeScale(size, size, size)
        .setPosition(this.pos[j]!, this.pos[j + 1]!, this.pos[j + 2]!);
      this.mesh.setMatrixAt(i, this.tmp);
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Removes particle i by moving the last one into its slot. */
  private moveLast(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.age[i] = this.age[last]!;
      this.kind[i] = this.kind[last]!;
      this.mesh.setColorAt(i, this.colors[this.kind[i]!]);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
