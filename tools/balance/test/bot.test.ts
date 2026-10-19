import { describe, expect, it } from 'vitest';
import { runBot } from '../src/bot';
import { compare } from '../src/report';

describe('balance bot', () => {
  it('plays deterministically and reaches the early milestones', () => {
    const a = runBot({ seed: 'bot-test', face: 'kiwisu', horizonMs: 24 * 3_600_000 });
    const b = runBot({ seed: 'bot-test', face: 'kiwisu', horizonMs: 24 * 3_600_000 });
    expect(a).toEqual(b);
    expect(a.times.tutorial).not.toBeNull();
    expect(a.times.nest2).not.toBeNull();
  });

  it('flags gaps above the threshold', () => {
    const fake = (face: 'kiwisu' | 'kiwino', t: number) => ({
      seed: 's',
      face,
      times: { tutorial: t, pop10: t, nest2: t, nest3: t, allLevel3: t },
      final: { population: 0, buildings: 0, produced: 0 },
    });
    const [first] = compare([fake('kiwisu', 100), fake('kiwino', 130)], 10);
    expect(first!.flagged).toBe(true);
    const [second] = compare([fake('kiwisu', 100), fake('kiwino', 105)], 10);
    expect(second!.flagged).toBe(false);
  });
});
