import { getTile, hexKey, hexLine, type FaceMap, type Tile } from '@kiwar/shared';

export interface PaintHandlers {
  pickTile(x: number, y: number): Tile | null;
  /** Whether the stroke starting on this tile erases (it already has a path). */
  isPath(tile: Tile): boolean;
  onPreview(tiles: Tile[], erase: boolean): void;
  onStroke(tiles: Tile[], erase: boolean): void;
}

/**
 * Path painting: while enabled, a one-finger / left-button drag over the tiles paints a stroke
 * (gaps between sampled tiles are filled with hex lines). A second finger cancels the stroke so
 * that pinch-zoom keeps working.
 */
export class PathPainter {
  enabled = false;
  private stroke: { id: number; tiles: Tile[]; keys: Set<string>; erase: boolean } | null = null;
  private pointers = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly faceMap: () => FaceMap | null,
    private readonly handlers: PaintHandlers,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onCancel);
  }

  private onDown = (e: PointerEvent) => {
    this.pointers++;
    if (!this.enabled) return;
    if (this.pointers > 1) {
      this.cancel();
      return;
    }
    if (e.pointerType === 'mouse' && (e.button !== 0 || e.altKey || e.ctrlKey)) return;
    const tile = this.handlers.pickTile(e.clientX, e.clientY);
    if (!tile) return;
    this.stroke = {
      id: e.pointerId,
      tiles: [tile],
      keys: new Set([hexKey(tile)]),
      erase: this.handlers.isPath(tile),
    };
    this.handlers.onPreview(this.stroke.tiles, this.stroke.erase);
  };

  private onMove = (e: PointerEvent) => {
    const s = this.stroke;
    const map = this.faceMap();
    if (!s || s.id !== e.pointerId || !map) return;
    const tile = this.handlers.pickTile(e.clientX, e.clientY);
    const last = s.tiles[s.tiles.length - 1]!;
    if (!tile || (tile.q === last.q && tile.r === last.r)) return;
    for (const h of hexLine(last, tile)) {
      const key = hexKey(h);
      if (s.keys.has(key)) continue;
      const t = getTile(map, h);
      if (!t) continue;
      s.keys.add(key);
      s.tiles.push(t);
    }
    this.handlers.onPreview(s.tiles, s.erase);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers = Math.max(0, this.pointers - 1);
    const s = this.stroke;
    if (!s || s.id !== e.pointerId) return;
    this.stroke = null;
    this.handlers.onPreview([], false);
    this.handlers.onStroke(s.tiles, s.erase);
  };

  private onCancel = () => {
    this.pointers = Math.max(0, this.pointers - 1);
    this.cancel();
  };

  cancel(): void {
    if (!this.stroke) return;
    this.stroke = null;
    this.handlers.onPreview([], false);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onCancel);
  }
}
