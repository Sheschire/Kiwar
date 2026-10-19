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

  it('a player who comes twice a day crosses the first winter without losing a kiwi', () => {
    // Attentive for the first day, then two visits a day until the spring after the winter.
    const r = runBot({
      seed: 'bot-winter',
      face: 'kiwino',
      horizonMs: 100 * 3_600_000,
      fullHorizon: true,
      activeMs: 24 * 3_600_000,
      sessionEveryMs: 12 * 3_600_000,
    });
    expect(r.final.starved).toBe(0);
    expect(r.final.population).toBeGreaterThanOrEqual(10);
  }, 180_000);

  it('flags gaps above the threshold', () => {
    const fake = (face: 'kiwisu' | 'kiwino', t: number) => ({
      seed: 's',
      face,
      times: {
        tutorial: t,
        pop10: t,
        nest2: t,
        nest3: t,
        allLevel3: t,
        kiwi5: t,
        kiwi10: t,
        mayor: t,
      },
      final: { population: 0, buildings: 0, produced: 0 },
    });
    const [first] = compare([fake('kiwisu', 100), fake('kiwino', 130)], 10);
    expect(first!.flagged).toBe(true);
    const [second] = compare([fake('kiwisu', 100), fake('kiwino', 105)], 10);
    expect(second!.flagged).toBe(false);
  });
});
