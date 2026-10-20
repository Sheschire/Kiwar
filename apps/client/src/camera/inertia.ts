/** Glide after a one-finger pan: the finger's last velocity, fading out in about 0.6 s. */

/** Time constant of the fade (s): after 0.6 s about 12 % of the speed is left. */
export const GLIDE_TAU = 0.28;
/** Only the last moments of the drag give the release velocity (ms). */
const SAMPLE_MS = 100;
/** A finger resting longer than this before lifting does not throw the camera (ms). */
const HOLD_MS = 60;
const STOP_SPEED = 0.15;

interface Sample {
  t: number;
  x: number;
  z: number;
}

export class Glide {
  private samples: Sample[] = [];
  vx = 0;
  vz = 0;

  get active(): boolean {
    return this.vx !== 0 || this.vz !== 0;
  }

  /** Records where the camera target is during the drag (time in ms). */
  sample(t: number, x: number, z: number): void {
    const last = this.samples[this.samples.length - 1];
    // A resting finger adds nothing: the last move keeps its time (see HOLD_MS).
    if (last && Math.abs(last.x - x) < 1e-4 && Math.abs(last.z - z) < 1e-4) return;
    this.samples.push({ t, x, z });
    while (this.samples.length > 2 && this.samples[0]!.t < t - SAMPLE_MS) this.samples.shift();
  }

  /** The finger lifts: starts the glide when it was moving. Returns true if it glides. */
  release(t: number, maxSpeed: number): boolean {
    const samples = this.samples;
    this.samples = [];
    this.stop();
    const last = samples[samples.length - 1];
    if (!last || t - last.t > HOLD_MS) return false;
    let first = samples.find((s) => s.t >= last.t - SAMPLE_MS)!;
    // Sparse events (a busy frame): fall back on the previous move if it is recent enough.
    if (first === last && samples.length > 1) first = samples[samples.length - 2]!;
    if (last.t - first.t > SAMPLE_MS * 2.5) return false;
    const span = (last.t - first.t) / 1000;
    if (span < 0.016) return false;
    let vx = (last.x - first.x) / span;
    let vz = (last.z - first.z) / span;
    const speed = Math.hypot(vx, vz);
    if (speed < STOP_SPEED * 4) return false;
    if (speed > maxSpeed) {
      vx *= maxSpeed / speed;
      vz *= maxSpeed / speed;
    }
    this.vx = vx;
    this.vz = vz;
    return true;
  }

  /** Displacement for this frame (exact integral of the fading speed), or null once stopped. */
  step(dt: number): { dx: number; dz: number } | null {
    if (!this.active) return null;
    const decay = Math.exp(-dt / GLIDE_TAU);
    const k = GLIDE_TAU * (1 - decay);
    const d = { dx: this.vx * k, dz: this.vz * k };
    this.vx *= decay;
    this.vz *= decay;
    if (Math.hypot(this.vx, this.vz) < STOP_SPEED) this.stop();
    return d;
  }

  /** Slows down harder (e.g. against the edge of the colony). */
  brake(factor: number): void {
    this.vx *= factor;
    this.vz *= factor;
  }

  stop(): void {
    this.vx = 0;
    this.vz = 0;
  }

  reset(): void {
    this.samples = [];
    this.stop();
  }
}
