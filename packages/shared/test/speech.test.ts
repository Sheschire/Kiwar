import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildLock,
  cloneState,
  GARRISON,
  HOUR_MS,
  KIWI,
  kiwiMorale,
  buildingHarvest,
  CALENDAR,
  isNight,
  SKILLS,
  SPEECH,
  speechCooldownMs,
  speechEffectMs,
  speechLock,
  speechValue,
  type Command,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0, siteFor } from './helpers';

/** A colony with a staffed pulpery, a mayor and (optionally) a Town Hall of this level. */
function colony(hallLevel = 1, mayor = true) {
  const { map, state } = setup();
  let s = rich(state);
  const flesh = findTile(map, 'flesh');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = advance(s, T0 + 2 * HOUR_MS).state;
  const t = cloneState(s);
  if (hallLevel > 0)
    t.buildings.push({
      ...t.buildings[0]!,
      id: 'bh' as never,
      type: 'townHall',
      level: hallLevel,
      q: 99,
      r: 99,
    });
  if (mayor) {
    const v = t.villagers.find((x) => x.job.kind !== 'work') ?? t.villagers.at(-1)!;
    v.classId = 'mayor';
    v.stats.charisma = 8;
  }
  t.resources = { pulp: 0, fiber: 0, seeds: 0, juice: 0 };
  // No wave meanwhile.
  t.threats.next = null;
  t.threats.shieldUntil = t.now + 1000 * HOUR_MS;
  return { map, s: t };
}

const SPEAK: Command = { type: 'giveSpeech' };

function errorOf(s: GameState, map: ReturnType<typeof setup>['map']) {
  const r = applyCommand(s, SPEAK, { now: s.now, map });
  return r.ok ? null : r.error;
}

describe('the Town Hall (chantier 43)', () => {
  it('is built once, from the Nest 3, outside the building cap', () => {
    const { map, state } = setup();
    const s = rich(state);
    expect(buildLock(s, 'townHall')).toBe('nestLevelTooLow');
    const t = cloneState(s);
    t.buildings.find((b) => b.type === 'nest')!.level = 3;
    expect(buildLock(t, 'townHall')).toBeNull();
    const built = run(
      t,
      {
        type: 'build',
        buildingType: 'townHall',
        ...siteFor(t, map, 'townHall', findTile(map, 'flesh', 2)),
      },
      t.now,
      map,
    );
    expect(buildLock(built, 'townHall')).toBe('townHallExists');
  });
});

describe('the Speech (chantier 43)', () => {
  it('needs a Town Hall, a mayor, a rest between two, and no wave close', () => {
    expect(errorOf(colony(0).s, colony(0).map)).toBe('noTownHall');
    const lone = colony(1, false);
    expect(errorOf(lone.s, lone.map)).toBe('noMayor');
    const { map, s } = colony();
    expect(speechLock(s)).toBeNull();
    const after = run(s, SPEAK, s.now, map);
    expect(errorOf(after, map)).toBe('speechCooling');
    const wave = cloneState(s);
    wave.threats.next = {
      id: 'wx',
      announceAt: s.now - 1,
      at: s.now + SPEECH.gatherMs + GARRISON.autoLeadMs,
      announced: true,
      ground: 10,
      air: 0,
    };
    expect(errorOf(wave, map)).toBe('waveSoon');
    wave.threats.next.at += 60_000;
    expect(errorOf(wave, map)).toBeNull();
  });

  it('stops the work while everyone gathers, then lifts every kiwi for hours', () => {
    const { map, s } = colony();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const demand = (x: GameState) => buildingHarvest(x, pulpery)!.demand;
    const before = demand(s);
    expect(before).toBeGreaterThan(0);
    const mood = new Map(s.villagers.map((v) => [v.id, kiwiMorale(s, v).total]));
    const speaking = run(s, SPEAK, s.now, map);
    expect(demand(speaking)).toBe(0);
    const until = s.now + SPEECH.gatherMs;
    expect(speaking.speech).toEqual({ until, readyAt: s.now + speechCooldownMs(1) });
    const value = SPEECH.value + SPEECH.perCharisma * (8 - KIWI.stat.average);
    const { state: later, events } = advance(speaking, until);
    expect(events.some((e) => e.type === 'speechOver' && e.at === until)).toBe(true);
    for (const v of later.villagers) {
      expect(v.memories).toEqual([{ kind: 'speech', value, until: until + speechEffectMs(1) }]);
      expect(kiwiMorale(later, v).total).toBeGreaterThan(mood.get(v.id)!);
    }
    expect(demand(later)).toBeGreaterThan(before);
    const faded = advance(later, until + speechEffectMs(1)).state;
    expect(faded.villagers.every((v) => !v.memories)).toBe(true);
  });

  it('lasts longer and comes back sooner at a higher Town Hall; Festival doubles it', () => {
    expect(speechEffectMs(1)).toBe(8 * HOUR_MS);
    expect(speechEffectMs(12)).toBe(12 * HOUR_MS);
    expect(speechCooldownMs(1)).toBe(24 * HOUR_MS);
    expect(speechCooldownMs(7)).toBe(18 * HOUR_MS);
    expect(speechCooldownMs(12)).toBe(12 * HOUR_MS);
    const { s } = colony();
    const mayor = s.villagers.find((v) => v.classId === 'mayor')!;
    const plain = speechValue(mayor);
    const party = speechValue({ ...mayor, level: 20 });
    expect(party).toBe(plain * SKILLS.festivalMultiplier);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s } = colony();
    const speaking = run(s, SPEAK, s.now, map);
    const end = s.now + 10 * HOUR_MS;
    const big = advance(speaking, end).state;
    let small = speaking;
    for (let at = speaking.now + 7 * 60_000; at < end; at += 7 * 60_000)
      small = advance(small, at).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.resources.pulp).toBeCloseTo(big.resources.pulp, 6);
    expect(small.speech).toEqual(big.speech);
  });

  it('pays off when given at nightfall: more harvested over the day than without', () => {
    const { map, s } = colony();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    // Right after nightfall (work is slow at night: the gathering costs little).
    const night = cloneState(s);
    night.calendarStart = s.now - (CALENDAR.dayMs - CALENDAR.nightMs.spring + 60_000);
    expect(isNight(night)).toBe(true);
    /** Pulp the pulpery could harvest over 12 h, minute by minute. */
    const harvested = (start: GameState) => {
      let x = start;
      let sum = 0;
      for (let m = 0; m < 12 * 60; m++) {
        sum += buildingHarvest(x, pulpery)!.demand / 60;
        x = advance(x, x.now + 60_000).state;
      }
      return sum;
    };
    const quiet = harvested(night);
    const spoken = harvested(run(night, SPEAK, night.now, map));
    expect(spoken).toBeGreaterThan(quiet);
  });
});
