import { describe, expect, it } from 'vitest';
import {
  assignFace,
  alienDefOf,
  createMemoryRepository,
  handleGameRequest,
  kiwiCount,
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
  it('fills twin faces first and always leaves an alien face', () => {
    const members: { kiwiIndex: number; face: 'kiwisu' | 'kiwino' }[] = [];
    for (let i = 0; i < 5; i++) members.push(assignFace(members));
    expect(members).toEqual([
      { kiwiIndex: 0, face: 'kiwisu' },
      { kiwiIndex: 0, face: 'kiwino' },
      { kiwiIndex: 1, face: 'kiwisu' },
      { kiwiIndex: 1, face: 'kiwino' },
      { kiwiIndex: 2, face: 'kiwisu' },
    ]);
    for (let p = 1; p <= 8; p++) {
      expect(kiwiCount(p) * 2).toBeGreaterThan(p);
      const ms = members.slice(0, Math.min(p, members.length));
      expect(universeTargets(ms, ms[0]!).length).toBeGreaterThan(0);
    }
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
    expect(bob.state).toMatchObject({ face: 'kiwino', kiwiId: 'k0' });
    // Two halves of the same fruit.
    expect(bob.state.seed).toBe(created.state.seed);
    // One shared calendar: Bob joins five hours later but lives the same days and seasons.
    expect(bob.state.calendarStart).toBe(created.state.calendarStart);
    expect(bob.state.createdAt).toBe(created.state.createdAt + 5 * 3_600_000);
    expect(bob.universe!.members.map((m) => m.displayName)).toEqual(['Alice', 'Bob']);

    // Alice's twin face is now Bob's: her targets move to the new alien kiwi.
    const aliceLoad = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    expect(aliceLoad.state.targets.map((t) => t.id)).toEqual([
      'aliens:1:kiwisu',
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

describe('choosing a face and seeing a friend (chantier 05)', () => {
  it('lets a newcomer move to the free face of their kiwi, never to a taken one', async () => {
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
    // Bob lands on the free face; Alice's face is taken.
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: created.universe!.code,
        displayName: 'Bob',
      }),
    );
    expect(bob.state.face).toBe('kiwisu');
    const refused = await handleGameRequest(as('bob'), {
      action: 'pickFace',
      universe,
      face: 'kiwino',
    });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toBe('faceTaken');
  });

  it('refuses to move a colony that has started, and shows the friend on the twin face', async () => {
    const { as } = world();
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
