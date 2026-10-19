import { describe, expect, it } from 'vitest';
import { advance, deserializeSave, HOUR_MS, serializeSave } from '../src';
import { findTile, run, setup, T0 } from './helpers';

describe('save', () => {
  it('round-trips a game state', () => {
    const { map, state } = setup();
    const flesh = findTile(map, 'flesh');
    const s = run(
      state,
      { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      T0,
      map,
    );
    const loaded = deserializeSave(serializeSave(s, T0 + 10));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.state).toEqual(s);
      expect(loaded.save.savedAt).toBe(T0 + 10);
    }
  });

  it('applies offline progress after loading', () => {
    const { map, state } = setup();
    const flesh = findTile(map, 'flesh');
    const s = run(
      state,
      { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      T0,
      map,
    );
    const loaded = deserializeSave(serializeSave(s, T0));
    if (!loaded.ok) throw new Error('load failed');
    const later = advance(loaded.save.state, T0 + 10 * 60_000).state;
    expect(later.buildings.some((b) => b.type === 'pulpery')).toBe(true);
    expect(later.resources.pulp).toBeGreaterThan(s.resources.pulp);
    expect(later.now).toBe(T0 + 10 * 60_000);
    expect(HOUR_MS).toBe(3_600_000);
  });

  it('rejects garbage and future versions', () => {
    expect(deserializeSave(null)).toEqual({ ok: false, reason: 'empty' });
    expect(deserializeSave('{oops')).toEqual({ ok: false, reason: 'corrupt' });
    expect(
      deserializeSave(JSON.stringify({ format: 'kiwar-save', savedAt: 1, state: { foo: 1 } })),
    ).toMatchObject({ ok: false });
    const { state } = setup();
    const future = JSON.parse(serializeSave(state, T0));
    future.state.schemaVersion = 999;
    expect(deserializeSave(JSON.stringify(future))).toEqual({ ok: false, reason: 'tooNew' });
  });
});
