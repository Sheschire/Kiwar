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
/** Chantier 32: the highest tilt allowed, at the farthest zoom (just below the horizon). */
export const TOP_POLAR = 1.5;

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

/**
 * Chantier 32: how far the zoom-out has raised the camera at zoom `k` (0 up to the framing).
 * Added to the player's own tilt, so the lift never locks it: they can tilt freely at any zoom.
 */
export function liftOffset(k: number): number {
  return liftPolar(k) - DEFAULT_POLAR;
}

/** Chantier 32: the tilt range at zoom `k` (the top of it rises with the lift). */
export function polarRange(k: number): [number, number] {
  return [MIN_POLAR, Math.min(TOP_POLAR, MAX_POLAR + liftOffset(k))];
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
   * Chantier 32: the lift (`liftOffset`) already added to the tilt; NaN = take the current one
   * without moving (after a frame or a return home).
   */
  private lastOffset = Number.NaN;
  /** Chantier 24: a flight between planets (`flyTo`), stepped in `update`. */
  private flight: {
    t: number;
    duration: number;
    from: Vector3;
    via: Vector3;
    to: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    land: () => void;
    /** Chantier 41: the planet's centre, moved by `shift` while flying (the arrival's bounds). */
    anchor?: Vector3;
  } | null = null;

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
    if (this.flight) {
      // A new face while flying: the flight is over, home limits come back below.
      this.flight = null;
      this.away = false;
      this.controls.enabled = true;
      this.controls.minDistance = 11;
      this.controls.minPolarAngle = MIN_POLAR;
      this.controls.maxPolarAngle = MAX_POLAR;
    }
    const r = Math.max(extentX, extentZ);
    this.setBounds(new Box3(new Vector3(-extentX, -1, -extentZ), new Vector3(extentX, 3, extentZ)));
    const distance = this.fitDistance(r);
    this.frameDistance = distance;
    // Zooming out far enough shows the planets of the map of space (chantier 24).
    this.controls.maxDistance = distance * MAX_ZOOM;
    this.lastOffset = Number.NaN;
    const { position, target } = this.framing(r);
    void this.controls.setLookAt(
      position.x,
      position.y,
      position.z,
      target.x,
      target.y,
      target.z,
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
   * Chantier 24: flies to a far planet (the twin or a member's, seen from our side) along an
   * arc, then keeps the camera around it: its own bounds and zoom range until `returnHome`.
   */
  visit(center: Vector3, radius: number, focus?: { target: Vector3; distance: number }): void {
    this.away = true;
    const distance = this.fitDistance(radius) * 1.2;
    // Seen from our side of the sky, the way the planet leans towards us.
    const toward = new Vector3(-center.x, 0, -center.z).normalize();
    // Chantier 41: a parcel framed closer (a landing), a little more from the side.
    const polar = focus ? 0.85 : 0.7;
    const look = focus?.target ?? center;
    const d = focus?.distance ?? distance;
    const position = new Vector3(
      look.x + toward.x * Math.sin(polar) * d,
      look.y + Math.cos(polar) * d,
      look.z + toward.z * Math.sin(polar) * d,
    );
    const anchor = center.clone();
    this.flyTo(position, look.clone(), () => {
      const c = this.controls;
      // A landing is watched up close: the fighters are small at the twin's scale.
      c.minDistance = focus ? Math.min(3, d * 0.5) : Math.min(8, distance * 0.4);
      c.maxDistance = distance * 1.6;
      this.setBounds(
        new Box3(
          new Vector3(anchor.x - radius, anchor.y - 4, anchor.z - radius),
          new Vector3(anchor.x + radius, anchor.y + 6, anchor.z + radius),
        ),
      );
    });
    this.flight!.anchor = anchor;
  }

  /**
   * Chantier 41: the visited planet moved by `delta` (the twin coming closer): the camera, its
   * flight and its bounds move with it, so the view stays on the same spot.
   */
  shift(delta: Vector3): void {
    if (delta.lengthSq() === 0) return;
    const f = this.flight;
    if (f) {
      f.to.add(delta);
      f.toTarget.add(delta);
      f.via.addScaledVector(delta, 0.5);
      f.anchor?.add(delta);
      return;
    }
    const c = this.controls;
    if (this.bounds) this.setBounds(this.bounds.clone().translate(delta));
    const p = c.getPosition(tmpEnd).add(delta);
    const t = c.getTarget(tmpTarget).add(delta);
    void c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
  }

  /** Back from a visit: the colony's bounds, and the view the player left (or the framing). */
  returnHome(
    extentX: number,
    extentZ: number,
    view: { position: Vector3; target: Vector3 } | null,
  ): void {
    const home = view ?? this.framing(Math.max(extentX, extentZ));
    this.flyTo(home.position.clone(), home.target.clone(), () => {
      this.away = false;
      this.lastOffset = Number.NaN;
      const c = this.controls;
      c.minDistance = 11;
      c.maxDistance = this.frameDistance * MAX_ZOOM;
      this.setBounds(
        new Box3(new Vector3(-extentX, -1, -extentZ), new Vector3(extentX, 3, extentZ)),
      );
    });
  }

  /** The framing view of a disc of radius `r` (`frame`), from the player's favourite side. */
  private framing(r: number): { position: Vector3; target: Vector3 } {
    const distance = this.fitDistance(r);
    const polar = DEFAULT_POLAR;
    const azimuth = this.azimuth;
    return {
      position: new Vector3(
        Math.sin(azimuth) * Math.sin(polar) * distance,
        Math.cos(polar) * distance,
        Math.cos(azimuth) * Math.sin(polar) * distance,
      ),
      target: new Vector3(0, 0.4, 0),
    };
  }

  /**
   * Chantier 24: an eased flight along an arc (rising halfway by a quarter of the way), the
   * target sliding from one planet to the other. The player's gestures and every limit are
   * off until `land` sets those of the arrival.
   */
  private flyTo(position: Vector3, target: Vector3, land: () => void): void {
    this.stopGlide();
    const c = this.controls;
    // Lift every limit: the flight starts far outside the arrival's bounds and zoom range.
    this.setBounds(undefined);
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.enabled = false;
    const from = c.getPosition(new Vector3());
    const fromTarget = c.getTarget(new Vector3());
    const via = from.clone().add(position).multiplyScalar(0.5);
    via.y += from.distanceTo(position) * 0.25;
    const length = from.distanceTo(via) + via.distanceTo(position);
    this.flight = {
      t: 0,
      // 1.4 s for a short hop, up to 2 s across the map.
      duration: Math.min(2, 1.4 + length / 600),
      from,
      via,
      to: position,
      fromTarget,
      toTarget: target,
      land,
    };
  }

  private stepFlight(dt: number): void {
    const f = this.flight!;
    f.t = Math.min(1, f.t + dt / f.duration);
    const e = f.t * f.t * (3 - 2 * f.t);
    const u = 1 - e;
    // Quadratic Bézier through `via`.
    tmpEnd
      .copy(f.from)
      .multiplyScalar(u * u)
      .addScaledVector(f.via, 2 * u * e)
      .addScaledVector(f.to, e * e);
    tmpTarget.lerpVectors(f.fromTarget, f.toTarget, e);
    void this.controls.setLookAt(
      tmpEnd.x,
      tmpEnd.y,
      tmpEnd.z,
      tmpTarget.x,
      tmpTarget.y,
      tmpTarget.z,
      false,
    );
    if (f.t < 1) return;
    this.flight = null;
    const c = this.controls;
    c.minPolarAngle = MIN_POLAR;
    c.maxPolarAngle = MAX_POLAR;
    c.enabled = true;
    f.land();
  }

  /**
   * Chantier 32: turns to look towards a far point of the map of space (a comet) from the
   * colony, zoomed far out: the lift raises the view to the horizon, where it flies.
   */
  lookToward(x: number, z: number): void {
    if (this.away || this.flight) return;
    this.stopGlide();
    const c = this.controls;
    // The camera stands on the other side of the target (camera-controls: sin a, cos a).
    const want = Math.atan2(-x, -z);
    const now = c.azimuthAngle;
    const turn = Math.atan2(Math.sin(want - now), Math.cos(want - now));
    void c.rotateAzimuthTo(now + turn, true);
    void c.moveTo(0, 0.4, 0, true);
    // Ends at the space view's tilt, whatever the player's: the lift adds the rest as the
    // zoom goes out (`updateLift`).
    const from = c.getSpherical(tmpSpherical, true).radius / this.frameDistance;
    const to = (c.maxDistance * 0.95) / this.frameDistance;
    void c.rotatePolarTo(SPACE_POLAR + 0.04 - (liftOffset(to) - liftOffset(from)), true);
    void c.dollyTo(c.maxDistance * 0.95, true);
  }

  /** A camera flight between planets is under way. */
  get flying(): boolean {
    return this.flight !== null;
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
    if (this.flight) {
      this.stepFlight(dt);
      return this.controls.update(dt) || true;
    }
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
   * in lowers it again. Chantier 32: the lift is only a change added to the tilt while the zoom
   * changes, never a floor — the player tilts freely at any zoom (the old floor left them
   * 0.04 rad of play far out). Read on the end values, so the tilt eases along with the zoom.
   */
  private updateLift(): void {
    const c = this.controls;
    const end = c.getSpherical(tmpSpherical, true);
    const k = end.radius / this.frameDistance;
    const [min, max] = polarRange(k);
    c.minPolarAngle = min;
    c.maxPolarAngle = max;
    const offset = liftOffset(k);
    const delta = offset - this.lastOffset;
    this.lastOffset = offset;
    if (!(Math.abs(delta) > 1e-4)) return;
    const want = Math.min(max, Math.max(min, end.phi + delta));
    if (Math.abs(want - end.phi) > 1e-4) void c.rotatePolarTo(want, true);
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
