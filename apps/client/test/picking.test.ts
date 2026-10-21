import { describe, expect, it } from 'vitest';
import { TapDetector } from '../src/render/picking';

interface PointerInit {
  id?: number;
  x?: number;
  y?: number;
  type?: 'mouse' | 'touch';
  primary?: boolean;
  buttons?: number;
}

function pointer(kind: string, init: PointerInit = {}): Event {
  const type = init.type ?? 'mouse';
  return Object.assign(new Event(kind, { bubbles: true }), {
    pointerId: init.id ?? 1,
    pointerType: type,
    isPrimary: init.primary ?? true,
    button: 0,
    buttons: init.buttons ?? (kind === 'pointerdown' ? 1 : 0),
    clientX: init.x ?? 100,
    clientY: init.y ?? 100,
  });
}

function setup() {
  const canvas = new EventTarget();
  const panel = new EventTarget();
  const win = new EventTarget();
  const doc = new EventTarget();
  const taps: [number, number, boolean][] = [];
  let doubles = 0;
  const detector = new TapDetector(
    canvas,
    {
      onTap: (x, y, touch) => taps.push([x, y, touch]),
      onDoubleTap: () => doubles++,
      onHover: () => {},
      onHoverEnd: () => {},
    },
    { window: win, document: doc },
  );
  /** Like a browser: the window's capture listeners see the event first, then the canvas. */
  const at = (target: EventTarget, kind: string, init?: PointerInit) => {
    const early = pointer(kind, init);
    Object.defineProperty(early, 'target', { value: target });
    win.dispatchEvent(early);
    if (target === canvas) canvas.dispatchEvent(pointer(kind, init));
  };
  const onCanvas = (kind: string, init?: PointerInit) => at(canvas, kind, init);
  const onPanel = (kind: string, init?: PointerInit) => at(panel, kind, init);
  return { canvas, win, doc, taps, detector, onCanvas, onPanel, doubles: () => doubles };
}

describe('TapDetector', () => {
  it('reports a press and release on the canvas as a tap', () => {
    const s = setup();
    s.onCanvas('pointerdown');
    s.onCanvas('pointerup');
    expect(s.taps).toEqual([[100, 100, false]]);
    expect(s.detector.activePointers).toBe(0);
  });

  it('still taps after a press released over a panel', () => {
    const s = setup();
    s.onCanvas('pointerdown', { type: 'touch' });
    s.onPanel('pointerup', { type: 'touch' });
    expect(s.taps).toHaveLength(0);
    expect(s.detector.activePointers).toBe(0);
    s.onCanvas('pointerdown', { type: 'touch', id: 2 });
    s.onCanvas('pointerup', { type: 'touch', id: 2 });
    expect(s.taps).toEqual([[100, 100, true]]);
  });

  it('recovers when a release is lost entirely', () => {
    const s = setup();
    s.onCanvas('pointerdown', { type: 'touch', id: 5 });
    // The system swallowed the pointerup: the next first finger starts a fresh gesture.
    s.onCanvas('pointerdown', { type: 'touch', id: 6 });
    s.onCanvas('pointerup', { type: 'touch', id: 6 });
    expect(s.taps).toHaveLength(1);
    // Same for a mouse.
    s.onCanvas('pointerdown', { id: 1 });
    s.onCanvas('pointerdown', { id: 1, x: 300 });
    s.onCanvas('pointerup', { id: 1, x: 300 });
    expect(s.taps).toHaveLength(2);
  });

  it('forgets held pointers when the page loses focus', () => {
    const s = setup();
    s.onCanvas('pointerdown', { type: 'touch', id: 1 });
    s.win.dispatchEvent(new Event('blur'));
    expect(s.detector.activePointers).toBe(0);
    s.onCanvas('pointerdown', { type: 'touch', id: 1 });
    s.doc.dispatchEvent(new Event('visibilitychange'));
    expect(s.detector.activePointers).toBe(0);
  });

  it('never taps during a two-finger gesture', () => {
    const s = setup();
    s.onCanvas('pointerdown', { type: 'touch', id: 1 });
    s.onCanvas('pointerdown', { type: 'touch', id: 2, primary: false });
    s.onCanvas('pointerup', { type: 'touch', id: 2 });
    s.onCanvas('pointerup', { type: 'touch', id: 1 });
    expect(s.taps).toHaveLength(0);
    expect(s.detector.activePointers).toBe(0);
  });

  it('ignores a drag and spots a double tap', () => {
    const s = setup();
    s.onCanvas('pointerdown');
    s.onCanvas('pointermove', { x: 160, buttons: 1 });
    s.onCanvas('pointerup', { x: 160 });
    expect(s.taps).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      s.onCanvas('pointerdown');
      s.onCanvas('pointerup');
    }
    expect(s.taps).toHaveLength(2);
    expect(s.doubles()).toBe(1);
  });

  it('lets go of everything on dispose', () => {
    const s = setup();
    s.detector.dispose();
    s.onCanvas('pointerdown');
    s.onCanvas('pointerup');
    expect(s.taps).toHaveLength(0);
  });
});
