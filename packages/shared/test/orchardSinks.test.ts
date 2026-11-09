import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  beautyOf,
  bromelainShield,
  calendarAt,
  CIDER_EVENING,
  CIDER_FUEL,
  cloneState,
  fruitOfState,
  GILD,
  goodOf,
  ITEMS,
  MORALE,
  NECTAR_SCALE,
  voyageForecast,
  type BuildingId,
  type GameState,
  type VillagerId,
} from '../src';
import { findTile, orchardColony, T0 } from './helpers';

/** The orchard colony with a Forge, stocked with every good of the orchard. */
function stocked() {
  const { map, s, crew } = orchardColony('sinks');
  const at = findTile(map, 'flesh', 14);
  s.buildings.push({
    id: 'bforge' as BuildingId,
    type: 'forge',
    q: at.q,
    r: at.r,
    level: 3,
    richness: 1,
    builtAt: T0,
    cramped: true,
  });
  s.research.done = [...s.research.done, 'forge'];
  s.nectar = 200 * NECTAR_SCALE;
  s.cider = 60 * NECTAR_SCALE;
  s.goldFiber = 60 * NECTAR_SCALE;
  return { map, s, crew };
}

function atNight(s: GameState, night: boolean): GameState {
  const c = calendarAt(s.calendarStart, s.now);
  const target = night
    ? c.night
      ? s.now
      : c.nightAt + 60_000
    : c.night
      ? c.dawnAt + 60_000
      : s.now;
  return advance(s, target).state;
}

describe('the orchard gear (chantier 55)', () => {
  it('forges nectar weapons and golden fibre armours, refunded on cancel', () => {
    const { map, s } = stocked();
    const blade = ITEMS['blade-nectar'];
    const r = applyCommand(s, { type: 'forgeItem', item: 'blade-nectar' }, { now: s.now, map });
    if (!r.ok) throw new Error(r.error);
    expect(goodOf(r.state, 'nectar')).toBe(200 - blade.nectar!);
    const mail = ITEMS['heavy-gold'];
    const r2 = applyCommand(
      r.state,
      { type: 'forgeItem', item: 'heavy-gold' },
      { now: s.now, map },
    );
    if (!r2.ok) throw new Error(r2.error);
    expect(goodOf(r2.state, 'goldFiber')).toBe(60 - mail.goldFiber!);
    const order = r2.state.forge.orders[1]!;
    const back = applyCommand(
      r2.state,
      { type: 'cancelForge', orderId: order.id },
      { now: s.now, map },
    );
    if (!back.ok) throw new Error(back.error);
    expect(goodOf(back.state, 'goldFiber')).toBe(60);
    const poor = cloneState(s);
    poor.goldFiber = 0;
    const r3 = applyCommand(poor, { type: 'forgeItem', item: 'light-gold' }, { now: s.now, map });
    expect(r3.ok ? null : r3.error).toBe('notEnoughGoldFiber');
  });

  it('keeps half the bromelain out with a golden fibre armour', () => {
    const { s, crew } = stocked();
    const v = s.villagers.find((x) => x.id === crew[0])!;
    const bare = bromelainShield(s, v);
    v.gear = { armor: 'heavy-gold' };
    expect(bromelainShield(s, v)).toBeCloseTo(bare * ITEMS['heavy-gold'].bromelain!);
  });
});

describe('cider (chantier 55)', () => {
  it('serves a cider evening at night, once a night: every kiwi at home remembers it', () => {
    const { map, s } = stocked();
    const day = atNight(s, false);
    const r0 = applyCommand(day, { type: 'serveCider' }, { now: day.now, map });
    expect(r0.ok ? null : r0.error).toBe('notNight');
    const night = atNight(s, true);
    const r = applyCommand(night, { type: 'serveCider' }, { now: night.now, map });
    if (!r.ok) throw new Error(r.error);
    expect(goodOf(r.state, 'cider')).toBe(60 - CIDER_EVENING.cider);
    const home = r.state.villagers.filter((v) => v.job.kind !== 'expedition');
    for (const v of home)
      expect(v.memories?.some((m) => m.kind === 'cider' && m.value === CIDER_EVENING.value)).toBe(
        true,
      );
    const again = applyCommand(r.state, { type: 'serveCider' }, { now: night.now, map });
    expect(again.ok ? null : again.error).toBe('ciderDone');
  });

  it('fuels the sailboat through the wormhole instead of stardust', () => {
    const { map, s, crew } = stocked();
    const plan = {
      launchpadId: 'bpad' as BuildingId,
      mission: 'visit' as const,
      stops: [fruitOfState(s, 'apple').parcels.find((g) => g.ring === 0)!.id],
      crew: crew.slice(0, 2) as VillagerId[],
      provisions: { pulp: 400, juice: 400 },
    };
    const plain = voyageForecast(s, plan)!;
    const fuelled = voyageForecast(s, { ...plan, fuelCider: true })!;
    expect(fuelled.travelMs).toBeLessThan(plain.travelMs);
    expect(fuelled.reliability).toBeGreaterThanOrEqual(plain.reliability);
    const dust = s.stardust;
    const r = applyCommand(s, { type: 'voyage', ...plan, fuelCider: true }, { now: s.now, map });
    if (!r.ok) throw new Error(r.error);
    expect(goodOf(r.state, 'cider')).toBe(60 - CIDER_FUEL.cider);
    expect(r.state.stardust).toBe(dust);
    const both = applyCommand(
      s,
      { type: 'voyage', ...plan, fuel: true, fuelCider: true },
      { now: s.now, map },
    );
    expect(both.ok ? null : both.error).toBe('invalidMission');
  });
});

describe('gilded decorations (chantier 55)', () => {
  it('adds beauty past the decorations’ cap, paid in nectar and golden fibre', () => {
    const { map, s } = stocked();
    // Enough flower beds to reach the decorations' cap.
    const nest = s.buildings[0]!;
    for (let i = 0; i < 8; i++)
      s.buildings.push({
        ...nest,
        id: `bflower${i}` as BuildingId,
        type: 'flowerBed',
        level: 1,
        q: nest.q + 5 + i,
        r: nest.r - 3,
      });
    expect(beautyOf(s)).toBe(MORALE.beauty);
    const r = applyCommand(
      s,
      { type: 'gildDecor', buildingId: 'bflower0' as BuildingId },
      { now: s.now, map },
    );
    if (!r.ok) throw new Error(r.error);
    expect(beautyOf(r.state)).toBe(MORALE.beauty + GILD.beauty);
    expect(goodOf(r.state, 'nectar')).toBe(200 - GILD.nectar);
    expect(goodOf(r.state, 'goldFiber')).toBe(60 - GILD.goldFiber);
    const twice = applyCommand(
      r.state,
      { type: 'gildDecor', buildingId: 'bflower0' as BuildingId },
      { now: s.now, map },
    );
    expect(twice.ok ? null : twice.error).toBe('alreadyGilded');
    const nestGild = applyCommand(
      r.state,
      { type: 'gildDecor', buildingId: nest.id },
      { now: s.now, map },
    );
    expect(nestGild.ok ? null : nestGild.error).toBe('notDecor');
    // The gilding has its own cap.
    let g = r.state;
    for (let i = 1; i < 8 && goodOf(g, 'goldFiber') >= GILD.goldFiber; i++) {
      const next = applyCommand(
        g,
        { type: 'gildDecor', buildingId: `bflower${i}` as BuildingId },
        { now: s.now, map },
      );
      if (!next.ok) break;
      g = next.state;
    }
    expect(beautyOf(g)).toBeLessThanOrEqual(MORALE.beauty + GILD.cap);
  });
});
