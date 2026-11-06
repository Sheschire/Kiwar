import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  createMemoryRepository,
  deserializeSave,
  drupeletTruth,
  handleGameRequest,
  migrateState,
  newGame,
  publicState,
  raspberryOf,
  raspberryOfState,
  RASPBERRY,
  serializeSave,
  techCost,
  TECHS,
  universeOrchardSeed,
  type GameResponse,
  type GameState,
  type ServiceContext,
} from '../src';
import { setup, T0 } from './helpers';

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

/** Nothing of the orchard's truth in what the server sends. */
function noOrchardTruth(r: GameResponse): void {
  const text = JSON.stringify(r);
  expect(text).not.toContain('"orchardSeed"');
  expect(text).not.toContain('/drupelet/');
}

describe('the raspberry (chantier 54)', () => {
  it('draws the same cluster from the same seed, every drupelet linked and owned', () => {
    const a = raspberryOf('u-1/orchard');
    const b = raspberryOf('u-1/orchard');
    expect(b).toBe(a);
    expect(JSON.stringify(raspberryOf('u-2/orchard').drupelets)).not.toBe(
      JSON.stringify(a.drupelets),
    );
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const m = raspberryOf(`${seed}/orchard`);
      expect(m.drupelets.length).toBeGreaterThanOrEqual(RASPBERRY.drupelets[0]);
      expect(m.drupelets.length).toBeLessThanOrEqual(RASPBERRY.drupelets[1]);
      expect(m.clans.length).toBeGreaterThanOrEqual(RASPBERRY.clans[0]);
      expect(m.clans.length).toBeLessThanOrEqual(RASPBERRY.clans[1]);
      // Links go both ways; one piece; every clan holds drupelets in one piece too.
      for (const d of m.drupelets)
        for (const l of d.links) expect(m.byId.get(l)!.links).toContain(d.id);
      const seen = new Set<string>(['d0']);
      const todo = ['d0'];
      while (todo.length)
        for (const l of m.byId.get(todo.pop()!)!.links)
          if (!seen.has(l)) {
            seen.add(l);
            todo.push(l);
          }
      expect(seen.size).toBe(m.drupelets.length);
      expect(m.clans.reduce((a, c) => a + c.drupelets.length, 0)).toBe(m.drupelets.length);
      for (const c of m.clans) {
        expect(c.drupelets.length).toBeGreaterThan(0);
        const mine = new Set(c.drupelets);
        const got = new Set([c.drupelets[0]!]);
        const stack = [c.drupelets[0]!];
        while (stack.length)
          for (const l of m.byId.get(stack.pop()!)!.links)
            if (mine.has(l) && !got.has(l)) {
              got.add(l);
              stack.push(l);
            }
        expect(got.size).toBe(mine.size);
      }
      // Nobody under the vine's cap.
      expect(Math.max(...m.drupelets.map((d) => d.y))).toBeLessThan(
        1 - 2 * RASPBERRY.stemCap + 0.01,
      );
    }
  });

  it('holds stronger, richer drupelets toward the stem (hidden seed)', () => {
    const m = raspberryOf('x/orchard');
    const power = (ring: number) => {
      const ds = m.drupelets.filter((d) => d.ring === ring);
      return (
        ds.reduce(
          (a, d) => a + drupeletTruth('secret', d).units.reduce((s, u) => s + u.count, 0),
          0,
        ) / ds.length
      );
    };
    expect(power(2)).toBeGreaterThan(power(0));
    expect(drupeletTruth('secret', m.drupelets[0]!)).toEqual(
      drupeletTruth('secret', m.drupelets[0]!),
    );
  });

  it('opens the wormholes with a technology cheaper once the Mother Vine is found', () => {
    const { state } = setup();
    expect(TECHS.wormholes.cheaperWith).toBe('motherVine');
    expect(techCost(state, 'wormholes')).toBe(TECHS.wormholes.cost * 2.5);
    const s = cloneState(state);
    s.depths.weevil = { attempts: 1, fellAt: T0 };
    expect(techCost(s, 'wormholes')).toBe(TECHS.wormholes.cost);
  });

  it('keeps a hidden seed in local games, stripped from what the client sees', () => {
    const { state } = setup();
    expect(state.orchardSeed).toBeDefined();
    expect(state.orchard.seed).toBe('test-seed/orchard');
    expect(publicState(state).orchardSeed).toBeUndefined();
    expect(raspberryOfState(state).seed).toBe(state.orchard.seed);
  });

  it('round-trips the save and migrates a v43 game', () => {
    const { state } = setup();
    const s = advance(state, T0 + 3_600_000).state;
    const back = deserializeSave(serializeSave(s, T0 + 3_600_000));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.save.state.orchard).toEqual(s.orchard);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.orchard;
    delete old.nectar;
    delete old.orchardSeed;
    old.schemaVersion = 43;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.state.orchard.seed).toBe(`${s.seed}/orchard`);
      expect(m.state.nectar).toBe(0);
    }
  });
});

describe('the orchard online (chantier 54)', () => {
  it('gives every member of a universe the same orchard, never its secret', async () => {
    const { as, repo, tick } = world();
    const alice = ok(
      await handleGameRequest(as('alice'), {
        action: 'createUniverse',
        name: 'Verger',
        displayName: 'Alice',
      }),
    );
    noOrchardTruth(alice);
    const u = alice.universe!;
    tick(60_000);
    const bob = ok(
      await handleGameRequest(as('bob'), {
        action: 'joinUniverse',
        code: u.code,
        displayName: 'Bob',
      }),
    );
    noOrchardTruth(bob);
    const a = ok(await handleGameRequest(as('alice'), { action: 'load', universe: u.id }));
    const b = ok(await handleGameRequest(as('bob'), { action: 'load', universe: u.id }));
    noOrchardTruth(a);
    noOrchardTruth(b);
    // Two kiwis, two planets, one orchard.
    expect(a.state.seed).not.toBe(b.state.seed);
    expect(a.state.orchard.seed).toBe(b.state.orchard.seed);
    expect(a.state.orchard.seed).toBe(universeOrchardSeed(alice.universe!.seed));
    // The hidden seed is the universe's, the same in both stored games.
    const stored = [...repo.games.values()].filter((g) => g.universeId === u.id);
    expect(stored).toHaveLength(2);
    const secrets = new Set(stored.map((g) => g.state.orchardSeed));
    expect(secrets.size).toBe(1);
    expect([...secrets][0]).toBeDefined();
    // A solo game draws a secret of its own.
    const solo = ok(await handleGameRequest(as('carol'), { action: 'load' }));
    noOrchardTruth(solo);
    const soloGame = [...repo.games.values()].find((g) => g.userId === 'carol')!;
    expect(soloGame.state.orchardSeed).toBeDefined();
    expect(soloGame.state.orchardSeed).not.toBe([...secrets][0]);
  });

  it('draws a new secret for an imported save', async () => {
    const { as, repo } = world();
    const local = newGame({ seed: 'mine', face: 'kiwisu', now: 1_700_000_000_000 });
    const r = ok(
      await handleGameRequest(as('dan'), {
        action: 'import',
        save: serializeSave(local, 1_700_000_000_000),
      }),
    );
    noOrchardTruth(r);
    const g = [...repo.games.values()].find((x) => x.userId === 'dan')!;
    expect(g.state.orchardSeed).toBeDefined();
    expect(g.state.orchardSeed).not.toBe(local.orchardSeed);
  });
});
