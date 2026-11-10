import { describe, expect, it } from 'vitest';
import {
  advance,
  createMemoryRepository,
  handleGameRequest,
  HOUR_MS,
  PVP,
  type GameResponse,
  type GameState,
  type ServiceContext,
  type Villager,
} from '../src';
import { findTileForTest } from './serverHelpers';
import { kiwi } from './helpers';

const DAY = 24 * HOUR_MS;

function world() {
  const repo = createMemoryRepository();
  let now = 1_700_000_000_000;
  let n = 0;
  const as = (userId: string): ServiceContext => ({
    repo,
    userId,
    now: () => now,
    randomSeed: () => `seed-${++n}`,
    randomBytes: (len) => Uint8Array.from({ length: len }, (_, i) => (n * 31 + i * 17) % 256),
  });
  return { repo, as, tick: (ms: number) => (now += ms), now: () => now };
}

const ok = (r: GameResponse) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r as Extract<GameResponse, { ok: true }> & { state: GameState };
};

/** Alice and Bob in a universe (PvP or not), four days in, Bob out of the beginners' age. */
async function universe(pvp = true) {
  const w = world();
  const u = ok(
    await handleGameRequest(w.as('alice'), {
      action: 'createUniverse',
      name: 'Arena',
      displayName: 'Alice',
      ...(pvp ? { pvp: true } : {}),
    }),
  ).universe!;
  ok(
    await handleGameRequest(w.as('bob'), {
      action: 'joinUniverse',
      code: u.code,
      displayName: 'Bob',
    }),
  );
  w.tick(4 * DAY);
  // Both colonies are brought to now (the server saves what it resolved; the client advances).
  for (const who of ['alice', 'bob']) {
    const g = (await w.repo.findGame(who, u.id))!;
    await w.repo.update(g.id, advance(g.state, w.now()).state, g.version);
  }
  // Alice: a launchpad and six warriors. Bob: a monument (Stone age) and a full store.
  const a = (await w.repo.findGame('alice', u.id))!;
  const flesh = findTileForTest(a.state, 'flesh');
  const warriors: Villager[] = Array.from({ length: 6 }, (_, i) => ({
    ...kiwi(`ax${i}`, `Raider${i}`, a.state.now),
    level: 15,
    classId: 'warrior',
  }));
  await w.repo.update(
    a.id,
    {
      ...a.state,
      resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 },
      villagers: [...a.state.villagers, ...warriors],
      buildings: [
        ...a.state.buildings,
        {
          id: 'b-pad' as never,
          type: 'launchpad',
          q: flesh.q,
          r: flesh.r,
          level: 1,
          richness: 1,
          builtAt: a.state.now,
        },
      ],
    },
    a.version,
  );
  const b = (await w.repo.findGame('bob', u.id))!;
  const mon = findTileForTest(b.state, 'flesh');
  await w.repo.update(
    b.id,
    {
      ...b.state,
      resources: { pulp: 2000, fiber: 2000, seeds: 2000, juice: 2000 },
      buildings: [
        ...b.state.buildings,
        {
          id: 'b-mon' as never,
          type: 'monument',
          q: mon.q,
          r: mon.r,
          level: 1,
          richness: 1,
          builtAt: b.state.now,
        },
      ],
      threats: { ...b.state.threats, next: null, shieldUntil: w.now() + 100 * DAY },
    },
    b.version,
  );
  // Bob plays (an absent colony is protected).
  ok(await handleGameRequest(w.as('bob'), { action: 'load', universe: u.id }));
  return { ...w, u };
}

const raid = (universe: string) => ({
  action: 'command' as const,
  universe,
  command: {
    type: 'raidPlayer' as const,
    launchpadId: 'b-pad',
    targetId: 'ally:bob',
    crew: ['ax0', 'ax1', 'ax2', 'ax3'],
    provisions: { pulp: 100, juice: 100 },
    sector: 'front' as const,
    orders: { posture: 'bold' as const, retreatAt: 0.5 },
  },
});

describe('chantier 57: PvP on the server', () => {
  it('only in PvP universes', async () => {
    const { as, u } = await universe(false);
    expect(u.pvp).toBeUndefined();
    const r = await handleGameRequest(as('alice'), raid(u.id));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('notPvp');
  });

  it('lists the other members as targets and shows their protection', async () => {
    const w = world();
    const u = ok(
      await handleGameRequest(w.as('alice'), {
        action: 'createUniverse',
        name: 'Arena',
        displayName: 'Alice',
        pvp: true,
      }),
    ).universe!;
    expect(u.pvp).toBe(true);
    ok(
      await handleGameRequest(w.as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'Bob',
      }),
    );
    const alice = ok(await handleGameRequest(w.as('alice'), { action: 'load', universe: u.id }));
    expect(alice.state.pvp.on).toBe(true);
    expect(alice.state.pvp.targets).toMatchObject([{ id: 'ally:bob', owner: 'Bob', distance: 1 }]);
    // Bob just arrived: a beginner.
    expect(alice.allies![0]!.power).toMatchObject({ pvpGuard: 'beginner' });
  });

  it('refuses a beginner', async () => {
    const { as, u, repo } = await universe();
    const b = (await repo.findGame('bob', u.id))!;
    await repo.update(
      b.id,
      { ...b.state, buildings: b.state.buildings.filter((x) => x.type !== 'monument') },
      b.version,
    );
    const r = await handleGameRequest(as('alice'), raid(u.id));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('pvpBeginner');
  });

  it('announces the attack, plays it at the target and brings the news home', async () => {
    const { as, u, repo, tick } = await universe();
    const sent = ok(await handleGameRequest(as('alice'), raid(u.id)));
    const e = sent.state.expeditions.find((x) => x.mission === 'pvp')!;
    expect(sent.state.pvp.attacked).toBe(true);
    // The attacker never gets the target's state.
    expect(JSON.stringify(sent)).not.toContain('"incoming":[{"id":"alice/');

    // Bob is told: who, when, how many — never the crew's units nor the seed.
    const told = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    const r = told.state.pvp.incoming[0]!;
    expect(r).toMatchObject({ from: 'ally:alice', owner: 'Alice', crew: 4, at: e.arriveAt });
    expect(r.units).toBeUndefined();
    expect(r.seed).toBeUndefined();
    expect(JSON.stringify(told)).not.toContain('"units":[');
    const stored = (await repo.findGame('bob', u.id))!;
    expect(stored.state.pvp.incoming[0]!.units).toHaveLength(4);

    // A second attack on Bob is refused within the day.
    const again = await handleGameRequest(as('alice'), raid(u.id));
    expect(again.ok).toBe(false);

    tick(e.arriveAt - told.serverTime + 1000);
    const back = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    const ship = back.state.expeditions.find((x) => x.id === e.id)!;
    expect(ship.result?.outcome).toBeDefined();
    expect(back.events.some((x) => x.type === 'expeditionArrived')).toBe(true);
    // Bob was played and is shielded; the chat line is written once.
    const bob = (await repo.findGame('bob', u.id))!.state;
    expect(bob.pvp.incoming).toHaveLength(0);
    expect(bob.pvp.shieldUntil).toBe(e.arriveAt + PVP.shieldMs);
    expect(bob.threats.reports.at(-1)).toMatchObject({ from: 'pvp', by: 'Alice', dead: [] });
    expect(repo.pvpBattles).toHaveLength(1);
    expect(repo.pvpBattles[0]).toMatchObject({
      attackerId: 'alice',
      attackerName: 'Alice',
      defenderId: 'bob',
      defenderName: 'Bob',
    });
    // Loading again changes nothing.
    ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    const twice = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    expect(twice.state.expeditions.find((x) => x.id === e.id)!.result).toEqual(ship.result);
    expect(repo.pvpBattles).toHaveLength(1);
  });

  it('the target playing first leaves the news for the attacker', async () => {
    const { as, u, repo, tick } = await universe();
    const sent = ok(await handleGameRequest(as('alice'), raid(u.id)));
    const e = sent.state.expeditions.find((x) => x.mission === 'pvp')!;
    tick(e.arriveAt - sent.serverTime + 1000);
    const bob = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    expect(bob.state.pvp.incoming).toHaveLength(0);
    expect(bob.state.pvp.defended).toHaveLength(1);
    expect(repo.pvpBattles).toHaveLength(1);
    const alice = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    const ship = alice.state.expeditions.find((x) => x.id === e.id)!;
    expect(ship.result?.aborted).toBeUndefined();
    expect(ship.result?.outcome).toBeDefined();
    expect(repo.pvpBattles).toHaveLength(1);
  });

  it('an absent target cannot be attacked', async () => {
    const { as, u, repo, tick } = await universe();
    tick(PVP.absentMs + HOUR_MS);
    // Alice played meanwhile; Bob did not.
    ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    expect((await repo.findGame('bob', u.id))!.state.pvp.lastActiveAt).toBeGreaterThan(0);
    const r = await handleGameRequest(as('alice'), raid(u.id));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('pvpAbsent');
  });
});
