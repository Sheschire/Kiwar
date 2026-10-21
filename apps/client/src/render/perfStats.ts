/** Frame timing for the debug panel and the perf script: fps, slow frames, CPU cost. */
export interface FrameStats {
  fps: number;
  /** Median, 95th percentile and worst frame interval over the window (ms). */
  median: number;
  p95: number;
  worst: number;
  /**
   * Skipped beats in the window: frames lasting more than 1.5 × the median interval (the
   * display's own rhythm, so a 144 Hz screen counts a 14 ms frame).
   */
  hitches: number;
  /** GPU time per frame (ms), when the browser exposes timer queries; otherwise null. */
  gpuMs: number | null;
  /** Average JS time spent in the frame callback (ms). */
  cpu: number;
  drawCalls: number;
  triangles: number;
  /** Drawing buffer size in device pixels and the pixel ratio used. */
  width: number;
  height: number;
  dpr: number;
  /** Chantier 23: the frame rate aimed at now (0 = no cap), slowed down while idle. */
  targetFps: number;
  idle: boolean;
  /** Share of the display's frames actually drawn (the others only run the tick). */
  drawnShare: number;
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

  summary(): Pick<FrameStats, 'fps' | 'median' | 'p95' | 'worst' | 'hitches' | 'cpu'> {
    const recent: number[] = [];
    let total = 0;
    let cpu = 0;
    for (let k = 1; k <= this.count && total < SPAN_MS; k++) {
      const i = (this.index - k + WINDOW) % WINDOW;
      const interval = this.intervals[i]!;
      recent.push(interval);
      total += interval;
      cpu += this.cpu[i]!;
    }
    const n = recent.length;
    if (n === 0) return { fps: 0, median: 0, p95: 0, worst: 0, hitches: 0, cpu: 0 };
    const sorted = recent.sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)]!;
    let hitches = 0;
    for (const interval of sorted) if (interval > median * 1.5) hitches++;
    return {
      fps: total > 0 ? (1000 * n) / total : 0,
      median,
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
