import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  assaultLock,
  bedsOf,
  CALENDAR,
  cloneState,
  consumption,
  counterAwaited,
  counterForecast,
  createMemoryRepository,
  finalForecast,
  finalLock,
  forecastExpedition,
  handleGameRequest,
  HOUR_MS,
  INTEL,
  migrateState,
  publicState,
  resetSiege,
  queenPower,
  SIEGE,
  siegeLock,
  siegeTruth,
  siegeView,
  validateCommand,
  type BuildingId,
  type Command,
  type GameResponse,
  type GameState,
  type ServiceContext,
  type VillagerId,
} from '../src';
import { findTile, kiwi, knowTruth, rich, setup, T0 } from './helpers';

const PAD = 'bpad' as BuildingId;

/** Iron age, a Kikiwiwi, a big launchpad and a crowd of strong warriors and mages. */
function siegeColony(seed = 'siege') {
  const { map, state } = setup('kiwisu', seed);
  const s: GameState = rich(state);
  s.buildings[0]!.level = 4;
  const pad = findTile(map, 'flesh', 2);
  const mon = findTile(map, 'flesh', 6);
  s.buildings.push(
    { id: PAD, type: 'launchpad', q: pad.q, r: pad.r, level: 3, richness: 1, builtAt: T0 },
    {
      id: 'bmon' as BuildingId,
      type: 'monument',
      q: mon.q,
      r: mon.r,
      level: 2,
      richness: 1,
      builtAt: T0,
    },
  );
  const crowd = Array.from({ length: 30 }, (_, i) => {
    const v = kiwi(`vs${i}`, `S${i}`);
    v.level = 15;
    v.classId = i % 3 === 2 ? 'mage' : 'warrior';
    v.stats = { ...v.stats, strength: 10, endurance: 10, dexterity: 10 };
    return v;
  });
  const titan = kiwi('vtitan', 'Titan');
  titan.level = 15;
  titan.kikiwiwi = { since: T0 };
  s.villagers = [...s.villagers, ...crowd, titan];
  return { map, s };
}

/** Everything known: a fresh report, every sector deep-seen, the holds and the queen exact. */
function knowSiege(state: GameState, at: number): GameState {
  const s = knowTruth(state, at);
  const id = s.targets[0]!.id;
  const g = s.aliens![id]!;
  const truth = siegeTruth(g);
  const report = s.intel[id]!;
  report.sectors = Array.from({ length: INTEL.sectors }, (_, i) => i);
  const exact = (v: number) => ({ at, min: v, max: v });
  const q = queenPower({ ...s, siege: { ...s.siege, bridgeheads: [] } }, g, at);
  report.siege = {
    seen: [...report.sectors],
    holds: Object.fromEntries(SIEGE.outerSectors.map((x) => [x, exact(truth.holds[x]! * 1.2)])),
    queen: { sector: truth.queenSector, ground: exact(q.ground), air: exact(q.air) },
  };
  return s;
}

const strong = (s: GameState, n: number, skip: string[] = []) =>
  s.villagers
    .filter(
      (v) =>
        v.id.startsWith('vs') &&
        !skip.includes(v.id) &&
        (v.job.kind === 'idle' || v.job.kind === 'work'),
    )
    .slice(0, n)
    .map((v) => v.id);

function launch(s: GameState, cmd: Partial<Extract<Command, { type: 'launchExpedition' }>>) {
  const full: Command = {
    type: 'launchExpedition',
    launchpadId: PAD,
    targetId: s.targets[0]!.id,
    crew: [],
    provisions: { pulp: 400, juice: 200 },
    ...cmd,
  };
  return applyCommand(s, full, { now: s.now, map: setup('kiwisu', 'siege').map });
}

const ok = (r: ReturnType<typeof launch>) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

/** Takes `sector` with `n` strong kiwis, `stay` of them holding it. */
function takeSector(s: GameState, sector: number, stay: VillagerId[], n = 10): GameState {
  const crew = [...new Set([...stay, ...strong(s, n, stay)])].slice(0, Math.max(n, stay.length));
  const launched = ok(launch(s, { mission: 'assault', sector, crew, holders: stay }));
  const e = launched.expeditions.at(-1)!;
  return advance(launched, e.returnAt).state;
}

describe('the siege opens at the Iron age with a Kikiwiwi (chantier 19)', () => {
  it('stays closed before, and never for a conquered face', () => {
    const { s } = siegeColony();
    expect(siegeLock(s)).toBeNull();
    const young = cloneState(s);
    young.buildings = young.buildings.map((b) => (b.type === 'monument' ? { ...b, level: 1 } : b));
    expect(siegeLock(young)).toBe('ageTooLow');
    const plain = cloneState(s);
    plain.villagers = plain.villagers.filter((v) => !v.kikiwiwi);
    expect(siegeLock(plain)).toBe('needsKikiwiwi');
    const won = cloneState(s);
    won.siege.conqueredAt = T0;
    expect(siegeLock(won)).toBe('conquered');
  });

  it('draws the holds and the queen from the secret seed only', () => {
    const { s } = siegeColony();
    const g = s.aliens![s.targets[0]!.id]!;
    const a = siegeTruth(g);
    expect(siegeTruth({ seed: g.seed })).toEqual(a);
    expect(siegeTruth({ seed: `${g.seed}x` })).not.toEqual(a);
    expect(a.queenSector).toBeGreaterThanOrEqual(0);
    expect(a.queenSector).toBeLessThan(6);
    for (const x of SIEGE.outerSectors) {
      expect(a.holds[x]).toBeGreaterThanOrEqual(SIEGE.hold.base * SIEGE.hold.spread[0] - 0.1);
      expect(a.holds[x]).toBeLessThanOrEqual(SIEGE.hold.base * SIEGE.hold.spread[1] + 0.1);
    }
    // Nothing of it is in the state a client receives.
    expect(JSON.stringify(publicState(s))).not.toContain(g.seed);
  });
});

describe('deep reconnaissance', () => {
  it('reports the holds of the outer sectors seen and finds the queen, truth inside', () => {
    const { s } = siegeColony('deep');
    let state = s;
    const id = s.targets[0]!.id;
    for (let i = 0; i < 8 && !siegeView(state, state.now).queen; i++) {
      const scouts = strong(state, 2);
      const launched = ok(launch(state, { mission: 'recon', crew: scouts }));
      state = advance(launched, launched.expeditions.at(-1)!.returnAt).state;
    }
    const view = siegeView(state, state.now);
    const g = state.aliens![id]!;
    const truth = siegeTruth(g);
    expect(view.queen?.sector).toBe(truth.queenSector);
    const holds = Object.entries(state.intel[id]!.siege!.holds);
    expect(holds.length).toBeGreaterThan(0);
    for (const [k, r] of holds) {
      expect(SIEGE.outerSectors).toContain(Number(k));
      const real = truth.holds[Number(k)]!;
      // The truth grew a little since: it lies inside the range at the time of the report.
      expect(r.min).toBeLessThanOrEqual(real * 2);
      expect(r.max).toBeGreaterThanOrEqual(real);
    }
    // A later raid keeps what the siege learnt.
    const raid = ok(launch(state, { mission: 'raid', crew: strong(state, 10) }));
    const after = advance(raid, raid.expeditions.at(-1)!.arriveAt).state;
    expect(after.intel[id]!.source).toBe('raid');
    expect(after.intel[id]!.siege?.queen?.sector).toBe(truth.queenSector);
  });
});

describe('assaults and bridgeheads', () => {
  it('refuses unseen or inner sectors, holders outside the crew, and a fourth bridgehead', () => {
    const { map } = setup('kiwisu', 'siege');
    const c = siegeColony();
    const ctx = { now: c.s.now, map };
    const base = {
      type: 'launchExpedition' as const,
      launchpadId: PAD,
      targetId: c.s.targets[0]!.id,
      provisions: { pulp: 400, juice: 200 },
      mission: 'assault' as const,
    };
    const crew = strong(c.s, 6);
    expect(validateCommand(c.s, { ...base, crew, sector: 6, holders: [crew[0]!] }, ctx)).toBe(
      'sectorUnseen',
    );
    const known = knowSiege(c.s, c.s.now);
    expect(validateCommand(known, { ...base, crew, sector: 2, holders: [crew[0]!] }, ctx)).toBe(
      'notASector',
    );
    expect(validateCommand(known, { ...base, crew, sector: 6, holders: [] }, ctx)).toBe(
      'invalidHolders',
    );
    expect(
      validateCommand(known, { ...base, crew, sector: 6, holders: ['vs29' as VillagerId] }, ctx),
    ).toBe('invalidHolders');
    expect(
      validateCommand(known, { ...base, crew, sector: 6, holders: [crew[0]!] }, ctx),
    ).toBeNull();
    const full = cloneState(known);
    full.siege.bridgeheads = [7, 8, 9].map((sector) => ({
      sector,
      since: T0,
      holders: [],
      fortified: false,
    }));
    expect(assaultLock(full, 6)).toBe('bridgeheadLimit');
    expect(assaultLock(full, 7)).toBe('bridgeheadHere');
  });

  it('a won assault leaves the holders on their post, fed from the colony stock', () => {
    const { s } = siegeColony();
    const known = knowSiege(s, s.now);
    const stay = strong(known, 3);
    const eatersBefore = consumption(known).pulp;
    const launched = ok(
      launch(known, { mission: 'assault', sector: 7, crew: strong(known, 10), holders: stay }),
    );
    const e = launched.expeditions[0]!;
    // Away: they eat their rations, not the colony stock.
    expect(consumption(launched).pulp).toBeLessThan(eatersBefore);
    expect(
      forecastExpedition(known, { ...e, crew: strong(known, 10), holders: stay })!.returnCrew,
    ).toHaveLength(7);
    const landed = advance(launched, e.arriveAt).state;
    const result = landed.expeditions[0]!.result!;
    expect(result.victory).toBe(true);
    expect(result.bridgehead).toBe(true);
    const b = landed.siege.bridgeheads[0]!;
    expect(b.sector).toBe(7);
    expect(b.holders).toEqual(stay);
    for (const id of stay)
      expect(landed.villagers.find((v) => v.id === id)!.job).toEqual({
        kind: 'outpost',
        sector: 7,
      });
    expect(landed.expeditions[0]!.crew).toHaveLength(7);
    // The holders eat from the colony again, but sleep on their bridgehead.
    const home = advance(landed, e.returnAt).state;
    expect(consumption(home).pulp).toBeCloseTo(eatersBefore, 6);
    const beds = bedsOf(home);
    for (const id of stay) expect(beds.has(id)).toBe(false);
    // The exact hold is now known; a counter-attack is planned and announced 6 h ahead.
    expect(home.intel[home.targets[0]!.id]!.siege!.holds['7']!.min).toBe(result.defense);
    const c = home.siege.counter!;
    expect(c.sector).toBe(7);
    expect(c.at - b.since).toBeGreaterThanOrEqual(SIEGE.counter.intervalMs[0]);
    expect(c.at - b.since).toBeLessThanOrEqual(SIEGE.counter.intervalMs[1]);
    expect(c.at - c.announceAt).toBe(SIEGE.counter.noticeMs);
    const announced = advance(home, c.announceAt);
    expect(announced.events.some((x) => x.type === 'counterAnnounced')).toBe(true);
    expect(counterForecast(announced.state, announced.state.now)!.enemy).not.toBeNull();
  });

  it('a lost assault kills like a raid and leaves no bridgehead', () => {
    const { s } = siegeColony();
    const known = knowSiege(s, s.now);
    const weak = known.villagers
      .filter((v) => !v.id.startsWith('vs') && !v.kikiwiwi)
      .map((v) => v.id);
    const launched = ok(
      launch(known, { mission: 'assault', sector: 8, crew: weak, holders: [weak[0]!] }),
    );
    const landed = advance(launched, launched.expeditions[0]!.arriveAt).state;
    expect(landed.expeditions[0]!.result!.victory).toBe(false);
    expect(landed.siege.bridgeheads).toHaveLength(0);
    expect(landed.memorial.length).toBeGreaterThan(0);
  });
});

describe('counter-attacks', () => {
  it('only the server resolves them: the client waits for the news', () => {
    const { s } = siegeColony();
    const held = takeSector(knowSiege(s, s.now), 9, strong(s, 4));
    const c = held.siege.counter!;
    const client = advance(publicState(held), c.at + HOUR_MS).state;
    expect(client.siege.counter?.announced).toBe(true);
    expect(counterAwaited(client, client.now)).toBe(true);
    const server = advance(held, c.at + HOUR_MS).state;
    expect(server.siege.counter?.id).not.toBe(c.id);
    expect(server.siege.reports.at(-1)!.id).toBe(c.id);
    expect(counterAwaited(server, server.now)).toBe(false);
  });

  it('strong holders repel it; a lone holder loses the bridgehead (heavy losses)', () => {
    const { s } = siegeColony();
    const known = knowSiege(s, s.now);
    const firm = takeSector(known, 9, strong(known, 8));
    const c1 = firm.siege.counter!;
    const after = advance(firm, c1.at).state;
    expect(after.siege.reports.at(-1)!.victory).toBe(true);
    expect(after.siege.bridgeheads).toHaveLength(1);

    const lone = cloneState(firm);
    const b = lone.siege.bridgeheads[0]!;
    // Every holder but one flies home (no ship needed for the test): one weak kiwi is left.
    for (const v of lone.villagers) if (v.job.kind === 'outpost') v.job = { kind: 'idle' };
    const weakling = lone.villagers.find((v) => !v.id.startsWith('vs') && !v.kikiwiwi)!;
    weakling.job = { kind: 'outpost', sector: b.sector };
    b.holders = [weakling.id];
    const struck = advance(lone, lone.siege.counter!.at);
    const report = struck.state.siege.reports.at(-1)!;
    expect(report.victory).toBe(false);
    expect(struck.state.siege.bridgeheads).toHaveLength(0);
    expect(struck.events.some((x) => x.type === 'counterStruck' && !x.victory)).toBe(true);
    // One holder: lost at 50–90 % → rounded, possibly a survivor flying home.
    const away = struck.state.expeditions.filter((e) => e.mission === 'retreat');
    expect(report.dead.length + away.reduce((n, e) => n + e.crew.length, 0)).toBe(1);
  });

  it('kills between half and nine tenths of the holders when it wins', () => {
    const { s } = siegeColony();
    const held = takeSector(knowSiege(s, s.now), 10, strong(s, 6));
    const weak = cloneState(held);
    // Strip the holders of their strength: the aliens win.
    for (const v of weak.villagers)
      if (v.job.kind === 'outpost') {
        v.level = 1;
        v.stats = { ...v.stats, strength: 1, endurance: 1 };
        v.classId = null;
      }
    const struck = advance(weak, weak.siege.counter!.at).state;
    const report = struck.siege.reports.at(-1)!;
    expect(report.victory).toBe(false);
    expect(report.dead.length).toBeGreaterThanOrEqual(Math.round(6 * SIEGE.fallLosses[0]));
    expect(report.dead.length).toBeLessThanOrEqual(Math.round(6 * SIEGE.fallLosses[1]));
    const retreat = struck.expeditions.find((e) => e.mission === 'retreat')!;
    expect(retreat.crew).toHaveLength(6 - report.dead.length);
    const home = advance(struck, retreat.returnAt).state;
    expect(home.expeditions.find((e) => e.id === retreat.id)!.status).toBe('done');
    expect(
      home.villagers
        .filter((v) => retreat.crew.includes(v.id))
        .every((v) => v.job.kind !== 'expedition'),
    ).toBe(true);
  });
});

describe('reinforcements and fortification', () => {
  it('brings kiwis to a bridgehead and others home; an emptied one is abandoned', () => {
    const { s } = siegeColony();
    const stay = strong(s, 3);
    const held = takeSector(knowSiege(s, s.now), 6, stay);
    const fresh = strong(held, 2, stay);
    const launched = ok(
      launch(held, { mission: 'reinforce', sector: 6, crew: fresh, bringBack: [stay[0]!] }),
    );
    const landed = advance(launched, launched.expeditions.at(-1)!.arriveAt).state;
    const b = landed.siege.bridgeheads[0]!;
    expect(b.holders).toEqual([stay[1], stay[2], ...fresh]);
    expect(landed.expeditions.at(-1)!.crew).toEqual([stay[0]]);
    // An empty ship can fly to bring everybody home.
    const all = b.holders;
    const back = advance(landed, landed.expeditions.at(-1)!.returnAt).state;
    const empty = ok(launch(back, { mission: 'reinforce', sector: 6, crew: [], bringBack: all }));
    const done = advance(empty, empty.expeditions.at(-1)!.returnAt).state;
    expect(done.siege.bridgeheads).toHaveLength(0);
    expect(done.siege.counter).toBeNull();
    expect(done.villagers.filter((v) => v.job.kind === 'outpost')).toHaveLength(0);
  });

  it('a Kikiwiwi on the bridgehead fortifies it in 12 h for juice', () => {
    const { map } = setup('kiwisu', 'siege');
    const c = siegeColony();
    const held = takeSector(knowSiege(c.s, c.s.now), 11, strong(c.s, 3));
    const ctx = { now: held.now, map };
    expect(validateCommand(held, { type: 'fortifyBridgehead', sector: 11 }, ctx)).toBe(
      'notAKikiwiwi',
    );
    expect(validateCommand(held, { type: 'fortifyBridgehead', sector: 6 }, ctx)).toBe(
      'noBridgehead',
    );
    const titan = held.villagers.find((v) => v.kikiwiwi)!.id;
    const sent = ok(
      launch(held, {
        mission: 'reinforce',
        sector: 11,
        crew: [titan],
        provisions: { pulp: 100, juice: 50 },
      }),
    );
    const there = advance(sent, sent.expeditions.at(-1)!.returnAt).state;
    const juice = there.resources.juice;
    const r = applyCommand(
      there,
      { type: 'fortifyBridgehead', sector: 11 },
      { now: there.now, map },
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.state.resources.juice).toBeCloseTo(juice - SIEGE.fortify.juice, 0);
    const b = r.state.siege.bridgeheads[0]!;
    expect(b.fortifyUntil).toBe(there.now + SIEGE.fortify.durationMs);
    expect(
      validateCommand(r.state, { type: 'fortifyBridgehead', sector: 11 }, { now: there.now, map }),
    ).toBe('fortifying');
    const done = advance(r.state, b.fortifyUntil!);
    expect(done.state.siege.bridgeheads[0]!.fortified).toBe(true);
    expect(done.events.some((x) => x.type === 'bridgeheadFortified')).toBe(true);
  });
});

describe('the final assault on the queen', () => {
  /** Two bridgeheads, one fortified by the Kikiwiwi, the queen located. */
  function besieged() {
    const { s } = siegeColony();
    let state = takeSector(knowSiege(s, s.now), 6, strong(s, 3));
    state = takeSector(state, 9, strong(state, 3));
    const b = state.siege.bridgeheads[0]!;
    const titan = state.villagers.find((v) => v.kikiwiwi)!;
    titan.job = { kind: 'outpost', sector: b.sector };
    b.holders.push(titan.id);
    b.fortified = true;
    // No counter-attack before the final assault lands.
    state.siege.counter = null;
    state.siege.lastCounterAt = state.now + 10 * CALENDAR.dayMs;
    return state;
  }

  it('needs the queen located, two bridgeheads and one fortified', () => {
    const state = besieged();
    expect(finalLock(state)).toBeNull();
    const one = cloneState(state);
    one.siege.bridgeheads = one.siege.bridgeheads.slice(0, 1);
    expect(finalLock(one)).toBe('needBridgeheads');
    const bare = cloneState(state);
    for (const b of bare.siege.bridgeheads) b.fortified = false;
    expect(finalLock(bare)).toBe('needFortified');
    const blind = cloneState(state);
    delete blind.intel[blind.targets[0]!.id]!.siege!.queen;
    expect(finalLock(blind)).toBe('queenUnknown');
  });

  it('a strong army brings the queen down: the face is conquered, everyone flies home', () => {
    const state = besieged();
    const holders = state.siege.bridgeheads.flatMap((b) => b.holders);
    const crew = strong(state, 18, holders);
    const f = finalForecast(
      state,
      state.villagers.filter((v) => crew.includes(v.id)),
      1,
      state.now,
    );
    expect(f.reduction).toBeGreaterThanOrEqual(2 * SIEGE.queen.perBridgehead);
    expect(f.odds).toBe('likely');
    const launched = ok(launch(state, { mission: 'final', crew }));
    const e = launched.expeditions.at(-1)!;
    const landed = advance(launched, e.arriveAt);
    const result = landed.state.expeditions.at(-1)!.result!;
    expect(result.victory).toBe(true);
    expect(result.queenFallen).toBe(true);
    expect(landed.state.siege.conqueredAt).toBe(e.arriveAt);
    expect(landed.state.siege.bridgeheads).toHaveLength(0);
    expect(landed.state.intel[state.targets[0]!.id]!.sectors).toHaveLength(INTEL.sectors);
    const home = advance(landed.state, e.returnAt).state;
    expect(
      home.villagers.filter((v) => v.job.kind === 'outpost' || v.job.kind === 'expedition'),
    ).toHaveLength(0);
    for (const id of holders) expect(home.villagers.some((v) => v.id === id)).toBe(true);
    // No more missions to a conquered face.
    expect(launch(home, { mission: 'raid', crew: strong(home, 4) })).toMatchObject({
      ok: false,
      error: 'conquered',
    });
  });

  it('a weak army is crushed, but the bridgeheads stay with their survivors', () => {
    const state = besieged();
    const holders = state.siege.bridgeheads.flatMap((b) => b.holders);
    const weak = state.villagers
      .filter((v) => !v.id.startsWith('vs') && !v.kikiwiwi)
      .map((v) => v.id);
    const launched = ok(launch(state, { mission: 'final', crew: weak }));
    const e = launched.expeditions.at(-1)!;
    const landed = advance(launched, e.arriveAt).state;
    const result = landed.expeditions.at(-1)!.result!;
    expect(result.victory).toBe(false);
    expect(result.lostInBattle.length).toBeGreaterThan(0);
    expect(landed.siege.conqueredAt).toBe(0);
    const alive = new Set(landed.villagers.map((v) => v.id));
    for (const b of landed.siege.bridgeheads) {
      expect(b.holders.length).toBeGreaterThan(0);
      expect(b.holders.every((id) => alive.has(id))).toBe(true);
    }
    expect(landed.siege.bridgeheads.flatMap((b) => b.holders).length).toBeLessThanOrEqual(
      holders.length,
    );
  });
});

describe('offline and saves', () => {
  it('is the same in one big step or many small ones', () => {
    const { s } = siegeColony();
    const held = takeSector(knowSiege(s, s.now), 7, strong(s, 5));
    const end = held.now + 3 * CALENDAR.dayMs;
    const big = advance(held, end).state;
    let small = held;
    for (let t = held.now; t < end; t += 37 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.siege).toEqual(big.siege);
    expect(small.villagers).toEqual(big.villagers);
    expect(small.rng).toEqual(big.rng);
  });

  it('migrates v21 saves without a siege', () => {
    const { state } = setup('kiwisu', 'mig');
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    old.schemaVersion = 21;
    delete old.siege;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.siege.bridgeheads).toEqual([]);
    expect(m.state.siege.counter).toBeNull();
  });
});

describe('the server resolves the siege', () => {
  function ctxFor() {
    const repo = createMemoryRepository();
    let now = T0;
    let seeds = 0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => `secret-${++seeds}`,
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + seeds) % 256),
    };
    return { ctx, repo, tick: (ms: number) => (now += ms), at: (t: number) => (now = t) };
  }
  const hidden = (r: GameResponse) => {
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"aliens":\{/);
    expect(text).not.toMatch(/secret-\d+\/aliens:/);
    return r;
  };

  it('resolves a counter-attack that struck while away, on load', async () => {
    const { ctx, repo, at } = ctxFor();
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const { s } = siegeColony();
    const held = takeSector(knowSiege(s, s.now), 8, strong(s, 6));
    const c = held.siege.counter!;
    repo.games.set(game.id, { ...game, state: held });
    at(c.at + HOUR_MS);
    const r = hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(r.ok && r.events.some((x) => x.type === 'counterStruck')).toBe(true);
    expect(r.state!.siege.reports.at(-1)!.id).toBe(c.id);
  });

  it('an imported save loses its siege (nobody can check it)', () => {
    const { s } = siegeColony();
    const held = takeSector(knowSiege(s, s.now), 8, strong(s, 4));
    const flying = ok(
      launch(held, {
        mission: 'assault',
        sector: 9,
        crew: strong(held, 6),
        holders: strong(held, 1),
      }),
    );
    const imported = cloneState(flying);
    resetSiege(imported);
    expect(imported.siege.bridgeheads).toEqual([]);
    expect(
      imported.expeditions.some((e) => e.mission === 'assault' && e.status === 'outbound'),
    ).toBe(false);
    expect(
      imported.villagers.some((v) => v.job.kind === 'outpost' || v.job.kind === 'expedition'),
    ).toBe(false);
    expect(imported.intel[imported.targets[0]!.id]!.siege).toBeUndefined();
  });
});
