/**
 * GPU time of the frames, from WebGL2 timer queries (EXT_disjoint_timer_query_webgl2). Many
 * browsers hide the extension (Safari, Firefox): `average` then stays null. Results arrive a few
 * frames late; one query at a time is enough for an average.
 */
export class GpuTimer {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private query: WebGLQuery | null = null;
  private running = false;
  private total = 0;
  private count = 0;
  /** Average GPU ms of the frames measured since the last `take`. */
  average: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext | WebGLRenderingContext) {
    const isGl2 =
      typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.ext = isGl2 ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  }

  /** Call before drawing the frame. */
  begin(): void {
    const gl = this.gl as WebGL2RenderingContext;
    if (!this.ext) return;
    if (this.query) {
      // The previous measure is not back yet: skip this frame.
      if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) {
        this.total += (gl.getQueryParameter(this.query, gl.QUERY_RESULT) as number) / 1e6;
        this.count++;
      }
    } else {
      this.query = gl.createQuery();
      if (!this.query) return;
    }
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    this.running = true;
  }

  /** Call after drawing the frame. */
  end(): void {
    if (!this.ext || !this.running) return;
    (this.gl as WebGL2RenderingContext).endQuery(this.ext.TIME_ELAPSED_EXT);
    this.running = false;
  }

  /** Average since the last call (null when nothing was measured). */
  take(): number | null {
    if (this.count > 0) this.average = this.total / this.count;
    else if (!this.ext) this.average = null;
    this.total = 0;
    this.count = 0;
    return this.average;
  }
}
