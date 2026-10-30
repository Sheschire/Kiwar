/**
 * Chantier 49: "tilt beyond the edge". While the player tilts the camera and it already rests
 * at the end of its range, the drag keeps going: once it has pushed `threshold` pixels past
 * the edge, the gesture is understood (open the cut of the depths, or close it). Moving back
 * eats the push away; letting go forgets it.
 */
export class TiltPast {
  private pushed = 0;
  private fired = false;

  constructor(readonly threshold = 90) {}

  /**
   * One move of the drag: `push` pixels towards the edge (negative: away from it), `atEdge`
   * the camera rests at the end of its range. True once, when the gesture is complete.
   */
  feed(push: number, atEdge: boolean): boolean {
    if (this.fired) return false;
    if (!atEdge) {
      this.pushed = 0;
      return false;
    }
    this.pushed = Math.max(0, this.pushed + push);
    if (this.pushed < this.threshold) return false;
    this.fired = true;
    return true;
  }

  /** The finger or the button let go. */
  reset(): void {
    this.pushed = 0;
    this.fired = false;
  }

  /** Share of the gesture done (a hint may grow with it). */
  get progress(): number {
    return Math.min(1, this.pushed / this.threshold);
  }
}
