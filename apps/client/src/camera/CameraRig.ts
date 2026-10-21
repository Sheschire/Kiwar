import CameraControls from 'camera-controls';
import {
  Box3,
  Matrix4,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
  type PerspectiveCamera,
} from 'three';
import { Glide } from './inertia';

CameraControls.install({
  THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster },
});

const A = CameraControls.ACTION;
const ROTATE_STEP = Math.PI / 4;
const KEY_SPEED = 0.9; // fraction of the camera distance per second
const FOCUS_DISTANCE = 26;
const AZIMUTH_KEY = 'kiwar.camera.azimuth';
/** Fastest glide after a flick, in camera distances per second. */
const GLIDE_MAX_SPEED = 5;
/** Chantier 20: fastest spin after a two-finger twist is let go (radians per second). */
const SPIN_MAX_SPEED = 5;
const tmpTarget = new Vector3();
const tmpEnd = new Vector3();
const tmpSpherical = new Spherical();

/** The player's tilt range near the colony (polar angle from straight down). */
export const MIN_POLAR = 0.32;
export const MAX_POLAR = 1.12;
/** Chantier 24: farthest zoom, in framing distances (the planets show from afar). */
export const MAX_ZOOM = 3;
/** Polar angle the camera rises to at the farthest zoom: almost level, the planets in view. */
export const SPACE_POLAR = 1.42;
const DEFAULT_POLAR = 0.78;

/**
 * Chantier 24, "space view": the lowest the camera may look at zoom `k` (distance / framing
 * distance). Nothing up to the framing; then it rises smoothly towards the horizon, so the
 * planets of the map of space come into view (the camera looks 45–64° down at home: a far
 * planet near the horizon is never on screen otherwise).
 */
export function liftPolar(k: number): number {
  const t = Math.min(1, Math.max(0, (k - 1) / (MAX_ZOOM - 1.4)));
  // Eased out: the first steps of the zoom-out already raise the view (the twin peeks in).
  return DEFAULT_POLAR + (SPACE_POLAR - DEFAULT_POLAR) * (1 - (1 - t) * (1 - t));
}

function loadAzimuth(): number {
  try {
    const v = Number(localStorage.getItem(AZIMUTH_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Isometric-ish camera: bounded orbit, pan and zoom with damping.
 * Desktop: left-drag pan (a simple click still selects), right-drag or Alt/Ctrl+left-drag orbit,
 * wheel / trackpad pinch zoom, middle-drag or Shift+right-drag pan, WASD move, Q/E rotate.
 * Touch: pinch zoom, one-finger pan, two-finger drag/twist rotate.
 */
export class CameraRig {
  readonly controls: CameraControls;
  private readonly keys = new Set<string>();
  private readonly element: HTMLElement;
  private twistAngle: number | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private paintMode = false;
  /** Distance that frames the whole disc (zoom 1). */
  frameDistance = 60;
  /** The player's favourite side of the colony, kept across sessions. */
  private azimuth = loadAzimuth();
  /** Away on an ally's planet: the camera there is not the player's home view. */
  private away = false;
  /** Glide after a one-finger pan on touch screens. */
  private readonly glide = new Glide();
  /** Chantier 20: the same fading glide for the azimuth after a two-finger twist. */
  private readonly spin = new Glide();
  private twistTotal = 0;
  private bounds: Box3 | null = null;
  /** A one-finger pan is under way (no second finger since it started). */
  private panning = false;
  /**
   * Chantier 24: the zoom-out has raised the camera (`liftPolar`); `playerPolar` is the tilt
   * the player had before, given back when zooming in again.
   */
  private lifted = false;
  private playerPolar = DEFAULT_POLAR;
  private lastLift = 0;

  constructor(camera: PerspectiveCamera, element: HTMLElement) {
    this.element = element;
    const c = new CameraControls(camera, element);
    this.controls = c;
    c.mouseButtons.left = A.TRUCK;
    c.mouseButtons.right = A.ROTATE;
    c.mouseButtons.middle = A.TRUCK;
    c.mouseButtons.wheel = A.DOLLY;
    c.touches.one = A.TOUCH_TRUCK;
    c.touches.two = A.TOUCH_DOLLY_ROTATE;
    c.touches.three = A.TOUCH_TRUCK;
    c.dollyToCursor = true;
    c.smoothTime = 0.2;
    c.draggingSmoothTime = 0.09;
    c.azimuthRotateSpeed = 0.6;
    c.polarRotateSpeed = 0.5;
    c.dollySpeed = 0.6;
    c.truckSpeed = 1.6;
    c.minDistance = 11;
    c.maxDistance = 75;
    c.minPolarAngle = MIN_POLAR;
    c.maxPolarAngle = MAX_POLAR;
    c.boundaryFriction = 0.15;

    // Remember where the player likes to look from once the camera settles.
    c.addEventListener('rest', this.onRest);
    element.addEventListener('contextmenu', this.onContextMenu);
    element.addEventListener('pointerdown', this.onMouseDownCapture, { capture: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.stopGlide, { passive: true });
  }

  private stopGlide = () => {
    this.glide.reset();
    this.spin.reset();
  };

  /** Frames the whole disc of the given half extents. */
  frame(extentX: number, extentZ: number, enableTransition = false): void {
    this.stopGlide();
    const r = Math.max(extentX, extentZ);
    this.setBounds(new Box3(new Vector3(-extentX, -1, -extentZ), new Vector3(extentX, 3, extentZ)));
    const distance = this.fitDistance(r);
    this.frameDistance = distance;
    // Zooming out far enough shows the planets of the map of space (chantier 24).
    this.controls.maxDistance = distance * MAX_ZOOM;
    this.lifted = false;
    const polar = DEFAULT_POLAR;
    const azimuth = this.azimuth;
    void this.controls.setLookAt(
      Math.sin(azimuth) * Math.sin(polar) * distance,
      Math.cos(polar) * distance,
      Math.cos(azimuth) * Math.sin(polar) * distance,
      0,
      0.4,
      0,
      enableTransition,
    );
  }

  private onRest = () => {
    if (this.away) return;
    const a = this.controls.azimuthAngle;
    // Normalised to (-π, π], so the stored value never drifts after many turns.
    const azimuth = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(azimuth - this.azimuth) < 1e-3) return;
    this.azimuth = azimuth;
    try {
      localStorage.setItem(AZIMUTH_KEY, azimuth.toFixed(4));
    } catch {
      // ignore
    }
  };

  /**
   * Flies to a far planet (an ally's, seen from our side) and keeps the camera around it: its
   * own bounds and zoom range until `returnHome`.
   */
  visit(center: Vector3, radius: number): void {
    this.away = true;
    this.stopGlide();
    const c = this.controls;
    this.setBounds(
      new Box3(
        new Vector3(center.x - radius, center.y - 4, center.z - radius),
        new Vector3(center.x + radius, center.y + 6, center.z + radius),
      ),
    );
    const distance = this.fitDistance(radius) * 1.2;
    c.minDistance = Math.min(8, distance * 0.4);
    c.maxDistance = distance * 1.6;
    // Seen from our side of the sky, the way the planet leans towards us.
    const toward = new Vector3(-center.x, 0, -center.z).normalize();
    const polar = 0.7;
    void c.setLookAt(
      center.x + toward.x * Math.sin(polar) * distance,
      center.y + Math.cos(polar) * distance,
      center.z + toward.z * Math.sin(polar) * distance,
      center.x,
      center.y,
      center.z,
      true,
    );
  }

  /** Back from a visit: the colony's bounds, and the view the player left (or the framing). */
  returnHome(
    extentX: number,
    extentZ: number,
    view: { position: Vector3; target: Vector3 } | null,
  ): void {
    this.away = false;
    if (!view) {
      this.frame(extentX, extentZ, true);
      return;
    }
    const c = this.controls;
    // Lift the bounds first: the flight back starts far outside them.
    this.setBounds(undefined);
    c.minDistance = 11;
    c.maxDistance = this.frameDistance * MAX_ZOOM;
    void c
      .setLookAt(
        view.position.x,
        view.position.y,
        view.position.z,
        view.target.x,
        view.target.y,
        view.target.z,
        true,
      )
      .then(() =>
        this.setBounds(
          new Box3(new Vector3(-extentX, -1, -extentZ), new Vector3(extentX, 3, extentZ)),
        ),
      );
  }

  /** Distance at which a disc of radius `r` fits on screen for the current aspect ratio. */
  fitDistance(r: number): number {
    const cam = this.controls.camera as PerspectiveCamera;
    const vHalf = (cam.fov * Math.PI) / 180 / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    // In portrait, crop the rim a little so the colony is not tiny.
    const horizontal = cam.aspect < 0.8 ? 0.82 : 0.98;
    return Math.max((r * 0.8) / Math.tan(vHalf), (r * horizontal) / Math.tan(hHalf));
  }

  /**
   * Shifts the view so the target appears higher on screen, e.g. above a bottom sheet covering
   * `fraction` of the screen height (0 = centred).
   */
  setBottomInset(fraction: number): void {
    const cam = this.controls.camera as PerspectiveCamera;
    // Use the distance the camera is heading to (focus() may be zooming in).
    const distance = Math.min(this.controls.distance, FOCUS_DISTANCE);
    const halfHeight = distance * Math.tan((cam.fov * Math.PI) / 180 / 2);
    void this.controls.setFocalOffset(0, halfHeight * fraction, 0, true);
  }

  focus(x: number, y: number, z: number): void {
    this.stopGlide();
    void this.controls.moveTo(x, y, z, true);
    if (this.controls.distance > FOCUS_DISTANCE + 4)
      void this.controls.dollyTo(FOCUS_DISTANCE, true);
  }

  /** While painting, left-drag and one-finger drags belong to the painter. */
  setPaintMode(on: boolean): void {
    this.paintMode = on;
    this.stopGlide();
    this.controls.mouseButtons.left = on ? A.NONE : A.TRUCK;
    this.controls.touches.one = on ? A.NONE : A.TOUCH_TRUCK;
    this.controls.touches.two = on ? A.TOUCH_DOLLY_TRUCK : A.TOUCH_DOLLY_ROTATE;
  }

  rotateStep(direction: 1 | -1): void {
    // Snap to the next multiple of 45° for a satisfying stepped rotation.
    const current = this.controls.azimuthAngle;
    const target = Math.round(current / ROTATE_STEP) * ROTATE_STEP + direction * ROTATE_STEP;
    void this.controls.rotateAzimuthTo(target, true);
  }

  update(dt: number): boolean {
    const forward =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafe =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    if (forward !== 0 || strafe !== 0) {
      const step = this.controls.distance * KEY_SPEED * dt;
      if (forward) void this.controls.forward(forward * step, true);
      if (strafe) void this.controls.truck(strafe * step, 0, true);
    }
    this.updateGlide(dt);
    if (!this.away) this.updateLift();
    return this.controls.update(dt);
  }

  /**
   * Chantier 24: zooming out raises the camera towards the horizon (`liftPolar`), zooming back
   * in gives the player's own tilt back. Read on the end values, so the tilt eases along with
   * the zoom.
   */
  private updateLift(): void {
    const c = this.controls;
    const end = c.getSpherical(tmpSpherical, true);
    const lift = liftPolar(end.radius / this.frameDistance);
    c.maxPolarAngle = Math.max(MAX_POLAR, lift + 0.04);
    // The player tilted up past the lift by hand: that tilt is theirs now.
    if (this.lifted && end.phi > this.lastLift + 0.01) this.lifted = false;
    if (lift > end.phi + 1e-3) {
      if (!this.lifted) this.playerPolar = end.phi;
      this.lifted = true;
    } else if (!this.lifted) return;
    const want = Math.max(this.playerPolar, lift);
    if (lift <= this.playerPolar) this.lifted = false;
    this.lastLift = want;
    if (Math.abs(want - end.phi) > 1e-3) void c.rotatePolarTo(want, true);
  }

  private updateGlide(dt: number): void {
    const spin = this.spin.step(dt);
    if (spin) void this.controls.rotate(spin.dx, 0, false);
    const d = this.glide.step(dt);
    if (!d) return;
    const c = this.controls;
    c.getTarget(tmpTarget, true);
    tmpTarget.x += d.dx;
    tmpTarget.z += d.dz;
    // Chantier 20: clamp here. A pan can leave the target above or below the bounds; then
    // camera-controls' own enclosing divides by zero (an offset with no height) and the
    // camera turns to NaN.
    tmpEnd.copy(tmpTarget);
    if (this.bounds) this.bounds.clampPoint(tmpTarget, tmpTarget);
    void c.moveTo(tmpTarget.x, tmpTarget.y, tmpTarget.z, true);
    // Against the edge of the colony the bounds hold the target back: stop gliding softly.
    if (Math.hypot(tmpEnd.x - tmpTarget.x, tmpEnd.z - tmpTarget.z) > 1e-3) this.glide.brake(0.6);
  }

  /** The camera-controls boundary, kept here too (the glide clamps against it). */
  private setBounds(box: Box3 | undefined): void {
    this.bounds = box ?? null;
    this.controls.setBoundary(box);
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isTyping(e) || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Shift') this.controls.mouseButtons.right = A.TRUCK;
    if (e.code === 'KeyQ' && !e.repeat) this.rotateStep(-1);
    if (e.code === 'KeyE' && !e.repeat) this.rotateStep(1);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.controls.mouseButtons.right = A.ROTATE;
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.touches.clear();
    this.controls.mouseButtons.right = A.ROTATE;
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  /**
   * Runs before camera-controls (capture phase): Alt/Option or Ctrl + left drag orbits, for
   * trackpads without a right button (Ctrl+click is the macOS right click). Also shows a
   * "grabbing" cursor while dragging.
   */
  private onMouseDownCapture = (e: PointerEvent) => {
    this.stopGlide();
    if (e.pointerType !== 'mouse') return;
    this.controls.mouseButtons.left =
      e.altKey || e.ctrlKey ? A.ROTATE : this.paintMode ? A.NONE : A.TRUCK;
    this.element.classList.add('dragging');
    window.addEventListener('pointerup', this.onMouseUpAnywhere);
  };

  private onMouseUpAnywhere = () => {
    this.element.classList.remove('dragging');
    window.removeEventListener('pointerup', this.onMouseUpAnywhere);
  };

  // Two-finger twist → azimuth rotation (camera-controls only handles drag for rotation).
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    // Chantier 20: the first finger of a gesture: no older finger can still be down (a lost
    // pointerup must not block the pan's glide or fake a twist).
    if (e.isPrimary) this.touches.clear();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.twistAngle = this.currentTwist();
    this.panning = this.touches.size === 1 && !this.paintMode;
  };

  /**
   * Where the pan has brought the target. Listeners on the canvas run before camera-controls
   * applies a move, so each sample is one move behind: the speed is the same.
   */
  private samplePan(): void {
    if (!this.panning) return;
    this.controls.getTarget(tmpTarget, true);
    this.glide.sample(performance.now(), tmpTarget.x, tmpTarget.z);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !this.touches.has(e.pointerId)) return;
    this.samplePan();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const angle = this.currentTwist();
    if (angle !== null && this.twistAngle !== null) {
      let delta = angle - this.twistAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      // Smoothed like the other gestures (camera-controls eases towards the end angle).
      if (Math.abs(delta) < 0.5) {
        void this.controls.rotate(delta, 0, true);
        this.twistTotal += delta;
        this.spin.sample(performance.now(), this.twistTotal, 0);
      }
    }
    this.twistAngle = angle;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.touches.has(e.pointerId)) return;
    this.samplePan();
    const twisting = this.touches.size === 2;
    this.touches.delete(e.pointerId);
    this.twistAngle = this.currentTwist();
    // Chantier 20: a twist let go while turning keeps spinning a little.
    if (twisting && e.type === 'pointerup') this.spin.release(performance.now(), SPIN_MAX_SPEED);
    if (twisting) this.twistTotal = 0;
    if (this.touches.size === 0 && this.panning && e.type === 'pointerup') {
      this.glide.release(performance.now(), this.controls.distance * GLIDE_MAX_SPEED);
    }
    this.panning = false;
  };

  private currentTwist(): number | null {
    if (this.touches.size !== 2) return null;
    const [a, b] = [...this.touches.values()] as [
      { x: number; y: number },
      { x: number; y: number },
    ];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  dispose(): void {
    this.controls.removeEventListener('rest', this.onRest);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    this.element.removeEventListener('pointerdown', this.onMouseDownCapture, { capture: true });
    window.removeEventListener('pointerup', this.onMouseUpAnywhere);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.stopGlide);
    this.controls.dispose();
  }
}
