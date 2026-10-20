import { describe, expect, it } from 'vitest';
import { advance, netRates as sharedNetRates, newGame } from '@kiwar/shared';
import { netRates, perGame } from '../src/ui/derived';

describe('perGame', () => {
  it('computes once per state object', () => {
    let calls = 0;
    const f = perGame((s) => ++calls + s.villagers.length);
    const a = newGame({ seed: 'derived', face: 'kiwisu', now: 0 });
    expect(f(a)).toBe(f(a));
    expect(calls).toBe(1);
    f(advance(a, 60_000).state);
    expect(calls).toBe(2);
  });

  it('matches the shared selector', () => {
    const s = advance(newGame({ seed: 'derived', face: 'kiwisu', now: 0 }), 600_000).state;
    expect(netRates(s)).toEqual(sharedNetRates(s));
  });
});
