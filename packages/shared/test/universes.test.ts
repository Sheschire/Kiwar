import { describe, expect, it } from 'vitest';
import {
  advance,
  assignFace,
  alienDefOf,
  createMemoryRepository,
  handleGameRequest,
  kiwiCount,
  planetSeedOf,
  universeTargets,
  type GameResponse,
  type GameState,
  type ServiceContext,
} from '../src';
import { findTileForTest } from './serverHelpers';

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
  return { repo, as, tick: (ms: number) => (now += ms) };
}

const ok = (r: GameResponse) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r as Extract<GameResponse, { ok: true }> & { state: GameState };
};

describe('universe helpers', () => {
  it('gives every player a kiwi of their own, with an alien twin face', () => {
    const members: { kiwiIndex: number; face: 'kiwisu' | 'kiwino' }[] = [];
    for (let i = 0; i < 8; i++) members.push(assignFace(members));
    expect(members.slice(0, 3)).toEqual([
      { kiwiIndex: 0, face: 'kiwisu' },
      { kiwiIndex: 1, face: 'kiwisu' },
      { kiwiIndex: 2, face: 'kiwisu' },
    ]);
    for (let p = 1; p <= 8; p++) {
      const ms = members.slice(0, p);
      expect(kiwiCount(ms)).toBe(p);
      // Everyone's twin is an alien face at distance 0.
      for (const me of ms)
        expect(universeTargets(ms, me).filter((t) => t.distance === 0)).toHaveLength(1);
    }
    // A kiwi freed by a player who left is given again.
    expect(assignFace([{ kiwiIndex: 1, face: 'kiwino' }])).toEqual({
      kiwiIndex: 0,
      face: 'kiwisu',
    });
    // Older universes with two players on a kiwi still get an extra alien kiwi.
    expect(
      kiwiCount([
        { kiwiIndex: 0, face: 'kiwisu' },
        { kiwiIndex: 0, face: 'kiwino' },
      ] as never),
    ).toBe(2);
  });

  it('targets only alien faces, nearest first, harder and richer further away', () => {
    const t = universeTargets(
      [
        { kiwiIndex: 0, face: 'kiwisu' },
        { kiwiIndex: 0, face: 'kiwino' },
      ],
      { kiwiIndex: 0, face: 'kiwisu' },
    );
    expect(t.map((x) => x.id)).toEqual(['aliens:1:kiwisu', 'aliens:1:kiwino']);
    expect(t[0]!.distance).toBe(1);
    const solo = universeTargets([{ kiwiIndex: 0, face: 'kiwisu' }], {
      kiwiIndex: 0,
      face: 'kiwisu',
    });
    expect(solo[0]!.travelMs).toBeLessThan(t[0]!.travelMs);
    expect(alienDefOf(solo[0]!.distance).defense).toBeLessThan(alienDefOf(t[0]!.distance).defense);
    expect(alienDefOf(0).loot.seeds).toBeLessThan(alienDefOf(1).loot.seeds);
  });
});

describe('shared universes (server)', () => {
  it('creates a universe, invites friends by code and gives each a face', async () => {
    const { as, tick } = world();
    const created = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Les Kiwis',
        displayName: 'Alice',
      }),
    );
    const u = created.universe!;
    expect(u.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(created.state).toMatchObject({ face: 'kiwisu', kiwiId: 'k0', universeId: u.id });
    expect(created.state.targets.map((t) => t.id)).toEqual(['aliens:0:kiwino']);

    tick(5 * 3_600_000);
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code.toLowerCase(),
        displayName: 'Bob',
      }),
    );
    expect(bob.state).toMatchObject({ face: 'kiwisu', kiwiId: 'k1' });
    // A kiwi of their own, with its own alien half.
    expect(bob.state.seed).not.toBe(created.state.seed);
    expect(bob.state.targets.map((t) => t.id)).toEqual(['aliens:1:kiwino', 'aliens:0:kiwino']);
    // One shared calendar: Bob joins five hours later but lives the same days and seasons.
    expect(bob.state.calendarStart).toBe(created.state.calendarStart);
    expect(bob.state.createdAt).toBe(created.state.createdAt + 5 * 3_600_000);
    expect(bob.universe!.members.map((m) => m.displayName)).toEqual(['Alice', 'Bob']);

    // Alice keeps her own alien twin and may also raid Bob's, further away.
    const aliceLoad = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    // She sees Bob's colony far away (layout only), not on her twin face.
    expect(aliceLoad.twin).toBeNull();
    expect(aliceLoad.allies).toMatchObject([{ owner: 'Bob', kiwiIndex: 1, seed: bob.state.seed }]);
    expect(aliceLoad.allies![0]).not.toHaveProperty('resources');
    expect(aliceLoad.state.targets.map((t) => t.id)).toEqual([
      'aliens:0:kiwino',
      'aliens:1:kiwino',
    ]);

    // Joining again is idempotent.
    const again = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'Bob',
      }),
    );
    expect(again.universe!.members).toHaveLength(2);

    const list = await handleGameRequest(as('bob'), { action: 'listUniverses' });
    expect(list.ok && list.universes?.map((x) => x.name)).toEqual(['Les Kiwis']);
  });

  it('keeps the solo colony separate from universe colonies', async () => {
    const { as } = world();
    const solo = ok(await handleGameRequest(as('alice'), { action: 'load' }));
    const created = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'U',
        displayName: 'A',
      }),
    );
    expect(created.state.universeId).not.toBe(solo.state.universeId);
    const soloAgain = ok(await handleGameRequest(as('alice'), { action: 'load' }));
    expect(soloAgain.state).toEqual(solo.state);
  });

  it('refuses strangers, unknown codes and full universes', async () => {
    const { as } = world();
    const u = ok(
      await handleGameRequest(as('owner'), {
        action: 'createUniverse',
        name: 'U',
        displayName: 'O',
      }),
    ).universe!;
    expect(
      await handleGameRequest(as('stranger'), { action: 'load', universe: u.id }),
    ).toMatchObject({ error: 'forbidden' });
    expect(
      await handleGameRequest(as('stranger'), {
        action: 'command',
        universe: u.id,
        command: { type: 'hatchEgg' },
      }),
    ).toMatchObject({ error: 'forbidden' });
    expect(
      await handleGameRequest(as('x'), {
        action: 'joinUniverse',
        code: 'ZZZZZZZZ',
        displayName: 'X',
      }),
    ).toMatchObject({
      error: 'universeNotFound',
    });
    for (let i = 1; i < 8; i++)
      ok(
        await handleGameRequest(as(`p${i}`), {
          action: 'joinUniverse',
          code: u.code,
          displayName: `P${i}`,
        }),
      );
    expect(
      await handleGameRequest(as('p9'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'P9',
      }),
    ).toMatchObject({
      error: 'universeFull',
    });
  });

  it('plays commands inside a universe', async () => {
    const { as } = world();
    const u = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'U',
        displayName: 'A',
      }),
    ).universe!;
    const r = ok(
      await handleGameRequest(as('alice'), {
        action: 'command',
        universe: u.id,
        command: { type: 'hatchEgg' },
      }),
    );
    expect(r.state.egg).not.toBeNull();
  });

  it('lets a player who joined build, and keeps the building after a reload', async () => {
    const { as } = world();
    const u = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'U',
        displayName: 'A',
      }),
    ).universe!;
    const joined = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'B',
      }),
    );
    const flesh = findTileForTest(joined.state, 'flesh');
    const built = ok(
      await handleGameRequest(as('bob'), {
        action: 'command',
        universe: u.id,
        command: { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      }),
    );
    expect(built.state.queue).toHaveLength(1);
    const loaded = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    expect(loaded.state.queue).toHaveLength(1);
  });
});

describe('deliveries between allies (server)', () => {
  it('flies a gift to an ally, who gets it when the ship lands', async () => {
    const { as, tick, repo } = world();
    const u = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Gifts',
        displayName: 'Alice',
      }),
    ).universe!;
    ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'Bob',
      }),
    );
    const alice = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    expect(alice.state.friends).toMatchObject([{ id: 'ally:bob', owner: 'Bob', distance: 1 }]);
    expect(alice.allies![0]).toMatchObject({ friendId: 'ally:bob' });
    expect(alice.allies![0]!.room!.pulp).toBeGreaterThan(0);
    // Give Alice a launchpad straight away (building it is tested elsewhere).
    const stored = (await repo.findGame('alice', u.id))!;
    const flesh = findTileForTest(stored.state, 'flesh');
    await repo.update(
      stored.id,
      {
        ...stored.state,
        resources: { pulp: 900, fiber: 900, seeds: 900, juice: 900 },
        buildings: [
          ...stored.state.buildings,
          {
            id: 'b-pad' as never,
            type: 'launchpad',
            q: flesh.q,
            r: flesh.r,
            level: 1,
            richness: 1,
            builtAt: stored.state.now,
          },
        ],
      },
      stored.version,
    );
    const sent = ok(
      await handleGameRequest(as('alice'), {
        action: 'command',
        universe: u.id,
        command: {
          type: 'sendCargo',
          launchpadId: 'b-pad',
          friendId: 'ally:bob',
          resources: { seeds: 40 },
        },
      }),
    );
    const shipment = sent.state.shipments[0]!;
    // Bob sees it coming, and gets it when it lands.
    const coming = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    expect(coming.state.incoming).toMatchObject([{ from: 'Alice', resources: { seeds: 40 } }]);
    const seedsBefore = coming.state.resources.seeds;
    tick(shipment.arriveAt - sent.serverTime + 1);
    const landed = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    const after = advance(landed.state, landed.serverTime);
    expect(after.state.incoming).toHaveLength(0);
    expect(after.state.resources.seeds).toBeGreaterThanOrEqual(seedsBefore + 40);
    expect(after.events.some((e) => e.type === 'cargoReceived')).toBe(true);
  });
});

describe('founding a universe with the solo colony', () => {
  it('moves the colony into the new universe and starts the solo slot over', async () => {
    const { as, tick } = world();
    const solo = ok(await handleGameRequest(as('alice'), { action: 'load' }));
    const tile = findTileForTest(solo.state, 'flesh');
    ok(
      await handleGameRequest(as('alice'), {
        action: 'command',
        command: { type: 'build', buildingType: 'pulpery', q: tile.q, r: tile.r },
      }),
    );
    tick(3 * 3_600_000);
    const created = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Home',
        displayName: 'Alice',
        fromSolo: true,
      }),
    );
    const u = created.universe!;
    // Same planet, same buildings, same seasons, now in the universe.
    expect(created.state).toMatchObject({
      seed: solo.state.seed,
      face: solo.state.face,
      kiwiId: 'k0',
      universeId: u.id,
      calendarStart: solo.state.calendarStart,
    });
    expect(created.state.buildings.map((b) => b.type)).toContain('pulpery');
    expect(created.state.targets.map((t) => t.id)).toEqual(['aliens:0:kiwino']);
    expect(u.members[0]).toMatchObject({ kiwiIndex: 0, planetSeed: solo.state.seed });
    // It stays there on reload; the solo slot is a new world.
    const back = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    expect(back.state.buildings).toHaveLength(created.state.buildings.length);
    const fresh = ok(await handleGameRequest(as('alice'), { action: 'load' }));
    expect(fresh.state.seed).not.toBe(solo.state.seed);
    expect(fresh.state.buildings).toHaveLength(1);
    // A friend gets the next kiwi and shares the calendar.
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'B',
      }),
    );
    expect(bob.state).toMatchObject({ kiwiId: 'k1', calendarStart: solo.state.calendarStart });
    expect(planetSeedOf(bob.universe!, 0)).toBe(solo.state.seed);
  });

  it('refuses to bring along an untouched solo colony', async () => {
    const { as } = world();
    ok(await handleGameRequest(as('alice'), { action: 'load' }));
    const r = await handleGameRequest(as('alice'), {
      action: 'createUniverse',
      name: 'Home',
      displayName: 'Alice',
      fromSolo: true,
    });
    expect(!r.ok && r.error).toBe('invalidRequest');
  });
});

describe('joining a universe with the solo colony (chantier 14)', () => {
  /** Alice hosts a universe; Bob has played his solo colony for a while. */
  async function setup() {
    const w = world();
    const created = ok(
      await handleGameRequest(w.as('alice'), {
        action: 'createUniverse',
        name: 'Orchard',
        displayName: 'Alice',
      }),
    );
    const solo = ok(await handleGameRequest(w.as('bob'), { action: 'load' }));
    const tile = findTileForTest(solo.state, 'flesh');
    ok(
      await handleGameRequest(w.as('bob'), {
        action: 'command',
        command: { type: 'build', buildingType: 'pulpery', q: tile.q, r: tile.r },
      }),
    );
    w.tick(3 * 3_600_000);
    return { ...w, universe: created.universe!, solo: solo.state };
  }
  const join = (as: ServiceContext, code: string) =>
    handleGameRequest(as, { action: 'joinUniverse', code, displayName: 'Bob', fromSolo: true });

  it('moves the colony onto a kiwi of its own, shielded for 48 h', async () => {
    const { as, repo, universe, solo, tick } = await setup();
    // What Bob learnt about his alien twin moves along with him.
    const stored = await repo.findGame('bob', `solo-bob`);
    const twinId = solo.targets[0]!.id;
    expect(twinId).toBe(`aliens:0:${solo.face === 'kiwisu' ? 'kiwino' : 'kiwisu'}`);
    stored!.state.victories = { [twinId]: 2 };
    await repo.update(stored!.id, stored!.state, stored!.version);

    const joined = ok(await join(as('bob'), universe.code));
    const now = joined.serverTime;
    expect(joined.state).toMatchObject({
      seed: solo.seed,
      face: solo.face,
      kiwiId: 'k1',
      universeId: universe.id,
    });
    expect(joined.state.buildings.map((b) => b.type)).toContain('pulpery');
    expect(joined.state.victories).toEqual({ [twinId.replace(':0:', ':1:')]: 2 });
    expect(joined.state.targets.map((t) => t.id)).toContain(twinId.replace(':0:', ':1:'));
    expect(joined.state.friends.map((f) => f.owner)).toEqual(['Alice']);
    // The universe calendar, an arrival shield and no wave planned before it ends.
    expect(joined.state.calendarStart).toBe(
      ok(await handleGameRequest(as('alice'), { action: 'load', universe: universe.id })).state
        .calendarStart,
    );
    expect(joined.state.threats.shieldUntil).toBe(now + 48 * 3_600_000);
    expect(joined.state.threats.next?.at ?? Infinity).toBeGreaterThanOrEqual(now + 48 * 3_600_000);
    const bob = joined.universe!.members.find((m) => m.userId === 'bob')!;
    expect(bob).toMatchObject({ kiwiIndex: 1, imported: true, planetSeed: solo.seed });
    expect(planetSeedOf(joined.universe!, 1)).toBe(solo.seed);
    // Alice sees how strong the newcomer is.
    tick(1000);
    const info = ok(
      await handleGameRequest(as('alice'), { action: 'universeInfo', universe: universe.id }),
    );
    expect(info.allies![0]!.power).toMatchObject({
      age: 0,
      nest: 1,
      kiwis: joined.state.villagers.length,
      shieldUntil: now + 48 * 3_600_000,
    });
    // The solo slot starts over.
    const fresh = ok(await handleGameRequest(as('bob'), { action: 'load' }));
    expect(fresh.state.seed).not.toBe(solo.seed);
    expect(fresh.state.buildings).toHaveLength(1);
  });

  it('refuses a second colony, an untouched one, a ship in flight and a closed universe', async () => {
    const { as, repo, universe } = await setup();
    // Only the host may close the universe.
    const notHost = await handleGameRequest(as('bob'), {
      action: 'universeSettings',
      universe: universe.id,
      allowImports: false,
    });
    expect(!notHost.ok && notHost.error).toBe('forbidden');
    const closed = ok(
      await handleGameRequest(as('alice'), {
        action: 'universeSettings',
        universe: universe.id,
        allowImports: false,
      }),
    );
    expect(closed.universe!.allowImports).toBe(false);
    const refused = await join(as('bob'), universe.code);
    expect(!refused.ok && refused.error).toBe('importsClosed');
    // A plain join (a new colony) is still welcome.
    expect(
      ok(
        await handleGameRequest(as('carol'), {
          action: 'joinUniverse',
          code: universe.code,
          displayName: 'Carol',
        }),
      ).universe!.allowImports,
    ).toBe(false);
    ok(
      await handleGameRequest(as('alice'), {
        action: 'universeSettings',
        universe: universe.id,
        allowImports: true,
      }),
    );
    // Carol already has a colony there; Dave has not played solo yet.
    const again = await join(as('carol'), universe.code);
    expect(!again.ok && again.error).toBe('alreadyMember');
    ok(await handleGameRequest(as('dave'), { action: 'load' }));
    const pristine = await join(as('dave'), universe.code);
    expect(!pristine.ok && pristine.error).toBe('invalidRequest');
    // Bob's ship is out: the colony waits for it.
    const stored = (await repo.findGame('bob', 'solo-bob'))!;
    const t = stored.state.now;
    stored.state.shipments = [
      {
        id: 's1',
        launchpadId: stored.state.buildings[0]!.id,
        friendId: 'ally:eve',
        owner: 'Eve',
        kiwiIndex: 0,
        resources: { ...stored.state.resources },
        departedAt: t,
        arriveAt: t + 1e9,
        returnAt: t + 2e9,
        status: 'outbound',
      },
    ];
    await repo.update(stored.id, stored.state, stored.version);
    const away = await join(as('bob'), universe.code);
    expect(!away.ok && away.error).toBe('shipAway');
    expect((await repo.listMembers(universe.id)).map((m) => m.userId)).toEqual(['alice', 'carol']);
  });
});

describe('choosing a face and seeing a friend (chantier 05)', () => {
  it('lets a newcomer move to the other face of their own kiwi', async () => {
    const { as } = world();
    const created = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Orchard',
        displayName: 'Alice',
      }),
    );
    const universe = created.universe!.id;
    expect(created.state.face).toBe('kiwisu');
    expect(created.twin).toBeNull();
    // The twin face is free (aliens): Alice may still change sides.
    const moved = ok(
      await handleGameRequest(as('alice'), { action: 'pickFace', universe, face: 'kiwino' }),
    );
    expect(moved.state.face).toBe('kiwino');
    expect(moved.state.seed).toBe(created.state.seed);
    expect(moved.universe!.members[0]!.face).toBe('kiwino');
    // Bob gets a kiwi of his own: both of its faces are open to him.
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: created.universe!.code,
        displayName: 'Bob',
      }),
    );
    expect(bob.state).toMatchObject({ face: 'kiwisu', kiwiId: 'k1' });
    const bobMoved = ok(
      await handleGameRequest(as('bob'), { action: 'pickFace', universe, face: 'kiwino' }),
    );
    expect(bobMoved.state).toMatchObject({ face: 'kiwino', kiwiId: 'k1' });
  });

  it('refuses to move a colony that has started, and shows the friend on the twin face', async () => {
    const { as, repo } = world();
    const created = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Pair',
        displayName: 'Alice',
      }),
    );
    const universe = created.universe!.id;
    const tile = findTileForTest(created.state, 'flesh');
    ok(
      await handleGameRequest(as('alice'), {
        action: 'command',
        universe,
        command: { type: 'build', buildingType: 'pulpery', q: tile.q, r: tile.r },
      }),
    );
    const refused = await handleGameRequest(as('alice'), {
      action: 'pickFace',
      universe,
      face: 'kiwino',
    });
    expect(!refused.ok && refused.error).toBe('forbidden');
    // An older universe where Bob was seated on the other half of Alice's kiwi.
    await repo.addMember(universe, {
      userId: 'bob',
      displayName: 'Bob',
      kiwiIndex: 0,
      face: 'kiwino',
    });
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: created.universe!.code,
        displayName: 'Bob',
      }),
    );
    // Bob sees Alice's layout on the other half of their kiwi (no stocks).
    expect(bob.twin).toMatchObject({ owner: 'Alice', face: 'kiwisu' });
    expect(bob.twin!.buildings.map((b) => b.type)).toEqual(['nest']);
    expect(bob.twin).not.toHaveProperty('resources');
    const info = ok(await handleGameRequest(as('alice'), { action: 'universeInfo', universe }));
    expect(info.twin).toMatchObject({ owner: 'Bob', face: 'kiwino' });
  });
});
