import { describe, expect, it } from 'vitest';
import { Glide, GLIDE_TAU } from '../src/camera/inertia';
import { FRONT_AZIMUTH, frontScreenAngle } from '../src/render/front';
import { TapDetector } from '../src/render/picking';

describe('Glide', () => {
  const flick = (g: Glide, speed: number) => {
    for (let t = 0; t <= 100; t += 16) g.sample(t, (speed * t) / 1000, 0);
  };

  it('keeps the finger speed and fades out in about 0.6 s', () => {
    const g = new Glide();
    flick(g, 20);
    expect(g.release(110, 1000)).toBe(true);
    expect(g.vx).toBeCloseTo(20, 5);
    let travelled = 0;
    for (let i = 0; i < 36; i++) travelled += g.step(1 / 60)?.dx ?? 0;
    // The whole glide covers speed × tau; after 0.6 s little is left.
    expect(travelled).toBeGreaterThan(20 * GLIDE_TAU * 0.85);
    expect(travelled).toBeLessThan(20 * GLIDE_TAU);
    expect(Math.abs(g.vx)).toBeLessThan(20 * 0.15);
  });

  it('does not throw the camera when the finger rested before lifting', () => {
    const g = new Glide();
    flick(g, 20);
    expect(g.release(400, 1000)).toBe(false);
    expect(g.active).toBe(false);
  });

  it('caps the speed and stops', () => {
    const g = new Glide();
    flick(g, 500);
    g.release(100, 50);
    expect(Math.hypot(g.vx, g.vz)).toBeCloseTo(50, 5);
    for (let i = 0; i < 600 && g.active; i++) g.step(1 / 60);
    expect(g.active).toBe(false);
  });
});

describe('frontScreenAngle', () => {
  it('points up when the camera looks towards the front', () => {
    expect(frontScreenAngle(FRONT_AZIMUTH - Math.PI)).toBeCloseTo(0, 6);
    expect(Math.abs(frontScreenAngle(FRONT_AZIMUTH))).toBeCloseTo(Math.PI, 6);
  });

  it('turns with the camera', () => {
    const a = frontScreenAngle(FRONT_AZIMUTH - Math.PI + 0.3);
    expect(Math.abs(a)).toBeCloseTo(0.3, 6);
  });
});

describe('TapDetector double tap', () => {
  const pointer = (type: string, x: number, y: number) =>
    Object.assign(new Event(type), {
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
    });

  it('selects on each tap and reports the second one as a double tap', () => {
    const target = new EventTarget() as unknown as HTMLElement;
    const taps: string[] = [];
    new TapDetector(target, {
      onTap: () => taps.push('tap'),
      onDoubleTap: () => taps.push('double'),
      onHover: () => {},
      onHoverEnd: () => {},
    });
    const tap = (x: number) => {
      target.dispatchEvent(pointer('pointerdown', x, 100));
      target.dispatchEvent(pointer('pointerup', x, 100));
    };
    tap(100);
    tap(110);
    tap(400);
    expect(taps).toEqual(['tap', 'tap', 'double', 'tap']);
  });
});
