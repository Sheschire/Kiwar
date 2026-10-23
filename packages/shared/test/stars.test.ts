import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  COMETS,
  CYCLES,
  meteorStock,
  nightWork,
  STARDUST_SCALE,
  stardustOf,
  TECHS,
  THREATS,
  levelDef,
  upgradeLock,
  type BuildingId,
  type GameState,
  type TechId,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const HOUR = 3_600_000;

/** A Stone-age colony with a level-2 Library (a fake monument stands for the age). */
function starColony(dust: number) {
  const { map, state } = setup('kiwisu', 'stars');
  let s: GameState = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + HOUR).state;
  const site = findTile(map, 'flesh', 3);
  s = run(s, { type: 'build', buildingType: 'library', q: site.q, r: site.r }, s.now, map);
  s = advance(s, s.now + HOUR).state;
  s = rich(s);
  const library = s.buildings.find((b) => b.type === 'library')!;
  s = run(s, { type: 'upgrade', buildingId: library.id }, s.now, map);
  s = advance(s, s.now + 2 * HOUR).state;
  const m = findTile(map, 'flesh', 6);
  s = structuredClone(s) as GameState;
  s.buildings.push({
    id: 'bm' as BuildingId,
    type: 'monument',
    q: m.q,
    r: m.r,
    level: 1,
    richness: m.richness,
    builtAt: s.now,
  });
  s.stardust = dust * STARDUST_SCALE;
  return { map, s };
}

const withTech = (s: GameState, id: TechId): GameState => ({
  ...s,
  research: { ...s.research, done: [...s.research.done, id] },
});

describe('star technologies', () => {
  it('cost stardust when chosen, refunded when abandoned', () => {
    const { map, s } = starColony(10);
    const dust = TECHS.clearNights.stardust!;
    const chosen = run(s, { type: 'setResearch', tech: 'clearNights' }, s.now, map);
    expect(stardustOf(chosen)).toBe(10 - dust);
    // Choosing it again costs nothing; another star tech swaps the payment.
    const again = run(chosen, { type: 'setResearch', tech: 'clearNights' }, s.now, map);
    expect(stardustOf(again)).toBe(10 - dust);
    const other = run(chosen, { type: 'setResearch', tech: 'starWatch' }, s.now, map);
    expect(stardustOf(other)).toBe(10 - TECHS.starWatch.stardust!);
    const stopped = run(other, { type: 'setResearch', tech: null }, s.now, map);
    expect(stardustOf(stopped)).toBe(10);
    const poor = applyCommand(
      { ...s, stardust: 0 },
      { type: 'setResearch', tech: 'clearNights' },
      { now: s.now, map },
    );
    expect(!poor.ok && poor.error).toBe('notEnoughStardust');
    // The Iron-age star techs wait for the Iron age.
    const early = applyCommand(s, { type: 'setResearch', tech: 'cometLure' }, { now: s.now, map });
    expect(!early.ok && early.error).toBe('techAgeLocked');
  });

  it('change night work, wave notice, comets and meteorites', () => {
    const { s } = starColony(0);
    expect(nightWork(withTech(s, 'clearNights'))).toBeCloseTo(
      Math.min(1, CYCLES.nightWork * 1.15),
      9,
    );
    expect(meteorStock(withTech(s, 'starIron'), s.now)).toBe(
      Math.round(meteorStock(s, s.now) * 1.3),
    );
    // Waves: announced 2 hours earlier than the plain draw.
    const unplanned: GameState = { ...s, threats: { ...s.threats, next: null } };
    const plain = advance(unplanned, s.now + 1).state.threats.next!;
    const watched = advance(withTech(unplanned, 'starWatch'), s.now + 1).state.threats.next!;
    expect(watched.at - watched.announceAt).toBe(plain.at - plain.announceAt + 2 * HOUR);
    expect(watched.at - watched.announceAt).toBeLessThanOrEqual(THREATS.noticeMs[1] + 2 * HOUR);
    // Comets: the gap after a passage is 20 % shorter.
    const after = (st: GameState) => {
      const x = advance(st, T0 + COMETS.firstMs).state;
      return x.comets.next!.at - x.comets.lastAt;
    };
    const lured = after(withTech(s, 'cometLure'));
    expect(lured).toBeGreaterThanOrEqual(COMETS.intervalMs[0] * 0.8 - 1);
    expect(lured).toBeLessThanOrEqual(COMETS.intervalMs[1] * 0.8 + 1);
  });
});

describe('stardust for the ages', () => {
  it('the Iron age monument needs stardust, given back on cancel', () => {
    const { map, s: base } = starColony(0);
    const s = structuredClone(base) as GameState;
    s.buildings[0]!.level = 6;
    s.research.done.push('stoneAge', 'ironAge');
    s.queue = [];
    const monument = s.buildings.find((b) => b.type === 'monument')!;
    const dust = levelDef('monument', 2)!.stardust!;
    expect(upgradeLock(rich(s), monument)).toBe('notEnoughStardust');
    const rs: GameState = { ...rich(s), stardust: dust * STARDUST_SCALE };
    expect(upgradeLock(rs, monument)).toBeNull();
    const up = run(rs, { type: 'upgrade', buildingId: monument.id }, rs.now, map);
    expect(up.stardust).toBe(0);
    const item = up.queue.find((i) => i.buildingId === monument.id)!;
    const back = run(up, { type: 'cancel', queueItemId: item.id }, up.now, map);
    expect(stardustOf(back)).toBe(dust);
    // The Stone age stays free of stardust.
    expect(levelDef('monument', 1)!.stardust ?? 0).toBe(0);
  });
});
