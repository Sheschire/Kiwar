import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildLock,
  CABARET,
  calendarAt,
  cloneState,
  colonyMood,
  HOUR_MS,
  kiwiMorale,
  nestDef,
  type GameState,
} from '../src';
import { rich, setup } from './helpers';

/** A colony with the cabaret next to its Nest (everyone sleeps in the Nest). */
function withCabaret() {
  const { map, state } = setup();
  const s = cloneState(rich(state));
  const nest = s.buildings.find((b) => b.type === 'nest')!;
  s.buildings.push({
    ...nest,
    id: 'bcab' as never,
    type: 'cabaret',
    level: 1,
    q: nest.q,
    r: nest.r + 3,
  });
  s.threats.next = null;
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  return { map, s };
}

function nightfall(s: GameState): number {
  const c = calendarAt(s.calendarStart, s.now);
  return c.night ? calendarAt(s.calendarStart, c.dawnAt).nightAt : c.nightAt;
}

const cabaretMemory = (s: GameState) =>
  s.villagers.filter((v) => v.memories?.some((m) => m.kind === 'cabaret' && m.until > s.now))
    .length;

describe('the cabaret (chantier 44)', () => {
  it('opens in the Iron age, one per colony, outside the building cap', () => {
    const { state } = setup();
    const s = cloneState(rich(state));
    expect(buildLock(s, 'cabaret')).not.toBeNull();
    s.buildings.find((b) => b.type === 'nest')!.level = 7;
    s.buildings.push({
      ...s.buildings[0]!,
      id: 'bm' as never,
      type: 'monument',
      level: 2,
      q: 0,
      r: 5,
    });
    expect(buildLock(s, 'cabaret')).toBeNull();
    const cap = nestDef(s).maxBuildings!;
    for (let i = 0; i < cap; i++)
      s.buildings.push({ ...s.buildings[0]!, id: `bx${i}` as never, type: 'hut', level: 1 });
    expect(buildLock(s, 'cabaret')).toBeNull();
    s.buildings.push({ ...s.buildings[0]!, id: 'bc' as never, type: 'cabaret', level: 1 });
    expect(buildLock(s, 'cabaret')).toBe('cabaretExists');
  });

  it('takes its juice at nightfall and gives its guests an evening of morale', () => {
    const { s } = withCabaret();
    const at = nightfall(s);
    const before = advance(s, at - 1000).state;
    const juice = before.resources.juice;
    const { state: after, events } = advance(before, at + 1000);
    expect(events.some((e) => e.type === 'cabaret')).toBe(true);
    expect(after.resources.juice).toBeLessThan(juice - CABARET.juice + 5);
    expect(cabaretMemory(after)).toBe(after.villagers.length);
    const v = after.villagers[0]!;
    const plain = { ...v, memories: v.memories?.filter((m) => m.kind !== 'cabaret') };
    expect(kiwiMorale(after, v).total - kiwiMorale(after, plain).total).toBeGreaterThan(0);
    // Until the next nightfall.
    const later = advance(after, calendarAt(after.calendarStart, at).dawnAt + 1000).state;
    expect(cabaretMemory(later)).toBe(after.villagers.length);
    expect(colonyMood(later).sum).toBe(colonyMood(after).sum);
  });

  it('stays shut without juice, or when the player closes it', () => {
    const { map, s } = withCabaret();
    const at = nightfall(s);
    const dry = advance(s, at - 1000).state;
    dry.resources.juice = 0;
    const r = advance(dry, at + 1000);
    expect(r.events.some((e) => e.type === 'cabaretShut')).toBe(true);
    expect(cabaretMemory(r.state)).toBe(0);
    const res = applyCommand(s, { type: 'setCabaret', open: false }, { now: s.now, map });
    expect(res.ok).toBe(true);
    const shut = advance(res.ok ? res.state : s, at + 1000).state;
    expect(cabaretMemory(shut)).toBe(0);
  });

  it('gives the same evening in one big step or many small ones', () => {
    const { s } = withCabaret();
    const end = nightfall(s) + 3 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now; t < end; t += 7 * 60_000)
      small = advance(small, Math.min(end, t + 7 * 60_000)).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.resources.juice).toBeCloseTo(big.resources.juice, 3);
  });
});
