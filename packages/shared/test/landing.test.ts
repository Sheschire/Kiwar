import { describe, expect, it } from 'vitest';
import {
  advance,
  cloneState,
  civOf,
  deserializeSave,
  forecastExpedition,
  hashSeed,
  HOUR_MS,
  LANDING,
  migrateState,
  resetLandings,
  landingOutcome,
  landingSetup,
  parcelTruth,
  publicState,
  repairCost,
  repairDuration,
  serializeSave,
  simulateBattle,
  validateCommand,
  awaitingReport,
  createMemoryRepository,
  handleGameRequest,
  type Command,
  type GameResponse,
  type ServiceContext,
  type GameState,
  type LandingOrders,
  type Villager,
} from '../src';
import { findTile, kiwi, rich, run, setup, siteFor, T0 } from './helpers';

/** A colony with a Nest 2, a launchpad and plenty of kiwis, ready to land. */
function landingColony(extraKiwis = 8, seed = 'landing') {
  const { map, state } = setup('kiwisu', seed);
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(
    s,
    { type: 'build', buildingType: 'launchpad', ...siteFor(s, map, 'launchpad', flesh) },
    t,
    map,
  );
  t += HOUR_MS;
  s = advance(s, t).state;
  for (let i = 0; i < extraKiwis; i++)
    s = { ...s, villagers: [...s.villagers, kiwi(`vx${i}`, `Kiwi${i}`, t)] };
  s = { ...s, resources: { pulp: 3000, fiber: 3000, seeds: 3000, juice: 3000 } };
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  return { map, s, t, padId: pad.id, targetId: s.targets[0]!.id };
}

/** Champions: high level, strong, armed; half warriors, half mages (for the bats). */
function champions(s: GameState, ids: string[]): GameState {
  return {
    ...s,
    villagers: s.villagers.map((v): Villager =>
      ids.includes(v.id)
        ? {
            ...v,
            level: 20,
            classId: ids.indexOf(v.id) % 2 === 0 ? 'warrior' : 'mage',
            stats: { ...v.stats, strength: 18, endurance: 18, agility: 14 },
            gear: {
              weapon: ids.indexOf(v.id) % 2 === 0 ? 'blade-steel' : 'staff-steel',
              armor: 'heavy-steel',
            },
          }
        : v,
    ),
  };
}

const orders = (o: Partial<LandingOrders> = {}): LandingOrders => ({
  ...LANDING.defaultOrders,
  ...o,
});

function land(
  padId: string,
  targetId: string,
  crew: string[],
  sector: number,
  o: Partial<LandingOrders> = {},
): Extract<Command, { type: 'launchExpedition' }> {
  return {
    type: 'launchExpedition',
    launchpadId: padId as never,
    targetId,
    crew: crew as never,
    provisions: { pulp: 200, juice: 100 },
    mission: 'land',
    sector,
    orders: orders(o),
  };
}

/** Advances past the arrival; returns the state and the landing. */
function arrive(s: GameState, t: number) {
  const e = s.expeditions[s.expeditions.length - 1]!;
  const after = advance(s, e.arriveAt + 1).state;
  return { state: after, e: after.expeditions.find((x) => x.id === e.id)!, t };
}

describe('the landing (chantier 40)', () => {
  it('validates the parcel and the orders', () => {
    const { s, t, map, padId, targetId } = landingColony();
    const ids = s.villagers.slice(-4).map((v) => v.id);
    const ctx = { now: t, map };
    expect(validateCommand(s, land(padId, targetId, ids, 7), ctx)).toBeNull();
    expect(validateCommand(s, { ...land(padId, targetId, ids, 7), sector: undefined }, ctx)).toBe(
      'notASector',
    );
    expect(validateCommand(s, land(padId, targetId, ids, 7, { retreatAt: 0.95 }), ctx)).toBe(
      'invalidOrders',
    );
    const withBeacon = cloneState(s);
    withBeacon.faceViews[targetId] = { beacons: [{ sector: 7, since: t }], parcels: {} };
    expect(validateCommand(withBeacon, land(padId, targetId, ids, 7), ctx)).toBe('beaconHere');
    // Orders belong to landings only.
    expect(validateCommand(s, { ...land(padId, targetId, ids, 7), mission: 'raid' }, ctx)).toBe(
      'invalidMission',
    );
  });

  it('plays the same battle for the same setup and seed', () => {
    const { s, targetId } = landingColony();
    const g = s.aliens![targetId]!;
    const truth = parcelTruth(s, g, targetId, 8, s.now);
    const input = {
      sector: 8,
      units: truth.units,
      help: truth.help,
      buildings: truth.buildings,
      orders: orders(),
      fed: 1,
    };
    const crew = s.villagers.slice(-4);
    const a = simulateBattle(landingSetup(s, crew, input), 'same');
    const b = simulateBattle(landingSetup(s, crew, input), 'same');
    expect(a).toEqual(b);
    expect(a.result.lost).toBeDefined();
    expect(['victory', 'retreat', 'defeat']).toContain(landingOutcome(a));
  });

  it('wins the edge with a prepared crew: beacon, burn, bestiary, veterans', () => {
    const base = landingColony(10);
    const ids = base.s.villagers.slice(-6).map((v) => v.id);
    const s = champions(base.s, ids);
    const launched = run(s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
    // The launch pays the fee and the rations.
    expect(launched.resources.fiber).toBeLessThan(s.resources.fiber);
    const { state, e } = arrive(launched, base.t);
    expect(e.result!.outcome).toBe('victory');
    expect(e.result!.beacon).toBe(true);
    expect(e.result!.burnt).toBe(true);
    expect(e.result!.log).toBeDefined();
    const face = state.faceViews[base.targetId]!;
    expect(face.beacons.map((b) => b.sector)).toEqual([8]);
    expect(face.parcels['8']!.source).toBe('beacon');
    // The edge of the neighbouring parcels is lit.
    expect(Object.values(face.parcels).some((p) => p.source === 'edge')).toBe(true);
    expect(Object.keys(state.bestiary).length).toBeGreaterThan(0);
    // The civilisation lost hours in the burnt parcel.
    const civ = civOf(state.aliens![base.targetId]!);
    expect(civ.log.some((l) => l.kind === 'burn' && l.sector === 8)).toBe(true);
    // Home: the survivors are veterans.
    const home = advance(state, e.returnAt + 1).state;
    const back = home.villagers.filter((v) => e.crew.includes(v.id));
    expect(back.length).toBeGreaterThan(0);
    expect(back.every((v) => (v.veteran ?? 0) >= 1)).toBe(true);
  });

  it('loses everything in the centre with a weak crew: crew, ship, gear and sight', () => {
    const base = landingColony(4, 'landing-defeat');
    const ids = base.s.villagers.slice(-2).map((v) => v.id);
    // Weak kiwis carrying a piece each: it stays with the aliens.
    const s: GameState = {
      ...base.s,
      villagers: base.s.villagers.map((v) =>
        ids.includes(v.id) ? { ...v, gear: { armor: 'light-stone' } } : v,
      ),
    };
    const launched = run(
      s,
      land(base.padId, base.targetId, ids, 2, { retreatAt: 0.8 }),
      base.t,
      base.map,
    );
    const { state, e } = arrive(launched, base.t);
    expect(e.result!.outcome).toBe('defeat');
    expect(e.status).toBe('done');
    expect(e.result!.shipLost).toBe(true);
    expect(state.villagers.some((v) => ids.includes(v.id))).toBe(false);
    expect(state.memorial.filter((m) => ids.includes(m.id))).toHaveLength(2);
    expect(state.forge.armory['light-stone'] ?? 0).toBe(0);
    expect(state.faceViews[base.targetId]?.parcels['2']).toBeUndefined();
    const civ = civOf(state.aliens![base.targetId]!);
    expect(civ.log.some((l) => l.kind === 'defeat')).toBe(true);
    // The ship must be rebuilt: the launchpad is damaged until its repair.
    const pad = state.buildings.find((b) => b.id === base.padId)!;
    expect(pad.damaged).toBe(true);
    expect(pad.shipLost).toBe('wood');
    expect(repairDuration(pad)).toBe(LANDING.rebuild.hours.wood * HOUR_MS);
    expect(repairCost(pad)).toMatchObject({ fiber: 400, juice: 250 });
    const ctx = { now: e.arriveAt + 1, map: base.map };
    const others = state.villagers.slice(-2).map((v) => v.id);
    expect(validateCommand(state, land(base.padId, base.targetId, others, 8), ctx)).toBe(
      'launchpadDamaged',
    );
    // The automation orders the repair on its own (else the player does).
    const ordered = state.queue.some((q) => q.kind === 'repair' && q.buildingId === base.padId)
      ? state
      : run(state, { type: 'repair', buildingId: base.padId }, e.arriveAt + 1, base.map);
    const fixed = advance(ordered, e.arriveAt + 1 + 2 * repairDuration(pad)).state;
    const after = fixed.buildings.find((b) => b.id === base.padId)!;
    expect(after.damaged).toBeUndefined();
    expect(after.shipLost).toBeUndefined();
  });

  it('retreats past the threshold: the survivors bring back a dated glimpse', () => {
    let found = false;
    for (let i = 0; i < 6 && !found; i++) {
      const base = landingColony(8, `landing-retreat-${i}`);
      const ids = base.s.villagers.slice(-5).map((v) => v.id);
      const launched = run(
        base.s,
        land(base.padId, base.targetId, ids, 9 + (i % 3), { retreatAt: 0.3 }),
        base.t,
        base.map,
      );
      const { state, e } = arrive(launched, base.t);
      if (e.result!.outcome !== 'retreat') continue;
      found = true;
      const sector = e.sector!;
      const view = state.faceViews[base.targetId]!.parcels[String(sector)]!;
      expect(view.source).toBe('retreat');
      expect(view.units.length).toBeGreaterThan(0);
      expect(state.faceViews[base.targetId]!.beacons).toHaveLength(0);
      expect(e.status).toBe('returning');
      expect(e.crew.length).toBeGreaterThan(0);
      expect(e.crew.length).toBeLessThan(ids.length);
    }
    expect(found).toBe(true);
  });

  it('a breakdown delays the landing instead of cancelling it', () => {
    const base = landingColony();
    const ids = base.s.villagers.slice(-3).map((v) => v.id);
    let delayed = null;
    for (let i = 0; i < 80 && !delayed; i++) {
      const s = { ...base.s, rng: hashSeed(`breakdown-${i}`) };
      const launched = run(s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
      const e = launched.expeditions[0]!;
      if (e.delayed) delayed = e;
    }
    expect(delayed).not.toBeNull();
    expect(delayed!.broken).toBeUndefined();
    const travel = delayed!.returnAt - delayed!.arriveAt;
    expect(delayed!.arriveAt - delayed!.departedAt).toBe(
      Math.round((travel * LANDING.breakdown.delay) / 1000) * 1000,
    );
  });

  it('waits for the server and leaks nothing before the landing', () => {
    const base = landingColony();
    const ids = base.s.villagers.slice(-3).map((v) => v.id);
    const launched = run(base.s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
    const client = publicState(launched);
    const e = client.expeditions[0]!;
    const after = advance(client, e.arriveAt + 1).state;
    expect(after.expeditions[0]!.status).toBe('outbound');
    expect(awaitingReport(after, e.arriveAt + 1)).toHaveLength(1);
    const json = JSON.stringify(client);
    expect(json).not.toContain('"aliens":{');
    expect(json).not.toContain('"parcels":{"8"');
  });

  it('forecasts honestly: the unseen centre is formidable, the edge a guess', () => {
    const base = landingColony();
    const ids = base.s.villagers.slice(-4).map((v) => v.id);
    const plan = (sector: number) => ({
      launchpadId: base.padId,
      targetId: base.targetId,
      crew: ids as never,
      provisions: { pulp: 200, juice: 100 },
      mission: 'land' as const,
      sector,
      orders: orders(),
    });
    const centre = forecastExpedition(publicState(base.s), plan(1))!.landing!;
    expect(centre.knowledge).toBe('formidable');
    expect(centre.odds).toBe('unknown');
    expect(centre.power).toBeNull();
    const edge = forecastExpedition(publicState(base.s), plan(8))!.landing!;
    expect(edge.knowledge).toBe('guess');
    expect(edge.trials).toHaveLength(3);
    expect(edge.power!.max).toBeGreaterThan(edge.power!.min);
  });

  it('saves and loads beacons, glimpses, the bestiary and the journal', () => {
    const base = landingColony(10);
    const ids = base.s.villagers.slice(-6).map((v) => v.id);
    const s = champions(base.s, ids);
    const launched = run(s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
    const { state } = arrive(launched, base.t);
    const loaded = deserializeSave(serializeSave(state, state.now));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.state.faceViews).toEqual(state.faceViews);
    expect(loaded.save.state.bestiary).toEqual(state.bestiary);
  });

  it('the server resolves the landing on load and only then shows the parcel', async () => {
    const repo = createMemoryRepository();
    let now = T0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => now,
      randomSeed: () => 'secret-1',
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i % 256),
    };
    const hidden = (r: GameResponse) => {
      const text = JSON.stringify(r);
      expect(text).not.toMatch(/"aliens":\{|"civ":\{|"keys":\[|"fights":\[/);
      return r;
    };
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const base = landingColony(10);
    const ids = base.s.villagers.slice(-6).map((v) => v.id);
    const s = champions(
      { ...base.s, aliens: { [base.targetId]: Object.values(game.state.aliens!)[0]! } },
      ids,
    );
    const launched = run(s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
    repo.games.set(game.id, { ...game, state: launched });
    const before = hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(before.state!.faceViews[base.targetId]).toBeUndefined();
    now = launched.expeditions[0]!.arriveAt + 1000;
    const r = hidden(await handleGameRequest(ctx, { action: 'load' }));
    const e = r.state!.expeditions[0]!;
    expect(e.result?.outcome).toBeDefined();
    expect(r.ok && r.events.some((x) => x.type === 'expeditionArrived')).toBe(true);
    if (e.result!.outcome !== 'defeat')
      expect(r.state!.faceViews[base.targetId]!.parcels['8']).toBeDefined();
  });

  it('migrates v33 saves: ships turn back, bridgeheads become beacons, reports dated views', () => {
    const base = landingColony();
    const s = base.s;
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.schemaVersion = 33;
    const holder = s.villagers[s.villagers.length - 1]!.id;
    const flyer = s.villagers[s.villagers.length - 2]!.id;
    raw.villagers = (raw.villagers as Record<string, unknown>[]).map((v) =>
      v.id === holder
        ? { ...v, job: { kind: 'outpost', sector: 9 } }
        : v.id === flyer
          ? { ...v, job: { kind: 'expedition', expeditionId: 'x9' } }
          : v,
    );
    raw.expeditions = [
      {
        id: 'x9',
        mission: 'raid',
        targetId: base.targetId,
        launchpadId: base.padId,
        crew: [flyer],
        roster: [{ id: flyer, name: 'F' }],
        provisions: { pulp: 10, juice: 5, fiber: 0, seeds: 0 },
        cargo: 150,
        departedAt: s.now,
        arriveAt: s.now + HOUR_MS,
        returnAt: s.now + 2 * HOUR_MS,
        status: 'outbound',
        result: null,
      },
    ];
    raw.siege = {
      ...(raw.siege as object),
      bridgeheads: [{ sector: 9, since: s.now - HOUR_MS, holders: [holder], fortified: false }],
      conqueredAt: 0,
    };
    raw.intel = {
      [base.targetId]: {
        at: s.now - HOUR_MS,
        source: 'recon',
        defense: { min: 5, max: 8 },
        ferrets: { min: 3, max: 5 },
        bats: { min: 2, max: 3 },
        victoriesAt: 0,
        sectors: [1, 7, 9],
        structures: [],
        civAge: 0,
      },
    };
    delete raw.faceViews;
    delete raw.bestiary;
    raw.schemaVersion = 32;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const st = m.state;
    expect(st.expeditions[0]).toMatchObject({ status: 'returning', result: { aborted: true } });
    expect(st.siege.bridgeheads).toEqual([]);
    expect(st.villagers.find((v) => v.id === holder)!.job.kind).toBe('idle');
    const face = st.faceViews[base.targetId]!;
    expect(face.beacons.map((b) => b.sector)).toEqual([9]);
    expect(face.parcels['7']).toMatchObject({ source: 'report', power: { min: 5, max: 8 } });
    expect(face.parcels['1']).toMatchObject({ source: 'report', power: { min: 10, max: 24 } });
    expect(face.parcels['9']).toBeUndefined();
    // The flyer comes home with the ship, as planned.
    const home = advance(st, st.now + 3 * HOUR_MS).state;
    expect(home.villagers.find((v) => v.id === flyer)!.job.kind).not.toBe('expedition');
  });

  it('keeps a conquered face conquered through the migration', () => {
    const { s } = landingColony();
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.schemaVersion = 33;
    raw.siege = { ...(raw.siege as object), conqueredAt: s.now };
    const m = migrateState(raw);
    expect(m.ok && m.state.siege.conqueredAt).toBe(s.now);
  });

  it('an imported save loses its beacons and its landings in flight', () => {
    const base = landingColony();
    const ids = base.s.villagers.slice(-3).map((v) => v.id);
    const launched = run(base.s, land(base.padId, base.targetId, ids, 8), base.t, base.map);
    launched.faceViews[base.targetId] = { beacons: [{ sector: 7, since: base.t }], parcels: {} };
    const imported = cloneState(launched);
    resetLandings(imported);
    expect(imported.faceViews).toEqual({});
    expect(imported.expeditions).toHaveLength(0);
    expect(imported.villagers.some((v) => v.job.kind === 'expedition')).toBe(false);
  });
});
