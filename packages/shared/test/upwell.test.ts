import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  cloneState,
  DEPTHS,
  doorStrength,
  forecastWave,
  HOUR_MS,
  publicState,
  upwellAwaited,
  waveAhead,
  type GameState,
} from '../src';
import { delveColony, run } from './helpers';

function colony() {
  const { map, s } = delveColony('upwell', 1, 6, 12);
  // No surface wave in the way unless a test asks for one.
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  return { map, s };
}

/** An upwelling announced now, striking in an hour. */
function announced(s: GameState, ground: number, air: number): GameState {
  const out = cloneState(s);
  const tunnel = out.buildings.find((b) => b.type === 'tunnel')!;
  out.depths.next = {
    id: 'u1',
    announceAt: out.now - 1,
    at: out.now + HOUR_MS,
    announced: true,
    ground,
    air,
    tunnel: { q: tunnel.q, r: tunnel.r },
    squads: [
      { kind: 'larva', sector: 'front', count: Math.max(1, Math.round(ground * 0.7)) },
      { kind: 'fruitFly', sector: 'front', count: Math.max(1, Math.round(air / 0.9)) },
    ],
    gates: { front: { q: tunnel.q, r: tunnel.r } },
  };
  return out;
}

describe('upwellings (chantier 48)', () => {
  it('are planned once the tunnel stands, on their own calendar, apart from the surface waves', () => {
    const { s: s0 } = colony();
    const none = cloneState(s0);
    none.buildings = none.buildings.filter((b) => b.type !== 'tunnel');
    expect(advance(none, none.now + HOUR_MS).state.depths.next).toBeNull();
    const s = advance(s0, s0.now + 1000).state;
    const w = s.depths.next!;
    expect(w).not.toBeNull();
    expect(w.at - w.announceAt).toBe(DEPTHS.upwell.noticeMs);
    expect(w.at).toBeGreaterThanOrEqual(
      s0.buildings.find((b) => b.type === 'tunnel')!.builtAt + DEPTHS.upwell.firstMs,
    );
    // A surface wave planned close to it moves away.
    const both = cloneState(s0);
    both.threats.shieldUntil = 0;
    both.createdAt = both.now - 100 * HOUR_MS;
    const later = advance(both, both.now + 1000).state;
    if (later.threats.next && later.depths.next)
      expect(Math.abs(later.threats.next.at - later.depths.next.at)).toBeGreaterThanOrEqual(
        DEPTHS.upwell.gapMs,
      );
  });

  it('waits for the truth to be announced, then comes out of the tunnel', () => {
    const { s: s0 } = colony();
    let s = advance(s0, s0.now + 1000).state;
    const w = s.depths.next!;
    const seen = advance(publicState(s), w.announceAt + 1000).state;
    expect(seen.depths.next!.announced).toBe(false);
    expect(upwellAwaited(seen, w.announceAt + 1000)).toBe(true);
    s = advance(s, w.announceAt + 1000).state;
    const a = s.depths.next!;
    expect(a.announced).toBe(true);
    expect(a.tunnel).toBeDefined();
    expect(a.squads!.every((q) => ['larva', 'fruitFly', 'woodlouse'].includes(q.kind))).toBe(true);
    expect(waveAhead(s)?.wave.id).toBe(a.id);
    s = advance(s, a.at + 1000).state;
    const report = s.threats.reports.at(-1)!;
    expect(report.id).toBe(a.id);
    expect(report.from).toBe('tunnel');
    expect(report.log).toBeDefined();
    expect(s.depths.next === null || s.depths.next.id !== a.id).toBe(true);
    expect(s.depths.upwells).toBe(1);
  });

  it('is held back by a closed door up to its strength, else it breaks the door', () => {
    const { s: s0 } = colony();
    const strength = doorStrength(s0);
    expect(strength).toBe(DEPTHS.door[1]);
    const weak = announced(s0, strength * 0.4, strength * 0.1);
    weak.depths.door.closed = true;
    const f = forecastWave(weak)!;
    expect(f.odds).toBe('likely');
    const held = advance(weak, weak.depths.next!.at + 1).state;
    expect(held.threats.reports.at(-1)!.door).toBe('held');
    expect(held.buildings.find((b) => b.type === 'tunnel')!.damaged).toBeFalsy();
    const strong = announced(s0, strength * 2, strength * 0.5);
    strong.depths.door.closed = true;
    const broke = advance(strong, strong.depths.next!.at + 1).state;
    expect(broke.threats.reports.at(-1)!.door).toBe('broken');
    expect(broke.buildings.find((b) => b.type === 'tunnel')!.damaged).toBe(true);
  });

  it('closes and fortifies the door', () => {
    const { map, s: s0 } = colony();
    let s = run(s0, { type: 'setTunnelDoor', closed: true }, s0.now, map);
    expect(s.depths.door.closed).toBe(true);
    s = run(s, { type: 'fortifyTunnel' }, s.now, map);
    expect(s.depths.door.fortifying).toBeDefined();
    const again = applyCommand(s, { type: 'fortifyTunnel' }, { now: s.now, map });
    expect(again.ok ? null : again.error).toBe('fortifying');
    s = advance(s, s.depths.door.fortifying!.until + 1).state;
    expect(s.depths.door.fort).toBeGreaterThan(0);
    expect(doorStrength(s)).toBe(DEPTHS.door[1]! + DEPTHS.fortify.strength);
  });

  it('never moves the surface waves’ draws, and is exact offline', () => {
    const { s: s0 } = colony();
    const none = cloneState(s0);
    none.buildings = none.buildings.filter((b) => b.type !== 'tunnel');
    const end = s0.now + 80 * HOUR_MS;
    const a = advance(s0, end).state;
    const b = advance(none, end).state;
    expect(a.threats.rng).toEqual(b.threats.rng);
    let small = s0;
    for (let t = s0.now + 53 * 60_000; t < end; t += 53 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.depths).toEqual(a.depths);
    expect(small.threats.reports).toEqual(a.threats.reports);
    expect(small.villagers).toEqual(a.villagers);
  });
});
