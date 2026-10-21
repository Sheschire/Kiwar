import {
  AdditiveBlending,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { TwinView } from './twin';

/** What a siege fight came to (same kinds as the 2D caption). */
export type SiegeFxKind = 'taken' | 'repelled' | 'held' | 'fell' | 'queen' | 'queenHeld';

/** Seconds of the whole show (the twin comes closer, the fight, the outcome, back). */
export const SIEGE_FX_SECONDS = 6.5;
/** When the twin goes back to its place. */
const RETREAT_AT = 5;

const BOLTS = 10;
const FLASHES = 5;
const PUFFS = 16;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A soft white disc, tinted by each sprite's colour. */
function softTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Stable pseudo-random numbers for the show (no game randomness involved). */
function wobble(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Chantier 19: the 3D staging of a siege fight seen from home. The twin comes closer
 * (`GameRenderer.setTwinApproach`), bolts fly from the colony to the sector, flashes burst
 * there; the queen's crown tumbles down and the clouds blow away when she falls, dark smoke
 * when an assault fails. A handful of sprites and two small meshes, hidden between shows.
 */
export class SiegeFx {
  readonly group = new Group();
  private readonly texture = softTexture();
  private readonly bolts: Sprite[] = [];
  private readonly flashes: Sprite[] = [];
  private readonly puffs: Sprite[] = [];
  private readonly crown = new Group();
  private readonly crownMaterial: MeshStandardMaterial;
  private t = -1;
  private kind: SiegeFxKind = 'taken';
  private sector: number | null = null;
  private lite = false;
  private readonly target = new Vector3();
  private readonly center = new Vector3();
  private readonly from = new Vector3(0, 5, 0);
  private readonly tmp = new Vector3();

  constructor() {
    const sprite = (blending: typeof AdditiveBlending | typeof NormalBlending) =>
      new Sprite(
        new SpriteMaterial({
          map: this.texture,
          blending,
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      );
    for (let i = 0; i < BOLTS; i++) this.bolts.push(sprite(AdditiveBlending));
    for (let i = 0; i < FLASHES; i++) this.flashes.push(sprite(AdditiveBlending));
    for (let i = 0; i < PUFFS; i++) this.puffs.push(sprite(NormalBlending));
    for (const s of [...this.bolts, ...this.flashes, ...this.puffs]) {
      s.renderOrder = 6;
      this.group.add(s);
    }
    // The queen's crown: a gold band with five points.
    this.crownMaterial = new MeshStandardMaterial({
      color: 0xe0a83a,
      emissive: 0x6a4210,
      metalness: 0.6,
      roughness: 0.35,
      flatShading: true,
      transparent: true,
      fog: false,
    });
    const band = new Mesh(new CylinderGeometry(1, 1, 0.7, 10, 1, true), this.crownMaterial);
    this.crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const point = new Mesh(new ConeGeometry(0.32, 0.9, 5), this.crownMaterial);
      point.position.set(Math.cos(a) * 0.9, 0.75, Math.sin(a) * 0.9);
      this.crown.add(point);
    }
    this.group.visible = false;
  }

  get playing(): boolean {
    return this.t >= 0;
  }

  /** Twin back at its place (seconds into the show). */
  get retreating(): boolean {
    return this.t >= RETREAT_AT;
  }

  /** Low quality: fewer sprites. */
  setLite(lite: boolean): void {
    this.lite = lite;
  }

  play(kind: SiegeFxKind, sector: number | null): void {
    this.kind = kind;
    this.sector = sector;
    this.t = 0;
    this.group.visible = true;
  }

  stop(): void {
    this.t = -1;
    this.group.visible = false;
  }

  /** Steps the show; `twin` gives where the fight is (null: nothing to show). */
  update(dt: number, twin: TwinView | null): void {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t > SIEGE_FX_SECONDS || !twin) return this.stop();
    const t = this.t;
    twin.worldCenter(this.center);
    twin.sectorWorld(this.sector, this.target);
    const k = this.kind;
    const queen = k === 'queen' || k === 'queenHeld';
    const counter = k === 'held' || k === 'fell';
    const good = k === 'taken' || k === 'held' || k === 'queen';

    // Bolts from home to the sector (a counter-attack is fought on the twin itself).
    const bolts = this.lite ? 4 : BOLTS;
    this.bolts.forEach((b, i) => {
      const start = 1 + i * 0.18;
      const p = (t - start) / 0.9;
      b.visible = !counter && i < bolts && p > 0 && p < 1;
      if (!b.visible) return;
      this.tmp.lerpVectors(counter ? this.center : this.from, this.target, p);
      this.tmp.y += Math.sin(p * Math.PI) * 12;
      b.position.copy(this.tmp);
      b.scale.setScalar(3.4);
      b.material.color.set(queen ? 0xffd27a : 0xbfffa0);
      b.material.opacity = 1 - p * 0.3;
    });

    // Flashes on the sector while the fight lasts.
    this.flashes.forEach((f, i) => {
      const start = 1.9 + i * 0.35 + wobble(i, 1) * 0.2;
      const p = (t - start) / 0.5;
      f.visible = p > 0 && p < 1;
      if (!f.visible) return;
      f.position.set(
        this.target.x + (wobble(i, 2) - 0.5) * 6,
        this.target.y + 1.5 + wobble(i, 3) * 3,
        this.target.z + (wobble(i, 4) - 0.5) * 6,
      );
      f.scale.setScalar(6 + 12 * Math.sin(p * Math.PI));
      f.material.color.set(counter ? 0xff7a4a : 0xfff0b0);
      f.material.opacity = Math.sin(p * Math.PI);
    });

    // The outcome: clouds blown away (the queen fell), smoke (a failure), sparkles (won).
    const puffs = this.lite ? 6 : PUFFS;
    this.puffs.forEach((s, i) => {
      const lift = k === 'queen';
      const start = lift ? 3.2 + wobble(i, 5) * 0.4 : 3.4 + i * 0.05;
      const p = (t - start) / (lift ? 2.6 : 1.8);
      s.visible = i < puffs && p > 0 && p < 1 && (lift || !good || k === 'taken' || k === 'held');
      if (!s.visible) return;
      if (lift) {
        // Rings of cloud spreading out from the twin, fading.
        const a = (i / puffs) * Math.PI * 2 + wobble(i, 6);
        const r = twin.radius * (0.4 + 1.3 * p);
        s.position.set(
          this.center.x + Math.cos(a) * r,
          this.center.y + 1.5 + wobble(i, 7) * 3,
          this.center.z + Math.sin(a) * r,
        );
        s.scale.setScalar(twin.radius * (0.5 + 0.4 * p));
        s.material.color.set(0xfff6ee);
        s.material.opacity = 0.85 * (1 - p);
      } else {
        s.position.set(
          this.target.x + (wobble(i, 8) - 0.5) * 5,
          this.target.y + 1.5 + p * 10,
          this.target.z + (wobble(i, 9) - 0.5) * 5,
        );
        s.scale.setScalar(4 + 6 * p);
        s.material.color.set(good ? 0xd8ffb0 : 0x3a3036);
        s.material.opacity = (good ? 0.6 : 0.75) * (1 - p);
      }
    });

    // The crown above the queen's lair; it tumbles when she falls.
    this.crown.visible = queen && t > 1.2;
    if (this.crown.visible) {
      if (this.crown.parent !== this.group) this.group.add(this.crown);
      const fall = k === 'queen' ? smoothstep(3, 4.4, t) : 0;
      this.crown.position.set(this.target.x, this.target.y + 9 - fall * 8, this.target.z);
      this.crown.rotation.set(fall * 1.3, t * 0.8, fall * 0.6);
      this.crown.scale.setScalar(3.2 * (1 - 0.6 * fall));
      this.crownMaterial.opacity = k === 'queen' ? 1 - smoothstep(4.2, 5, t) : 1;
    }
  }

  dispose(): void {
    this.texture.dispose();
    for (const s of [...this.bolts, ...this.flashes, ...this.puffs]) s.material.dispose();
    this.crown.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.crownMaterial.dispose();
  }
}
