import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  awaitingReport,
  cloneState,
  delveForecast,
  delveLock,
  depthsMapOf,
  hazardHits,
  HOUR_MS,
  IRON_SCALE,
  LANDING,
  publicState,
  roomTruth,
  type Command,
  type GameState,
  type VillagerId,
} from '../src';
import { delveColony, run } from './helpers';

const orders = LANDING.defaultOrders;

function crewIds(s: GameState, n: number): VillagerId[] {
  return s.villagers
    .filter((v) => v.id.startsWith('dk'))
    .slice(0, n)
    .map((v) => v.id);
}

function firstRoom(s: GameState) {
  return depthsMapOf(s).rooms.find((r) => r.entrance)!;
}

function delve(s: GameState, roomId: string, crew: VillagerId[]): Command {
  return { type: 'delve', roomId, crew, provisions: { pulp: 200, juice: 200 }, orders };
}

describe('delves (chantier 48)', () => {
  it('needs the tunnel, an open door, a room within reach and a crew that fits', () => {
    const { s } = delveColony();
    const room = firstRoom(s);
    const deep = depthsMapOf(s).rooms.find((r) => r.depth === 3)!;
    expect(delveLock(s, room.id, crewIds(s, 4), orders)).toBeNull();
    expect(delveLock(s, deep.id, crewIds(s, 4), orders)).toBe('roomOutOfReach');
    expect(delveLock(s, 'nope', crewIds(s, 4), orders)).toBe('unknownRoom');
    expect(
      delveLock(
        s,
        room.id,
        s.villagers.slice(0, 9).map((v) => v.id),
        orders,
      ),
    ).toBe('crewTooLarge');
    expect(delveLock(s, room.id, [], orders)).toBe('crewTooSmall');
    expect(delveLock(s, room.id, crewIds(s, 2), { ...orders, retreatAt: 2 })).toBe('invalidOrders');
    const closed = cloneState(s);
    closed.depths.door.closed = true;
    expect(delveLock(closed, room.id, crewIds(s, 2), orders)).toBe('doorClosed');
    const none = cloneState(s);
    none.buildings = none.buildings.filter((b) => b.type !== 'tunnel');
    expect(delveLock(none, room.id, crewIds(s, 2), orders)).toBe('noTunnel');
    const taken = cloneState(s);
    taken.depths.galleries[room.id] = { kind: 'sap', since: s.now };
    expect(delveLock(taken, room.id, crewIds(s, 2), orders)).toBe('roomTaken');
  });

  it('goes down, fights, takes the room and brings the loot and iron up', () => {
    const { map, s: s0 } = delveColony();
    const room = firstRoom(s0);
    const ids = crewIds(s0, 8);
    s0.meteorIron = 0;
    let s = run(s0, delve(s0, room.id, ids), s0.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    expect(e.room).toBe(room.id);
    expect(e.arriveAt - e.departedAt).toBe(HOUR_MS);
    expect(s.villagers.find((v) => v.id === ids[0])!.job.kind).toBe('expedition');
    // Another delve to the same room waits.
    expect(applyCommand(s, delve(s, room.id, crewIds(s, 1)), { now: s.now, map }).ok).toBe(false);
    const before = { ...s.resources };
    s = advance(s, e.arriveAt + 1).state;
    const done = s.expeditions.find((x) => x.id === e.id)!;
    expect(done.result!.outcome).toBe('victory');
    expect(s.depths.galleries[room.id]?.kind).toBe(roomTruth(s.depthSeed!, room).kind);
    expect(s.depths.views[room.id]?.source).toBe('delve');
    for (const id of room.links)
      if (!s.depths.galleries[id]) expect(s.depths.views[id]).toBeDefined();
    expect(done.result!.log).toBeDefined();
    expect(Object.keys(s.bestiary)).toContain('larva');
    s = advance(s, e.returnAt + 1).state;
    const truth = roomTruth(s.depthSeed!, room);
    expect(Math.floor(s.meteorIron / IRON_SCALE)).toBe(truth.iron);
    const gained = Object.entries(truth.loot).some(
      ([r, v]) =>
        (s.resources[r as keyof typeof s.resources] ?? 0) > before[r as keyof typeof before] &&
        v! > 0,
    );
    expect(gained).toBe(true);
    // Nobody died on a room won; the fallen are wounded.
    for (const id of done.result!.injured ?? [])
      expect(s.villagers.find((v) => v.id === id)?.job.kind).toBe('injured');
    expect(s.villagers.filter((v) => ids.includes(v.id))).toHaveLength(ids.length);
  });

  it('kills only on a retreat or a defeat', () => {
    const { map, s: s0 } = delveColony('weak', 1, 2, 1);
    for (const v of s0.villagers) {
      v.classId = null;
      for (const k of Object.keys(v.stats)) v.stats[k as 'strength'] = 1;
    }
    const room = depthsMapOf(s0).rooms.find((r) => r.entrance)!;
    const ids = crewIds(s0, 2);
    let s = run(s0, delve(s0, room.id, ids), s0.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    s = advance(s, e.arriveAt + 1).state;
    const r = s.expeditions.find((x) => x.id === e.id)!.result!;
    expect(r.outcome).not.toBe('victory');
    expect(s.depths.galleries[room.id]).toBeUndefined();
    const dead = ids.filter((id) => !s.villagers.some((v) => v.id === id));
    expect(dead.length).toBe(r.lostInBattle.length);
    expect(dead.length).toBeGreaterThan(0);
    expect(s.memorial.some((m) => dead.includes(m.id as VillagerId))).toBe(true);
  });

  it('waits for the server when the depths seed is hidden', () => {
    const { map, s: s0 } = delveColony();
    const room = firstRoom(s0);
    const s = run(s0, delve(s0, room.id, crewIds(s0, 4)), s0.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    const seen = publicState(s);
    expect(seen.depthSeed).toBeUndefined();
    const later = advance(seen, e.arriveAt + HOUR_MS).state;
    expect(later.expeditions.find((x) => x.id === e.id)!.status).toBe('outbound');
    expect(awaitingReport(later, e.arriveAt + HOUR_MS).map((x) => x.id)).toEqual([e.id]);
    expect(later.depths.galleries).toEqual({});
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s: s0 } = delveColony();
    const room = firstRoom(s0);
    const s = run(s0, delve(s0, room.id, crewIds(s0, 6)), s0.now, map);
    const end = s.now + 3 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now + 7 * 60_000; t < end; t += 7 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.depths).toEqual(big.depths);
    expect(small.expeditions).toEqual(big.expeditions);
    expect(small.villagers).toEqual(big.villagers);
  });

  it('forecasts from what we know, and the hazard is lessened by the stat', () => {
    const { s } = delveColony();
    const room = firstRoom(s);
    const crew = s.villagers.filter((v) => v.id.startsWith('dk')).slice(0, 8);
    const f = delveForecast(s, room.id, crew, orders)!;
    expect(f.knowledge).toBe('unknown');
    expect(f.trials).toHaveLength(3);
    expect(['likely', 'uncertain', 'unlikely']).toContain(f.odds);
    expect(f.possibleHazard).toBe(true);
    const seen = cloneState(s);
    seen.depths.views[room.id] = {
      at: s.now,
      source: 'retreat',
      kind: 'scree',
      units: [{ kind: 'larva', count: 2, level: 2 }],
      hazard: { kind: 'fall', strength: 0.3 },
    };
    const g = delveForecast(seen, room.id, crew, orders)!;
    expect(g.knowledge).toBe('seen');
    expect(g.odds).toBe('likely');
    expect(g.harm).toHaveLength(8);
    // Endurance shields from falls.
    const tough = cloneState(seen);
    for (const v of tough.villagers) v.stats.endurance = 15;
    const h = delveForecast(
      tough,
      room.id,
      tough.villagers.filter((v) => v.id.startsWith('dk')).slice(0, 8),
      orders,
    )!;
    expect(h.harm[0]!.chance).toBeLessThan(g.harm[0]!.chance);
    expect(h.harm[0]!.share).toBeLessThan(g.harm[0]!.share);
    expect(hazardHits(crew, { kind: 'fall', strength: 0.3 }, 'x')).toEqual(
      hazardHits(crew, { kind: 'fall', strength: 0.3 }, 'x'),
    );
  });
});
