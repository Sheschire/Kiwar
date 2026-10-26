import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  createMemoryRepository,
  emergeQueen,
  finalInput,
  forecastExpedition,
  foundLock,
  handleGameRequest,
  hiddenDue,
  awaitingServer,
  HOUR_MS,
  LANDING,
  landingOutcome,
  publicState,
  queenFrom,
  queenSetup,
  queenWounds,
  SIEGE,
  simulateBattle,
  validateCommand,
  type Command,
  type GameResponse,
  type GameState,
  type ServiceContext,
  type Villager,
  type VillagerId,
} from '../src';
import { findTile, kiwi, rich, run, setup, siteFor, T0 } from './helpers';

const DAY = 24 * HOUR_MS;

/** A colony at day `day` with a big launchpad, a strong crew, and the twin under 12 beacons. */
function queenColony(day = 10, crewSize = 12, level = 20, seed = 'queen') {
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
  s = cloneState(s);
  s.threats = { ...s.threats, next: null, shieldUntil: T0 + 100 * DAY };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  pad.level = 12;
  const classes = ['warrior', 'mage', 'scout', 'gatherer', 'bard'] as const;
  const crew = Array.from({ length: crewSize }, (_, i): Villager => {
    const v = kiwi(`c${i}`, `Champion${i}`, t);
    v.level = level;
    v.classId = classes[i % 5]!;
    v.stats = { ...v.stats, strength: 16, endurance: 16, agility: 12, dexterity: 12, spirit: 14 };
    v.gear = { weapon: i % 5 === 1 ? 'staff-steel' : 'blade-steel', armor: 'heavy-steel' };
    return v;
  });
  s.villagers = [...s.villagers, ...crew, kiwi('g0', 'Guard', t)];
  const id = s.targets[0]!.id;
  s.faceViews = {
    [id]: {
      beacons: Array.from({ length: 12 }, (_, sector) => ({ sector, since: t })),
      parcels: {},
    },
  };
  s.faceViews[id]!.beacons[3]!.guards = ['g0' as VillagerId];
  s.villagers.find((v) => v.id === 'g0')!.job = { kind: 'outpost', sector: 3, targetId: id };
  s.now = T0 + day * DAY;
  // No attack on the beacons during these tests (they would take the bare ones).
  s.faceViews[id]!.lastAttackAt = s.now + 30 * DAY;
  s.resources = { pulp: 50_000, fiber: 50_000, seeds: 50_000, juice: 50_000 };
  return { map, s, id, padId: pad.id, crew: crew.map((v) => v.id) };
}

const final = (padId: string, targetId: string, crew: string[]): Command => ({
  type: 'launchExpedition',
  launchpadId: padId as never,
  targetId,
  crew: crew as VillagerId[],
  provisions: { pulp: 500, juice: 300 },
  mission: 'final',
  orders: { ...LANDING.defaultOrders, retreatAt: 0.8 },
});

describe('the ferret queen (chantier 42)', () => {
  it('comes out once 12 beacons light the twin, and only then', () => {
    const { s, id } = queenColony();
    const eleven = cloneState(s);
    eleven.faceViews[id]!.beacons.pop();
    expect(emergeQueen(eleven, id, s.now)).toBe(false);
    expect(emergeQueen(publicState(cloneState(s)), id, s.now)).toBe(false);
    const st = cloneState(s);
    expect(emergeQueen(st, id, s.now)).toBe(true);
    const q = st.faceViews[id]!.queen!;
    expect(q.sector).toBeLessThan(6);
    expect(q.ground).toBeGreaterThan(SIEGE.queen.ground * SIEGE.queen.spread[0] - 1);
    expect(st.aliens![id]!.civ!.royalSeen).toBe(true);
    expect(emergeQueen(st, id, s.now)).toBe(false);
  });

  it('waits for her public date even under 12 beacons (chantier 47)', () => {
    const { s, id } = queenColony(3);
    const date = queenFrom(s);
    expect(date).toBe(s.createdAt + SIEGE.queenFromH * HOUR_MS);
    expect(date).toBeGreaterThan(s.now);
    expect(emergeQueen(cloneState(s), id, s.now)).toBe(false);
    const early = advance(s, date - 1).state;
    expect(early.faceViews[id]!.queen).toBeUndefined();
    const { state, events } = advance(s, date + HOUR_MS);
    expect(state.faceViews[id]!.queen!.since).toBe(date);
    expect(events.filter((e) => e.type === 'queenEmerged')).toEqual([
      { type: 'queenEmerged', at: date, targetId: id, sector: state.faceViews[id]!.queen!.sector },
    ]);
    // Exact offline: the same in two steps.
    const twice = advance(advance(s, date - DAY).state, date + HOUR_MS).state;
    expect(twice.faceViews[id]!.queen).toEqual(state.faceViews[id]!.queen);
  });

  it('needs the 12 beacons at her date: a fallen one delays her until it shines again', () => {
    const { s, id } = queenColony(3);
    const date = queenFrom(s);
    const st = cloneState(s);
    const lost = st.faceViews[id]!.beacons.pop()!;
    const waiting = advance(st, date + DAY).state;
    expect(waiting.faceViews[id]!.queen).toBeUndefined();
    const relit = cloneState(waiting);
    relit.faceViews[id]!.beacons.push({ ...lost, since: relit.now });
    const { state, events } = advance(relit, relit.now + HOUR_MS);
    expect(state.faceViews[id]!.queen!.since).toBe(relit.now);
    expect(events.some((e) => e.type === 'queenEmerged')).toBe(true);
  });

  it('is brought out at her date by the server when the client cannot', async () => {
    const repo = createMemoryRepository();
    let now = T0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => 'secret-queen-date',
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i % 256),
    };
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const base = queenColony(3);
    const s = cloneState({ ...base.s, aliens: game.state.aliens, createdAt: game.state.createdAt });
    const id = s.targets[0]!.id;
    s.faceViews = { [id]: base.s.faceViews[base.id]! };
    for (const v of s.villagers) if (v.job.kind === 'outpost') v.job = { ...v.job, targetId: id };
    const date = queenFrom(s);
    const pub = publicState(cloneState(s));
    expect(hiddenDue(pub, date - 1)).toEqual([]);
    expect(awaitingServer(pub, date - 1)).toBe(false);
    expect(hiddenDue(pub, date + 1000)).toEqual([date]);
    expect(awaitingServer(pub, date + 1000)).toBe(true);
    repo.games.set(game.id, { ...game, state: s });
    now = date + 1000;
    const r: GameResponse = await handleGameRequest(ctx, { action: 'load' });
    expect(JSON.stringify(r)).not.toMatch(/"aliens":\{|"civ":\{|"keys":\[|"fights":\[/);
    expect(r.state!.faceViews[id]!.queen!.since).toBe(date);
  });

  it('comes out when a landing lights the last beacon (an event)', () => {
    const { s, id, padId, crew, map } = queenColony(10, 16, 30);
    const st = cloneState(s);
    const last = st.faceViews[id]!.beacons.pop()!.sector;
    const land: Command = {
      type: 'launchExpedition',
      launchpadId: padId as never,
      targetId: id,
      crew: crew as VillagerId[],
      provisions: { pulp: 500, juice: 300 },
      mission: 'land',
      sector: last,
      orders: LANDING.defaultOrders,
    };
    const after = run(st, land, st.now, map);
    const e = after.expeditions.at(-1)!;
    const { state, events } = advance(after, e.arriveAt + 1);
    expect(state.expeditions.find((x) => x.id === e.id)!.result!.outcome).toBe('victory');
    expect(state.faceViews[id]!.queen).toBeDefined();
    expect(events.some((x) => x.type === 'queenEmerged')).toBe(true);
  });

  it('fights in phases: bats under 75 %, elites under 50 %, all flee when she falls', () => {
    const { s, id, crew } = queenColony(10, 16, 25);
    const st = cloneState(s);
    emergeQueen(st, id, st.now);
    const members = st.villagers.filter((v) => crew.includes(v.id));
    const setupB = queenSetup(st, members, finalInput(st, id, LANDING.defaultOrders, 1, st.now)!);
    expect(setupB.leader).toBe('queen');
    const waking = setupB.units.filter((u) => u.wake);
    expect(waking.some((u) => u.flying && u.wake!.below === SIEGE.final.swarm.below)).toBe(true);
    expect(waking.some((u) => !u.flying && u.wake!.below === SIEGE.final.tunnels.below)).toBe(true);
    const log = simulateBattle(setupB, 'phases');
    // Nobody of a phase came in before the battle started, and the journal is replayable.
    expect(log.result.leaderLeft).toBeDefined();
    expect(landingOutcome(log)).toBe('victory');
    expect(log.result.leaderLeft).toBe(0);
  });

  it('is locked until she is out, then conquers the twin and opens the second colony', () => {
    const { s, id, padId, crew, map } = queenColony(10, 16, 30);
    const eleven = cloneState(s);
    eleven.faceViews[id]!.beacons.pop();
    expect(validateCommand(eleven, final(padId, id, crew), { now: s.now, map })).toBe(
      'queenHidden',
    );
    const st = cloneState(s);
    emergeQueen(st, id, st.now);
    const f = forecastExpedition(st, final(padId, id, crew) as never)!;
    expect(f.landing?.knowledge).toBe('seen');
    expect(f.landing?.trials).toHaveLength(3);
    let after = run(st, final(padId, id, crew), st.now, map);
    const e = after.expeditions.at(-1)!;
    expect(e.sector).toBe(st.faceViews[id]!.queen!.sector);
    // The client cannot tell the outcome: only the truth resolves it.
    const blind = advance(publicState(after), e.arriveAt + 1).state;
    expect(blind.expeditions.at(-1)!.status).toBe('outbound');
    after = advance(after, e.arriveAt + 1).state;
    const done = after.expeditions.find((x) => x.id === e.id)!;
    expect(done.result?.outcome).toBe('victory');
    expect(done.result!.queenFallen).toBe(true);
    expect(after.siege.conqueredAt).toBe(e.arriveAt);
    expect(Object.keys(after.faceViews[id]!.parcels)).toHaveLength(12);
    // The guard flies home with the ship.
    expect(done.crew).toContain('g0');
    expect(foundLock(after)).toBeNull();
    // Nothing attacks the conquered twin.
    expect(advance(after, after.now + 5 * DAY).state.faceViews[id]!.attack ?? null).toBeNull();
  });

  it('keeps her wounds after our defeat, healing them over time', () => {
    const { s, id, padId, map } = queenColony(14, 6, 10);
    const st = cloneState(s);
    emergeQueen(st, id, st.now);
    const few = st.villagers.filter((v) => v.id.startsWith('c')).map((v) => v.id);
    let after = run(st, final(padId, id, few), st.now, map);
    const e = after.expeditions.at(-1)!;
    after = advance(after, e.arriveAt + 1).state;
    const q = after.faceViews[id]!.queen!;
    expect(after.siege.conqueredAt).toBe(0);
    expect(q.wounds?.share ?? 0).toBeGreaterThan(0);
    const now = q.wounds!.at;
    expect(queenWounds(q, now)).toBeCloseTo(q.wounds!.share, 5);
    expect(queenWounds(q, now + SIEGE.final.healMs / 2)).toBeCloseTo(q.wounds!.share / 2, 5);
    expect(queenWounds(q, now + SIEGE.final.healMs)).toBe(0);
  });

  it('is resolved by the server, never leaking the truth', async () => {
    const repo = createMemoryRepository();
    let now = T0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => 'secret-queen',
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i % 256),
    };
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const base = queenColony(10, 16, 30);
    const s = cloneState({ ...base.s, aliens: game.state.aliens });
    const id = s.targets[0]!.id;
    s.faceViews = { [id]: base.s.faceViews[base.id]! };
    for (const v of s.villagers) if (v.job.kind === 'outpost') v.job = { ...v.job, targetId: id };
    emergeQueen(s, id, s.now);
    const launched = run(s, final(base.padId, id, base.crew), s.now, base.map);
    repo.games.set(game.id, { ...game, state: launched });
    now = launched.expeditions.at(-1)!.arriveAt + 1000;
    const r: GameResponse = await handleGameRequest(ctx, { action: 'load' });
    expect(JSON.stringify(r)).not.toMatch(/"aliens":\{|"civ":\{|"keys":\[|"fights":\[/);
    expect(r.state!.expeditions.at(-1)!.result?.outcome).toBeDefined();
  });
});
