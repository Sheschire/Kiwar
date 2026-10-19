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

CameraControls.install({
  THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster },
});

const A = CameraControls.ACTION;
const ROTATE_STEP = Math.PI / 4;
const KEY_SPEED = 0.9; // fraction of the camera distance per second
const FOCUS_DISTANCE = 26;

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
    c.minPolarAngle = 0.32;
    c.maxPolarAngle = 1.12;
    c.boundaryFriction = 0.15;

    element.addEventListener('contextmenu', this.onContextMenu);
    element.addEventListener('pointerdown', this.onMouseDownCapture, { capture: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Frames the whole disc of the given half extents. */
  frame(extentX: number, extentZ: number, enableTransition = false): void {
    const r = Math.max(extentX, extentZ);
    this.controls.setBoundary(
      new Box3(new Vector3(-extentX, -1, -extentZ), new Vector3(extentX, 3, extentZ)),
    );
    const distance = this.fitDistance(r);
    this.controls.maxDistance = distance * 1.35;
    const polar = 0.78;
    void this.controls.setLookAt(
      0,
      Math.cos(polar) * distance,
      Math.sin(polar) * distance,
      0,
      0.4,
      0,
      enableTransition,
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
    void this.controls.moveTo(x, y, z, true);
    if (this.controls.distance > FOCUS_DISTANCE + 4)
      void this.controls.dollyTo(FOCUS_DISTANCE, true);
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
    return this.controls.update(dt);
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
    this.controls.mouseButtons.right = A.ROTATE;
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  /**
   * Runs before camera-controls (capture phase): Alt/Option or Ctrl + left drag orbits, for
   * trackpads without a right button (Ctrl+click is the macOS right click). Also shows a
   * "grabbing" cursor while dragging.
   */
  private onMouseDownCapture = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    this.controls.mouseButtons.left = e.altKey || e.ctrlKey ? A.ROTATE : A.TRUCK;
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
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.twistAngle = this.currentTwist();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const angle = this.currentTwist();
    if (angle !== null && this.twistAngle !== null) {
      let delta = angle - this.twistAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) < 0.5) void this.controls.rotate(delta, 0, false);
    }
    this.twistAngle = angle;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    this.twistAngle = this.currentTwist();
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
    this.controls.dispose();
  }
}
