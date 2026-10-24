import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildLock,
  calendarAt,
  cloneState,
  FIREWORKS,
  HOUR_MS,
  kiwiMorale,
  STARDUST_SCALE,
  type FireworksPattern,
  type GameState,
} from '../src';
import { rich, setup } from './helpers';

/** A colony with its fireworks cannon, at night (or by day), stocked with stardust. */
function withCannon(night: boolean) {
  const { map, state } = setup();
  let s = cloneState(rich(state));
  const nest = s.buildings.find((b) => b.type === 'nest')!;
  s.buildings.push({
    ...nest,
    id: 'bfw' as never,
    type: 'fireworks',
    level: 1,
    q: nest.q,
    r: nest.r + 2,
  });
  s.threats.next = null;
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  s.stardust = 20 * STARDUST_SCALE;
  const c = calendarAt(s.calendarStart, s.now);
  const target = night
    ? c.night
      ? s.now
      : c.nightAt + 60_000
    : c.night
      ? c.dawnAt + 60_000
      : s.now;
  s = advance(s, target).state;
  s.resources = { pulp: 1000, fiber: 1000, seeds: 1000, juice: 1000 };
  s.stardust = 20 * STARDUST_SCALE;
  return { map, s };
}

const fire = (s: GameState, map: ReturnType<typeof setup>['map'], pattern: FireworksPattern) =>
  applyCommand(s, { type: 'fireFireworks', pattern }, { now: s.now, map });

describe('the fireworks (chantier 44)', () => {
  it('is one per colony, outside the building cap', () => {
    const { s } = withCannon(true);
    s.buildings.find((b) => b.type === 'nest')!.level = 7;
    s.buildings.push({
      ...s.buildings[0]!,
      id: 'bm' as never,
      type: 'monument',
      level: 2,
      q: 0,
      r: 5,
    });
    expect(buildLock(s, 'fireworks')).toBe('fireworksExists');
    s.buildings = s.buildings.filter((b) => b.type !== 'fireworks');
    expect(buildLock(s, 'fireworks')).toBeNull();
  });

  it('fires only at night, once a night, and lifts every kiwi at home', () => {
    const day = withCannon(false);
    const r0 = fire(day.s, day.map, 'bouquet');
    expect(r0.ok ? null : r0.error).toBe('notNight');
    const { map, s } = withCannon(true);
    const r = fire(s, map, 'kiwiBird');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.state;
    const def = FIREWORKS.kiwiBird;
    expect(after.resources.seeds).toBeLessThan(1000 - def.cost.seeds + 1);
    expect(after.stardust).toBe((20 - def.stardust) * STARDUST_SCALE);
    expect(after.village.lastShow?.pattern).toBe('kiwiBird');
    for (const v of after.villagers) {
      const m = v.memories?.find((x) => x.kind === 'fireworks');
      expect(m?.value).toBe(def.value);
      const plain = { ...v, memories: v.memories?.filter((x) => x.kind !== 'fireworks') };
      expect(kiwiMorale(after, v).total).toBeGreaterThan(kiwiMorale(after, plain).total);
    }
    const again = fire(after, map, 'bouquet');
    expect(again.ok ? null : again.error).toBe('fireworksDone');
    // The next night, again.
    const c = calendarAt(after.calendarStart, after.now);
    const next = advance(after, calendarAt(after.calendarStart, c.dawnAt).nightAt + 60_000).state;
    next.resources = { pulp: 1000, fiber: 1000, seeds: 1000, juice: 1000 };
    expect(fire(next, map, 'bouquet').ok).toBe(true);
  });

  it('needs its stardust for the big patterns', () => {
    const { map, s } = withCannon(true);
    s.stardust = 2 * STARDUST_SCALE;
    const r = fire(s, map, 'kiwiFruit');
    expect(r.ok ? null : r.error).toBe('notEnoughStardust');
    expect(fire(s, map, 'bouquet').ok).toBe(true);
  });

  it('fades after its time', () => {
    const { map, s } = withCannon(true);
    const r = fire(s, map, 'bouquet');
    if (!r.ok) throw new Error(r.error);
    const later = advance(r.state, r.state.now + FIREWORKS.bouquet.ms + 1000).state;
    expect(later.villagers.some((v) => v.memories?.some((m) => m.kind === 'fireworks'))).toBe(
      false,
    );
  });
});
