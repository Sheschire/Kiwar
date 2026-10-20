import { describe, expect, it } from 'vitest';
import {
  ALIENS,
  CALENDAR,
  HOUR_MS,
  advance,
  alienDefOf,
  alienDefense,
  alienEnemies,
  awaitingReport,
  createMemoryRepository,
  forecastExpedition,
  handleGameRequest,
  intelView,
  migrateState,
  publicState,
  recordIntel,
  sectorOf,
  serializeSave,
  type GameResponse,
  type GameState,
  type ServiceContext,
} from '../src';
import { findTile, kiwi, rich, run, setup, T0 } from './helpers';

/** Nest 2, a launchpad, a crowd of kiwis and full stocks: ready to raid the twin face. */
function readyColony() {
  const { map, state } = setup('kiwisu', 'aliens');
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(s, { type: 'build', buildingType: 'launchpad', q: flesh.q, r: flesh.r }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  s = {
    ...s,
    villagers: [...s.villagers, ...Array.from({ length: 8 }, (_, i) => kiwi(`vx${i}`, `K${i}`, t))],
    resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 },
  };
  const padId = s.buildings.find((b) => b.type === 'launchpad')!.id;
  return { map, s, t, padId, targetId: s.targets[0]!.id };
}

describe('hidden alien garrisons (chantier 07)', () => {
  it('draws every target a garrison around the public numbers, the same for the same seed', () => {
    const a = setup('kiwisu', 'g1').state;
    const b = setup('kiwisu', 'g1').state;
    const id = a.targets[0]!.id;
    const g = a.aliens![id]!;
    expect(b.aliens![id]).toEqual(g);
    const def = alienDefOf(0);
    expect(g.defense).toBeGreaterThanOrEqual(def.defense * ALIENS.defenseSpread[0] - 0.1);
    expect(g.defense).toBeLessThanOrEqual(def.defense * ALIENS.defenseSpread[1] + 0.1);
    expect(g.structures.length).toBe(ALIENS.structures.base);
    expect(new Set(g.structures.map((x) => sectorOf(x.q, x.r))).size).toBeGreaterThan(1);
    expect(setup('kiwisu', 'g2').state.aliens![id]).not.toEqual(g);
  });

  it('grows slowly every day, up to a cap, and reinforces after victories', () => {
    const { state } = setup('kiwisu', 'grow');
    const id = state.targets[0]!.id;
    const g = state.aliens![id]!;
    expect(alienDefense(state, id, state.createdAt)).toBeCloseTo(g.defense, 1);
    const day = alienDefense(state, id, state.createdAt + CALENDAR.dayMs)!;
    expect(day).toBeCloseTo(g.defense + g.growth, 1);
    const late = alienDefense(state, id, state.createdAt + 1000 * CALENDAR.dayMs)!;
    expect(late).toBeCloseTo(g.defense * ALIENS.maxGrowth, 1);
    const won = { ...state, victories: { [id]: 2 } };
    expect(alienDefense(won, id, state.createdAt)).toBeCloseTo(g.defense + 2 * g.reinforce, 1);
    const e = alienEnemies(g, 10);
    expect(e.ferrets + e.bats).toBe(10);
  });

  it('shows unknown odds without a report, and widens old reports', () => {
    const { s, padId, targetId } = readyColony();
    const plan = {
      launchpadId: padId,
      targetId,
      crew: 6,
      provisions: { pulp: 60, juice: 30 },
    };
    const blind = forecastExpedition(s, plan)!;
    expect(blind.defense).toBeNull();
    expect(blind.odds).toBe('unknown');
    expect(blind.expectedLosses).toBe(0);

    recordIntel(s, targetId, {
      at: s.now,
      source: 'recon',
      defense: { min: 5, max: 7 },
      ferrets: { min: 3, max: 4 },
      bats: { min: 2, max: 3 },
      victoriesAt: 0,
    });
    const fresh = intelView(s, targetId, s.now)!;
    expect(fresh).toMatchObject({ freshness: 'fresh', defense: { min: 5, max: 7 } });
    expect(forecastExpedition(s, plan)!.odds).not.toBe('unknown');
    const old = intelView(s, targetId, s.now + 5 * CALENDAR.dayMs)!;
    expect(old.freshness).toBe('old');
    expect(old.defense.min).toBe(5);
    expect(old.defense.max).toBeGreaterThan(7);
    expect(old.ferrets.max).toBeGreaterThanOrEqual(4);
    // We know we won since: the aliens reinforced.
    const won = { ...s, victories: { [targetId]: 1 } };
    expect(intelView(won, targetId, s.now)!.defense.min).toBe(5 + alienDefOf(0).reinforce);
  });

  it('accumulates sectors and structures over reports', () => {
    const { state } = setup('kiwisu', 'acc');
    const id = state.targets[0]!.id;
    const base = {
      source: 'recon' as const,
      defense: { min: 1, max: 2 },
      ferrets: { min: 1, max: 1 },
      bats: { min: 0, max: 1 },
      victoriesAt: 0,
    };
    recordIntel(state, id, {
      ...base,
      at: 1,
      sectors: [3, 1],
      structures: [{ kind: 'den', q: 2, r: 0 }],
    });
    recordIntel(state, id, {
      ...base,
      at: 2,
      sectors: [1, 7],
      structures: [{ kind: 'roost', q: 0, r: 5 }],
    });
    expect(state.intel[id]!.sectors).toEqual([1, 3, 7]);
    expect(state.intel[id]!.structures).toHaveLength(2);
    expect(state.intel[id]!.at).toBe(2);
  });

  it('waits for the server when the client does not hold the garrison', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(
      s,
      {
        type: 'launchExpedition',
        launchpadId: padId,
        targetId,
        crew: 6,
        provisions: { pulp: 200, juice: 100 },
      },
      t,
      map,
    );
    const e = launched.expeditions[0]!;
    // What an online client holds: the public state only.
    const client = publicState(launched);
    expect(client.aliens).toBeUndefined();
    const later = advance(client, e.returnAt + HOUR_MS).state;
    expect(later.expeditions[0]!.status).toBe('outbound');
    expect(awaitingReport(later, later.now)).toHaveLength(1);
    expect(later.villagers.filter((v) => v.job.kind === 'expedition')).toHaveLength(6);
    // The server resolves it; rebased on its answer, the client plays the way back itself.
    const server = advance(launched, e.arriveAt).state;
    expect(server.expeditions[0]!.status).toBe('returning');
    const rebased = advance(publicState(server), e.returnAt + HOUR_MS).state;
    expect(rebased.expeditions[0]!.status).toBe('done');
    expect(rebased.resources).toEqual(advance(server, e.returnAt + HOUR_MS).state.resources);
  });

  it('migrates v11 saves: targets lose their numbers, intel starts empty', () => {
    const { state } = setup('kiwisu', 'mig');
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    old.schemaVersion = 11;
    delete old.intel;
    delete old.aliens;
    old.targets = state.targets.map((t) => ({
      ...t,
      defense: 6,
      reinforce: 3,
      loot: alienDefOf(0).loot,
    }));
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.intel).toEqual({});
    expect(m.state.aliens).toBeUndefined();
    expect(m.state.targets[0]).not.toHaveProperty('defense');
  });
});

describe('the server never sends a garrison', () => {
  function ctxFor(start = T0) {
    const repo = createMemoryRepository();
    let now = start;
    let seeds = 0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => `secret-${++seeds}`,
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + seeds) % 256),
    };
    return { ctx, repo, tick: (ms: number) => (now += ms) };
  }
  const hidden = (r: GameResponse) => {
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"aliens":\{/);
    // No garrison seed (drawn as `<seed>/<target id>`) either.
    expect(text).not.toMatch(/secret-\d+\/aliens:/);
    return r;
  };

  it('strips the truth from every answer, and keeps it stored', async () => {
    const { ctx, repo } = ctxFor();
    const loaded = hidden(await handleGameRequest(ctx, { action: 'load' }));
    const stored = [...repo.games.values()][0]!;
    expect(stored.state.aliens).toBeDefined();
    const garrison = JSON.stringify(stored.state.aliens);
    hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(JSON.stringify([...repo.games.values()][0]!.state.aliens)).toBe(garrison);
    hidden(
      await handleGameRequest(ctx, {
        action: 'command',
        command: { type: 'build', buildingType: 'pulpery', q: 0, r: 0 },
      }),
    );
    hidden(await handleGameRequest(ctx, { action: 'command', command: { type: 'shelter' } }));
    hidden(await handleGameRequest(ctx, { action: 'newWorld', face: 'kiwino' }));
    expect(loaded.ok).toBe(true);
    const u = hidden(
      await handleGameRequest(ctx, {
        action: 'createUniverse',
        name: 'Verger',
        displayName: 'Ana',
      }),
    );
    expect(u.ok).toBe(true);
  });

  it('draws a secret garrison for imports, whatever the save says', async () => {
    const { ctx, repo } = ctxFor();
    const { state } = setup('kiwisu', 'imp');
    const id = state.targets[0]!.id;
    const forged: GameState = {
      ...state,
      aliens: { [id]: { ...state.aliens![id]!, defense: 0, growth: 0 } },
    };
    const r = hidden(
      await handleGameRequest(ctx, { action: 'import', save: serializeSave(forged, T0) }),
    );
    expect(r.ok).toBe(true);
    const stored = [...repo.games.values()][0]!.state;
    expect(stored.aliens![id]!.defense).toBeGreaterThan(0);
    expect(stored.aliens![id]!.seed).toContain('secret-');
  });

  it('resolves ships that landed while the player was away, on load', async () => {
    const { ctx, repo, tick } = ctxFor();
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(
      {
        ...s,
        aliens: game.state.aliens ? { [targetId]: Object.values(game.state.aliens)[0]! } : s.aliens,
      },
      {
        type: 'launchExpedition',
        launchpadId: padId,
        targetId,
        crew: 6,
        provisions: { pulp: 200, juice: 100 },
      },
      t,
      map,
    );
    repo.games.set(game.id, { ...game, state: launched });
    tick(launched.expeditions[0]!.arriveAt - T0 + 1000);
    const r = hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(r.state!.expeditions[0]!.status).toBe('returning');
    expect(r.state!.intel[targetId]?.source).toBe('raid');
    expect(r.ok && r.events.some((e) => e.type === 'expeditionArrived')).toBe(true);
    expect([...repo.games.values()][0]!.state.expeditions[0]!.status).toBe('returning');
  });
});
