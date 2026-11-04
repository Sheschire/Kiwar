import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  decodeEvents,
  DEPTHS,
  delveForecast,
  delveLock,
  depthsMapOf,
  EV,
  HOUR_MS,
  isCore,
  isStem,
  LANDING,
  publicState,
  simulateBattle,
  stemForecast,
  stemSetup,
  weevilWounds,
  WEEVIL_REF,
  type Command,
  type GameState,
  type VillagerId,
} from '../src';
import { delveColony, run } from './helpers';

const fight = { ...LANDING.defaultOrders, retreatAt: 0.8 };

function crewIds(s: GameState, n: number): VillagerId[] {
  return s.villagers
    .filter((v) => v.id.startsWith('dk'))
    .slice(0, n)
    .map((v) => v.id);
}

/** A colony at the Age of the stars with every room but the stem taken. */
function atTheStem(kiwiLevel = 25, kiwis = 8) {
  const { map, s } = delveColony('stem', 3, kiwis, kiwiLevel);
  s.buildings.find((b) => b.type === 'monument')!.level = 4;
  const net = depthsMapOf(s);
  for (const r of net.rooms)
    if (!isStem(r))
      s.depths.galleries[r.id] = { kind: isCore(r) ? 'cavern' : 'bundle', since: s.now };
  return { map, s, stem: net.rooms.find(isStem)! };
}

function crewOf(s: GameState, n: number) {
  return crewIds(s, n).map((id) => s.villagers.find((v) => v.id === id)!);
}

describe('the stem and the Great Weevil (chantier 52)', () => {
  it('opens the stem at the Age of the stars, once a cavern next to it is ours', () => {
    const { s, stem } = atTheStem();
    expect(delveLock(s, stem.id, crewIds(s, 4), fight)).toBeNull();
    const before = cloneState(s);
    before.buildings.find((b) => b.type === 'monument')!.level = 3;
    expect(delveLock(before, stem.id, crewIds(s, 4), fight)).toBe('layerLocked');
    // The stem has its own forecast.
    expect(delveForecast(s, stem.id, crewOf(s, 4), fight)).toBeNull();
  });

  it('fights in phases: the shell, the flight, the swarm of larvae', () => {
    const { s } = atTheStem(30);
    const setup = stemSetup(s, crewOf(s, 8), { wounds: 0, orders: fight, fed: 1 });
    const log = simulateBattle(setup, 'phases');
    const events = decodeEvents(log.events, 0.5);
    const weevil = setup.units.findIndex((u) => u.ref === WEEVIL_REF);
    const rise = events.find((e) => e.code === EV.rise && e.args[0] === weevil);
    expect(rise).toBeDefined();
    const larvae = setup.units
      .map((u, i) => ({ u, i }))
      .filter(({ u }) => u.wake?.ref === WEEVIL_REF)
      .map(({ i }) => i);
    expect(larvae.length).toBeGreaterThan(0);
    const swarm = events.find((e) => e.code === EV.enter && larvae.includes(e.args[0]!));
    expect(swarm).toBeDefined();
    expect(swarm!.t).toBeGreaterThan(rise!.t);
    // While it is up there, no melee blow touches it.
    const landAt = events.find(
      (e) => e.code === EV.land && e.args[0] === weevil && e.t > rise!.t,
    )?.t;
    const melee = new Set(
      setup.units.map((u, i) => (u.side === 1 && !u.weapon.hitsAir ? i : -1)).filter((i) => i >= 0),
    );
    for (const e of events)
      if (e.code === EV.attack && e.args[1] === weevil * 2 && e.t > rise!.t + 0.5)
        if (landAt === undefined || e.t < landAt - 0.5) expect(melee.has(e.args[0]!)).toBe(false);
  });

  it('is deterministic and stays within the budgets', () => {
    const { s } = atTheStem(30);
    const setup = stemSetup(s, crewOf(s, 8), { wounds: 0, orders: fight, fed: 1 });
    const t0 = performance.now();
    const a = simulateBattle(setup, 'same');
    expect(performance.now() - t0).toBeLessThan(200);
    expect(JSON.stringify(simulateBattle(setup, 'same'))).toBe(JSON.stringify(a));
    expect(JSON.stringify(a).length).toBeLessThan(30_000);
    expect(a.steps * a.dt).toBeLessThanOrEqual(DEPTHS.stem.maxS);
  });

  it('keeps its wounds after a lost battle, and they heal', () => {
    const { map, s: s0, stem } = atTheStem(18, 6);
    const cmd: Command = {
      type: 'delve',
      roomId: stem.id,
      crew: crewIds(s0, 6),
      provisions: { pulp: 900, juice: 900 },
      orders: { ...LANDING.defaultOrders, retreatAt: 0.3 },
    };
    let s = run(s0, cmd, s0.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    expect(e.arriveAt - e.departedAt).toBe(DEPTHS.travelMs[5]);
    s = advance(s, e.arriveAt + 1).state;
    const r = s.expeditions.find((x) => x.id === e.id)!.result!;
    expect(r.outcome).not.toBe('victory');
    expect(s.depths.weevil?.attempts).toBe(1);
    const w = weevilWounds(s, s.now);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(DEPTHS.stem.maxWounds);
    expect(r.weevil?.left).toBeCloseTo(1 - s.depths.weevil!.wounds!.share, 2);
    expect(weevilWounds(s, s.now + DEPTHS.stem.healMs / 2)).toBeCloseTo(w / 2, 1);
    expect(weevilWounds(s, s.now + DEPTHS.stem.healMs)).toBe(0);
    // Its wounds weaken it in the next forecast.
    const fresh = stemForecast(s0, crewOf(s0, 6), fight);
    const hurt = stemForecast(s, crewOf(s, 6), fight);
    expect(hurt.wounds).toBeGreaterThan(0);
    expect(fresh.wounds).toBe(0);
    // The public state keeps what we know of it.
    expect(publicState(s).depths.weevil?.attempts).toBe(1);
  });

  it('falls to a strong crew: the stem is ours', () => {
    const { map, s: s0, stem } = atTheStem(40, 8);
    const f = stemForecast(s0, crewOf(s0, 8), fight);
    expect(f.reachesAir).toBe(true);
    const cmd: Command = {
      type: 'delve',
      roomId: stem.id,
      crew: crewIds(s0, 8),
      provisions: { pulp: 900, juice: 900 },
      orders: fight,
    };
    let s = run(s0, cmd, s0.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    s = advance(s, e.arriveAt + 1).state;
    const r = s.expeditions.find((x) => x.id === e.id)!.result!;
    expect(r.outcome).toBe('victory');
    expect(r.lostInBattle).toEqual([]);
    expect(s.depths.weevil?.fellAt).toBe(e.arriveAt);
    expect(s.depths.galleries[stem.id]?.kind).toBe('stem');
    expect(delveLock(s, stem.id, crewIds(s, 1), fight)).toBe('roomTaken');
    s = advance(s, e.returnAt + HOUR_MS).state;
    expect(s.expeditions.find((x) => x.id === e.id)?.status ?? 'done').toBe('done');
  });
});
