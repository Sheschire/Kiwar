import { describe, expect, it } from 'vitest';
import {
  advance,
  appleCalendar,
  applyCommand,
  cloneState,
  fruitOfState,
  goodOf,
  NECTAR_SCALE,
  POST,
  POST_YIELD,
  postGoods,
  postRate,
  routeUpkeep,
  ROUTE,
  voyageForecast,
  type BuildingId,
  type FruitId,
  type GameState,
  type TradingPost,
  type VillagerId,
} from '../src';
import { orchardColony, T0 } from './helpers';

const HOUR_MS = 3_600_000;

/** Posts standing on every fruit, a stall and two kiwis each (Endurance high: no wear soon). */
function withPosts(fruits: FruitId[] = ['raspberry', 'apple', 'pineapple']) {
  const { map, s, crew } = orchardColony('routes');
  let k = 0;
  for (const fruit of fruits) {
    const parcel = fruitOfState(s, fruit).parcels.find((p) => p.ring === 0 && !p.crown)!;
    const post: TradingPost = {
      drupelet: parcel.id,
      since: T0 - 10 * HOUR_MS,
      readyAt: T0 - 8 * HOUR_MS,
      modules: [{ id: `pm-${fruit}`, type: 'stall', q: 1, r: 0, readyAt: T0 - 7 * HOUR_MS }],
      store: 0,
      attacks: 0,
      attack: null,
      reports: [],
    };
    s.orchard.posts = { ...s.orchard.posts, [fruit]: post };
    for (let i = 0; i < 2; i++) {
      const v = s.villagers.find((x) => x.id === crew[k])!;
      k++;
      v.job = {
        kind: 'post',
        returnTo: null,
        ...(fruit !== 'raspberry' ? { fruit } : {}),
        ...(fruit === 'pineapple' ? { wornAt: T0 + 400 * HOUR_MS } : {}),
      };
    }
  }
  // No attacks in the way.
  for (const p of Object.values(s.orchard.posts))
    p.attack = { id: 'x', clan: null, announceAt: T0 + 1e12, at: T0 + 1e12, announced: false };
  s.nectar = 100 * NECTAR_SCALE;
  s.cider = 50 * NECTAR_SCALE;
  s.goldFiber = 50 * NECTAR_SCALE;
  return { map, s, crew };
}

describe('the posts of every fruit (chantier 55)', () => {
  it('gathers golden fibre on the pineapple, nectar or cider on the apple by its ripeness', () => {
    const { s } = withPosts();
    expect(postRate(s, 'pineapple').good).toBe('goldFiber');
    expect(postRate(s, 'raspberry').good).toBe('nectar');
    const cal = appleCalendar(s.orchard.seed, T0, 4);
    const over = cal.find((r) => r.stage === 'overripe')!;
    const ripe = cal.find((r) => r.stage === 'ripe')!;
    const atOver = advance(s, over.since + HOUR_MS).state;
    expect(postRate(atOver, 'apple').good).toBe('cider');
    const atRipe = advance(s, ripe.since + HOUR_MS).state;
    expect(postRate(atRipe, 'apple').good).toBe('nectar');
    // The pineapple's golden fibre, exactly two kiwis' worth per hour.
    const day = advance(s, T0 + 10 * HOUR_MS).state;
    expect(postGoods(day.orchard.posts.pineapple!).goldFiber).toBe(
      Math.floor(POST_YIELD.pineapple * 2 * 10 + 1e-9),
    );
  });

  it('switches the apple stalls at the stage boundary, exactly whatever the steps', () => {
    const { s } = withPosts(['apple']);
    const over = appleCalendar(s.orchard.seed, T0, 4).find((r) => r.stage === 'overripe')!;
    const from = advance(s, over.since - 3 * HOUR_MS).state;
    const end = over.since + 5 * HOUR_MS;
    const one = advance(from, end).state;
    let steps = from;
    for (let t = from.now; t < end; t += 41 * 60_000) steps = advance(steps, t).state;
    steps = advance(steps, end).state;
    expect(steps.orchard.posts.apple).toEqual(one.orchard.posts.apple);
    const goods = postGoods(one.orchard.posts.apple!);
    expect(goods.cider).toBe(Math.floor(POST_YIELD.appleCider * 2 * 5 + 1e-9));
    expect(goods.nectar).toBeGreaterThan(0);
  });

  it('brings every good of the post home with a ship calling there', () => {
    const { map, s, crew } = withPosts(['pineapple']);
    const filled = advance(s, T0 + 20 * HOUR_MS).state;
    const scale = filled.orchard.posts.pineapple!.drupelet;
    const plan = {
      launchpadId: 'bpad' as BuildingId,
      mission: 'visit' as const,
      stops: [scale],
      crew: crew.slice(4, 6) as VillagerId[],
      provisions: { pulp: 600, juice: 600 },
    };
    const f = voyageForecast(filled, plan)!;
    const r = applyCommand(filled, { type: 'voyage', ...plan }, { now: filled.now, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'visit')!;
    const back = advance(r.state, e.returnAt).state;
    const result = back.expeditions.find((x) => x.id === e.id)!.result!;
    expect(result.goldFiber).toBeGreaterThanOrEqual(f.waiting!.goldFiber);
    expect(goodOf(back, 'goldFiber')).toBe(50 + result.goldFiber!);
  });
});

describe('routes between posts (chantier 55)', () => {
  it('opens a route for its upkeep: both posts gather more, trips are shorter', () => {
    const { map, s } = withPosts(['raspberry', 'apple']);
    const before = postRate(s, 'raspberry').rate;
    const pad = {
      launchpadId: 'bpad' as BuildingId,
      mission: 'visit' as const,
      crew: [],
      provisions: { pulp: 0, juice: 0 },
    };
    const stop = s.orchard.posts.raspberry!.drupelet;
    const tripBefore = voyageForecast(s, { ...pad, stops: [stop] })!.travelMs;
    const r = applyCommand(s, { type: 'openRoute', a: 'raspberry', b: 'apple' }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const up = routeUpkeep('raspberry', 'apple');
    expect(goodOf(r.state, 'nectar')).toBe(100 - up.nectar!);
    expect(goodOf(r.state, 'cider')).toBe(50 - up.cider!);
    expect(postRate(r.state, 'raspberry').rate).toBe(
      Math.round((POST.perHour * NECTAR_SCALE * 2 * (1 + ROUTE.bonus)) / HOUR_MS),
    );
    expect(postRate(r.state, 'raspberry').rate).toBeGreaterThan(before);
    expect(voyageForecast(r.state, { ...pad, stops: [stop] })!.travelMs).toBeLessThan(tripBefore);
    const again = applyCommand(
      r.state,
      { type: 'openRoute', a: 'apple', b: 'raspberry' },
      { now: T0, map },
    );
    expect(again.ok ? null : again.error).toBe('routeExists');
    const lone = applyCommand(
      r.state,
      { type: 'openRoute', a: 'apple', b: 'pineapple' },
      { now: T0, map },
    );
    expect(lone.ok ? null : lone.error).toBe('noPost');
  });

  it('pays its upkeep every day, and is cut when it cannot (opened again by paying)', () => {
    const { map, s } = withPosts(['raspberry', 'pineapple']);
    const r = applyCommand(
      s,
      { type: 'openRoute', a: 'raspberry', b: 'pineapple' },
      { now: T0, map },
    );
    if (!r.ok) throw new Error(r.error);
    const route = r.state.orchard.routes[0]!;
    const paid = advance(r.state, route.paidUntil + 1).state;
    expect(paid.orchard.routes[0]!.cut).toBeUndefined();
    expect(paid.orchard.routes[0]!.paidUntil).toBe(route.paidUntil + ROUTE.dayMs);
    // Nothing left to pay with: cut at the next due time.
    const poor = cloneState(paid);
    poor.goldFiber = 0;
    const out = advance(poor, route.paidUntil + ROUTE.dayMs + 1);
    expect(out.state.orchard.routes[0]!.cut).toBe(true);
    expect(out.events.some((e) => e.type === 'routeCut')).toBe(true);
    expect(postRate(out.state, 'raspberry').rate).toBeLessThan(postRate(paid, 'raspberry').rate);
    // Paying again opens it.
    const rich: GameState = cloneState(out.state);
    rich.goldFiber = 30 * NECTAR_SCALE;
    const re = applyCommand(
      rich,
      { type: 'openRoute', a: 'raspberry', b: 'pineapple' },
      { now: rich.now, map },
    );
    if (!re.ok) throw new Error(re.error);
    expect(re.state.orchard.routes).toHaveLength(1);
    expect(re.state.orchard.routes[0]!.cut).toBeUndefined();
    const closed = applyCommand(
      re.state,
      { type: 'closeRoute', routeId: route.id },
      { now: rich.now, map },
    );
    if (!closed.ok) throw new Error(closed.error);
    expect(closed.state.orchard.routes).toHaveLength(0);
  });
});
