import { Raycaster, Vector2, type Camera, type InstancedMesh } from 'three';

const TAP_MAX_MOVE_MOUSE = 6;
const TAP_MAX_MOVE_TOUCH = 14;
const TAP_MAX_MS = 450;

export interface TapHandlers {
  onTap(x: number, y: number): void;
  onHover(x: number, y: number): void;
  onHoverEnd(): void;
}

/**
 * Distinguishes taps / left clicks from drags (which belong to the camera) and reports
 * hover positions for mice.
 */
export class TapDetector {
  private down: { id: number; x: number; y: number; t: number; touch: boolean } | null = null;
  private activePointers = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: TapHandlers,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onCancel);
    element.addEventListener('pointerleave', this.onLeave);
  }

  private onDown = (e: PointerEvent) => {
    this.activePointers++;
    if (this.activePointers > 1) {
      this.down = null; // multi-touch gesture: never a tap
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse' };
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.buttons === 0) this.handlers.onHover(e.clientX, e.clientY);
    if (this.down && this.down.id === e.pointerId) {
      const max = this.down.touch ? TAP_MAX_MOVE_TOUCH : TAP_MAX_MOVE_MOUSE;
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > max) this.down = null;
    }
  };

  private onUp = (e: PointerEvent) => {
    this.activePointers = Math.max(0, this.activePointers - 1);
    const d = this.down;
    this.down = null;
    if (!d || d.id !== e.pointerId) return;
    if (performance.now() - d.t > TAP_MAX_MS) return;
    this.handlers.onTap(e.clientX, e.clientY);
  };

  private onCancel = () => {
    this.activePointers = Math.max(0, this.activePointers - 1);
    this.down = null;
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') this.handlers.onHoverEnd();
  };

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onCancel);
    this.element.removeEventListener('pointerleave', this.onLeave);
  }
}

const raycaster = new Raycaster();
const ndc = new Vector2();

/** Returns the instance id of the instanced mesh under the given client coordinates. */
export function pickInstance(
  element: HTMLElement,
  camera: Camera,
  mesh: InstancedMesh,
  clientX: number,
  clientY: number,
): number | null {
  const rect = element.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(mesh, false);
  const hit = hits[0];
  return hit?.instanceId ?? null;
}
