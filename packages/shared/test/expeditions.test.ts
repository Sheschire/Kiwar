import { describe, expect, it } from 'vitest';
import {
  FUEL,
  STARDUST_SCALE,
  advance,
  applyCommand,
  deserializeSave,
  EXPEDITIONS,
  forecastExpedition,
  launchCost,
  HOUR_MS,
  migrateState,
  LANDING,
  population,
  serializeSave,
  validateCommand,
  type Command,
  type GameState,
} from '../src';
import { findTile, kiwi, knowTruth, rich, run, setup, T0, siteFor } from './helpers';

/** A colony with a Nest 2, a launchpad and plenty of kiwis, ready to launch. */
function readyColony(extraKiwis = 8) {
  const { map, state } = setup('kiwisu', 'expedition');
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(
    s,
    { type: 'build', buildingType: 'launchpad', ...siteFor(s, map, 'launchpad', flesh) },
    t,
    map,
  );
  t += HOUR_MS;
  s = advance(s, t).state;
  // Fast-forward population (hatching is tested elsewhere).
  for (let i = 0; i < extraKiwis; i++) {
    s = {
      ...s,
      villagers: [...s.villagers, kiwi(`vx${i}`, `Kiwi${i}`, t)],
    };
  }
  s = { ...s, resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 } };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  // The tests below plan with a perfect report (missions are tested in aliens.test.ts).
  s = knowTruth(s, t);
  return { map, s, t, padId: pad.id, targetId: s.targets[0]!.id };
}

const plan = (
  padId: string,
  targetId: string,
  crew: number,
  pulp: number,
  juice: number,
): Command => ({
  type: 'launchExpedition',
  launchpadId: padId as never,
  targetId,
  crew,
  provisions: { pulp, juice },
  // Chantier 40: every expedition to an alien face is a landing.
  mission: 'land',
  sector: 8,
  orders: LANDING.defaultOrders,
});

describe('expeditions', () => {
  it('starts with the alien-held twin face as a target', () => {
    const { state } = setup('kiwisu');
    expect(state.targets).toHaveLength(1);
    expect(state.targets[0]).toMatchObject({ owner: 'aliens', face: 'kiwino' });
  });

  it('forecasts rations, cargo and odds with the same maths as the simulation', () => {
    const { s, padId, targetId } = readyColony();
    const f = forecastExpedition(s, {
      launchpadId: padId as never,
      targetId,
      crew: 10,
      provisions: { pulp: 120, juice: 60 },
    })!;
    expect(f.cargo).toBe(150);
    expect(f.weight).toBeCloseTo(10 * EXPEDITIONS.kiwiWeight + 180 * EXPEDITIONS.resourceWeight);
    // 90 min trip: 10 kiwis × 4 pulp/h × 1.5 h.
    expect(f.needOneWay.pulp).toBeCloseTo(60);
    expect(f.fed).toBe(1);
    const hungry = forecastExpedition(s, {
      launchpadId: padId as never,
      targetId,
      crew: 10,
      provisions: { pulp: 0, juice: 0 },
    })!;
    expect(hungry.fed).toBe(0);
    expect(hungry.strength.max).toBeLessThan(f.strength.min);
  });

  it('validates crew, cargo, launchpad and provisions', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const ctx = { now: t, map };
    expect(validateCommand(s, plan(padId, targetId, 1, 10, 10), ctx)).toBe('crewTooSmall');
    expect(validateCommand(s, plan(padId, targetId, 40, 10, 10), ctx)).toBe('crewTooLarge');
    expect(validateCommand(s, plan(padId, targetId, 10, 500, 300), ctx)).toBe('overloaded');
    expect(validateCommand(s, plan(padId, 'nowhere', 4, 10, 10), ctx)).toBe('unknownTarget');
    expect(validateCommand(s, plan(s.buildings[0]!.id, targetId, 4, 10, 10), ctx)).toBe(
      'notALaunchpad',
    );
    const poor = { ...s, resources: { ...s.resources, juice: 5 } };
    expect(validateCommand(poor, plan(padId, targetId, 4, 10, 10), ctx)).toBe('notEnoughResources');
    const launched = run(s, plan(padId, targetId, 4, 30, 15), t, map);
    expect(validateCommand(launched, plan(padId, targetId, 4, 30, 15), ctx)).toBe('launchpadBusy');
  });

  it('gives the same outcome offline in one step or many', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, plan(padId, targetId, 8, 100, 50), t, map);
    const one = advance(launched, t + 5 * HOUR_MS).state;
    let many = launched;
    for (let x = t; x <= t + 5 * HOUR_MS; x += 600_013) many = advance(many, x).state;
    many = advance(many, t + 5 * HOUR_MS).state;
    expect(many.expeditions).toEqual(one.expeditions);
    expect(many.villagers.length).toBe(one.villagers.length);
  });

  it('migrates milestone-2 saves (schema v1) and keeps them loadable', () => {
    const { state } = setup('kiwino');
    const v1 = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    v1.schemaVersion = 1;
    delete v1.targets;
    delete v1.victories;
    delete v1.expeditions;
    const migrated = migrateState(v1);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) expect(migrated.state.targets[0]!.face).toBe('kiwisu');
    const loaded = deserializeSave(serializeSave(v1 as unknown as GameState, T0));
    expect(loaded.ok).toBe(true);
  });

  it('cancelling nothing: commands still work while a ship is away', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, plan(padId, targetId, 6, 60, 30), t, map);
    const r = applyCommand(launched, { type: 'hatchEgg' }, { now: t + 1000, map });
    expect(r.ok || r.error === 'housingFull').toBe(true);
  });

  it('turns back without fighting if a friend claimed the target meanwhile', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, plan(padId, targetId, 6, 80, 40), t, map);
    const claimed = { ...launched, targets: [] };
    const back = advance(claimed, t + 4 * HOUR_MS).state;
    const r = back.expeditions[0]!.result!;
    expect(r.aborted).toBe(true);
    expect(r.lostInBattle).toEqual([]);
    expect(population(back)).toBe(population(s));
  });

  it('boards the chosen kiwis only, and refuses unknown or busy ones', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const chosen = s.villagers.slice(-3).map((v) => v.id);
    const cmd: Command = {
      type: 'launchExpedition',
      launchpadId: padId as never,
      targetId,
      crew: chosen,
      provisions: { pulp: 60, juice: 30 },
      mission: 'land',
      sector: 8,
      orders: LANDING.defaultOrders,
    };
    const launched = run(s, cmd, t, map);
    const aboard = launched.villagers.filter((v) => v.job.kind === 'expedition').map((v) => v.id);
    expect(aboard.sort()).toEqual([...chosen].sort());
    expect(launched.expeditions[0]!.roster[0]).toMatchObject({ level: 1 });
    const ctx = { now: t, map };
    expect(validateCommand(s, { ...cmd, crew: [...chosen, 'ghost' as never] }, ctx)).toBe(
      'invalidCrew',
    );
    expect(validateCommand(s, { ...cmd, crew: [chosen[0]!, chosen[0]!] }, ctx)).toBe('invalidCrew');
    expect(validateCommand(s, { ...cmd, crew: [chosen[0]!] }, ctx)).toBe('crewTooSmall');
  });

  it('makes invested kiwis measurably stronger before launch', () => {
    const { s, padId, targetId } = readyColony();
    const ids = s.villagers.slice(-4).map((v) => v.id);
    const veteran: GameState = {
      ...s,
      villagers: s.villagers.map((v) =>
        ids.includes(v.id)
          ? { ...v, level: 15, stats: { ...v.stats, strength: v.stats.strength + 5 } }
          : v,
      ),
    };
    const p = {
      launchpadId: padId as never,
      targetId,
      crew: ids,
      provisions: { pulp: 60, juice: 30 },
    };
    const rookies = forecastExpedition(s, p)!;
    const veterans = forecastExpedition(veteran, p)!;
    expect(veterans.strength.min).toBeGreaterThan(rookies.strength.min * 1.8);
    // Each kiwi's risk is shown, and adds up to the expected losses.
    const sum = ids.reduce((a, id) => a + rookies.risk[id]!, 0);
    expect(sum).toBeCloseTo(rookies.expectedLosses, 6);
  });

  it('gives survivors experience and a story', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, plan(padId, targetId, 10, 120, 60), t, map);
    const { state: back, events } = advance(launched, t + 4 * HOUR_MS);
    const e = back.expeditions[0]!;
    expect(e.status).toBe('done');
    for (const id of e.crew) {
      const v = back.villagers.find((x) => x.id === id)!;
      expect(v.history.expeditions).toBe(1);
      expect(v.xp).toBeGreaterThan(0);
    }
    expect(events.some((x) => x.type === 'expeditionReturned')).toBe(true);
    // Exact offline: the same in one step or many.
    let small = launched;
    for (let now = t; now < t + 4 * HOUR_MS; now += 333_331) small = advance(small, now).state;
    small = advance(small, t + 4 * HOUR_MS).state;
    expect(small.villagers).toEqual(back.villagers);
    expect(small.memorial).toEqual(back.memorial);
  });
});

describe('stardust fuel (chantier 13)', () => {
  it('shortens the trip, mends the ship and costs stardust', () => {
    const { map, s: base, padId, targetId } = readyColony();
    const s: GameState = { ...base, stardust: FUEL.stardust * STARDUST_SCALE };
    const cmd = plan(padId, targetId, 3, 300, 300) as Extract<
      Command,
      { type: 'launchExpedition' }
    >;
    const plain = forecastExpedition(s, cmd)!;
    const fueled = forecastExpedition(s, { ...cmd, fuel: true })!;
    expect(fueled.travelMs).toBe(Math.round((plain.travelMs * FUEL.travel) / 1000) * 1000);
    expect(fueled.reliability).toBeCloseTo(Math.min(1, plain.reliability + FUEL.reliability), 6);
    const after = run(s, { ...cmd, fuel: true }, s.now, map);
    expect(after.stardust).toBe(0);
    const e = after.expeditions[after.expeditions.length - 1]!;
    expect(e.arriveAt - after.now).toBeLessThanOrEqual(fueled.travelMs);
    const r = applyCommand(after, { ...cmd, fuel: true }, { now: after.now, map });
    expect(r.ok).toBe(false);
  });
});

describe('launch cost (chantier 31)', () => {
  it('charges fibre and juice per kiwi aboard, shown before the launch', () => {
    const { map, s, t, padId, targetId } = readyColony();
    const f = forecastExpedition(s, {
      launchpadId: padId as never,
      targetId,
      crew: 6,
      provisions: { pulp: 60, juice: 30 },
    })!;
    const L = EXPEDITIONS.launchCost;
    expect(f.launchCost.fiber).toBe(6 * L.perKiwi.fiber * L.ship.wood);
    expect(f.launchCost.juice).toBe(6 * L.perKiwi.juice * L.ship.wood);
    const after = run(s, plan(padId, targetId, 6, 60, 30), t, map);
    expect(after.resources.fiber).toBe(s.resources.fiber - f.launchCost.fiber);
    expect(after.resources.juice).toBe(s.resources.juice - 30 - f.launchCost.juice);
  });

  it('refuses a launch the colony cannot pay', () => {
    const { map, s, t, padId, targetId } = readyColony();
    const poor = { ...s, resources: { ...s.resources, fiber: 10 } };
    const r = applyCommand(poor, plan(padId, targetId, 6, 60, 30), { now: t, map });
    expect(r).toMatchObject({ ok: false, error: 'notEnoughResources' });
  });

  it('grows with the ship of the age; the settlers fly for free', () => {
    const { s } = readyColony();
    const crew = s.villagers.slice(0, 4);
    const iron = {
      ...s,
      buildings: [
        ...s.buildings,
        { ...s.buildings[0]!, id: 'bm' as never, type: 'monument' as const, q: 3, r: 0, level: 2 },
      ],
    };
    expect(launchCost(iron, crew).fiber).toBe(
      launchCost(s, crew).fiber * EXPEDITIONS.launchCost.ship.iron,
    );
    expect(launchCost(s, crew, 'found')).toEqual({ pulp: 0, fiber: 0, seeds: 0, juice: 0 });
  });
});
