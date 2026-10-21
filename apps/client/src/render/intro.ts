import type { Mesh, MeshStandardMaterial } from 'three';
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Matrix4,
  PerspectiveCamera,
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
import {
  addFurShells,
  BladeTrail,
  createGlow,
  createWholeKiwi,
  disposeFur,
  FleshVeil,
  furShiver,
  JuiceBurst,
  JuiceStrands,
  RING,
  type Glow,
} from './introFx';

/**
 * Intro timeline (seconds since the player asked for the cut): the fruit settles with its seam
 * on the diagonal, the blade, the halves part.
 */
const T_SLICE = 0.4;
const T_PART = T_SLICE + 0.3;
const T_CHOICE = T_PART + 1.4;
const LEAVE_S = 1.3;
/** Slow motion when the blade bites (real seconds, at `SLOW` speed). */
const SLOW_S = 0.3;
const SLOW = 0.3;
/** A tap within this many pixels of the fruit's outline still counts. */
const TAP_SLACK_PX = 24;
/** A drag this long across the fruit slices it too. */
const SWIPE_PX = 40;

/** `waiting`: the whole fruit turns until the player slices it (chantier 22). */
export type IntroPhase = 'waiting' | 'playing' | 'choice' | 'leaving';

export interface IntroHandlers {
  onPhase(phase: IntroPhase): void;
  /** The pointer is over a half (desktop hover) or a half was tapped. */
  onFocus(face: Face): void;
  /** The blade cuts: sound. */
  onSlice(): void;
  /** The first strands of juice between the halves break: sound. */
  onJuice(): void;
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
  /** The skin dome under the face (hidden while the fruit is whole, deeper just after the cut). */
  dome: Object3D;
  /** Depth of the dome in the game (its Y scale). */
  domeDepth: number;
  water: WaterView;
  /** Wet flesh over the face just after the cut, melting to reveal the tiles. */
  veil: FleshVeil;
  /** Side of the screen: -1 left (Kiwisu), +1 right (Kiwino). */
  side: number;
  scale: number;
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
/**
 * Pose of the fruit when it is cut (chantier 22): its axis (X, across the cut) leans 60° away
 * from the camera towards the lower right, so the seam shows as an ellipse whose long axis is
 * the screen's other diagonal — the line the blade follows.
 */
const AXIS = new Vector3(0.62, -0.6, 0.5).normalize();
const POSE = new Quaternion().setFromUnitVectors(X, AXIS);
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
  private readonly blade = new BladeTrail();
  private readonly juice = new JuiceBurst();
  private readonly strands = new JuiceStrands();
  /** Real seconds of slow motion left. */
  private slowLeft = 0;
  private juiceHeard = false;
  /** The whole round fruit, until the cut. */
  private readonly whole: Mesh;
  private readonly radius: number;
  /** Radius of the skin (the whole fruit's size). */
  private readonly skinRadius: number;
  private readonly glow: Glow;
  private time = 0;
  /** Seconds since the player asked for the cut (null while waiting). */
  private cut: number | null = null;
  /** Turn of the fruit around its own axis (the seam stays in place). */
  private spin = 0;
  private phase: IntroPhase = 'waiting';
  /** Where a press started (tap or swipe across the fruit). */
  private press: { x: number; y: number; id: number } | null = null;
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
        domeDepth: 0,
        water,
        veil: new FleshVeil(1),
      });
      const e = terrain.extent();
      radius = Math.max(radius, e.x, e.z);
    }
    this.radius = radius;
    let skin = 0;
    for (const h of this.halves) {
      h.domeDepth = h.dome.scale.y;
      skin = Math.max(skin, h.dome.scale.x, h.dome.scale.z);
      // Dome tops on the seam (the terrain group sits 2.1 below the pivot), hidden while whole.
      h.dome.position.y = 2.1;
      h.dome.visible = false;
      // Real kiwi fur on the outside of each half (intro only; hairs towards the bottom).
      addFurShells(h.dome as Mesh, new Vector3(0, -1, 0));
    }
    this.skinRadius = skin;
    for (const h of this.halves) {
      // The fresh cut covers the face, just above its highest tile.
      const top = h.terrain.tiles.boundingBox!.max.y + h.terrain.group.position.y;
      h.veil.mesh.scale.setScalar(Math.max(this.radius, skin) * 1.02);
      h.veil.mesh.position.y = top + 0.05;
      h.pivot.add(h.veil.mesh);
    }
    // A round kiwi, barely longer along its axis (X, across the cut).
    this.whole = createWholeKiwi();
    this.whole.scale.set(skin * 1.04, skin, skin);
    this.fruit.add(this.whole);
    this.fruit.quaternion.copy(POSE);
    this.scene.add(this.fruit);
    this.glow = createGlow();
    this.glow.sprite.scale.setScalar(skin * 3.4);
    this.scene.add(this.glow.sprite);

    this.scene.add(this.blade.mesh, this.juice.drops, this.juice.seeds, this.strands.mesh);

    canvas.addEventListener('pointerdown', this.onPointerDown);
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

  /** The player asks for the cut (tap on the fruit, a swipe across it, or the button). */
  slice(): void {
    if (this.phase !== 'waiting') return;
    this.cut = 0;
    this.setPhase('playing');
  }

  /** Jumps to the choice (the Skip button, or reduced motion). */
  skip(): void {
    if (this.phase !== 'waiting' && this.phase !== 'playing') return;
    this.cut = T_CHOICE;
    this.sliced = true;
    this.whole.visible = false;
    this.glow.sprite.visible = false;
    this.fruit.quaternion.identity();
    for (const h of this.halves) {
      this.reveal(h);
      h.dome.scale.y = h.domeDepth;
      h.pivot.position.copy(this.partPosition(h, 1));
      h.pivot.quaternion.copy(this.facing(h, 0.3));
    }
    this.blade.mesh.visible = false;
    this.strands.clear();
    furShiver.value = 0;
    this.slowLeft = 0;
    for (const h of this.halves) h.veil.set(0, 1);
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

  update(realDt: number): void {
    // The terrain shaders share the season uniforms with the game: neutral look in space.
    seasonUniforms.uNight.value = 0;
    seasonUniforms.uSnow.value = 0;
    seasonUniforms.uSeasonTintAmount.value = 0.12;
    // Slow motion as the blade bites, easing back to full speed over its last 0.1 s.
    let dt = realDt;
    if (this.slowLeft > 0) {
      this.slowLeft -= realDt;
      dt *= SLOW + (1 - SLOW) * Math.max(0, 1 - this.slowLeft / 0.1);
    }
    this.time += dt;
    const t = this.time;
    for (const h of this.halves) h.water.update(t);
    this.juice.update(dt);
    if (this.strands.update(this.juice) > 0 && !this.juiceHeard) {
      this.juiceHeard = true;
      this.handlers.onJuice();
    }
    if (this.phase === 'waiting') this.wait(t, dt);
    else if (this.phase === 'playing') this.play(dt);
    else if (this.phase === 'choice') this.idle(dt);
    else this.leave(dt);
  }

  /** The whole fruit drifts and turns, its seam faintly lit, a glow pulsing behind it. */
  private wait(t: number, dt: number): void {
    this.spin += dt * 0.7;
    this.fruit.quaternion.copy(this.drift(t, 1));
    this.glow.set(0.5 + 0.5 * Math.sin(t * 2.2));
    this.placeCamera(dt * 1.5);
  }

  /**
   * Orientation of the whole fruit: the cut pose, rocked by a slow drift (`amount` 1) that
   * eases out when the player asks for the cut, and turned around its own axis.
   */
  private drift(t: number, amount: number): Quaternion {
    const q = this.tmpQ.setFromAxisAngle(
      this.tmpV.set(0, 0, 1),
      0.45 * Math.sin(t * 0.35) * amount,
    );
    const yaw = new Quaternion().setFromAxisAngle(Y, 0.5 * Math.sin(t * 0.23 + 1) * amount);
    return q.multiply(yaw).multiply(POSE).multiply(new Quaternion().setFromAxisAngle(X, this.spin));
  }

  private play(dt: number): void {
    const c = (this.cut ?? 0) + dt;
    this.cut = c;
    if (c < T_SLICE) {
      // The drift settles: the seam comes to rest on the diagonal the blade will follow.
      this.spin += dt * 0.7 * (1 - c / T_SLICE);
      this.fruit.quaternion.copy(this.drift(this.time, 1 - ease(c / T_SLICE)));
      this.glow.set(0.5 * (1 - c / T_SLICE));
    } else if (!this.sliced) {
      this.sliced = true;
      this.glow.sprite.visible = false;
      this.aimBlade();
      this.juice.burst(this.skinRadius, POSE);
      this.slowLeft = SLOW_S;
      this.handlers.onSlice();
    }
    // The fur quivers from the blow.
    const blow = c - T_SLICE;
    furShiver.value = blow > 0 && blow < 1.2 ? Math.exp(-blow * 4) * Math.sin(blow * 45) : 0;
    // The whole fruit holds together while the blade runs through it, then falls in two.
    if (c >= T_PART && this.whole.visible) this.split();
    // Blade: a thin streak sweeping along the seam, in the plane of the cut.
    const b = (c - T_SLICE) / (T_PART - T_SLICE);
    if (b > 0 && b < 2) {
      this.blade.mesh.visible = true;
      this.blade.set(ease(b * 0.9) * 1.45, 1 - ease((b - 1) * 1.2));
    } else this.blade.mesh.visible = false;
    if (c >= T_PART) {
      const k = ease((c - T_PART) / (T_CHOICE - T_PART));
      // The fresh cut glows warm for a moment, then the flesh melts into the colony's face.
      const after = c - T_PART;
      const glow = Math.max(0, 1 - after / 0.4) ** 2;
      const melt = ease((after - 0.35) / 0.9);
      for (const h of this.halves) {
        h.veil.set(glow, melt);
        h.dome.scale.y = this.skinRadius * 1.04 + (h.domeDepth - this.skinRadius * 1.04) * k;
        const from = h.pivot.userData.from as Quaternion;
        // The halves first slide apart along the fruit's axis, then take their places.
        h.pivot.position
          .copy(this.partPosition(h, k))
          .addScaledVector(AXIS, h.side * this.radius * 0.45 * 4 * k * (1 - k));
        h.pivot.quaternion.slerpQuaternions(from, this.facing(h, 0.3), k);
      }
    }
    this.placeCamera(dt * 1.5);
    if (c >= T_CHOICE) this.setPhase('choice');
  }

  /** The whole fruit gives way to its two halves, which then part. */
  private split(): void {
    // Bake the fruit's turn into the halves, then part them from there.
    this.fruit.updateMatrixWorld();
    for (const h of this.halves) {
      h.pivot.getWorldQuaternion(this.tmpQ);
      h.pivot.quaternion.copy(this.tmpQ);
      h.pivot.userData.from = this.tmpQ.clone();
    }
    this.fruit.quaternion.identity();
    for (const h of this.halves) {
      this.reveal(h);
      // Cut from the round fruit: as deep as it, settling into the game's dome as it parts.
      h.dome.scale.y = this.skinRadius * 1.04;
      h.veil.set(1, 0);
    }
    this.whole.visible = false;
    // Strands of juice from one cut to the other, anchored on the flesh.
    const [a, b] = this.halves;
    this.strands.attach(a!.pivot, b!.pivot, this.skinRadius * 0.9, POSE, a!.veil.mesh.position.y);
  }

  /**
   * Lays the blade in the plane of the cut, on the seam's circle: local Y along the seam's long
   * axis on screen (the in-plane direction square to the view, pointing up), local X towards
   * the camera, so the streak runs down the visible front of the seam.
   */
  private aimBlade(): void {
    const view = this.tmpV.copy(this.camera.position).sub(this.lookAt).normalize();
    const along = new Vector3().crossVectors(AXIS, view).normalize();
    if (along.y < 0) along.negate();
    const across = new Vector3().crossVectors(along, AXIS);
    if (across.dot(view) < 0) across.negate();
    const normal = new Vector3().crossVectors(across, along);
    const mesh = this.blade.mesh;
    mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(across, along, normal));
    mesh.position.set(0, 0, 0);
    // The seam's circle: the skin's radius plus its fur.
    mesh.scale.setScalar(this.skinRadius * 1.04 * 2 * RING);
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
    h.dome.visible = true;
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
    // The whole fruit keeps some room around it (its glow, the call to action below).
    const room = this.parted() ? 1 : 1.3;
    return (
      room *
      Math.max(width / (1 - right) / Math.tan(hHalf), height / (1 - bottom) / Math.tan(vHalf))
    );
  }

  private parted(): boolean {
    return this.cut !== null && this.cut >= T_PART;
  }

  /** Eases the camera to frame the scene in the area the UI leaves free. */
  private placeCamera(dt: number): void {
    const d = this.fitDistance();
    const whole = this.phase === 'waiting' || this.phase === 'playing';
    const { right, bottom } = whole ? { right: 0, bottom: 0 } : this.layout;
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

  /** Distance of a screen point from the whole fruit's centre, in its radii (< 1: on it). */
  private onFruit(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const c = this.tmpV.set(0, 0, 0).project(this.camera);
    const cx = rect.left + ((c.x + 1) / 2) * rect.width;
    const cy = rect.top + ((1 - c.y) / 2) * rect.height;
    // Screen radius of the fruit: half its angular size at the camera's distance.
    const dist = this.camera.position.length();
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const r = ((this.skinRadius * 1.06) / (dist * Math.tan(vHalf))) * (rect.height / 2);
    return Math.hypot(clientX - cx, clientY - cy) / (r + TAP_SLACK_PX);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.press = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const press = this.press;
    if (this.phase === 'waiting' && press && press.id === e.pointerId) {
      // A swipe across the fruit slices it (the blade still follows the seam).
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (moved > SWIPE_PX && this.crosses(press.x, press.y, e.clientX, e.clientY)) {
        this.press = null;
        this.slice();
      }
      return;
    }
    if (this.phase !== 'choice' || e.pointerType !== 'mouse' || this.locked) return;
    const face = this.faceAt(e.clientX, e.clientY);
    if (face && face !== this.focus) this.handlers.onFocus(face);
  };

  /** Whether the segment between two screen points passes over the fruit. */
  private crosses(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      if (this.onFruit(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) < 1) return true;
    }
    return false;
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    this.press = null;
    if (this.phase === 'waiting') {
      if (press && this.onFruit(e.clientX, e.clientY) < 1) this.slice();
      return;
    }
    // During the cut the Skip button skips: a second tap (or the end of a swipe) must not.
    if (this.phase !== 'choice') return;
    const face = this.faceAt(e.clientX, e.clientY);
    if (!face) return;
    this.locked = true;
    this.handlers.onFocus(face);
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    for (const h of this.halves) {
      disposeFur(h.dome as Mesh);
      h.terrain.dispose();
      h.water.dispose();
      h.veil.dispose();
    }
    this.blade.dispose();
    this.juice.dispose();
    this.strands.dispose();
    furShiver.value = 0;
    this.glow.dispose();
    disposeFur(this.whole);
    this.whole.geometry.dispose();
    (this.whole.material as MeshStandardMaterial).dispose();
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
