import { describe, expect, it } from 'vitest';
import { PerfStats } from '../src/render/perfStats';

describe('PerfStats', () => {
  it('summarises the recent frames', () => {
    const p = new PerfStats();
    for (let i = 0; i < 99; i++) p.record(16, 4);
    p.record(100, 50);
    const s = p.summary();
    expect(s.worst).toBe(100);
    expect(s.hitches).toBe(1);
    expect(s.p95).toBe(16);
    expect(s.fps).toBeCloseTo((1000 * 100) / (99 * 16 + 100), 5);
    expect(s.cpu).toBeCloseTo((99 * 4 + 50) / 100, 5);
  });

  it('only keeps the last seconds', () => {
    const p = new PerfStats();
    for (let i = 0; i < 10; i++) p.record(1000, 0);
    for (let i = 0; i < 5; i++) p.record(20, 0);
    const s = p.summary();
    // 5 short frames + 3 one-second frames reach the 3 s span.
    expect(s.hitches).toBe(3);
    expect(s.worst).toBe(1000);
  });

  it('is empty before the first frame', () => {
    expect(new PerfStats().summary().fps).toBe(0);
  });
});
