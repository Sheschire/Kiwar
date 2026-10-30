import { describe, expect, it } from 'vitest';
import {
  buildLock,
  cloneState,
  createMemoryRepository,
  DEPTHS,
  depthsMapOf,
  ensureDepths,
  handleGameRequest,
  HOUR_MS,
  LANDING,
  localDepthsSeed,
  migrateState,
  publicState,
  reachableRooms,
  roomTruth,
  serializeSave,
  ageOf,
  type BuildingId,
  type GameResponse,
  type GameState,
  type ServiceContext,
} from '../src';
import { delveColony, findTile, ironColony, setup, T0 } from './helpers';

describe('the depths: the network and what rooms hold (chantier 48)', () => {
  it('draws the same public network for everyone who knows the face', () => {
    const a = setup('kiwisu', 'net').state;
    const b = setup('kiwisu', 'net').state;
    const map = depthsMapOf(a);
    expect(depthsMapOf(b)).toBe(map);
    expect(JSON.stringify(depthsMapOf({ seed: 'net', face: 'kiwisu' }).rooms)).toBe(
      JSON.stringify(map.rooms),
    );
    const total = DEPTHS.rooms.reduce((acc, [lo, hi]) => [acc[0]! + lo, acc[1]! + hi], [0, 0]);
    const flesh = map.rooms.filter((r) => r.depth <= 3);
    expect(flesh.length).toBeGreaterThanOrEqual(total[0]!);
    expect(flesh.length).toBeLessThanOrEqual(total[1]!);
    // Every room can be reached from the entrance; links go both ways.
    const seen = new Set(map.rooms.filter((r) => r.entrance).map((r) => r.id));
    const todo = [...seen];
    while (todo.length) {
      const r = map.byId.get(todo.pop()!)!;
      for (const id of r.links) {
        expect(map.byId.get(id)!.links).toContain(r.id);
        if (!seen.has(id)) {
          seen.add(id);
          todo.push(id);
        }
      }
    }
    expect(seen.size).toBe(map.rooms.length);
    expect(depthsMapOf(setup('kiwino', 'net').state).rooms).not.toEqual(map.rooms);
  });

  it('fills rooms from the secret seed only, deterministically', () => {
    const { state } = setup('kiwisu', 'truth');
    const room = depthsMapOf(state).rooms[0]!;
    const t1 = roomTruth('secret-a/depths', room);
    expect(roomTruth('secret-a/depths', room)).toEqual(t1);
    expect(t1.units.some((u) => u.kind === 'larva')).toBe(true);
    const kinds = new Set(
      depthsMapOf(state).rooms.flatMap((r) =>
        Array.from({ length: 12 }, (_, i) => roomTruth(`s${i}`, r).kind),
      ),
    );
    expect(kinds.size).toBeGreaterThanOrEqual(4);
    // Scree always falls, raphides always cut.
    for (let i = 0; i < 40; i++) {
      const t = roomTruth(`k${i}`, room);
      if (t.kind === 'scree') expect(t.hazard?.kind).toBe('fall');
      if (t.kind === 'raphides') expect(t.hazard?.kind).toBe('cuts');
      if (t.kind === 'nest') expect(t.hazard).toBeNull();
    }
    expect(state.depthSeed).toBe(localDepthsSeed(state));
  });

  it('opens rooms next to the entrance, then next to a gallery', () => {
    const { s } = ironColony();
    const map = depthsMapOf(s);
    expect(reachableRooms(s).every((r) => r.entrance)).toBe(true);
    const first = map.rooms.find(
      (r) => r.entrance && r.links.some((id) => !map.byId.get(id)!.entrance),
    )!;
    s.depths.galleries[first.id] = { kind: 'bundle', since: s.now };
    const ids = reachableRooms(s).map((r) => r.id);
    expect(ids).not.toContain(first.id);
    for (const id of first.links) expect(ids).toContain(id);
  });

  it('builds one tunnel entrance, in the Iron age, with spelunking', () => {
    const { map, s } = ironColony();
    expect(ageOf(s)).toBe(2);
    expect(buildLock(s, 'tunnel')).toBeNull();
    const none = cloneState(s);
    none.research.done = ['stoneAge', 'ironAge'];
    expect(buildLock(none, 'tunnel')).toBe('techMissing');
    const at = findTile(map, 'flesh', 12);
    s.buildings.push({
      id: 'btun' as BuildingId,
      type: 'tunnel',
      q: at.q,
      r: at.r,
      level: 1,
      richness: 1,
      builtAt: T0,
    });
    expect(buildLock(s, 'tunnel')).toBe('tunnelExists');
    const sister = cloneState(none);
    sister.research.done = ['stoneAge', 'ironAge', 'spelunking'];
    sister.colony = { ...sister.colony, index: 1 };
    expect(buildLock(sister, 'tunnel')).toBe('notBuildable');
  });

  it('migrates v38 saves to empty depths, and draws the seed where the truth is held', () => {
    const { state } = setup('kiwisu', 'mig');
    const old = JSON.parse(JSON.stringify({ ...state, schemaVersion: 38 })) as Record<
      string,
      unknown
    >;
    delete old.depths;
    delete old.depthSeed;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.depths.views).toEqual({});
    expect(m.state.depths.galleries).toEqual({});
    expect(m.state.depths.door).toEqual({ closed: false, fort: 0 });
    expect(m.state.depthSeed).toBeUndefined();
    expect(ensureDepths(m.state, 'secret-9')).toBe(true);
    expect(m.state.depthSeed).toBe('secret-9/depths');
    expect(ensureDepths(m.state, 'secret-10')).toBe(false);
    expect(publicState(m.state).depthSeed).toBeUndefined();
  });
});

describe('the server never sends the depths seed', () => {
  function ctxFor(start = T0) {
    const repo = createMemoryRepository();
    let seeds = 0;
    const ctx: ServiceContext = {
      repo,
      userId: 'u1',
      now: () => start,
      randomSeed: () => `secret-${++seeds}`,
      randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + seeds) % 256),
    };
    return { ctx, repo };
  }
  const hidden = (r: GameResponse) => {
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"depthSeed"/);
    expect(text).not.toMatch(/secret-\d+\/depths/);
    return r;
  };

  it('keeps it stored, and draws a new one for imports', async () => {
    const { ctx, repo } = ctxFor();
    hidden(await handleGameRequest(ctx, { action: 'load' }));
    const stored = [...repo.games.values()][0]!.state;
    expect(stored.depthSeed).toMatch(/^secret-\d+\/depths$/);
    const { state } = setup('kiwisu', 'imp');
    const forged: GameState = {
      ...state,
      depthSeed: 'known/depths',
      depths: { ...state.depths, galleries: { r0: { kind: 'sap', since: T0 } } },
    };
    const { ctx: c2, repo: r2 } = ctxFor();
    const r = hidden(
      await handleGameRequest(c2, { action: 'import', save: serializeSave(forged, T0) }),
    );
    expect(r.ok).toBe(true);
    const imported = [...r2.games.values()][0]!.state;
    expect(imported.depthSeed).toMatch(/^secret-\d+\/depths$/);
    expect(imported.depths.galleries).toEqual({});
  });

  it('resolves a delve on load, without ever sending what the room held', async () => {
    const { ctx, repo } = ctxFor();
    let now = T0;
    ctx.now = () => now;
    await handleGameRequest(ctx, { action: 'load' });
    const game = [...repo.games.values()][0]!;
    const { s } = delveColony();
    s.depthSeed = game.state.depthSeed;
    repo.games.set(game.id, { ...game, state: s });
    const room = depthsMapOf(s).rooms.find((r) => r.entrance)!;
    const crew = s.villagers.filter((v) => v.id.startsWith('dk')).map((v) => v.id);
    const sent = hidden(
      await handleGameRequest(ctx, {
        action: 'command',
        command: {
          type: 'delve',
          roomId: room.id,
          crew,
          provisions: { pulp: 100, juice: 100 },
          orders: LANDING.defaultOrders,
        },
      }),
    );
    expect(sent.ok).toBe(true);
    now = T0 + 2 * HOUR_MS - 60_000;
    const r = hidden(await handleGameRequest(ctx, { action: 'load' }));
    const e = r.state!.expeditions.find((x) => x.mission === 'delve')!;
    expect(e.result?.outcome).toBeDefined();
    expect(r.ok && r.events.some((x) => x.type === 'expeditionArrived')).toBe(true);
  });
});
