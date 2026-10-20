import { describe, expect, it } from 'vitest';
import {
  advance,
  alienDefOf,
  capacity,
  cargoLimit,
  deliveryOf,
  deliveryTime,
  HOUR_MS,
  migrateState,
  validateCommand,
  type Command,
  type Friend,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const bob: Friend = {
  id: 'ally:bob',
  owner: 'Bob',
  kiwiIndex: 1,
  distance: 1,
  travelMs: alienDefOf(1).travelMs,
};

/** A colony with a Nest 2 and a launchpad, and Bob as an ally. */
function colony() {
  const { map, state } = setup('kiwisu', 'delivery');
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(s, { type: 'build', buildingType: 'launchpad', q: flesh.q, r: flesh.r }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  s = { ...s, resources: { pulp: 500, fiber: 500, seeds: 500, juice: 500 }, friends: [bob] };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  return { map, s, t, pad };
}

const send = (padId: string, resources: Extract<Command, { type: 'sendCargo' }>['resources']) =>
  ({ type: 'sendCargo', launchpadId: padId, friendId: bob.id, resources }) as Command;

describe('deliveries between allies', () => {
  it('loads the ship, keeps the launchpad busy until it is back', () => {
    const { map, s, t, pad } = colony();
    const sent = run(s, send(pad.id, { pulp: 200, seeds: 50 }), t, map);
    expect(sent.resources.pulp).toBe(s.resources.pulp - 200);
    expect(sent.resources.seeds).toBe(s.resources.seeds - 50);
    const x = sent.shipments[0]!;
    const travel = deliveryTime(s, bob, pad);
    expect(x).toMatchObject({ owner: 'Bob', status: 'outbound', arriveAt: t + travel });
    expect(x.returnAt).toBe(t + 2 * travel);
    // No raid while the ship is away.
    expect(validateCommand(sent, send(pad.id, { pulp: 1 }), { now: t, map })).toBe('launchpadBusy');

    const there = advance(sent, x.arriveAt);
    expect(there.events.find((e) => e.type === 'cargoDelivered')).toMatchObject({
      to: 'Bob',
      resources: { pulp: 200, seeds: 50 },
    });
    const back = advance(there.state, x.returnAt);
    expect(back.events.some((e) => e.type === 'shipmentReturned')).toBe(true);
    expect(back.state.shipments).toHaveLength(0);
  });

  it('refuses unknown allies, empty or too heavy loads, and what we do not have', () => {
    const { map, s, t, pad } = colony();
    const ctx = { now: t, map };
    expect(
      validateCommand(s, { ...send(pad.id, { pulp: 1 }), friendId: 'ally:x' } as Command, ctx),
    ).toBe('unknownFriend');
    expect(validateCommand(s, send(pad.id, {}), ctx)).toBe('emptyCargo');
    expect(validateCommand(s, send(pad.id, { pulp: -5 }), ctx)).toBe('invalidCount');
    expect(validateCommand(s, send(pad.id, { pulp: 600 }), ctx)).toBe('notEnoughResources');
    const heavy = { ...s, resources: { pulp: 1e5, fiber: 1e5, seeds: 1e5, juice: 1e5 } };
    expect(validateCommand(heavy, send(pad.id, { fiber: cargoLimit(pad) + 1 }), ctx)).toBe(
      'overloaded',
    );
    expect(validateCommand(heavy, send(pad.id, { fiber: cargoLimit(pad) }), ctx)).toBeNull();
  });

  it('credits a gift when it lands, up to the storage', () => {
    const { s, t, pad } = colony();
    const shipment = {
      id: 'x1',
      launchpadId: pad.id,
      friendId: 'ally:alice',
      owner: 'Bob',
      kiwiIndex: 0,
      resources: { pulp: 100, fiber: 0, seeds: 0, juice: 1e6 },
      departedAt: t,
      arriveAt: t + HOUR_MS,
      returnAt: t + 2 * HOUR_MS,
      status: 'outbound' as const,
    };
    const gift = deliveryOf(shipment, 'Alice', 'alice');
    const me: GameState = {
      ...s,
      resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
      incoming: [gift],
    };
    const before = advance(me, gift.arriveAt - 1).state;
    const r = advance(me, gift.arriveAt);
    const got = r.events.find((e) => e.type === 'cargoReceived');
    expect(got).toMatchObject({ from: 'Alice', deliveryId: 'alice:x1' });
    expect(r.state.incoming).toHaveLength(0);
    expect(r.state.resources.pulp).toBeCloseTo(before.resources.pulp + 100, 3);
    // The juice stops at the storage; the rest is lost and said so.
    expect(r.state.resources.juice).toBeLessThanOrEqual(capacity(r.state).juice + 1e-6);
    expect(got && got.type === 'cargoReceived' && got.lost.juice).toBeGreaterThan(0);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s, t, pad } = colony();
    const sent = run(s, send(pad.id, { pulp: 100 }), t, map);
    const withGift: GameState = {
      ...sent,
      incoming: [
        {
          id: 'a:1',
          from: 'Alice',
          resources: { pulp: 0, fiber: 40, seeds: 10, juice: 0 },
          departedAt: t,
          arriveAt: t + 3 * HOUR_MS,
        },
      ],
    };
    const end = t + 8 * HOUR_MS;
    const big = advance(withGift, end).state;
    let small = withGift;
    for (let at = t; at < end; at += 17 * 60_000) small = advance(small, at).state;
    small = advance(small, end).state;
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 6);
    expect(small.shipments).toEqual(big.shipments);
    expect(small.incoming).toEqual(big.incoming);
  });

  it('migrates older saves with no deliveries', () => {
    const { s } = colony();
    const old = { ...s, schemaVersion: 13 } as Record<string, unknown>;
    delete old.friends;
    delete old.shipments;
    delete old.incoming;
    const m = migrateState(old);
    expect(m.ok && m.state).toMatchObject({ friends: [], shipments: [], incoming: [] });
  });
});
