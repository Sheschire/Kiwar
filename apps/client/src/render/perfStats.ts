/** Frame timing for the debug panel and the perf script: fps, slow frames, CPU cost. */
export interface FrameStats {
  fps: number;
  /** 95th percentile and worst frame interval over the window (ms). */
  p95: number;
  worst: number;
  /** Frames longer than 33 ms (visible hitches) in the window. */
  hitches: number;
  /** Average JS time spent in the frame callback (ms). */
  cpu: number;
  drawCalls: number;
  triangles: number;
  /** Drawing buffer size in device pixels and the pixel ratio used. */
  width: number;
  height: number;
  dpr: number;
}

const WINDOW = 240;
/** Only the frames of the last few seconds count (slow devices draw few frames). */
const SPAN_MS = 3000;

export class PerfStats {
  private readonly intervals = new Float32Array(WINDOW);
  private readonly cpu = new Float32Array(WINDOW);
  private count = 0;
  private index = 0;

  /** Records one frame: its interval since the previous one and its JS cost (ms). */
  record(intervalMs: number, cpuMs: number): void {
    this.intervals[this.index] = intervalMs;
    this.cpu[this.index] = cpuMs;
    this.index = (this.index + 1) % WINDOW;
    this.count = Math.min(WINDOW, this.count + 1);
  }

  summary(): Pick<FrameStats, 'fps' | 'p95' | 'worst' | 'hitches' | 'cpu'> {
    const recent: number[] = [];
    let total = 0;
    let cpu = 0;
    let hitches = 0;
    for (let k = 1; k <= this.count && total < SPAN_MS; k++) {
      const i = (this.index - k + WINDOW) % WINDOW;
      const interval = this.intervals[i]!;
      recent.push(interval);
      total += interval;
      cpu += this.cpu[i]!;
      if (interval > 33) hitches++;
    }
    const n = recent.length;
    if (n === 0) return { fps: 0, p95: 0, worst: 0, hitches: 0, cpu: 0 };
    const sorted = recent.sort((a, b) => a - b);
    return {
      fps: total > 0 ? (1000 * n) / total : 0,
      p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))]!,
      worst: sorted[n - 1]!,
      hitches,
      cpu: cpu / n,
    };
  }

  reset(): void {
    this.count = 0;
    this.index = 0;
  }
}
