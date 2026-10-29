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
  /** Pointers down (by id): released anywhere on the page, so none stays stuck down. */
  private readonly pointers = new Set<number>();

  constructor(
    private readonly element: HTMLElement,
    private readonly faceMap: () => FaceMap | null,
    private readonly handlers: PaintHandlers,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
  }

  private onDown = (e: PointerEvent) => {
    // A mouse has one pointer: a press always starts afresh (a release may have been missed).
    if (e.pointerType === 'mouse') this.pointers.clear();
    this.pointers.add(e.pointerId);
    if (!this.enabled) return;
    if (this.pointers.size > 1) {
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
    this.pointers.delete(e.pointerId);
    const s = this.stroke;
    if (!s || s.id !== e.pointerId) return;
    this.stroke = null;
    this.handlers.onPreview([], false);
    this.handlers.onStroke(s.tiles, s.erase);
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
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
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
  }
}
