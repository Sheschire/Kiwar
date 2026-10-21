import { Raycaster, Vector2, type Camera, type InstancedMesh, type Object3D } from 'three';

const TAP_MAX_MOVE_MOUSE = 6;
const TAP_MAX_MOVE_TOUCH = 14;
const TAP_MAX_MS = 450;
/** Two taps this close in time and space make a double tap (the first one still selects). */
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_MAX_MOVE = 30;

export interface TapHandlers {
  /** `touch`: the tap came from a finger or a pen, not a mouse. */
  onTap(x: number, y: number, touch: boolean): void;
  /** Second tap of a double tap (after its own `onTap`). */
  onDoubleTap?(x: number, y: number): void;
  onHover(x: number, y: number): void;
  onHoverEnd(): void;
}

/** Where the detector also listens: releases outside the canvas, focus and visibility. */
export interface TapEnvironment {
  window: EventTarget;
  document: EventTarget;
}

function browserEnvironment(): TapEnvironment | null {
  return typeof window === 'undefined' ? null : { window, document };
}

/**
 * Distinguishes taps / left clicks from drags (which belong to the camera) and reports
 * hover positions for mice.
 *
 * Pointers are tracked by id, and released wherever the release happens (a finger lifted over
 * a panel, a mouse let go outside the window, a gesture swallowed by the system): a pointer
 * the canvas never saw go up must not turn every later tap into a "multi-touch gesture".
 */
export class TapDetector {
  private down: { id: number; x: number; y: number; t: number; touch: boolean } | null = null;
  private readonly pressed = new Set<number>();
  private lastTap: { x: number; y: number; t: number } | null = null;
  private readonly env: TapEnvironment | null;

  constructor(
    private readonly element: EventTarget,
    private readonly handlers: TapHandlers,
    env: TapEnvironment | null = browserEnvironment(),
  ) {
    this.env = env;
    element.addEventListener('pointerdown', this.onDown as EventListener);
    element.addEventListener('pointermove', this.onMove as EventListener);
    element.addEventListener('pointerup', this.onUp as EventListener);
    element.addEventListener('pointercancel', this.onCancel as EventListener);
    element.addEventListener('lostpointercapture', this.onCancel as EventListener);
    element.addEventListener('pointerleave', this.onLeave as EventListener);
    // Capture phase: a panel stopping the event's propagation must not hide the release.
    env?.window.addEventListener('pointerup', this.onReleaseElsewhere as EventListener, true);
    env?.window.addEventListener('pointercancel', this.onReleaseElsewhere as EventListener, true);
    env?.window.addEventListener('blur', this.reset);
    env?.document.addEventListener('visibilitychange', this.reset);
  }

  /** Pointers currently held down on the canvas (exposed for tests). */
  get activePointers(): number {
    return this.pressed.size;
  }

  private onDown = (e: PointerEvent) => {
    // A mouse press or the first finger of a new gesture: nothing else can still be down.
    if (e.pointerType === 'mouse' || e.isPrimary) this.pressed.clear();
    this.pressed.add(e.pointerId);
    if (this.pressed.size > 1) {
      this.down = null; // multi-touch gesture: never a tap
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.down = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      touch: e.pointerType !== 'mouse',
    };
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.buttons === 0) this.handlers.onHover(e.clientX, e.clientY);
    if (this.down && this.down.id === e.pointerId) {
      const max = this.down.touch ? TAP_MAX_MOVE_TOUCH : TAP_MAX_MOVE_MOUSE;
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > max) this.down = null;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.pressed.delete(e.pointerId);
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    const now = performance.now();
    if (now - d.t > TAP_MAX_MS) return;
    this.handlers.onTap(e.clientX, e.clientY, d.touch);
    const last = this.lastTap;
    if (
      last &&
      now - last.t < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_MAX_MOVE
    ) {
      this.lastTap = null;
      this.handlers.onDoubleTap?.(e.clientX, e.clientY);
    } else this.lastTap = { x: e.clientX, y: e.clientY, t: now };
  };

  /** The pointer is over without a tap: cancelled, or its capture was lost. */
  private onCancel = (e: PointerEvent) => {
    this.pressed.delete(e.pointerId);
    if (this.down?.id === e.pointerId) this.down = null;
  };

  /** A release seen by the window; those on the canvas itself are left to `onUp`. */
  private onReleaseElsewhere = (e: PointerEvent) => {
    if (e.target !== this.element) this.onCancel(e);
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.handlers.onHoverEnd();
    // Leaving the canvas ends any tap; a finger leaves only when it is lifted.
    this.pressed.delete(e.pointerId);
    if (this.down?.id === e.pointerId) this.down = null;
  };

  /** Focus or page lost: whatever was held down will never report its release here. */
  private reset = () => {
    this.pressed.clear();
    this.down = null;
  };

  dispose(): void {
    const el = this.element;
    el.removeEventListener('pointerdown', this.onDown as EventListener);
    el.removeEventListener('pointermove', this.onMove as EventListener);
    el.removeEventListener('pointerup', this.onUp as EventListener);
    el.removeEventListener('pointercancel', this.onCancel as EventListener);
    el.removeEventListener('lostpointercapture', this.onCancel as EventListener);
    el.removeEventListener('pointerleave', this.onLeave as EventListener);
    const win = this.env?.window;
    win?.removeEventListener('pointerup', this.onReleaseElsewhere as EventListener, true);
    win?.removeEventListener('pointercancel', this.onReleaseElsewhere as EventListener, true);
    this.env?.window.removeEventListener('blur', this.reset);
    this.env?.document.removeEventListener('visibilitychange', this.reset);
  }
}

const raycaster = new Raycaster();
const ndc = new Vector2();

/** The camera ray through a screen point (shared raycaster: use it right away). */
export function screenRay(
  element: HTMLElement,
  camera: Camera,
  clientX: number,
  clientY: number,
): Raycaster {
  const rect = element.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

export type PickResult =
  { kind: 'tile'; instanceId: number } | { kind: 'object'; q: number; r: number };

/**
 * Finds what is under the given client coordinates: a terrain tile (instance id) or an object
 * carrying `userData.q/r` (building, construction site) — whichever is closest.
 */
function shown(o: Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export function pick(
  element: HTMLElement,
  camera: Camera,
  terrain: InstancedMesh,
  objects: Object3D[],
  clientX: number,
  clientY: number,
): PickResult | null {
  const rect = element.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([terrain, ...objects], true);
  for (const hit of hits) {
    if (hit.object === terrain && hit.instanceId !== undefined) {
      return { kind: 'tile', instanceId: hit.instanceId };
    }
    // Hidden objects (level badges out of zoom) are not tappable.
    if (!shown(hit.object)) continue;
    let o: Object3D | null = hit.object;
    while (o) {
      if (typeof o.userData.q === 'number')
        return { kind: 'object', q: o.userData.q, r: o.userData.r };
      o = o.parent;
    }
  }
  return null;
}
