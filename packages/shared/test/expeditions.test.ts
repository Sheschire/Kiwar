import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  deserializeSave,
  EXPEDITIONS,
  forecastExpedition,
  HOUR_MS,
  migrateState,
  population,
  serializeSave,
  validateCommand,
  type Command,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** A colony with a Nest 2, a launchpad and plenty of kiwis, ready to launch. */
function readyColony(extraKiwis = 8) {
  const { map, state } = setup('kiwisu', 'expedition');
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(s, { type: 'build', buildingType: 'launchpad', q: flesh.q, r: flesh.r }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  // Fast-forward population (hatching is tested elsewhere).
  for (let i = 0; i < extraKiwis; i++) {
    s = {
      ...s,
      villagers: [
        ...s.villagers,
        { id: `vx${i}` as never, name: `Kiwi${i}`, bornAt: t, job: { kind: 'idle' } },
      ],
    };
  }
  s = { ...s, resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 } };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
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
    expect(f.odds).toBe('likely');
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

  it('a well-fed crew wins, brings loot home and the aliens reinforce', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const before = population(s);
    const launched = run(s, plan(padId, targetId, 10, 120, 60), t, map);
    expect(launched.resources.pulp).toBe(s.resources.pulp - 120);
    expect(launched.villagers.filter((v) => v.job.kind === 'expedition')).toHaveLength(10);

    const { state: back, events } = advance(launched, t + 4 * HOUR_MS);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['expeditionArrived', 'expeditionReturned']),
    );
    const e = back.expeditions[0]!;
    expect(e.status).toBe('done');
    expect(e.result!.victory).toBe(true);
    expect(e.result!.loot.seeds).toBeGreaterThan(0);
    expect(back.victories[targetId]).toBe(1);
    expect(population(back)).toBe(
      before - e.result!.lostInBattle.length - e.result!.lostOnReturn.length,
    );
    expect(back.villagers.some((v) => v.job.kind === 'expedition')).toBe(false);
    expect(
      forecastExpedition(back, {
        launchpadId: padId as never,
        targetId,
        crew: 10,
        provisions: { pulp: 120, juice: 60 },
      })!.defense,
    ).toBe(s.targets[0]!.defense + s.targets[0]!.reinforce);
  });

  it('an unfed crew is weaker and can lose', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, plan(padId, targetId, 9, 0, 0), t, map);
    const back = advance(launched, t + 4 * HOUR_MS).state;
    const r = back.expeditions[0]!.result!;
    expect(r.fed).toBe(0);
    expect(r.victory).toBe(false);
    expect(r.lostInBattle.length).toBeGreaterThanOrEqual(
      Math.round(9 * EXPEDITIONS.defeatLosses.min),
    );
    expect(r.loot.seeds).toBe(0);
  });

  it('provisions take the room of the loot', () => {
    const { s, t, map, padId, targetId } = readyColony();
    // Same crew; the heavy ship still carries ~40 cargo units of food after the outbound leg.
    const light = advance(
      run(s, plan(padId, targetId, 10, 120, 60), t, map),
      t + 4 * HOUR_MS,
    ).state;
    const heavy = advance(
      run(s, plan(padId, targetId, 10, 330, 160), t, map),
      t + 4 * HOUR_MS,
    ).state;
    expect(light.expeditions[0]!.result!.victory && heavy.expeditions[0]!.result!.victory).toBe(
      true,
    );
    const lootOf = (x: GameState) =>
      Object.values(x.expeditions[0]!.result!.loot).reduce((a, b) => a + b, 0);
    expect(lootOf(heavy)).toBeLessThan(lootOf(light));
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
});
