import { describe, expect, it } from 'vitest';
import { createRng } from '../src';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng('kiwi');
    const b = createRng('kiwi');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(createRng('kiwi').next()).not.toBe(createRng('kiwj').next());
  });

  it('can be restored from its state', () => {
    const a = createRng('save-me');
    a.next();
    const restored = createRng(a.state());
    for (let i = 0; i < 20; i++) expect(restored.next()).toBe(a.next());
  });

  it('produces values in range', () => {
    const r = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('forks into stable independent streams', () => {
    const x = createRng('root').fork('terrain').next();
    const y = createRng('root').fork('terrain').next();
    const z = createRng('root').fork('juice').next();
    expect(x).toBe(y);
    expect(x).not.toBe(z);
  });
});
