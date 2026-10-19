import { describe, expect, it } from 'vitest';
import {
  createMemoryRepository,
  findTileForTest,
  handleGameRequest,
  RATE_LIMIT,
  serializeSave,
  type GameResponse,
  type ServiceContext,
} from './serverHelpers';

function ctxFor(userId = 'user-1', start = 1_700_000_000_000) {
  const repo = createMemoryRepository();
  let now = start;
  let seeds = 0;
  const ctx: ServiceContext = { repo, userId, now: () => now, randomSeed: () => `srv-${++seeds}` };
  return { ctx, repo, tick: (ms: number) => (now += ms), at: () => now };
}

const ok = (r: GameResponse) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
};

describe('game service (server authority)', () => {
  it('creates a game on first load with a server-chosen seed', async () => {
    const { ctx, repo } = ctxFor();
    const r = ok(await handleGameRequest(ctx, { action: 'load' }));
    expect(r.state.seed).toBe('srv-1');
    expect(r.state.playerId).toBe('user-1');
    expect(repo.games.size).toBe(1);
    const again = ok(await handleGameRequest(ctx, { action: 'load' }));
    expect(again.state).toEqual(r.state);
  });

  it('honours the world of a shared link on creation', async () => {
    const { ctx } = ctxFor();
    const r = ok(
      await handleGameRequest(ctx, { action: 'load', create: { seed: 'banane', face: 'kiwino' } }),
    );
    expect(r.state).toMatchObject({ seed: 'banane', face: 'kiwino' });
  });

  it('applies commands with the shared rules and the server clock', async () => {
    const { ctx, tick } = ctxFor();
    const loaded = ok(await handleGameRequest(ctx, { action: 'load' }));
    const flesh = findTileForTest(loaded.state, 'flesh');
    const built = ok(
      await handleGameRequest(ctx, {
        action: 'command',
        command: { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      }),
    );
    expect(built.state.queue).toHaveLength(1);
    tick(60 * 60_000);
    const claimed = ok(
      await handleGameRequest(ctx, { action: 'command', command: { type: 'claimObjective' } }),
    );
    expect(claimed.state.objectiveIndex).toBe(1);
    expect(claimed.state.buildings.some((b) => b.type === 'pulpery')).toBe(true);
  });

  it('rejects invalid commands and returns the authoritative state', async () => {
    const { ctx } = ctxFor();
    ok(await handleGameRequest(ctx, { action: 'load' }));
    const r = await handleGameRequest(ctx, {
      action: 'command',
      command: { type: 'build', buildingType: 'pulpery', q: 0, r: 0 },
    });
    expect(r).toMatchObject({ ok: false, error: 'tileNotAllowed' });
    expect(r.state).toBeDefined();
  });

  it('rejects malformed requests and debug commands from non-admins', async () => {
    const { ctx } = ctxFor();
    ok(await handleGameRequest(ctx, { action: 'load' }));
    expect(
      await handleGameRequest(ctx, { action: 'command', command: { type: 'build', q: 'x' } }),
    ).toMatchObject({ error: 'invalidRequest' });
    expect(await handleGameRequest(ctx, { action: 'hack' })).toMatchObject({
      error: 'invalidRequest',
    });
    expect(
      await handleGameRequest(ctx, {
        action: 'command',
        command: { type: 'debugGrant', resources: { pulp: 1e6 } },
      }),
    ).toMatchObject({ error: 'forbidden' });
    const admin = ok(
      await handleGameRequest(
        { ...ctx, isAdmin: true },
        { action: 'command', command: { type: 'debugGrant', resources: { pulp: 100 } } },
      ),
    );
    expect(admin.state.resources.pulp).toBeGreaterThan(100);
  });

  it('rate limits command floods', async () => {
    const { ctx } = ctxFor();
    ok(await handleGameRequest(ctx, { action: 'load' }));
    let limited = false;
    for (let i = 0; i < RATE_LIMIT.maxCommands + 5; i++) {
      const r = await handleGameRequest(ctx, {
        action: 'command',
        command: { type: 'claimObjective' },
      });
      if (!r.ok && r.error === 'rateLimited') limited = true;
    }
    expect(limited).toBe(true);
  });

  it('retries on concurrent writes', async () => {
    const { ctx, repo } = ctxFor();
    ok(await handleGameRequest(ctx, { action: 'load' }));
    const realUpdate = repo.update.bind(repo);
    let first = true;
    repo.update = async (id, state, version) => {
      if (first) {
        first = false;
        // Simulate another device writing in between.
        const g = await repo.findByUser('user-1');
        await realUpdate(id, g!.state, g!.version);
      }
      return realUpdate(id, state, version);
    };
    const r = await handleGameRequest(ctx, { action: 'command', command: { type: 'hatchEgg' } });
    expect(r.ok).toBe(true);
  });

  it('imports a plausible local save once, into a pristine game only', async () => {
    const local = ctxFor('local-player');
    const s0 = ok(await handleGameRequest(local.ctx, { action: 'load' }));
    const flesh = findTileForTest(s0.state, 'flesh');
    const s1 = ok(
      await handleGameRequest(local.ctx, {
        action: 'command',
        command: { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
      }),
    );
    const save = serializeSave(s1.state, local.at());

    const { ctx } = ctxFor('user-2');
    ok(await handleGameRequest(ctx, { action: 'load' }));
    const imported = ok(await handleGameRequest(ctx, { action: 'import', save }));
    expect(imported.state.seed).toBe(s1.state.seed);
    expect(imported.state.playerId).toBe('user-2');
    // A second import over real progress is refused.
    const again = await handleGameRequest(ctx, { action: 'import', save });
    expect(again).toMatchObject({ ok: false, error: 'importRejected' });
  });

  it('refuses tampered saves', async () => {
    const local = ctxFor('cheater');
    const s0 = ok(await handleGameRequest(local.ctx, { action: 'load' }));
    const rich = { ...s0.state, resources: { pulp: 999_999, fiber: 0, seeds: 0, juice: 0 } };
    const { ctx } = ctxFor('user-3');
    expect(
      await handleGameRequest(ctx, { action: 'import', save: serializeSave(rich, local.at()) }),
    ).toMatchObject({
      error: 'importRejected',
    });
    const moved = { ...s0.state, buildings: s0.state.buildings.map((b) => ({ ...b, level: 3 })) };
    expect(
      await handleGameRequest(ctx, { action: 'import', save: serializeSave(moved, local.at()) }),
    ).toMatchObject({
      error: 'importRejected',
    });
  });

  it('can start a new world', async () => {
    const { ctx } = ctxFor();
    ok(await handleGameRequest(ctx, { action: 'load' }));
    const r = ok(
      await handleGameRequest(ctx, { action: 'newWorld', face: 'kiwino', seed: 'fresh' }),
    );
    expect(r.state).toMatchObject({ seed: 'fresh', face: 'kiwino', objectiveIndex: 0 });
  });
});
