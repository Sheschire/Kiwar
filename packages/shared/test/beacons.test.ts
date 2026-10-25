import { describe, expect, it } from 'vitest';
import {
  advance,
  attacksFrom,
  awaitingServer,
  beaconForecast,
  BEACONS,
  cloneState,
  createMemoryRepository,
  deserializeSave,
  fortifyCost,
  handleGameRequest,
  hiddenDue,
  HOUR_MS,
  LANDING,
  publicState,
  serializeSave,
  validateCommand,
  type GameResponse,
  type GameState,
  type ServiceContext,
  type Villager,
  type VillagerId,
} from '../src';
import { findTile, kiwi, rich, run, setup, siteFor, T0 } from './helpers';

const DAY = 24 * HOUR_MS;

/** A colony with a launchpad, kiwis, and beacons on parcels 6, 7 and 8 of the twin face. */
function beaconColony(seed = 'beacons') {
  const { map, state } = setup('kiwisu', seed);
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
  const crowd = Array.from({ length: 10 }, (_, i) => kiwi(`vg${i}`, `Guard${i}`, t));
  s = { ...s, villagers: [...s.villagers, ...crowd] };
  s.threats = { ...s.threats, next: null, shieldUntil: T0 + 100 * DAY };
  const targetId = s.targets[0]!.id;
  s.faceViews = {
    [targetId]: {
      beacons: [6, 7, 8].map((sector) => ({ sector, since: t })),
      parcels: {},
    },
  };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  return { map, s, t, targetId, padId: pad.id };
}

/** Strong armed guards. */
function veterans(s: GameState, ids: string[]): GameState {
  return {
    ...s,
    villagers: s.villagers.map((v): Villager =>
      ids.includes(v.id)
        ? {
            ...v,
            level: 20,
            classId: ids.indexOf(v.id) % 2 === 0 ? 'warrior' : 'mage',
            stats: { ...v.stats, strength: 18, endurance: 18, agility: 14 },
            gear: {
              weapon: ids.indexOf(v.id) % 2 === 0 ? 'blade-steel' : 'staff-steel',
              armor: 'heavy-steel',
            },
          }
        : v,
    ),
  };
}

/** Posts guards on a beacon directly. */
function post(s: GameState, targetId: string, sector: number, ids: string[]): GameState {
  const out = cloneState(s);
  const b = out.faceViews[targetId]!.beacons.find((x) => x.sector === sector)!;
  b.guards = ids as VillagerId[];
  for (const v of out.villagers)
    if (ids.includes(v.id)) v.job = { kind: 'outpost', sector, targetId };
  return out;
}

/** Runs to the next strike on the face; returns the state after it. */
function toStrike(s: GameState, targetId: string): GameState {
  let st = advance(s, s.now).state;
  const a = st.faceViews[targetId]!.attack!;
  st = advance(st, a.announceAt).state;
  return advance(st, st.faceViews[targetId]!.attack?.at ?? a.at).state;
}

describe('attacks on our beacons (chantier 42)', () => {
  it('are planned on a public schedule from the civilisation of the Iron age', () => {
    const { s, targetId } = beaconColony();
    const st = advance(s, s.now).state;
    const a = st.faceViews[targetId]!.attack!;
    expect(a.announced).toBe(false);
    expect(a.sector).toBeNull();
    const [lo, hi] = BEACONS.attack.intervalMs;
    const from = attacksFrom(s, 0);
    expect(a.at).toBeGreaterThanOrEqual(from + lo);
    expect(a.at).toBeLessThanOrEqual(from + hi);
    expect(a.at - a.announceAt).toBe(BEACONS.attack.noticeMs);
    // Public: the client plans the same time without the truth.
    const blind = advance(publicState(s), s.now).state;
    expect(blind.faceViews[targetId]!.attack).toEqual(a);
  });

  it('waits for the server to announce and to strike', () => {
    const { s, targetId } = beaconColony();
    const planned = advance(s, s.now).state;
    const a = planned.faceViews[targetId]!.attack!;
    const client = advance(publicState(planned), a.announceAt + HOUR_MS).state;
    expect(client.faceViews[targetId]!.attack!.announced).toBe(false);
    expect(awaitingServer(client, a.announceAt + HOUR_MS)).toBe(true);
    expect(hiddenDue(client, a.announceAt + HOUR_MS)).toContain(a.announceAt);
    const told = advance(planned, a.announceAt).state.faceViews[targetId]!.attack!;
    expect(told.announced).toBe(true);
    expect([6, 7, 8]).toContain(told.sector);
    expect(told.origin).not.toBeNull();
  });

  it('takes a bare beacon without a fight: the fog comes back, nobody dies', () => {
    const { s, targetId } = beaconColony();
    const before = s.villagers.length;
    const st = toStrike(s, targetId);
    const face = st.faceViews[targetId]!;
    const report = face.reports![0]!;
    expect(report.fought).toBe(false);
    expect(report.held).toBe(false);
    expect(face.beacons.map((b) => b.sector)).not.toContain(report.sector);
    expect(face.parcels[String(report.sector)]).toBeUndefined();
    expect(st.villagers.length).toBe(before);
    expect(face.attacks).toBe(1);
    // The next attack is planned on the remaining beacons.
    expect(advance(st, st.now).state.faceViews[targetId]!.attack).toBeTruthy();
  });

  it('fights with the guard: a fallen beacon loses its dead, a held one keeps the survivors', () => {
    const { s, targetId } = beaconColony();
    const ids = ['vg0', 'vg1', 'vg2', 'vg3', 'vg4', 'vg5', 'vg6', 'vg7', 'vg8', 'vg9'];
    let st = veterans(s, ids);
    for (const sector of [6, 7, 8]) st = post(st, targetId, sector, []);
    // Find which beacon is attacked, then guard that one.
    const planned = advance(st, st.now).state;
    const told = advance(planned, planned.faceViews[targetId]!.attack!.announceAt).state;
    const sector = told.faceViews[targetId]!.attack!.sector!;
    const guarded = post(told, targetId, sector, ids);
    const after = advance(guarded, told.faceViews[targetId]!.attack!.at).state;
    const report = after.faceViews[targetId]!.reports![0]!;
    expect(report.fought).toBe(true);
    expect(report.log).toBeDefined();
    const alive = new Set(after.villagers.map((v) => v.id as string));
    for (const name of report.dead)
      expect(after.memorial.some((m) => m.name === name && m.cause === 'battle')).toBe(true);
    const b = after.faceViews[targetId]!.beacons.find((x) => x.sector === sector);
    if (report.held) {
      expect(b).toBeDefined();
      for (const id of b!.guards ?? []) expect(alive.has(id)).toBe(true);
    } else expect(b).toBeUndefined();
    // Those who flew home are on their way.
    const home = after.expeditions.filter((e) => e.mission === 'retreat');
    expect(home.reduce((n, e) => n + e.crew.length, 0)).toBe(report.back);
  });

  it('keeps its fallen alive when it holds: they fly home wounded (chantier 46)', () => {
    const { s, targetId } = beaconColony();
    const ids = ['vg0', 'vg1', 'vg2', 'vg3', 'vg4', 'vg5'];
    // Three veterans and three ordinary kiwis: the beacon holds, an ordinary one falls.
    let st = veterans(s, ids.slice(0, 3));
    const planned = advance(st, st.now).state;
    const told = advance(planned, planned.faceViews[targetId]!.attack!.announceAt).state;
    const sector = told.faceViews[targetId]!.attack!.sector!;
    st = post(told, targetId, sector, ids);
    const after = advance(st, told.faceViews[targetId]!.attack!.at).state;
    const report = after.faceViews[targetId]!.reports![0]!;
    expect(report.held).toBe(true);
    expect(report.dead).toEqual([]);
    expect(report.hurt?.length).toBeGreaterThan(0);
    expect(after.memorial.some((m) => m.cause === 'battle')).toBe(false);
    // The wounded leave the guard and fly home, where they heal.
    const b = after.faceViews[targetId]!.beacons.find((x) => x.sector === sector)!;
    const ship = after.expeditions.find((e) => e.mission === 'retreat')!;
    expect(ship.result!.injured).toHaveLength(report.hurt!.length);
    for (const id of ship.result!.injured!) expect(b.guards).not.toContain(id);
    const home = advance(after, ship.returnAt + 1).state;
    for (const id of ship.result!.injured!)
      expect(home.villagers.find((v) => v.id === id)!.job.kind).toBe('injured');
    // The forecast says the same: wounded, nobody dead.
    const f = beaconForecast(
      st,
      targetId,
      sector,
      told.faceViews[targetId]!.attack!.origin!,
      st.now,
    );
    if (f?.trials[1]) expect(f.expectedDead).toBe(0);
  });

  it('fortifies from home: paid, ready after its time, then counted', () => {
    const { s, t, targetId, map } = beaconColony();
    let st = cloneState(s);
    st.meteorIron = 1e15;
    const cost = fortifyCost(st);
    const cmd = { type: 'fortifyBeacon' as const, targetId, sector: 7 };
    expect(validateCommand(st, cmd, { now: t, map })).toBeNull();
    expect(validateCommand(st, { ...cmd, sector: 2 }, { now: t, map })).toBe('noBeacon');
    const res = { ...st.resources };
    st = run(st, cmd, t, map);
    for (const r of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(st.resources[r]).toBeCloseTo(res[r] - cost.resources[r], 0);
    expect(validateCommand(st, cmd, { now: t, map })).toBe('fortifying');
    const b = () => st.faceViews[targetId]!.beacons.find((x) => x.sector === 7)!;
    expect(b().fort).toBeUndefined();
    const { state, events } = advance(st, t + BEACONS.fortify.durationMs);
    st = state;
    expect(b().fort).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'beaconFortified')).toBe(true);
    expect(validateCommand(st, cmd, { now: st.now, map })).toBe('alreadyFortified');
    // The forecast now counts the turrets.
    const f = beaconForecast(st, targetId, 7, 6, st.now)!;
    expect(f.bare).toBe(false);
    expect(f.trials).toHaveLength(3);
  });

  it('posts a guard by ship and brings it back home', () => {
    const { s, t, targetId, padId, map } = beaconColony();
    let st = run(
      s,
      {
        type: 'launchExpedition',
        launchpadId: padId,
        targetId,
        crew: ['vg0', 'vg1', 'vg2'] as VillagerId[],
        provisions: { pulp: 200, juice: 100 },
        mission: 'guard',
        sector: 7,
        orders: { ...LANDING.defaultOrders, retreatAt: 0.3 },
      },
      t,
      map,
    );
    const e = st.expeditions.at(-1)!;
    // Nothing hidden: the client resolves it.
    st = advance(publicState(st), e.arriveAt + 1).state;
    const b = st.faceViews[targetId]!.beacons.find((x) => x.sector === 7)!;
    expect(b.guards).toEqual(['vg0', 'vg1', 'vg2']);
    expect(b.orders!.retreatAt).toBe(0.3);
    expect(st.villagers.find((v) => v.id === 'vg0')!.job).toEqual({
      kind: 'outpost',
      sector: 7,
      targetId,
    });
    st = advance(st, e.returnAt + 1).state;
    // An empty ship relieves two of them.
    const cmd = {
      type: 'launchExpedition' as const,
      launchpadId: padId,
      targetId,
      crew: [] as VillagerId[],
      provisions: { pulp: 100, juice: 50 },
      mission: 'guard' as const,
      sector: 7,
      bringBack: ['vg0', 'vg1'] as VillagerId[],
    };
    expect(
      validateCommand(st, { ...cmd, bringBack: ['vg5'] as VillagerId[] }, { now: st.now, map }),
    ).toBe('invalidCrew');
    st = run(st, cmd, st.now, map);
    const back = st.expeditions.at(-1)!;
    st = advance(st, back.returnAt + 1).state;
    expect(st.faceViews[targetId]!.beacons.find((x) => x.sector === 7)!.guards).toEqual(['vg2']);
    expect(st.villagers.find((v) => v.id === 'vg0')!.job.kind).not.toBe('outpost');
  });

  it('gives the same result in one big step or many small ones', () => {
    const { s, targetId } = beaconColony('offline');
    let start = veterans(s, ['vg0', 'vg1', 'vg2', 'vg3']);
    start = post(start, targetId, 7, ['vg0', 'vg1', 'vg2', 'vg3']);
    start.faceViews[targetId]!.beacons.find((b) => b.sector === 6)!.fort = 6;
    const end = attacksFrom(s, 0) + 3 * DAY;
    const big = advance(cloneState(start), end).state;
    let small = cloneState(start);
    for (let t = start.now; t < end; t += 5 * HOUR_MS + 7 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.faceViews).toEqual(big.faceViews);
    expect(small.villagers.map((v) => v.id)).toEqual(big.villagers.map((v) => v.id));
    expect(big.faceViews[targetId]!.attacks ?? 0).toBeGreaterThan(0);
  });

  it('keeps everything through a save', () => {
    const { s, targetId } = beaconColony();
    const st = toStrike(post(s, targetId, 7, ['vg0']), targetId);
    const back = deserializeSave(serializeSave(st, st.now));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.save.state.faceViews).toEqual(st.faceViews);
  });

  it('is resolved by the server on load, never leaking the truth', async () => {
    const repo = createMemoryRepository();
    let now = T0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => 'secret-beacons',
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i % 256),
    };
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const s = cloneState(game.state);
    const id = s.targets[0]!.id;
    s.threats = { ...s.threats, next: null, shieldUntil: T0 + 100 * DAY };
    s.faceViews = { [id]: { beacons: [{ sector: 7, since: T0 }], parcels: {} } };
    // The attack is planned by any advance (public), as after the landing that lit the beacon.
    repo.games.set(game.id, { ...game, state: advance(s, s.now).state });
    now = attacksFrom(s, 0) + 2 * DAY;
    const r: GameResponse = await handleGameRequest(ctx, { action: 'load' });
    expect(JSON.stringify(r)).not.toMatch(/"aliens":\{|"civ":\{|"keys":\[|"fights":\[/);
    expect(r.state!.faceViews[id]!.reports?.length ?? 0).toBeGreaterThan(0);
  });
});
