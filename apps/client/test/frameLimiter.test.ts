import { describe, expect, it } from 'vitest';
import {
  DEEP_IDLE_AFTER_MS,
  DEEP_IDLE_FPS,
  FrameLimiter,
  IDLE_AFTER_MS,
  IDLE_FPS,
  IdleWatch,
} from '../src/render/frameLimiter';

/** Frames drawn per second on a display of `hz`, with a ±`jitter` ms wobble. */
function drawnPerSecond(hz: number, fps: number, jitter = 0, seconds = 4): number {
  const limiter = new FrameLimiter();
  let drawn = 0;
  const frames = hz * seconds;
  for (let i = 0; i < frames; i++) {
    const wobble = jitter * Math.sin(i * 1.7);
    if (limiter.shouldDraw((i * 1000) / hz + wobble, fps)) drawn++;
  }
  return drawn / seconds;
}

describe('FrameLimiter', () => {
  it('keeps every frame of a 60 Hz display at a cap of 60, even with jitter', () => {
    expect(drawnPerSecond(60, 60)).toBe(60);
    expect(drawnPerSecond(60, 60, 1.5)).toBe(60);
  });

  it('draws an even 60 on 120 and 144 Hz displays', () => {
    expect(drawnPerSecond(120, 60)).toBe(60);
    expect(drawnPerSecond(144, 60)).toBeCloseTo(60, 0);
    expect(drawnPerSecond(144, 60, 1)).toBeCloseTo(60, 0);
  });

  it('halves a 60 Hz display at 30 and draws everything when unlimited', () => {
    expect(drawnPerSecond(60, 30)).toBe(30);
    expect(drawnPerSecond(60, 30, 1.5)).toBe(30);
    expect(drawnPerSecond(144, 0)).toBe(144);
    expect(drawnPerSecond(60, 20)).toBe(20);
  });

  it('does not burst to catch up after a stall', () => {
    const limiter = new FrameLimiter();
    expect(limiter.shouldDraw(0, 60)).toBe(true);
    expect(limiter.shouldDraw(500, 60)).toBe(true);
    expect(limiter.shouldDraw(500 + 1000 / 144, 60)).toBe(false);
  });

  it('draws the very next frame after a reset', () => {
    const limiter = new FrameLimiter();
    expect(limiter.shouldDraw(0, 20)).toBe(true);
    expect(limiter.shouldDraw(17, 20)).toBe(false);
    limiter.reset();
    expect(limiter.shouldDraw(17, 60)).toBe(true);
  });
});

describe('IdleWatch', () => {
  it('slows down after a quiet moment and wakes up at once', () => {
    const idle = new IdleWatch();
    idle.wake(1000);
    expect(idle.target(1000 + IDLE_AFTER_MS - 1, 60)).toBe(60);
    expect(idle.target(1000 + IDLE_AFTER_MS, 60)).toBe(IDLE_FPS);
    expect(idle.target(1000 + DEEP_IDLE_AFTER_MS, 60)).toBe(DEEP_IDLE_FPS);
    expect(idle.target(1000 + DEEP_IDLE_AFTER_MS, 0)).toBe(DEEP_IDLE_FPS);
    idle.wake(1000 + DEEP_IDLE_AFTER_MS);
    expect(idle.target(1000 + DEEP_IDLE_AFTER_MS, 60)).toBe(60);
  });

  it('never goes above the player cap', () => {
    const idle = new IdleWatch();
    expect(idle.target(IDLE_AFTER_MS, 30)).toBe(30);
    expect(idle.target(DEEP_IDLE_AFTER_MS, 30)).toBe(DEEP_IDLE_FPS);
    expect(idle.target(0, 0)).toBe(0);
  });
});
