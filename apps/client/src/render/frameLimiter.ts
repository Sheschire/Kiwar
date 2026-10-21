/**
 * Chantier 23 (sobriety): the frame loop draws at most `cap` frames a second, and fewer while
 * nothing happens. A skipped animation frame still runs the game tick (`afterFrame`), so the
 * simulation keeps its pace; only the drawing (GPU work) is spared.
 */

/** Frames per second the player allows; 0 = as many as the display shows. */
export type FpsCap = 30 | 60 | 0;
export const FPS_CAPS: readonly FpsCap[] = [30, 60, 0];
export const DEFAULT_FPS_CAP: FpsCap = 60;

/** Without input or a visible event for this long, the loop slows down… */
export const IDLE_AFTER_MS = 3_000;
export const IDLE_FPS = 30;
/** …and further after this long (the player is probably looking elsewhere). */
export const DEEP_IDLE_AFTER_MS = 20_000;
export const DEEP_IDLE_FPS = 20;

/**
 * Decides, on each animation frame, whether to draw. The display timestamps jitter around the
 * refresh period: a slack of a quarter period (at most 4 ms) keeps a 60 Hz display at a cap of
 * 60 drawing every frame, and a 120 or 144 Hz one at an even 60.
 */
export class FrameLimiter {
  private next = -Infinity;

  /** `time` in ms (the rAF timestamp), `fps` the target (0 = every frame). */
  shouldDraw(time: number, fps: number): boolean {
    if (fps <= 0) {
      this.next = -Infinity;
      return true;
    }
    const period = 1000 / fps;
    const slack = Math.min(4, period / 4);
    if (time < this.next - slack) return false;
    // Steps of exactly one period keep the average on target; after a stall (or a change of
    // target) start again from now rather than drawing a burst to catch up.
    this.next += period;
    if (this.next <= time) this.next = time + period;
    return true;
  }

  reset(): void {
    this.next = -Infinity;
  }
}

/** Time since the last sign of life (input, camera motion, a show on screen). */
export class IdleWatch {
  private lastActive = 0;

  wake(now: number): void {
    this.lastActive = now;
  }

  idleFor(now: number): number {
    return Math.max(0, now - this.lastActive);
  }

  /** The frame rate to aim for now, given the player's cap. */
  target(now: number, cap: FpsCap): number {
    const idle = this.idleFor(now);
    const limit = cap === 0 ? Infinity : cap;
    if (idle >= DEEP_IDLE_AFTER_MS) return Math.min(limit, DEEP_IDLE_FPS);
    if (idle >= IDLE_AFTER_MS) return Math.min(limit, IDLE_FPS);
    return cap;
  }
}

const STORAGE_KEY = 'kiwar.fps';

const parseCap = (v: string | null): FpsCap | null =>
  v === '30' ? 30 : v === '60' ? 60 : v === '0' || v === 'max' ? 0 : null;

export function loadFpsCap(): FpsCap {
  const fromUrl = parseCap(new URLSearchParams(window.location.search).get('fps'));
  if (fromUrl !== null) return fromUrl;
  try {
    return parseCap(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_FPS_CAP;
  } catch {
    return DEFAULT_FPS_CAP;
  }
}

export function saveFpsCap(cap: FpsCap): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(cap));
  } catch {
    // ignore
  }
}
