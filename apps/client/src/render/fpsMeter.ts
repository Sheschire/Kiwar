/** Rolling frames-per-second measurement. */
export class FpsMeter {
  private frames = 0;
  private acc = 0;
  fps = 60;
  /** Average fps over the last few windows (used for adaptive quality). */
  slowAverage = 60;
  private samples: number[] = [];

  tick(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.samples.push(this.fps);
      if (this.samples.length > 8) this.samples.shift();
      this.slowAverage = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      this.frames = 0;
      this.acc = 0;
    }
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
    this.frames = 0;
    this.acc = 0;
  }
}
