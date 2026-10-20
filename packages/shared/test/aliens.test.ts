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
  createRng,
  INTEL,
  RECON,
  reconForecast,
  validateCommand,
  shipOf,
  shipReliability,
  SHIPS,
  travelTime,
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
import { findTile, kiwi, knowTruth, rich, run, setup, T0 } from './helpers';

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
  s = reliable({
    ...s,
    villagers: [...s.villagers, ...Array.from({ length: 8 }, (_, i) => kiwi(`vx${i}`, `K${i}`, t))],
    resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 },
  });
  const padId = s.buildings.find((b) => b.type === 'launchpad')!.id;
  return { map, s, t, padId, targetId: s.targets[0]!.id };
}

/** The Iron age (iron ship) and handy crews: reliability 100 %, no breakdown in these tests. */
function reliable(s: GameState, age = 2): GameState {
  return {
    ...s,
    buildings: [
      ...s.buildings
        .filter((b) => b.type !== 'monument')
        .map((b) => (b.type === 'launchpad' ? { ...b, level: 3 } : b)),
      { id: 'bm' as never, type: 'monument', q: 2, r: -1, level: age, richness: 1, builtAt: T0 },
    ],
    villagers: s.villagers.map((v) => ({ ...v, stats: { ...v.stats, dexterity: 10 } })),
  };
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

describe('reconnaissance missions', () => {
  const recon = (padId: string, targetId: string, crew: number | string[]) => ({
    type: 'launchExpedition' as const,
    launchpadId: padId as never,
    targetId,
    crew: crew as never,
    provisions: { pulp: 40, juice: 20 },
    mission: 'recon' as const,
  });

  it('takes one or two kiwis, flies faster, and brings back a partial map with ranges', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const ctx = { now: t, map };
    expect(validateCommand(s, recon(padId, targetId, 3), ctx)).toBe('crewTooLarge');
    expect(validateCommand(s, recon(padId, targetId, 0), ctx)).toBe('crewTooSmall');
    const launched = run(s, recon(padId, targetId, 1), t, map);
    const e = launched.expeditions[0]!;
    expect(e.mission).toBe('recon');
    const pad = launched.buildings.find((b) => b.id === padId)!;
    expect(e.arriveAt - t).toBe(travelTime(launched.targets[0]!, pad, [], 'recon'));
    expect(e.arriveAt - t).toBeLessThan(travelTime(launched.targets[0]!, pad, [], 'raid'));
    const back = advance(launched, e.returnAt).state;
    const done = back.expeditions[0]!;
    expect(done.status).toBe('done');
    const intel = back.intel[targetId]!;
    expect(intel.source).toBe('recon');
    expect(intel.sectors.length).toBeGreaterThanOrEqual(1);
    expect(intel.sectors.length).toBeLessThan(INTEL.sectors);
    // The truth is always inside the reported range.
    const truth = alienDefense(back, targetId, e.arriveAt)!;
    expect(intel.defense.min).toBeLessThanOrEqual(truth);
    expect(intel.defense.max).toBeGreaterThanOrEqual(truth);
    // Only structures of the seen sectors are reported.
    const seen = new Set(intel.sectors);
    expect(intel.structures.every((x) => seen.has(sectorOf(x.q, x.r)))).toBe(true);
    // No loot, no provocation.
    expect(done.result!.loot).toEqual({ pulp: 0, fiber: 0, seeds: 0, juice: 0 });
    expect(back.victories[targetId] ?? 0).toBe(0);
  });

  it('reveals more sectors and tighter ranges with better scouts, cumulatively', () => {
    const rookie = reconForecast([kiwi('a')]);
    const ace = {
      ...kiwi('b'),
      level: 12,
      classId: 'scout' as const,
      stats: { ...kiwi('b').stats, agility: 12, spirit: 10 },
    };
    const best = reconForecast([ace]);
    expect(best.quality).toBeGreaterThan(rookie.quality);
    expect(best.sectors).toBeGreaterThan(rookie.sectors);
    expect(best.spread).toBeLessThan(rookie.spread);
    expect(best.spotChance).toBeLessThan(rookie.spotChance);
    expect(reconForecast([kiwi('c'), kiwi('d')]).spotChance).toBeGreaterThan(rookie.spotChance);

    const { s, t, map, padId, targetId } = readyColony();
    let state = s;
    let time = t;
    let before = 0;
    for (let i = 0; i < 3; i++) {
      state = run(state, recon(padId, targetId, 1), time, map);
      time = state.expeditions.at(-1)!.returnAt + RECON.injuryMs;
      state = advance(state, time).state;
      const now = state.intel[targetId]!.sectors.length;
      expect(now).toBeGreaterThan(before);
      before = now;
    }
  });

  it('spotted scouts skirmish: one may fall or come home hurt, and the report is worse', () => {
    let spottedOnce = false;
    for (let seed = 0; seed < 40 && !spottedOnce; seed++) {
      const { s, t, map, padId, targetId } = readyColony();
      const launched = run(
        { ...s, rng: createRng(`spot-${seed}`).state() },
        recon(padId, targetId, 2),
        t,
        map,
      );
      const e = launched.expeditions[0]!;
      const arrived = advance(launched, e.arriveAt).state;
      const r = arrived.expeditions[0]!.result!;
      if (!r.spotted) continue;
      spottedOnce = true;
      expect(arrived.intel[targetId]!.spotted).toBe(true);
      expect(r.lostInBattle.length + (r.injured?.length ?? 0)).toBe(1);
      const back = advance(arrived, e.returnAt).state;
      if (r.injured?.length) {
        const hurt = back.villagers.find((v) => v.id === r.injured![0]);
        expect(hurt?.job).toEqual({ kind: 'injured', until: e.returnAt + RECON.injuryMs });
      }
    }
    expect(spottedOnce).toBe(true);
  });

  it('is the same in one big step or many small ones', () => {
    const { s, t, map, padId, targetId } = readyColony();
    const launched = run(s, recon(padId, targetId, 2), t, map);
    const end = launched.expeditions[0]!.returnAt + HOUR_MS;
    const big = advance(launched, end).state;
    let small = launched;
    for (let at = t; at < end; at += 7 * 60_000) small = advance(small, at).state;
    small = advance(small, end).state;
    expect(small.intel).toEqual(big.intel);
    expect(small.villagers).toEqual(big.villagers);
    expect(small.rng).toEqual(big.rng);
  });
});

describe('ship generations and breakdowns', () => {
  it('follows the age of the colony, Dexterity mends a little', () => {
    const s = { ...readyColony().s };
    s.buildings = s.buildings.filter((b) => b.type !== 'monument');
    const withAge = (age: number): GameState => ({
      ...s,
      buildings: [
        ...s.buildings,
        { id: 'bm' as never, type: 'monument', q: 1, r: 1, level: age, richness: 1, builtAt: T0 },
      ],
    });
    expect(shipOf(s).id).toBe('wood');
    expect(shipOf(withAge(1)).id).toBe('logs');
    expect(shipOf(withAge(2)).id).toBe('iron');
    expect(shipOf(withAge(3)).id).toBe('jet');
    const clumsy = { ...kiwi('a'), stats: { ...kiwi('a').stats, dexterity: 3 } };
    const handy = { ...kiwi('b'), stats: { ...kiwi('b').stats, dexterity: 9 } };
    expect(shipReliability(SHIPS.wood, [clumsy])).toBe(SHIPS.wood.reliability);
    expect(shipReliability(SHIPS.wood, [clumsy, handy])).toBeCloseTo(SHIPS.wood.reliability + 0.04);
    expect(
      shipReliability(SHIPS.iron, [handy, { ...handy, stats: { ...handy.stats, dexterity: 20 } }]),
    ).toBe(1);
  });

  it('a broken ship turns back half-way, empty, and its launchpad needs mending', () => {
    let found = false;
    for (let seed = 0; seed < 60 && !found; seed++) {
      const ready = readyColony();
      const { t, map, padId, targetId } = ready;
      // A wooden ship and plain crews.
      const s: GameState = {
        ...ready.s,
        rng: createRng(`break-${seed}`).state(),
        buildings: ready.s.buildings.filter((b) => b.type !== 'monument'),
        villagers: ready.s.villagers.map((v) => ({ ...v, stats: { ...v.stats, dexterity: 5 } })),
      };
      const launched = run(
        s,
        {
          type: 'launchExpedition',
          launchpadId: padId,
          targetId,
          crew: 4,
          provisions: { pulp: 200, juice: 100 },
        },
        t,
        map,
      );
      const e = launched.expeditions[0]!;
      if (!e.broken) continue;
      found = true;
      const pad = launched.buildings.find((b) => b.id === padId)!;
      expect(e.arriveAt - t).toBe(Math.round(travelTime(launched.targets[0]!, pad) / 2000) * 1000);
      // No garrison needed to know a breakdown: the client plays it alone.
      const back = advance(publicState(launched), e.returnAt).state;
      const done = back.expeditions[0]!;
      expect(done.status).toBe('done');
      expect(done.result).toMatchObject({ broken: true, victory: false, lostInBattle: [] });
      expect(done.result!.loot).toEqual({ pulp: 0, fiber: 0, seeds: 0, juice: 0 });
      expect(back.intel[targetId]).toBeUndefined();
      expect(back.buildings.find((b) => b.id === padId)!.damaged).toBe(true);
      const again = {
        type: 'launchExpedition' as const,
        launchpadId: padId,
        targetId,
        crew: 2,
        provisions: { pulp: 60, juice: 30 },
      };
      expect(validateCommand(back, again, { now: back.now, map })).toBe('launchpadDamaged');
      const mended = advance(
        run(back, { type: 'repair', buildingId: padId }, back.now, map),
        back.now + 3 * HOUR_MS,
      ).state;
      expect(mended.buildings.find((b) => b.id === padId)!.damaged).toBeFalsy();
      expect(validateCommand(mended, again, { now: mended.now, map })).toBeNull();
    }
    expect(found).toBe(true);
  });

  it('armour lowers raid losses', () => {
    const { s, padId, targetId } = readyColony();
    const known = knowTruth(s, s.now);
    const plan = { launchpadId: padId, targetId, crew: 3, provisions: { pulp: 60, juice: 30 } };
    const iron = forecastExpedition(known, plan)!;
    const logs = forecastExpedition(reliable(known, 1), plan)!;
    expect(iron.ship.armor).toBeGreaterThan(0);
    expect(iron.expectedLosses).toBeLessThan(logs.expectedLosses);
  });
});
