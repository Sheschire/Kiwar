import { describe, expect, it } from 'vitest';
import {
  createMemoryRepository,
  findTileForTest,
  handleGameRequest,
  type GameResponse,
  type GameState,
  type ServiceContext,
} from './serverHelpers';

/** A guest and an account sharing one server; `guest-token` belongs to the guest. */
function setup() {
  const repo = createMemoryRepository();
  let now = 1_700_000_000_000;
  let seeds = 0;
  const base = {
    repo,
    now: () => now,
    randomSeed: () => `srv-${++seeds}`,
    randomBytes: (n: number) => new Uint8Array(n),
    guestUserOf: async (token: string) => (token === 'guest-token-0123456789' ? 'guest' : null),
  };
  const guest: ServiceContext = { ...base, userId: 'guest' };
  const account: ServiceContext = { ...base, userId: 'account' };
  return { repo, guest, account, tick: (ms: number) => (now += ms) };
}

const ok = (r: GameResponse) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
};

/** Loads a colony and plays it a little (no longer pristine). */
async function play(ctx: ServiceContext, tick: (ms: number) => void): Promise<GameState> {
  const loaded = ok(await handleGameRequest(ctx, { action: 'load' }));
  const flesh = findTileForTest(loaded.state!, 'flesh');
  ok(
    await handleGameRequest(ctx, {
      action: 'command',
      command: { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r },
    }),
  );
  tick(60 * 60_000);
  return ok(
    await handleGameRequest(ctx, { action: 'command', command: { type: 'claimObjective' } }),
  ).state!;
}

const transfer = (keep?: 'guest' | 'account', guestToken = 'guest-token-0123456789') => ({
  action: 'guestTransfer',
  guestToken,
  ...(keep ? { keep } : {}),
});

describe('guest transfer', () => {
  it('previews, then brings the guest colony into an untouched account', async () => {
    const { repo, guest, account, tick } = setup();
    const played = await play(guest, tick);
    ok(await handleGameRequest(account, { action: 'load' }));
    const preview = ok(await handleGameRequest(account, transfer()));
    expect(preview.transfer).toMatchObject({ accountPristine: true });
    expect(preview.transfer!.guest!.nest).toBeGreaterThanOrEqual(1);
    const moved = ok(await handleGameRequest(account, transfer('guest')));
    expect(moved.state).toMatchObject({
      seed: played.seed,
      playerId: 'account',
      universeId: 'solo-account',
    });
    expect(moved.state!.objectiveIndex).toBe(played.objectiveIndex);
    // The colony does not exist twice: the guest keeps the account's old (empty) world.
    const left = await repo.findGame('guest', 'solo-guest');
    expect(left!.state.seed).not.toBe(played.seed);
    expect(left!.state.playerId).toBe('guest');
  });

  it('swaps two played colonies, or keeps the account one', async () => {
    const { repo, guest, account, tick } = setup();
    const guestState = await play(guest, tick);
    const accountState = await play(account, tick);
    const preview = ok(await handleGameRequest(account, transfer()));
    expect(preview.transfer!.accountPristine).toBe(false);

    const kept = ok(await handleGameRequest(account, transfer('account')));
    expect(kept.state!.seed).toBe(accountState.seed);
    expect((await repo.findGame('guest', 'solo-guest'))!.state.seed).toBe(guestState.seed);

    const swapped = ok(await handleGameRequest(account, transfer('guest')));
    expect(swapped.state!.seed).toBe(guestState.seed);
    const left = (await repo.findGame('guest', 'solo-guest'))!.state;
    expect(left).toMatchObject({ seed: accountState.seed, playerId: 'guest' });
  });

  it('creates the account colony when it has none yet', async () => {
    const { repo, guest, account, tick } = setup();
    const played = await play(guest, tick);
    const preview = ok(await handleGameRequest(account, transfer()));
    expect(preview.transfer).toMatchObject({ account: null, accountPristine: true });
    ok(await handleGameRequest(account, transfer('guest')));
    expect((await repo.findGame('account', 'solo-account'))!.state.seed).toBe(played.seed);
  });

  it('refuses unknown tokens, the same user and servers without guest checks', async () => {
    const { guest, account, tick } = setup();
    await play(guest, tick);
    expect(
      await handleGameRequest(account, transfer('guest', 'someone-else-token-000')),
    ).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await handleGameRequest(guest, transfer('guest'))).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
    const { guestUserOf: _, ...noGuest } = account;
    expect(await handleGameRequest(noGuest, transfer('guest'))).toMatchObject({
      ok: false,
      error: 'forbidden',
    });
  });

  it('never moves an untouched guest colony', async () => {
    const { repo, guest, account, tick } = setup();
    ok(await handleGameRequest(guest, { action: 'load' }));
    const accountState = await play(account, tick);
    const preview = ok(await handleGameRequest(account, transfer()));
    expect(preview.transfer!.guest).toBeNull();
    const r = ok(await handleGameRequest(account, transfer('guest')));
    expect(r.state!.seed).toBe(accountState.seed);
    expect((await repo.findGame('account', 'solo-account'))!.state.seed).toBe(accountState.seed);
  });
});
