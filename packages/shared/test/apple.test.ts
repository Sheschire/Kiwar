import { describe, expect, it } from 'vitest';
import {
  advance,
  APPLE,
  APPLE_STAGES,
  appleCalendar,
  appleOf,
  appleStage,
  applyCommand,
  cloneState,
  fruitOfId,
  fruitOfState,
  goodOf,
  LANDING,
  parcelInReach,
  parcelNow,
  publicState,
  tradeRate,
  voyageForecast,
  type BuildingId,
  type GameState,
  type Parcel,
  type VillagerId,
  type VoyagePlan,
} from '../src';
import { orchardColony, T0 } from './helpers';

const HOUR_MS = 3_600_000;

function applePlan(
  s: GameState,
  crew: VillagerId[],
  stops: string[],
  over: Partial<VoyagePlan> = {},
): VoyagePlan {
  return {
    launchpadId: 'bpad' as BuildingId,
    mission: 'visit',
    stops,
    crew: crew.slice(0, 2),
    provisions: { pulp: 400, juice: 400 },
    ...over,
  };
}

/** The first time at or after `from` the apple is at this stage (and still for an hour). */
function timeAt(seed: string, stage: string, from: number): number {
  for (const r of appleCalendar(seed, from, 6)) if (r.stage === stage) return r.since + HOUR_MS;
  throw new Error('no such stage');
}

describe('the apple (chantier 55)', () => {
  it('draws the same galleries from the same seed, in three layers linked to the skin', () => {
    const a = appleOf('u1/orchard');
    expect(appleOf('u1/orchard')).toBe(a);
    expect(appleOf('u2/orchard')).not.toEqual(a);
    expect(a.parcels.length).toBeGreaterThanOrEqual(APPLE.galleries[0]);
    expect(a.parcels.length).toBeLessThanOrEqual(APPLE.galleries[1]);
    for (const ring of [0, 1, 2]) expect(a.parcels.some((g) => g.ring === ring)).toBe(true);
    for (const g of a.parcels) {
      expect(fruitOfId(g.id)).toBe('apple');
      expect(fruitOfId(g.clan)).toBe('apple');
      for (const l of g.links) expect(a.byId.get(l)!.links).toContain(g.id);
    }
    // Every gallery can be reached from the skin by its links.
    const seen = new Set(a.parcels.filter((g) => g.ring === 0).map((g) => g.id));
    const todo = [...seen];
    while (todo.length)
      for (const l of a.byId.get(todo.pop()!)!.links)
        if (!seen.has(l)) {
          todo.push(l);
          seen.add(l);
        }
    expect(seen.size).toBe(a.parcels.length);
    expect(a.clans.flatMap((c) => c.parcels).sort()).toEqual(a.parcels.map((g) => g.id).sort());
  });

  it('ripens on a public calendar: green, ripe, overripe, again', () => {
    const seed = 'u1/orchard';
    const cal = appleCalendar(seed, T0, 7);
    for (let i = 0; i < cal.length; i++) {
      const r = cal[i]!;
      expect(r.until - r.since).toBe(APPLE.stageMs[r.stage]);
      if (i > 0) expect(r.since).toBe(cal[i - 1]!.until);
      expect(appleStage(seed, r.since)).toEqual(r);
      expect(appleStage(seed, r.until - 1).stage).toBe(r.stage);
      const next = APPLE_STAGES[(APPLE_STAGES.indexOf(r.stage) + 1) % APPLE_STAGES.length];
      if (i + 1 < cal.length) expect(cal[i + 1]!.stage).toBe(next);
    }
    // Another universe's apple is on another day of its cycle.
    const others = ['a', 'b', 'c', 'd'].map((x) => appleStage(`${x}/orchard`, T0).since);
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('is rich and calm ripe, poor and angry overripe, with cider only then', () => {
    const { s } = orchardColony('apple');
    const seed = s.orchard.seed;
    const map = fruitOfState(s, 'apple');
    const g = map.parcels.find((x) => x.ring === 2)!;
    const power = (at: number) =>
      parcelNow(s, s.orchardSeed!, g, at).units.reduce((a, u) => a + u.count, 0);
    const ripe = timeAt(seed, 'ripe', T0);
    const over = timeAt(seed, 'overripe', T0);
    const green = timeAt(seed, 'green', T0);
    expect(power(ripe)).toBeLessThan(power(green));
    expect(power(over)).toBeGreaterThan(power(green));
    expect(parcelNow(s, s.orchardSeed!, g, ripe).cider).toBe(0);
    expect(parcelNow(s, s.orchardSeed!, g, green).cider).toBe(0);
    expect(parcelNow(s, s.orchardSeed!, g, over).cider).toBeGreaterThan(0);
    expect(parcelNow(s, s.orchardSeed!, g, ripe).nectar).toBeGreaterThan(
      parcelNow(s, s.orchardSeed!, g, over).nectar,
    );
    const clan = map.parcels[0]!.clan;
    expect(tradeRate(s, clan, ripe)).toBeGreaterThan(tradeRate(s, clan, green));
    expect(tradeRate(s, clan, over)).toBeLessThan(tradeRate(s, clan, green));
  });

  it('opens its galleries from the skin, then next to what we took', () => {
    const { map, s, crew } = orchardColony('apple');
    const apple = fruitOfState(s, 'apple');
    const deep = apple.parcels.find((g) => g.ring === 1)!;
    expect(parcelInReach(s, deep)).toBe(false);
    const r = applyCommand(
      s,
      { type: 'voyage', ...applePlan(s, crew, [deep.id]) },
      { now: T0, map },
    );
    expect(r.ok ? null : r.error).toBe('galleryOutOfReach');
    const skin = apple.byId.get(deep.links.find((l) => apple.byId.get(l)!.ring === 0)!)! as Parcel;
    const taken = cloneState(s);
    taken.orchard.taken[skin.id] = T0;
    expect(parcelInReach(taken, deep)).toBe(true);
    for (const g of apple.parcels.filter((x) => x.ring === 0))
      expect(parcelInReach(s, g)).toBe(true);
  });

  it('trades at the rate of the stage the ship arrives in', () => {
    const { map, s, crew } = orchardColony('apple');
    const apple = fruitOfState(s, 'apple');
    const g = apple.parcels.find((x) => x.ring === 0)!;
    const clan = apple.clanById.get(g.clan)!;
    const p = applePlan(s, crew, [g.id], { goods: { [clan.wants]: 10000 } });
    const f = voyageForecast(s, p)!;
    expect(f.ripeness?.stage).toBe(appleStage(s.orchard.seed, T0 + f.travelMs).stage);
    expect(f.stops[0]!.rate).toBe(tradeRate(s, clan.id, T0 + f.travelMs));
    const r = applyCommand(s, { type: 'voyage', ...p }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'visit')!;
    expect(e.targetId).toBe('orchard:apple');
    const there = advance(r.state, e.arriveAt).state;
    const done = there.expeditions.find((x) => x.id === e.id)!;
    expect(done.result!.stops![0]!.nectar).toBe(f.stops[0]!.nectar);
    expect(there.orchard.visited).toContain('apple');
  });

  it('brings cider home from an overripe gallery won, never from a ripe one', () => {
    const results = (['overripe', 'ripe'] as const).map((stage) => {
      const { map, s, crew } = orchardColony('apple');
      const apple = fruitOfState(s, 'apple');
      const g = apple.parcels.filter((x) => x.ring === 0).sort((a, b) => a.index - b.index)[0]!;
      const f0 = voyageForecast(s, applePlan(s, crew, [g.id], { mission: 'pillage' }))!;
      // Leave so as to land in the middle of that stage.
      const depart = timeAt(s.orchard.seed, stage, T0 + f0.travelMs) - f0.travelMs;
      const ready = advance(s, depart).state;
      const p = applePlan(ready, crew, [g.id], {
        mission: 'pillage',
        crew: crew.slice(0, 8),
        orders: { ...LANDING.defaultOrders, posture: 'bold', retreatAt: 0.3 },
      });
      const f = voyageForecast(ready, p)!;
      expect(f.ripeness?.stage).toBe(stage);
      const r = applyCommand(ready, { type: 'voyage', ...p }, { now: depart, map });
      if (!r.ok) throw new Error(r.error);
      const e = r.state.expeditions.find((x) => x.mission === 'pillage')!;
      const back = advance(r.state, e.returnAt).state;
      const done = back.expeditions.find((x) => x.id === e.id)!;
      return { done, back, forecast: f.pillage! };
    });
    const [over, ripe] = results;
    expect(over!.forecast.cider).toBeGreaterThan(0);
    expect(ripe!.forecast.cider).toBe(0);
    expect(over!.done.result!.victory).toBe(true);
    expect(over!.done.result!.cider).toBeGreaterThan(0);
    expect(goodOf(over!.back, 'cider')).toBe(over!.done.result!.cider);
    expect(ripe!.done.result!.cider ?? 0).toBe(0);
  });

  it('never leaks what a gallery holds', () => {
    const { map, s, crew } = orchardColony('apple');
    const g = fruitOfState(s, 'apple').parcels.find((x) => x.ring === 0)!;
    const r = applyCommand(s, { type: 'voyage', ...applePlan(s, crew, [g.id]) }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const seen = publicState(r.state);
    expect(seen.orchardSeed).toBeUndefined();
    const e = seen.expeditions.find((x) => x.mission === 'visit')!;
    const later = advance(seen, e.arriveAt + HOUR_MS).state;
    expect(later.expeditions.find((x) => x.id === e.id)!.status).toBe('outbound');
    expect(JSON.stringify(later)).not.toContain('/apple/');
  });
});
