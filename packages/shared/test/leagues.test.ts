import { describe, expect, it } from 'vitest';
import {
  createMemoryLeagues,
  createMemoryRepository,
  cloneState,
  handleGameRequest,
  LEAGUE,
  recordLeague,
  type GameResponse,
  type GameState,
  type ServiceContext,
  type StoredGame,
} from '../src';
import { setup, T0 } from './helpers';

function world() {
  const repo = createMemoryRepository();
  let now = T0;
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

type Ok = Extract<GameResponse, { ok: true }>;
const ok = (r: GameResponse): Ok => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
};

function gameOf(repo: ReturnType<typeof createMemoryRepository>, userId: string): StoredGame {
  return [...repo.games.values()].find((g) => g.userId === userId && g.universeId !== 'solo')!;
}

/** Changes a stored colony as the server would after resolving something. */
function edit(
  repo: ReturnType<typeof createMemoryRepository>,
  userId: string,
  change: (s: GameState) => void,
) {
  const g = gameOf(repo, userId);
  change(g.state);
  repo.games.set(g.id, g);
}

async function twoPlayers() {
  const w = world();
  const created = ok(
    await handleGameRequest(w.as('alice'), {
      action: 'createUniverse',
      name: 'Ligue',
      displayName: 'Alice',
    }),
  );
  const universe = created.universe!;
  ok(
    await handleGameRequest(w.as('bob'), {
      action: 'joinUniverse',
      code: universe.code,
      displayName: 'Bob',
    }),
  );
  return { ...w, universe: universe.id };
}

describe('leagues on the server (chantier 56)', () => {
  it('sets a colony’s past aside, then scores what it passes', async () => {
    const w = await twoPlayers();
    // Alice played before the leagues: her colony already held waves.
    edit(w.repo, 'alice', (s) => (s.stats.wavesHeld = 5));
    ok(await handleGameRequest(w.as('alice'), { action: 'load', universe: w.universe }));
    let league = ok(
      await handleGameRequest(w.as('alice'), { action: 'league', universe: w.universe }),
    ).league!;
    expect(league.season.n).toBe(1);
    expect(league.feats).toEqual([
      expect.objectContaining({ userId: 'alice', feat: 'wavesHeld:5', season: 0, points: 0 }),
    ]);
    // Then she holds more: the next load writes it in the season, with its points.
    w.tick(3_600_000);
    edit(w.repo, 'alice', (s) => (s.stats.wavesHeld = 15));
    ok(await handleGameRequest(w.as('alice'), { action: 'load', universe: w.universe }));
    league = ok(
      await handleGameRequest(w.as('bob'), { action: 'league', universe: w.universe }),
    ).league!;
    const scored = league.feats.find((f) => f.feat === 'wavesHeld:15')!;
    expect(scored).toMatchObject({ userId: 'alice', season: 1 });
    expect(scored.points).toBeGreaterThan(0);
    // Written once only.
    ok(await handleGameRequest(w.as('alice'), { action: 'load', universe: w.universe }));
    league = ok(
      await handleGameRequest(w.as('bob'), { action: 'league', universe: w.universe }),
    ).league!;
    expect(league.feats.filter((f) => f.feat === 'wavesHeld:15')).toHaveLength(1);
  });

  it('closes a season with a podium, resets the ranking and touches no game', async () => {
    const w = await twoPlayers();
    for (const u of ['alice', 'bob']) {
      ok(await handleGameRequest(w.as(u), { action: 'load', universe: w.universe }));
    }
    edit(w.repo, 'bob', (s) => (s.stats.wavesHeld = 15));
    ok(await handleGameRequest(w.as('bob'), { action: 'load', universe: w.universe }));
    const games = JSON.stringify([...w.repo.games.values()]);
    w.tick(LEAGUE.seasonMs + 1000);
    const league = ok(
      await handleGameRequest(w.as('alice'), { action: 'league', universe: w.universe }),
    ).league!;
    expect(league.season.n).toBe(2);
    expect(league.titles).toEqual([
      expect.objectContaining({ season: 1, userId: 'bob', rank: 1, displayName: 'Bob' }),
    ]);
    expect(league.feats.filter((f) => f.season === 2)).toEqual([]);
    expect(JSON.stringify([...w.repo.games.values()])).toBe(games);

    // Only the podium picks a cosmetic, once; it is then worn and seen by the others.
    const refused = await handleGameRequest(w.as('alice'), {
      action: 'leagueReward',
      universe: w.universe,
      season: 1,
      cosmetic: 'banner',
    });
    expect(refused).toMatchObject({ ok: false, error: 'forbidden' });
    const picked = ok(
      await handleGameRequest(w.as('bob'), {
        action: 'leagueReward',
        universe: w.universe,
        season: 1,
        cosmetic: 'banner',
      }),
    ).league!;
    expect(picked.titles[0]!.cosmetic).toBe('banner');
    expect(picked.players.find((p) => p.userId === 'bob')!.worn).toEqual(['banner']);
    const again = await handleGameRequest(w.as('bob'), {
      action: 'leagueReward',
      universe: w.universe,
      season: 1,
      cosmetic: 'crown',
    });
    expect(again).toMatchObject({ ok: false, error: 'forbidden' });
    const seen = ok(
      await handleGameRequest(w.as('alice'), { action: 'load', universe: w.universe }),
    );
    expect(seen.allies?.find((a) => a.owner === 'Bob')?.league).toEqual({
      banner: { rank: 1, season: 1 },
    });
    const mine = ok(await handleGameRequest(w.as('bob'), { action: 'load', universe: w.universe }));
    expect(mine.leagueLook).toEqual({ banner: { rank: 1, season: 1 } });
    // Taking it off; wearing a cosmetic never picked is refused.
    ok(
      await handleGameRequest(w.as('bob'), {
        action: 'leagueWear',
        universe: w.universe,
        worn: [],
      }),
    );
    const off = ok(
      await handleGameRequest(w.as('alice'), { action: 'load', universe: w.universe }),
    );
    expect(off.allies?.find((a) => a.owner === 'Bob')?.league).toBeUndefined();
    const cheat = await handleGameRequest(w.as('bob'), {
      action: 'leagueWear',
      universe: w.universe,
      worn: ['crown'],
    });
    expect(cheat).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('has no league in solo, nor for an outsider', async () => {
    const w = await twoPlayers();
    const solo = await handleGameRequest(w.as('alice'), { action: 'league', universe: 'solo' });
    expect(solo).toMatchObject({ ok: false, error: 'forbidden' });
    const outsider = await handleGameRequest(w.as('eve'), {
      action: 'league',
      universe: w.universe,
    });
    expect(outsider).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('scores the feats a command passes; a player first seen keeps their past aside', async () => {
    const repo = createMemoryLeagues();
    const { state } = setup();
    const before = cloneState(state);
    before.stats.wavesHeld = 5;
    const after = cloneState(before);
    after.stats.wavesHeld = 15;
    const scored = await recordLeague(repo, 'u', [], 'p', 0, before, after, T0);
    expect(scored.map((f) => f.feat)).toEqual(['wavesHeld:15']);
    const feats = await repo.leagueFeats('u');
    expect(feats.map((f) => [f.feat, f.season])).toEqual([
      ['wavesHeld:5', 0],
      ['wavesHeld:15', 1],
    ]);
    // Nothing new: nothing written, nothing read.
    expect(await recordLeague(repo, 'u', [], 'p', 0, after, after, T0)).toEqual([]);
  });
});
