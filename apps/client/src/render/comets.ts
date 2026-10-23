import {
  AdditiveBlending,
  NormalBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { COMETS, getTile, type DustPatch, type FaceMap, type GameState } from '@kiwar/shared';
import { cometPath, edgeArrow } from './space';
import { worldPosition } from './terrain';

/** Chantier 32: size of the comet's head and length of its tail (world units, far away). */
const HEAD_SIZE = 16;
const TAIL_LENGTH = 120;
/** Screen margins the off-screen arrow keeps (px): clear of the top bar, the badges and the
 * thumb bar. */
const ARROW_INSET = { top: 150, right: 64, bottom: 128, left: 64 };

export interface CometArrow {
  x: number;
  y: number;
  angle: number;
}
const SPARKS = 28;
const FALL_S = 1.6;

/** A small golden four-point star with a dark edge (stardust on the ground). */
function sparkTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.moveTo(32, 2);
  g.quadraticCurveTo(36, 28, 62, 32);
  g.quadraticCurveTo(36, 36, 32, 62);
  g.quadraticCurveTo(28, 36, 2, 32);
  g.quadraticCurveTo(28, 28, 32, 2);
  g.fillStyle = '#ffd24a';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#9a6412';
  g.stroke();
  g.beginPath();
  g.arc(32, 32, 6, 0, Math.PI * 2);
  g.fillStyle = '#fffbe0';
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A whole comet seen from afar: a tapering blue-gold tail ending in a bright head (right). */
function cometTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  const tail = g.createLinearGradient(0, 0, 470, 0);
  tail.addColorStop(0, 'rgba(90,170,240,0)');
  tail.addColorStop(0.55, 'rgba(110,190,245,0.55)');
  tail.addColorStop(0.85, 'rgba(255,214,110,0.9)');
  tail.addColorStop(1, 'rgba(255,240,190,1)');
  g.fillStyle = tail;
  g.beginPath();
  g.moveTo(0, 48);
  g.quadraticCurveTo(300, 14, 470, 30);
  g.lineTo(470, 66);
  g.quadraticCurveTo(300, 82, 0, 48);
  g.fill();
  const head = g.createRadialGradient(462, 48, 0, 462, 48, 46);
  head.addColorStop(0, 'rgba(255,255,255,1)');
  head.addColorStop(0.3, 'rgba(255,224,120,1)');
  head.addColorStop(0.6, 'rgba(255,190,70,0.6)');
  head.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = head;
  g.fillRect(410, 0, 102, 96);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,236,170,0.85)');
  grad.addColorStop(0.55, 'rgba(255,200,90,0.25)');
  grad.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Simple hash → [0, 1) for stable sparkle layouts per patch. */
function hash(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

interface Patch {
  points: Points;
  glow: Sprite;
  base: Float32Array;
  phase: Float32Array;
  /** Seconds since the dust started falling (Infinity: fell long ago). */
  fall: number;
  y: number;
  share: number;
}

/**
 * Chantier 13: the comet. While it is announced, a bright head with a long golden tail crosses
 * the sky (much brighter at night); when it passes, stardust rains on a few tiles, which then
 * glitter until it is picked up or scatters.
 */
export class CometsView {
  readonly group = new Group();
  private readonly texture = glowTexture();
  private readonly sparkTexture = sparkTexture();
  private readonly head: Sprite;
  private readonly cometTexture = cometTexture();
  private readonly body: Mesh;
  private readonly tailEnd = new Vector3();
  private readonly flight = new Vector3();
  private readonly basis = new Matrix4();
  private readonly side = new Vector3();
  private readonly normal = new Vector3();
  private readonly patches = new Map<string, Patch>();
  private comet: { from: number; to: number; at: number } | null = null;
  private readonly dir = new Vector3();
  private signature = '';
  private night = 0;
  private time = 0;

  constructor(private readonly map: FaceMap) {
    this.head = this.sprite('#ffe9a0', 1);
    this.head.renderOrder = 2;
    // The tail: a long quad along the flight, turned towards the camera around that line.
    this.body = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: this.cometTexture,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.group.add(this.body, this.head);
    this.setCometVisible(false);
  }

  /** Additive glows vanish on the pale day sky: the comet blends normally. */
  private sprite(color: string, opacity: number, additive = false): Sprite {
    return new Sprite(
      new SpriteMaterial({
        map: this.texture,
        color,
        blending: additive ? AdditiveBlending : NormalBlending,
        depthWrite: false,
        transparent: true,
        opacity,
        fog: false,
      }),
    );
  }

  private setCometVisible(v: boolean): void {
    this.head.visible = v;
    this.body.visible = v;
  }

  /** 0 by day, 1 at night: the comet shines brighter in the dark. */
  setNight(night: number): void {
    this.night = night;
  }

  sync(state: GameState): void {
    const c = state.comets;
    const next = c.next?.announced ? c.next : null;
    const sig = `${next?.id ?? '-'}|${c.lastAt}|${c.patches
      .map((p) => `${p.id}:${Math.round((p.stock / Math.max(1, p.max)) * 20)}`)
      .join(';')}`;
    if (sig === this.signature) return;
    this.signature = sig;
    // The comet crosses the sky from its announcement until a while after it passed.
    if (next) this.comet = { from: next.announceAt, to: next.at + COMETS.passMs, at: next.at };
    else if (c.lastAt > 0)
      this.comet = { from: c.lastAt, to: c.lastAt + COMETS.passMs, at: c.lastAt };
    else this.comet = null;
    const alive = new Set(c.patches.map((p) => p.id));
    for (const [id, p] of this.patches) {
      if (alive.has(id)) continue;
      this.removePatch(p);
      this.patches.delete(id);
    }
    for (const p of c.patches) {
      const view = this.patches.get(p.id) ?? this.add(p, state.now - p.landedAt > FALL_S * 1000);
      view.share = p.max > 0 ? p.stock / p.max : 0;
      view.points.geometry.setDrawRange(0, Math.max(4, Math.round(SPARKS * view.share)));
      view.glow.scale.setScalar(0.8 + 1.1 * view.share);
    }
  }

  private add(p: DustPatch, landed: boolean): Patch {
    const pos = worldPosition(p);
    const y = getTile(this.map, p)?.height ?? 0;
    const base = new Float32Array(SPARKS * 3);
    const phase = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i++) {
      const a = hash(p.id, i * 3) * Math.PI * 2;
      const d = Math.sqrt(hash(p.id, i * 3 + 1)) * 0.55;
      base[i * 3] = pos.x + Math.cos(a) * d;
      base[i * 3 + 1] = y + 0.05 + hash(p.id, i * 3 + 2) * 0.12;
      base[i * 3 + 2] = pos.z + Math.sin(a) * d;
      phase[i] = hash(p.id, i + 99) * Math.PI * 2;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(base.slice(), 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        map: this.sparkTexture,
        size: 0.8,
        sizeAttenuation: true,
        alphaTest: 0.3,
        transparent: true,
      }),
    );
    const glow = this.sprite('#ffcf5a', 0.45);
    glow.position.set(pos.x, y + 0.15, pos.z);
    this.group.add(points, glow);
    const view: Patch = { points, glow, base, phase, fall: landed ? Infinity : 0, y, share: 1 };
    this.patches.set(p.id, view);
    return view;
  }

  private removePatch(p: Patch): void {
    this.group.remove(p.points, p.glow);
    p.points.geometry.dispose();
    (p.points.material as PointsMaterial).dispose();
    (p.glow.material as SpriteMaterial).dispose();
  }

  update(dt: number, now: number, camera: PerspectiveCamera): void {
    this.time += dt;
    this.updateComet(now, camera);
    for (const p of this.patches.values()) {
      const attr = p.points.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      let drop = 0;
      if (p.fall < FALL_S) {
        p.fall += dt;
        const u = Math.min(1, p.fall / FALL_S);
        drop = 1 - u * u;
      }
      for (let i = 0; i < SPARKS; i++) {
        const ph = p.phase[i]!;
        // Each spark falls a little later than the previous one, then floats and twinkles.
        const late = Math.min(1, drop * (1 + (ph / (Math.PI * 2)) * 0.8));
        arr[i * 3] = p.base[i * 3]! + Math.sin(this.time * 0.7 + ph) * 0.03;
        arr[i * 3 + 1] =
          p.base[i * 3 + 1]! + late * 7 + Math.abs(Math.sin(this.time * 1.3 + ph)) * 0.08;
        arr[i * 3 + 2] = p.base[i * 3 + 2]! + Math.cos(this.time * 0.6 + ph) * 0.03;
      }
      attr.needsUpdate = true;
      const m = p.points.material as PointsMaterial;
      m.size = 0.75 + 0.2 * Math.sin(this.time * 5 + p.y);
      (p.glow.material as SpriteMaterial).opacity =
        (0.3 + 0.15 * Math.sin(this.time * 2)) * (0.5 + p.share * 0.5);
    }
  }

  /**
   * Chantier 32: the comet is an object of the map of space (`cometPath`): between its
   * announcement and a while after its passage it travels a wide arc round home, far beyond
   * the planets, and stays there when the camera turns (the player looks for it; an arrow on
   * the edge of the screen shows where, `arrow`).
   */
  private updateComet(now: number, camera: PerspectiveCamera): void {
    const c = this.comet;
    if (!c || now < c.from || now > c.to) {
      this.setCometVisible(false);
      return;
    }
    this.setCometVisible(true);
    const k = (now - c.from) / Math.max(1, c.to - c.from);
    const { head, dir } = cometPath(c.at, k);
    this.head.position.set(head.x, head.y, head.z);
    this.flight.set(dir.x, dir.y, dir.z);
    // Fades in when first seen, out once gone (over a quarter of an hour of game time).
    const fade = Math.min(1, (now - c.from) / 900_000, (c.to - now) / 900_000);
    const bright = (0.8 + 0.2 * this.night) * fade;
    const pulse = 1 + Math.sin(this.time * 3) * 0.08;
    this.head.scale.setScalar(HEAD_SIZE * pulse);
    (this.head.material as SpriteMaterial).opacity = bright * 0.8;
    // The body: from the end of the tail, behind the head along its flight, to the head.
    this.tailEnd.copy(this.head.position).addScaledVector(this.flight, -TAIL_LENGTH);
    this.body.position.addVectors(this.tailEnd, this.head.position).multiplyScalar(0.5);
    // Local X along the flight (the texture's head is on the right), local Z towards the
    // camera as much as the line allows.
    this.normal.copy(camera.position).sub(this.body.position).normalize();
    this.side.crossVectors(this.normal, this.flight).normalize();
    this.normal.crossVectors(this.flight, this.side);
    this.basis.makeBasis(this.flight, this.side, this.normal);
    this.body.quaternion.setFromRotationMatrix(this.basis);
    this.body.scale.set(TAIL_LENGTH * 1.08, TAIL_LENGTH * 0.19, 1);
    (this.body.material as MeshBasicMaterial).opacity = bright;
  }

  /** The comet's head while it is in the sky (null otherwise). */
  headPosition(): Vector3 | null {
    return this.head.visible ? this.head.position : null;
  }

  /**
   * Chantier 32: where the off-screen arrow points to the comet (client pixels of a `width` ×
   * `height` canvas), or null when the comet is on screen or not in the sky.
   */
  arrow(camera: PerspectiveCamera, width: number, height: number): CometArrow | null {
    if (!this.head.visible) return null;
    const v = this.dir.copy(this.head.position).applyMatrix4(camera.matrixWorldInverse);
    const behind = v.z > 0;
    v.applyMatrix4(camera.projectionMatrix);
    return edgeArrow(v, behind, width, height, ARROW_INSET);
  }

  dispose(): void {
    for (const p of this.patches.values()) this.removePatch(p);
    this.patches.clear();
    (this.head.material as SpriteMaterial).dispose();
    (this.body.material as MeshBasicMaterial).dispose();
    this.body.geometry.dispose();
    this.cometTexture.dispose();
    this.texture.dispose();
    this.sparkTexture.dispose();
  }
}
