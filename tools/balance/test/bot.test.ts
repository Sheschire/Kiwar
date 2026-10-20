import { describe, expect, it } from 'vitest';
import { MILESTONES, runBot, type Milestone } from '../src/bot';
import { compare } from '../src/report';

describe('balance bot', () => {
  it('plays deterministically and reaches the early milestones', () => {
    const a = runBot({ seed: 'bot-test', face: 'kiwisu', horizonMs: 24 * 3_600_000 });
    const b = runBot({ seed: 'bot-test', face: 'kiwisu', horizonMs: 24 * 3_600_000 });
    expect(a).toEqual(b);
    expect(a.times.tutorial).not.toBeNull();
    expect(a.times.nest2).not.toBeNull();
  });

  it('a player who comes twice a day crosses the first (harsh) winter without losing a kiwi', () => {
    // Attentive for the first day, then two visits a day until the spring after the winter.
    // The tundra has the harshest winter and the slowest regrowth.
    const r = runBot({
      seed: 'bot-winter',
      face: 'kiwino',
      biome: 'tundra',
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
      biome: 'classic' as const,
      times: Object.fromEntries(MILESTONES.map((m) => [m, t])) as Record<Milestone, number>,
      final: { population: 0, buildings: 0, produced: 0 },
    });
    const group = (id: string, t: number) => ({ id, label: id, runs: [fake('kiwisu', t)] });
    const [first] = compare([group('a', 100), group('b', 100), group('c', 130)], 10);
    expect(first!.flagged).toBe(true);
    expect(first!.gaps.c).toBeCloseTo(30, 6);
    const [second] = compare([group('a', 100), group('b', 95), group('c', 105)], 10);
    expect(second!.flagged).toBe(false);
  });
});
