import { describe, expect, it } from 'vitest';
import {
  actinidineActive,
  advance,
  applyCommand,
  bromelainHarm,
  bromelainShield,
  cloneState,
  crownOf,
  fruitOfId,
  fruitOfState,
  fruitSetup,
  fruitTruth,
  goodOf,
  LANDING,
  NECTAR_SCALE,
  parcelInReach,
  PINEAPPLE,
  pineappleOf,
  postKiwis,
  stallWorkers,
  voyageForecast,
  wornOut,
  type BuildingId,
  type GameState,
  type VillagerId,
  type VoyagePlan,
} from '../src';
import { orchardColony, T0 } from './helpers';

const HOUR_MS = 3_600_000;

function pinePlan(crew: VillagerId[], stops: string[], over: Partial<VoyagePlan> = {}): VoyagePlan {
  return {
    launchpadId: 'bpad' as BuildingId,
    mission: 'visit',
    stops,
    crew: crew.slice(0, 2),
    provisions: { pulp: 600, juice: 600 },
    ...over,
  };
}

/** Puts a worked actinidine lake under the colony (chantier 50). */
function withLake(s: GameState): void {
  s.buildings.push({
    id: 'btunnel' as BuildingId,
    type: 'tunnel',
    q: 0,
    r: 9,
    level: 1,
    richness: 1,
    builtAt: T0,
  });
  s.depths.galleries.rLake = { kind: 'lake', since: T0 };
  const miner = s.villagers.find((v) => v.job.kind === 'idle' || v.job.kind === 'work')!;
  miner.job = { kind: 'mine', roomId: 'rLake', returnTo: null };
}

describe('the pineapple (chantier 55)', () => {
  it('draws its scales in spirals, almost a hexagonal grid, with the crown on top', () => {
    const p = pineappleOf('u1/orchard');
    expect(pineappleOf('u1/orchard')).toBe(p);
    const scales = p.parcels.filter((x) => !x.crown);
    expect(scales.length).toBeGreaterThanOrEqual(PINEAPPLE.scales[0]);
    expect(scales.length).toBeLessThanOrEqual(PINEAPPLE.scales[1]);
    const crown = crownOf(p);
    expect(crown.crown).toBe(true);
    expect(p.parcels.filter((x) => x.crown)).toHaveLength(1);
    expect(crown.links.length).toBeGreaterThanOrEqual(PINEAPPLE.crownLinks);
    const degrees = scales.map((x) => x.links.length);
    const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
    expect(mean).toBeGreaterThan(4.5);
    expect(mean).toBeLessThan(7);
    for (const x of p.parcels) {
      expect(fruitOfId(x.id)).toBe('pineapple');
      for (const l of x.links) expect(p.byId.get(l)!.links).toContain(x.id);
    }
    expect(p.clans.flatMap((c) => c.parcels).sort()).toEqual(p.parcels.map((x) => x.id).sort());
  });

  it('keeps its crown royal: the strongest, the richest in golden fibre, reached from a scale', () => {
    const { s } = orchardColony('pine');
    const p = fruitOfState(s, 'pineapple');
    const crown = crownOf(p);
    const power = (id: string) =>
      fruitTruth(s.orchardSeed!, p.byId.get(id)!).units.reduce((a, u) => a + u.count, 0);
    const top = p.parcels.filter((x) => x.ring === 2 && !x.crown);
    const avg = top.reduce((a, x) => a + power(x.id), 0) / top.length;
    expect(power(crown.id)).toBeGreaterThan(avg * 1.5);
    const fibre = (id: string) => fruitTruth(s.orchardSeed!, p.byId.get(id)!).goldFiber;
    expect(fibre(crown.id)).toBeGreaterThan(Math.max(...top.map((x) => fibre(x.id))));
    expect(parcelInReach(s, crown)).toBe(false);
    for (const x of p.parcels.filter((y) => !y.crown)) expect(parcelInReach(s, x)).toBe(true);
    const taken = cloneState(s);
    taken.orchard.taken[crown.links[0]!] = T0;
    expect(parcelInReach(taken, crown)).toBe(true);
  });

  it('wears a crew down with bromelain: Endurance and the actinidine shield it', () => {
    const { s, crew } = orchardColony('pine');
    const kiwis = crew.map((id) => s.villagers.find((v) => v.id === id)!);
    const tough = { ...kiwis[0]!, stats: { ...kiwis[0]!.stats, endurance: 18 } };
    const frail = {
      ...kiwis[0]!,
      id: 'frail' as VillagerId,
      stats: { ...kiwis[0]!.stats, endurance: 3 },
    };
    const harm = bromelainHarm(s, [tough, frail], PINEAPPLE.bromelain.landingHours);
    expect(harm.frail).toBeCloseTo(PINEAPPLE.bromelain.perHour * PINEAPPLE.bromelain.landingHours);
    expect(harm[tough.id]).toBeLessThan(harm.frail!);
    // Never below the floor of hit points.
    expect(bromelainHarm(s, [frail], 1000).frail).toBe(1 - PINEAPPLE.bromelain.floor);
    expect(actinidineActive(s)).toBe(false);
    const lake = cloneState(s);
    withLake(lake);
    expect(actinidineActive(lake)).toBe(true);
    expect(bromelainShield(lake, frail)).toBeCloseTo(
      bromelainShield(s, frail) * PINEAPPLE.bromelain.actinidine,
    );
  });

  it('starts a pillage worn down (the forecast shows it) and brings golden fibre home', () => {
    const { map, s, crew } = orchardColony('pine');
    const p = fruitOfState(s, 'pineapple');
    const scale = p.parcels.find((x) => x.ring === 0)!;
    const plan = pinePlan(crew, [scale.id], {
      mission: 'pillage',
      crew: crew.slice(0, 8),
      orders: { ...LANDING.defaultOrders, posture: 'bold', retreatAt: 0.3 },
    });
    const f = voyageForecast(s, plan)!;
    expect(f.travelMs).toBeGreaterThan(
      voyageForecast(s, { ...plan, stops: [fruitOfState(s, 'raspberry').parcels[0]!.id] })!
        .travelMs,
    );
    const pf = f.pillage!;
    expect(Object.keys(pf.harm)).toHaveLength(8);
    expect(pf.goldFiber).toBeGreaterThan(0);
    // The battle's crew starts with fewer hit points than without the bromelain.
    const members = crew.slice(0, 8).map((id) => s.villagers.find((v) => v.id === id)!);
    const input = {
      units: pf.units,
      help: [],
      orders: plan.orders!,
      fed: 1,
      seed: 'x',
      fruit: 'pineapple' as const,
    };
    const worn = fruitSetup(s, members, { ...input, harm: pf.harm });
    const fresh = fruitSetup(s, members, input);
    const hp = (setup: typeof worn) =>
      setup.units.filter((u) => u.side === 1).reduce((a, u) => a + u.hp, 0);
    expect(hp(worn)).toBeLessThan(hp(fresh));
    const r = applyCommand(s, { type: 'voyage', ...plan }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'pillage')!;
    expect(e.targetId).toBe('orchard:pineapple');
    const back = advance(r.state, e.returnAt).state;
    const done = back.expeditions.find((x) => x.id === e.id)!;
    expect(done.result!.victory).toBe(true);
    expect(done.result!.goldFiber).toBeGreaterThan(0);
    expect(goodOf(back, 'goldFiber')).toBe(done.result!.goldFiber);
  });

  it('wears out the kiwis left at its post: they stop working, come home wounded', () => {
    const { map, s, crew } = orchardColony('pine');
    const p = fruitOfState(s, 'pineapple');
    const scale = p.parcels.find((x) => x.ring === 0)!;
    s.nectar = 200 * NECTAR_SCALE;
    s.orchard.standing[scale.clan] = { value: 60, at: T0 };
    const plan = pinePlan(crew, [scale.id], {
      settle: true,
      crew: crew.slice(0, 3),
      stay: crew.slice(0, 2),
    });
    const r = applyCommand(s, { type: 'voyage', ...plan }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'visit')!;
    const there = advance(r.state, e.arriveAt).state;
    const post = there.orchard.posts.pineapple!;
    expect(post.drupelet).toBe(scale.id);
    const left = postKiwis(there, 'pineapple');
    expect(left).toHaveLength(2);
    const wornAt = Math.min(...left.map((v) => (v.job.kind === 'post' ? v.job.wornAt! : 0)));
    expect(wornAt).toBeGreaterThan(e.arriveAt + 24 * HOUR_MS);
    // A stall, the kiwis at work until the bromelain wears them out.
    const ready = advance(there, post.readyAt).state;
    const b = applyCommand(
      ready,
      { type: 'buildPostModule', fruit: 'pineapple', moduleType: 'stall', q: 1, r: 0 },
      { now: ready.now, map },
    );
    if (!b.ok) throw new Error(b.error);
    const working = advance(b.state, wornAt - HOUR_MS).state;
    expect(stallWorkers(working, working.orchard.posts.pineapple!, working.now)).toBe(2);
    const after = advance(working, wornAt + HOUR_MS);
    expect(after.events.some((x) => x.type === 'postKiwiWorn')).toBe(true);
    const tired = after.state.villagers.filter((v) => wornOut(v, after.state.now));
    expect(tired.length).toBeGreaterThan(0);
    expect(
      stallWorkers(after.state, after.state.orchard.posts.pineapple!, after.state.now),
    ).toBeLessThan(2);
    // Exact whatever the steps.
    let steps = b.state;
    for (let t = b.state.now; t < wornAt + HOUR_MS; t += 53 * 60_000)
      steps = advance(steps, t).state;
    steps = advance(steps, wornAt + HOUR_MS).state;
    expect(steps.orchard.posts.pineapple!.store).toBe(after.state.orchard.posts.pineapple!.store);
    // A relief ship brings them home wounded.
    const relief = pinePlan(crew, [scale.id], {
      crew: crew.slice(2, 4),
      bringBack: tired.map((v) => v.id),
    });
    const r2 = applyCommand(
      after.state,
      { type: 'voyage', ...relief },
      { now: after.state.now, map },
    );
    if (!r2.ok) throw new Error(r2.error);
    const e2 = r2.state.expeditions.find((x) => x.mission === 'visit' && x.status !== 'done')!;
    const home = advance(r2.state, e2.returnAt).state;
    for (const v of tired)
      expect(home.villagers.find((x) => x.id === v.id)!.job.kind).toBe('injured');
  });
});
