import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildCost,
  HOUR_MS,
  idleVillagers,
  OBJECTIVES,
  validateCommand,
  workersOf,
  type Command,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

describe('commands', () => {
  it('validates placement against the tile type', () => {
    const { map, state } = setup();
    const grove = findTile(map, 'grove');
    const ctx = { now: T0, map };
    expect(
      validateCommand(
        state,
        { type: 'build', buildingType: 'pulpery', q: grove.q, r: grove.r },
        ctx,
      ),
    ).toBe('tileNotAllowed');
    expect(
      validateCommand(state, { type: 'build', buildingType: 'pulpery', q: 99, r: 99 }, ctx),
    ).toBe('unknownTile');
    expect(validateCommand(state, { type: 'build', buildingType: 'nest', q: 0, r: 0 }, ctx)).toBe(
      'notBuildable',
    );
    const skin = findTile(map, 'skin');
    expect(
      validateCommand(state, { type: 'build', buildingType: 'hut', q: skin.q, r: skin.r }, ctx),
    ).toBe('tileNotAllowed');
  });

  it('builds on seed tiles, except the producers of other resources', () => {
    const { map, state } = setup();
    const seeds = findTile(map, 'seedRing');
    const ctx = { now: T0, map };
    const build = (buildingType: 'hut' | 'pulpery' | 'seedQuarry') =>
      validateCommand(rich(state), { type: 'build', buildingType, q: seeds.q, r: seeds.r }, ctx);
    // Owner, October 2026: a colony has more seed tiles than its quarries need.
    expect(build('hut')).toBeNull();
    expect(build('seedQuarry')).toBeNull();
    expect(build('pulpery')).toBe('tileNotAllowed');
  });

  it('pays the cost, rejects occupied tiles and refunds on cancel', () => {
    const { map, state } = setup();
    const flesh = findTile(map, 'flesh');
    const cmd: Command = { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r };
    const cost = buildCost(state, 'pulpery');
    const s = run(state, cmd, T0, map);
    expect(s.resources.pulp).toBe(state.resources.pulp - cost.pulp!);
    expect(validateCommand(s, cmd, { now: T0, map })).toBe('tileOccupied');
    const cancelled = run(s, { type: 'cancel', queueItemId: s.queue[0]!.id }, T0 + 1000, map);
    expect(cancelled.queue).toHaveLength(0);
    expect(cancelled.resources.pulp).toBeCloseTo(
      state.resources.pulp + advance(state, T0 + 1000).state.resources.pulp - state.resources.pulp,
      6,
    );
    expect(idleVillagers(cancelled)).toHaveLength(3);
  });

  it('rejects unaffordable orders without changing the state', () => {
    const { map, state } = setup();
    const s = { ...state, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    const flesh = findTile(map, 'flesh');
    const r = applyCommand(
      s,
      { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      { now: T0, map },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('notEnoughResources');
    expect(r.state.queue).toHaveLength(0);
  });

  it('limits the queue length and the number of buildings by nest level', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = (i: number) => findTile(map, 'flesh', i);
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh(0).q, r: flesh(0).r }, T0, map);
    s = run(s, { type: 'build', buildingType: 'hut', q: flesh(1).q, r: flesh(1).r }, T0, map);
    expect(
      validateCommand(
        s,
        { type: 'build', buildingType: 'hut', q: flesh(2).q, r: flesh(2).r },
        { now: T0, map },
      ),
    ).toBe('queueFull');

    let t = T0;
    for (let i = 2; i < 6; i++) {
      t += HOUR_MS;
      s = run(s, { type: 'build', buildingType: 'hut', q: flesh(i).q, r: flesh(i).r }, t, map);
    }
    t += HOUR_MS;
    s = advance(s, t).state;
    expect(
      validateCommand(
        s,
        { type: 'build', buildingType: 'hut', q: flesh(7).q, r: flesh(7).r },
        { now: t, map },
      ),
    ).toBe('buildingLimit');
  });

  it('gates level 3 behind nest level 2, and level 4 behind the Stone age', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    let t = T0 + HOUR_MS;
    const id = () => s.buildings.find((b) => b.type === 'pulpery')!.id;
    s = advance(s, t).state;
    s = run(s, { type: 'upgrade', buildingId: id() }, t, map);
    expect(validateCommand(s, { type: 'upgrade', buildingId: id() }, { now: t, map })).toBe(
      'alreadyUpgrading',
    );
    t += HOUR_MS;
    s = advance(s, t).state;
    expect(validateCommand(s, { type: 'upgrade', buildingId: id() }, { now: t, map })).toBe(
      'nestLevelTooLow',
    );
    s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map); // nest → 2
    t += HOUR_MS;
    s = run(s, { type: 'upgrade', buildingId: id() }, t, map);
    t += HOUR_MS;
    s = advance(s, t).state;
    expect(s.buildings.find((b) => b.type === 'pulpery')!.level).toBe(3);
    expect(validateCommand(s, { type: 'upgrade', buildingId: id() }, { now: t, map })).toBe(
      'ageTooLow',
    );
  });

  it('assigns and releases workers within the slots', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = advance(s, T0 + 60_000).state;
    const b = s.buildings[1]!;
    expect(workersOf(s, b.id)).toHaveLength(1);
    expect(
      validateCommand(
        s,
        { type: 'assignWorkers', buildingId: b.id, count: 2 },
        { now: s.now, map },
      ),
    ).toBe('tooManyWorkers');
    expect(
      validateCommand(
        s,
        { type: 'assignWorkers', buildingId: s.buildings[0]!.id, count: 1 },
        { now: s.now, map },
      ),
    ).toBe('notAProducer');
    s = run(s, { type: 'assignWorkers', buildingId: b.id, count: 0 }, s.now, map);
    expect(idleVillagers(s)).toHaveLength(3);
  });

  it('hatches eggs within housing and one at a time', () => {
    const { map, state } = setup();
    let s = rich(state);
    s = run(s, { type: 'hatchEgg' }, T0, map);
    expect(validateCommand(s, { type: 'hatchEgg' }, { now: T0, map })).toBe('eggInProgress');
    s = advance(s, T0 + HOUR_MS).state;
    expect(s.villagers).toHaveLength(4);
    expect(validateCommand(s, { type: 'hatchEgg' }, { now: s.now, map })).toBe('housingFull');
  });

  it('rewards objectives only once complete', () => {
    const { map, state } = setup();
    let s = state;
    expect(validateCommand(s, { type: 'claimObjective' }, { now: T0, map })).toBe(
      'objectiveIncomplete',
    );
    const flesh = findTile(map, 'flesh');
    s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
    s = advance(s, T0 + 60_000).state;
    const fiberBefore = s.resources.fiber;
    s = run(s, { type: 'claimObjective' }, s.now, map);
    expect(s.objectiveIndex).toBe(1);
    expect(s.resources.fiber).toBeCloseTo(fiberBefore + OBJECTIVES[0]!.reward.fiber!, 6);
  });

  it('is deterministic for a given command log', () => {
    const play = () => {
      const { map, state } = setup('kiwino', 'replay');
      let s = state;
      const flesh = findTile(map, 'flesh');
      s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
      s = run(s, { type: 'hatchEgg' }, T0 + 5000, map);
      return advance(s, T0 + 2 * HOUR_MS).state;
    };
    expect(play()).toEqual(play());
  });
});
