import { describe, expect, it } from 'vitest';
import { migrateState, publicState, queenTruth, SIEGE, type GameState } from '../src';
import { setup } from './helpers';

describe('the queen of the twin face (chantier 19, reshaped by chantier 42)', () => {
  it('is drawn from the secret seed only', () => {
    const { state } = setup('kiwisu', 'siege');
    const s: GameState = state;
    const g = s.aliens![s.targets[0]!.id]!;
    const a = queenTruth(g);
    expect(queenTruth({ seed: g.seed })).toEqual(a);
    expect(queenTruth({ seed: `${g.seed}x` })).not.toEqual(a);
    expect(a.sector).toBeGreaterThanOrEqual(0);
    expect(a.sector).toBeLessThan(6);
    expect(a.power.ground).toBeGreaterThanOrEqual(SIEGE.queen.ground * SIEGE.queen.spread[0] - 0.1);
    // Nothing of it is in the state a client receives.
    expect(JSON.stringify(publicState(s))).not.toContain(g.seed);
  });
});

describe('saves', () => {
  it('migrates v34 saves: the old siege is gone, a conquest is kept', () => {
    const { state } = setup('kiwisu', 'mig');
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    old.schemaVersion = 34;
    old.siege = {
      bridgeheads: [],
      counter: null,
      counters: 2,
      lastCounterAt: 5,
      reports: [],
      conqueredAt: 1234,
    };
    old.intel = {
      t: {
        at: 0,
        source: 'recon',
        defense: { min: 1, max: 2 },
        ferrets: { min: 1, max: 1 },
        bats: { min: 0, max: 1 },
        victoriesAt: 0,
        sectors: [1],
        structures: [],
        siege: { seen: [1], holds: {} },
      },
    };
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.siege).toEqual({ conqueredAt: 1234 });
    expect(m.state.intel.t).not.toHaveProperty('siege');
  });
});
