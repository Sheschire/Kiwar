import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  Vector3,
  type Object3D,
} from 'three';
import { FACES, type Face, type FaceMap } from '@kiwar/shared';
import { seasonUniforms } from './seasonLook';
import { DOME_TOP, TerrainView } from './terrain';
import { WaterView } from './water';

/** Intro timeline (seconds): the whole fruit turns, the blade, the halves part. */
const T_SLICE = 1.6;
const T_PART = T_SLICE + 0.3;
const T_CHOICE = T_PART + 1.4;
const LEAVE_S = 1.3;

export type IntroPhase = 'playing' | 'choice' | 'leaving';

export interface IntroHandlers {
  onPhase(phase: IntroPhase): void;
  /** The pointer is over a half (desktop hover) or a half was tapped. */
  onFocus(face: Face): void;
  /** The blade cuts: sound and flash. */
  onSlice(): void;
  /** The camera has dived onto the chosen half. */
  onDone(face: Face): void;
}

/** Screen area left free by the UI (side panel on desktop, bottom sheet on phones). */
export interface IntroLayout {
  /** Share of the width covered on the right. */
  right: number;
  /** Share of the height covered at the bottom. */
  bottom: number;
}

interface Half {
  face: Face;
  pivot: Group;
  terrain: TerrainView;
  /** The skin dome under the face (moved up against the seam while the fruit is whole). */
  dome: Object3D;
  water: WaterView;
  /** Side of the screen: -1 left (Kiwisu), +1 right (Kiwino). */
  side: number;
  scale: number;
}

const Y = new Vector3(0, 1, 0);
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Chantier 05 intro: a whole kiwi turning in space is sliced in two; the halves (the real
 * faces of the new world, generated from its seed) part and turn to the player, who picks
 * one. Its own scene and camera, drawn instead of the game while it runs. Light enough for
 * phones: two terrains without props, shadows or post-processing.
 */
export class IntroScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(35, 1, 1, 2000);
  private readonly fruit = new Group();
  private readonly halves: Half[] = [];
  private readonly blade: Mesh;
  private readonly radius: number;
  private time = 0;
  private phase: IntroPhase = 'playing';
  private focus: Face | null = null;
  /** The player clicked a face: the mouse hovering over the other one no longer moves it. */
  private locked = false;
  private chosen: Face | null = null;
  private leaveTime = 0;
  private sliced = false;
  private layout: IntroLayout = { right: 0, bottom: 0 };
  private readonly target = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly tmpV = new Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    maps: Record<Face, FaceMap>,
    private readonly handlers: IntroHandlers,
    opts: { skip: boolean },
  ) {
    this.scene.background = new Color('#1d1631');
    this.scene.add(new HemisphereLight('#e8dcff', '#4a3550', 1.4));
    const sun = new DirectionalLight('#ffe9cc', 2.2);
    sun.position.set(-40, 60, 90);
    this.scene.add(sun, createStars());

    let radius = 0;
    for (const face of FACES) {
      const terrain = new TerrainView(maps[face]);
      terrain.tiles.castShadow = false;
      terrain.tiles.receiveShadow = false;
      // The cut runs just above the skin rim: the face sits at the pivot's origin.
      terrain.group.position.y = -2.1;
      // Whole fruit: only the furry domes show, touching at the seam; the faces appear when
      // the halves part.
      terrain.tiles.visible = false;
      const water = new WaterView(maps[face], sun.position);
      water.mesh.visible = false;
      terrain.group.add(water.mesh);
      const pivot = new Group();
      pivot.add(terrain.group);
      const side = face === 'kiwisu' ? -1 : 1;
      // Whole fruit: both cuts face each other along X (Kiwisu's towards +X).
      pivot.quaternion.setFromUnitVectors(Y, new Vector3(-side, 0, 0));
      this.fruit.add(pivot);
      this.halves.push({
        face,
        pivot,
        terrain,
        side,
        scale: 1,
        dome: terrain.group.children.find((c) => c !== terrain.tiles && c !== water.mesh)!,
        water,
      });
      const e = terrain.extent();
      radius = Math.max(radius, e.x, e.z);
    }
    this.radius = radius;
    // Dome tops on the seam (the terrain group sits 2.1 below the pivot).
    for (const h of this.halves) h.dome.position.y = 2.1;
    this.scene.add(this.fruit);

    this.blade = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: '#fffbe8',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthTest: false,
      }),
    );
    this.blade.rotation.z = 0.12;
    this.blade.renderOrder = 10;
    this.scene.add(this.blade);

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    this.placeCamera(1);
    if (opts.skip) this.skip();
  }

  get currentPhase(): IntroPhase {
    return this.phase;
  }

  setLayout(layout: IntroLayout): void {
    this.layout = layout;
  }

  setFocus(face: Face): void {
    this.focus = face;
  }

  /** A face was clicked (or its tab): hovering no longer changes the choice. */
  lock(): void {
    this.locked = true;
  }

  /** Jumps to the choice (tap during the animation, or reduced motion). */
  skip(): void {
    if (this.phase !== 'playing') return;
    this.time = T_CHOICE;
    this.sliced = true;
    this.fruit.quaternion.identity();
    this.fruit.scale.set(1, 1, 1);
    for (const h of this.halves) {
      this.reveal(h);
      h.pivot.position.copy(this.partPosition(h, 1));
      h.pivot.quaternion.copy(this.facing(h, 0.3));
    }
    this.blade.visible = false;
    this.setPhase('choice');
    this.placeCamera(1);
  }

  /** The player picked a face: the camera dives onto it, the other half flies off. */
  choose(face: Face): void {
    if (this.phase !== 'choice') return;
    this.chosen = face;
    this.leaveTime = 0;
    this.setPhase('leaving');
  }

  update(dt: number): void {
    // The terrain shaders share the season uniforms with the game: neutral look in space.
    seasonUniforms.uNight.value = 0;
    seasonUniforms.uSnow.value = 0;
    seasonUniforms.uSeasonTintAmount.value = 0.12;
    this.time += dt;
    const t = this.time;
    for (const h of this.halves) h.water.update(t);
    if (this.phase === 'playing') this.play(t, dt);
    else if (this.phase === 'choice') this.idle(dt);
    else this.leave(dt);
  }

  private play(t: number, dt: number): void {
    if (t < T_SLICE) {
      // The whole fruit rolls around its axis (the cut stays edge-on to the camera).
      this.fruit.rotation.set(t * 0.9, 0.25 * Math.sin(t * 0.8), 0);
      // A real kiwi is a little longer than wide.
      this.fruit.scale.set(1.18, 1, 1);
    } else if (!this.sliced) {
      this.sliced = true;
      // Bake the fruit's turn into the halves, then part them from there.
      this.fruit.updateMatrixWorld();
      for (const h of this.halves) {
        h.pivot.getWorldQuaternion(this.tmpQ);
        h.pivot.quaternion.copy(this.tmpQ);
        h.pivot.userData.from = this.tmpQ.clone();
      }
      this.fruit.quaternion.identity();
      this.fruit.scale.set(1, 1, 1);
      for (const h of this.halves) this.reveal(h);
      this.handlers.onSlice();
    }
    // Blade: a bright slash sweeping down the seam.
    const b = (t - T_SLICE) / (T_PART - T_SLICE);
    const mat = this.blade.material as MeshBasicMaterial;
    if (b > -0.4 && b < 1.6) {
      this.blade.visible = true;
      const reach = ease(b * 1.4);
      this.blade.scale.set(0.7, this.radius * 2.8 * reach + 0.01, 1);
      this.blade.position.set(0, this.radius * 1.4 * (1 - reach), this.radius + 4);
      mat.opacity = b < 0 ? 0 : Math.max(0, 1 - Math.max(0, b - 0.6));
    } else this.blade.visible = false;
    if (t >= T_PART) {
      const k = ease((t - T_PART) / (T_CHOICE - T_PART));
      for (const h of this.halves) {
        const from = h.pivot.userData.from as Quaternion;
        h.pivot.position.copy(this.partPosition(h, k));
        h.pivot.quaternion.slerpQuaternions(from, this.facing(h, 0.3), k);
      }
    }
    this.placeCamera(dt * 1.5);
    if (t >= T_CHOICE) this.setPhase('choice');
  }

  private idle(dt: number): void {
    const k = damp(4, dt);
    for (const h of this.halves) {
      const focused = this.focus === h.face;
      const other = this.focus !== null && !focused;
      const pos = this.partPosition(h, 1);
      if (focused) pos.z += this.radius * 0.25;
      if (other) pos.z -= this.radius * 0.45;
      pos.y += Math.sin(this.time * 0.8 + h.side) * 0.6;
      h.pivot.position.lerp(pos, k);
      h.pivot.quaternion.slerp(this.facing(h, focused ? 0.08 : other ? 0.75 : 0.3), k);
      h.scale += ((focused ? 1.06 : other ? 0.85 : 1) - h.scale) * k;
      h.pivot.scale.setScalar(h.scale);
    }
    this.placeCamera(dt);
  }

  private leave(dt: number): void {
    this.leaveTime += dt;
    const k = ease(this.leaveTime / LEAVE_S);
    for (const h of this.halves) {
      if (h.face === this.chosen) {
        // Turn the face up, as the colony will be seen.
        const q = this.tmpQ.setFromUnitVectors(Y, this.tmpV.set(0, 0.55, 1).normalize());
        h.pivot.quaternion.slerp(q, damp(5, dt));
        h.pivot.position.lerp(this.tmpV.set(0, 0, 0), damp(4, dt));
      } else {
        h.pivot.position.y += dt * (20 + 90 * k);
        h.pivot.position.x += dt * h.side * 10;
      }
    }
    // Dive towards the chosen face.
    this.lookAt.lerp(this.tmpV.set(0, 0, 0), damp(5, dt));
    const d = this.fitDistance() * (1 - 0.6 * k);
    this.camera.position.lerp(this.tmpV.set(0, d * 0.35, d), damp(6, dt));
    this.camera.lookAt(this.lookAt);
    if (this.leaveTime >= LEAVE_S && this.chosen) {
      const face = this.chosen;
      this.chosen = null;
      this.handlers.onDone(face);
    }
  }

  /** The face of a half shows, its dome back under it. */
  private reveal(h: Half): void {
    h.terrain.tiles.visible = true;
    h.water.mesh.visible = true;
    h.dome.position.y = DOME_TOP;
  }

  private setPhase(phase: IntroPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.handlers.onPhase(phase);
  }

  /** Where a half stands when parted (`k` from 0, joined, to 1). */
  private partPosition(h: Half, k: number): Vector3 {
    return new Vector3(h.side * this.radius * 1.22 * k, 0, 0);
  }

  /** Orientation showing the face to the camera, turned `away` towards its side. */
  private facing(h: Half, away: number): Quaternion {
    const n = new Vector3(h.side * away, 0.22, 1).normalize();
    const q = new Quaternion().setFromUnitVectors(Y, n);
    // A slow turn around its own axis keeps the halves alive.
    const spin = new Quaternion().setFromAxisAngle(Y, this.time * 0.05 * h.side);
    return q.multiply(spin);
  }

  /** Camera distance that frames both halves in the free area of the screen. */
  private fitDistance(): number {
    const { right, bottom } = this.parted() ? this.layout : { right: 0, bottom: 0 };
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const width = this.parted() ? this.radius * 2.6 : this.radius * 1.3;
    const height = this.radius * 1.25;
    return Math.max(width / (1 - right) / Math.tan(hHalf), height / (1 - bottom) / Math.tan(vHalf));
  }

  private parted(): boolean {
    return this.time >= T_PART;
  }

  /** Eases the camera to frame the scene in the area the UI leaves free. */
  private placeCamera(dt: number): void {
    const d = this.fitDistance();
    const { right, bottom } = this.phase === 'playing' ? { right: 0, bottom: 0 } : this.layout;
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hh = d * Math.tan(vHalf);
    const hw = hh * this.camera.aspect;
    // Shift the view so the halves sit in the middle of the free area.
    this.target.set(right * hw, -bottom * hh, 0);
    const k = Math.min(1, damp(3, dt));
    this.lookAt.lerp(this.target, k);
    this.camera.position.lerp(this.tmpV.set(this.target.x, this.target.y + d * 0.12, d), k);
    this.camera.lookAt(this.lookAt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Which half is under a screen point (projected discs). */
  private faceAt(clientX: number, clientY: number): Face | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    let best: Face | null = null;
    let bestD = Infinity;
    for (const h of this.halves) {
      const c = this.tmpV.copy(h.pivot.position).project(this.camera);
      const edge = new Vector3(
        h.pivot.position.x + this.radius * h.scale,
        h.pivot.position.y,
        0,
      ).project(this.camera);
      const r = Math.abs(edge.x - c.x) * 1.1;
      const dx = (x - c.x) * this.camera.aspect;
      const dy = y - c.y;
      const d = Math.hypot(dx, dy) / Math.max(1e-3, r * this.camera.aspect);
      if (d < 1 && d < bestD) {
        bestD = d;
        best = h.face;
      }
    }
    return best;
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.phase !== 'choice' || e.pointerType !== 'mouse' || this.locked) return;
    const face = this.faceAt(e.clientX, e.clientY);
    if (face && face !== this.focus) this.handlers.onFocus(face);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.phase === 'playing') return this.skip();
    if (this.phase !== 'choice') return;
    const face = this.faceAt(e.clientX, e.clientY);
    if (!face) return;
    this.locked = true;
    this.handlers.onFocus(face);
  };

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    for (const h of this.halves) {
      h.terrain.dispose();
      h.water.dispose();
    }
    this.blade.geometry.dispose();
    (this.blade.material as MeshBasicMaterial).dispose();
    this.scene.traverse((o) => {
      if (o instanceof Points) {
        o.geometry.dispose();
        (o.material as PointsMaterial).dispose();
      }
    });
  }
}

/** A sky of still stars around the scene. */
function createStars(): Points {
  const positions: number[] = [];
  let s = 12345;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (let i = 0; i < 1400; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.push(Math.cos(a) * r * 700, u * 700, Math.sin(a) * r * 700);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return new Points(
    g,
    new PointsMaterial({ color: '#fff3dc', size: 1.8, sizeAttenuation: false, fog: false }),
  );
}
