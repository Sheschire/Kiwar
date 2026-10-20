import { describe, expect, it } from 'vitest';
import {
  advance,
  netRates as sharedNetRates,
  newGame,
  productionRates as sharedProductionRates,
  type GameState,
} from '@kiwar/shared';
import { runBot } from '../../../tools/balance/src/bot';
import { netRates, perGame, productionRates } from '../src/ui/derived';

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

  it('matches the shared rates on a lived-in colony (cached harvests)', () => {
    const states: GameState[] = [];
    let step = 0;
    runBot({
      seed: 'derived',
      face: 'kiwisu',
      biome: 'classic',
      horizonMs: 12 * 3_600_000,
      fullHorizon: true,
      onStep: (state) => {
        if (step++ % 40 === 0) states.push(state);
      },
    });
    expect(states.length).toBeGreaterThan(3);
    for (const s of states) {
      expect(productionRates(s)).toEqual(sharedProductionRates(s));
      expect(netRates(s)).toEqual(sharedNetRates(s));
    }
  }, 30_000);
});
