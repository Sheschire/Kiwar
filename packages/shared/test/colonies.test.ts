import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  capacity,
  COLONY,
  createMemoryRepository,
  handleGameRequest,
  type GameResponse,
  type ServiceContext,
  deliverToSister,
  denRaidForecast,
  faceMapOf,
  foundLock,
  HOUR_MS,
  housing,
  migrateState,
  newSister,
  RESEARCH_SCALE,
  SISTER_FRIEND,
  sisterThreat,
  syncColonies,
  takeFounding,
  twinTarget,
  validateCommand,
  type BuildingId,
  type Command,
  type GameState,
  type VillagerId,
  LANDING,
} from '../src';
import { findTile, kiwi, rich, setup, T0 } from './helpers';

const PAD = 'bpad' as BuildingId;

/** The queen has fallen: Iron age, a big launchpad, a crowd of kiwis. */
function conquered(seed = 'colony') {
  const { map, state } = setup('kiwisu', seed);
  const s: GameState = rich(state);
  s.buildings[0]!.level = 4;
  const pad = findTile(map, 'flesh', 2);
  const mon = findTile(map, 'flesh', 6);
  const lib = findTile(map, 'flesh', 9);
  s.buildings.push(
    {
      id: 'blib0' as BuildingId,
      type: 'library',
      q: lib.q,
      r: lib.r,
      level: 3,
      richness: 1,
      builtAt: T0,
    },
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
  const crowd = Array.from({ length: 16 }, (_, i) => {
    const v = kiwi(`vc${i}`, `C${i}`);
    v.level = 8;
    return v;
  });
  s.villagers = [...s.villagers, ...crowd];
  s.siege.conqueredAt = T0;
  s.research.done = ['foraging', 'stoneAge', 'ironAge'];
  return { map, s };
}

const settlers = (s: GameState, n = 6) =>
  s.villagers
    .filter((v) => v.id.startsWith('vc'))
    .slice(0, n)
    .map((v) => v.id);

function foundCmd(
  s: GameState,
  crew: VillagerId[],
  freight = { fiber: 300, seeds: 300 },
): Extract<Command, { type: 'launchExpedition' }> {
  return {
    type: 'launchExpedition',
    launchpadId: PAD,
    targetId: twinTarget(s)!.id,
    crew,
    provisions: { pulp: 200, juice: 200 },
    mission: 'found',
    freight,
  };
}

/** Launches the settlers and lands them: the home colony with its founding. */
function landed(seed?: string) {
  const { map, s } = conquered(seed);
  const crew = settlers(s);
  const r = applyCommand(s, foundCmd(s, crew), { now: T0, map });
  if (!r.ok) throw new Error(r.error);
  const e = r.state.expeditions.at(-1)!;
  const home = advance(r.state, e.arriveAt).state;
  return { map, home, crew, e };
}

describe('founding the second colony', () => {
  it('needs the conquered twin, once', () => {
    const { map, s } = conquered();
    const before = { ...s, siege: { ...s.siege, conqueredAt: 0 } };
    expect(foundLock(before)).toBe('notConquered');
    expect(validateCommand(before, foundCmd(before, settlers(before)), { now: T0, map })).toBe(
      'notConquered',
    );
    expect(foundLock(s)).toBeNull();
    const few = validateCommand(s, foundCmd(s, settlers(s, COLONY.minSettlers - 1)), {
      now: T0,
      map,
    });
    expect(few).toBe('crewTooSmall');
    // Any other mission to the conquered face is refused, and freight is for settlers only.
    const raid = {
      ...foundCmd(s, settlers(s)),
      mission: 'land' as const,
      freight: undefined,
      sector: 8,
      orders: LANDING.defaultOrders,
    };
    expect(validateCommand(s, raid, { now: T0, map })).toBe('conquered');
    const r = applyCommand(s, foundCmd(s, settlers(s)), { now: T0, map });
    expect(r.ok).toBe(true);
    expect(r.state.resources.fiber).toBe(s.resources.fiber - 300);
    expect(r.state.resources.pulp).toBe(s.resources.pulp - 200);
    expect(foundLock(r.state)).toBe('alreadyFounded');
  });

  it('lands the settlers and their freight, the ship flies back empty', () => {
    const { home, crew, e } = landed();
    const f = home.colony.founding!;
    expect(f.at).toBe(e.arriveAt);
    expect(f.settlers.map((v) => v.name)).toEqual(crew.map((id) => id.replace('vc', 'C')));
    expect(f.settlers.every((v) => v.job.kind === 'idle')).toBe(true);
    expect(f.resources.fiber).toBe(300);
    expect(f.resources.pulp).toBeGreaterThan(0);
    expect(home.villagers.some((v) => crew.includes(v.id))).toBe(false);
    expect(home.memorial).toEqual([]);
    expect(home.villagers.some((v) => v.memories)).toBe(false);
    const ship = home.expeditions.find((x) => x.id === e.id)!;
    expect(ship.result?.founded).toBe(true);
    const back = advance(home, ship.returnAt).state;
    expect(back.expeditions.find((x) => x.id === e.id)?.status).toBe('done');
    expect(back.resources.fiber).toBe(home.resources.fiber);
  });

  it('creates the sister colony on the twin face, the same every time', () => {
    const { home } = landed();
    const f = home.colony.founding!;
    const a = newSister(home, f);
    expect(newSister(home, f)).toEqual(a);
    expect(a.face).toBe('kiwino');
    expect(a.seed).toBe(home.seed);
    expect(a.calendarStart).toBe(home.calendarStart);
    expect(a.createdAt).toBe(f.at);
    expect(a.colony).toEqual({ index: 1, founding: null, foundedAt: f.at });
    // The settlers raise a hut for those the Nest cannot house.
    expect(a.buildings.map((b) => [b.type, b.level])).toEqual([
      ['nest', 1],
      ['hut', 1],
    ]);
    expect(housing(a)).toBeGreaterThanOrEqual(a.villagers.length);
    expect(a.villagers.map((v) => v.name)).toEqual(f.settlers.map((v) => v.name));
    expect(new Set(a.villagers.map((v) => v.id)).size).toBe(a.villagers.length);
    const cap = capacity(a);
    expect(a.resources.fiber).toBe(Math.min(cap.fiber, 300));
    expect(a.targets).toEqual([]);
    expect(a.aliens).toBeUndefined();
    expect(a.threats.shieldUntil).toBe(f.at + COLONY.shieldMs);
    expect(a.research.done).toEqual(home.research.done);
    const ruins = a.obstacles.filter((o) => o.kind === 'ruin').length;
    expect(ruins).toBeGreaterThanOrEqual(COLONY.traces.ruins[0]);
    expect(a.obstacles.filter((o) => o.kind === 'den')).toHaveLength(COLONY.traces.dens);
    expect(new Set(a.obstacles.map((o) => `${o.q},${o.r}`)).size).toBe(a.obstacles.length);

    const h = structuredClone(home);
    const sister = takeFounding(h)!;
    expect(sister).toEqual(a);
    expect(h.colony.founding).toBeNull();
    expect(h.colony.foundedAt).toBe(f.at);
    expect(takeFounding(h)).toBeNull();
    expect(foundLock(h)).toBe('alreadyFounded');
  });

  it('plays the sister offline exactly, in one step or many', () => {
    const { home } = landed('colony-offline');
    const sister = takeFounding(structuredClone(home))!;
    const end = sister.now + 30 * HOUR_MS;
    const big = advance(sister, end).state;
    let small = sister;
    for (let t = sister.now; t < end; t += 2 * HOUR_MS + 17_000)
      small = advance(small, Math.min(end, t)).state;
    small = advance(small, end).state;
    // Stocks are floats: compared closely, like the other offline tests (a stock running dry
    // may shift the hunger gauge by a millisecond).
    expect(small.villagers).toEqual(big.villagers);
    expect(small.buildings).toEqual(big.buildings);
    expect(small.queue).toEqual(big.queue);
    expect(small.obstacles).toEqual(big.obstacles);
    expect(small.research).toEqual(big.research);
    expect(small.threats).toEqual(big.threats);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[id]).toBeCloseTo(big.resources[id], 6);
    expect(Math.abs(small.hunger - big.hunger)).toBeLessThanOrEqual(big.hunger * 1e-6 + 100);
  });
});

describe('shared research', () => {
  it('the sister sends its points home, never finishes a technology itself', () => {
    const { home } = landed('colony-research');
    const h = structuredClone(home);
    const sister = takeFounding(h)!;
    // Only the sister's Library works on it here.
    h.buildings = h.buildings.filter((b) => b.type !== 'library');
    h.research.current = 'masonry';
    syncColonies(h, sister);
    expect(sister.research.current).toBe('masonry');
    const site = findTile(faceMapOf(sister), 'flesh', 1);
    sister.buildings.push({
      id: 'blib' as BuildingId,
      type: 'library',
      q: site.q,
      r: site.r,
      level: 3,
      richness: 1,
      builtAt: sister.now,
    });
    for (const v of sister.villagers.slice(0, 3))
      v.job = { kind: 'work', buildingId: 'blib' as BuildingId };
    const later = advance(sister, sister.now + 200 * HOUR_MS);
    expect(later.events.some((e) => e.type === 'researchDone')).toBe(false);
    expect(later.state.research.points).toBe(0);
    expect(later.state.research.outbox).toBeGreaterThan(0);
    const at = later.state.now;
    const home2 = advance(h, at).state;
    const before = home2.research.points;
    const sent = later.state.research.outbox;
    syncColonies(home2, later.state);
    expect(home2.research.points).toBe(before + sent);
    expect(later.state.research.outbox).toBe(0);
    // The technology completes at home, then the sister learns it at the next sync.
    const done = advance(home2, at + 1).state;
    expect(done.research.done).toContain('masonry');
    syncColonies(done, later.state);
    expect(later.state.research.done).toContain('masonry');
    expect(sent).toBeGreaterThanOrEqual(1 * RESEARCH_SCALE);
  });

  it('is chosen at home only', () => {
    const { home, map } = landed('colony-choice');
    const sister = takeFounding(structuredClone(home))!;
    const r = validateCommand(
      sister,
      { type: 'setResearch', tech: null },
      { now: sister.now, map },
    );
    expect(r).toBe('sharedResearch');
  });
});

describe('the last aliens', () => {
  it('start weak and grow stronger, more with dens standing', () => {
    const { home } = landed('colony-waves');
    const sister = takeFounding(structuredClone(home))!;
    const k = 1 + COLONY.denWave * COLONY.traces.dens;
    const t0 = sister.colony.foundedAt;
    expect(sisterThreat(sister, t0)).toBeCloseTo(COLONY.rampStart * k);
    expect(sisterThreat(sister, t0 + COLONY.rampMs)).toBeCloseTo(k);
    expect(sisterThreat(sister, t0 + 3 * COLONY.rampMs)).toBeCloseTo(k);
    expect(sisterThreat(home, t0)).toBe(1);
  });

  it('dens fall to strong enough guards (foreseen), and the waves weaken', () => {
    const { home } = landed('colony-dens');
    const sister = takeFounding(structuredClone(home))!;
    const map = faceMapOf(sister);
    const den = sister.obstacles.find((o) => o.kind === 'den')!;
    const cmd: Command = { type: 'raidDen', q: den.q, r: den.r };
    const ctx = { now: sister.now, map };
    expect(validateCommand(sister, cmd, ctx)).toBe('noGuards');
    const weak = structuredClone(sister);
    weak.villagers[0]!.job = { kind: 'guard' };
    expect(validateCommand(weak, cmd, ctx)).toBe('tooStrong');
    const strong = structuredClone(sister);
    for (const v of strong.villagers) {
      v.job = { kind: 'guard' };
      v.classId = 'warrior';
      v.level = 20;
      v.stats = { ...v.stats, strength: 10, endurance: 10 };
    }
    expect(denRaidForecast(strong).strength).toBeGreaterThanOrEqual(denRaidForecast(strong).power);
    const r = applyCommand(strong, cmd, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.obstacles.some((o) => o.id === den.id)).toBe(false);
    expect(r.events.some((e) => e.type === 'obstacleCleared')).toBe(true);
    expect(sisterThreat(r.state, sister.now)).toBeLessThan(sisterThreat(strong, sister.now));
  });
});

describe('links between the two faces', () => {
  function linked() {
    const { home, map } = landed('colony-links');
    const h = structuredClone(home);
    const sister = takeFounding(h)!;
    const sMap = faceMapOf(sister);
    const site = findTile(sMap, 'flesh', 3);
    sister.buildings.push({
      id: 'bspad' as BuildingId,
      type: 'launchpad',
      q: site.q,
      r: site.r,
      level: 2,
      richness: 1,
      builtAt: sister.now,
    });
    // Once the settlers' ship is back home.
    const at = h.expeditions.find((e) => e.mission === 'found')!.returnAt;
    return { home: advance(h, at).state, sister: advance(sister, at).state, map, sMap };
  }

  it('carries resources and kiwis to the sister, once', () => {
    const { home, sister, map } = linked();
    expect(home.friends.map((f) => f.id)).toContain(SISTER_FRIEND);
    expect(sister.friends.map((f) => f.id)).toContain(SISTER_FRIEND);
    const movers = home.villagers.filter((v) => v.job.kind !== 'expedition').slice(0, 3);
    const cmd: Command = {
      type: 'sendCargo',
      launchpadId: PAD,
      friendId: SISTER_FRIEND,
      resources: { fiber: 100 },
      villagerIds: movers.map((v) => v.id),
    };
    const r = applyCommand(home, cmd, { now: home.now, map });
    if (!r.ok) throw new Error(r.error);
    const sent = r.state;
    expect(sent.villagers.some((v) => movers.some((m) => m.id === v.id))).toBe(false);
    expect(sent.memorial).toEqual([]);
    const other = structuredClone(sister);
    expect(deliverToSister(sent, other)).toBe(1);
    expect(deliverToSister(sent, other)).toBe(0);
    expect(other.incoming).toHaveLength(1);
    const x = sent.shipments[0]!;
    const there = advance(other, x.arriveAt);
    const names = movers.map((v) => v.name);
    expect(there.events.find((e) => e.type === 'settlersArrived')).toMatchObject({ names });
    expect(there.state.villagers.filter((v) => names.includes(v.name))).toHaveLength(3);
    expect(new Set(there.state.villagers.map((v) => v.id)).size).toBe(there.state.villagers.length);
    // The ship flies back empty to its own launchpad.
    const back = advance(sent, x.returnAt).state;
    expect(back.shipments).toEqual([]);
  });

  it('works the other way, and never carries kiwis to an ally', () => {
    const { home, sister, sMap, map } = linked();
    const v = sister.villagers[0]!;
    const cmd: Command = {
      type: 'sendCargo',
      launchpadId: 'bspad' as BuildingId,
      friendId: SISTER_FRIEND,
      resources: {},
      villagerIds: [v.id],
    };
    const r = applyCommand(sister, cmd, { now: sister.now, map: sMap });
    if (!r.ok) throw new Error(r.error);
    const h = structuredClone(home);
    deliverToSister(r.state, h);
    const landedHome = advance(h, r.state.shipments[0]!.arriveAt).state;
    expect(landedHome.villagers.some((k) => k.name === v.name)).toBe(true);
    const ally = {
      ...home,
      friends: [...home.friends, { ...home.friends[0]!, id: 'ally:bob', owner: 'Bob' }],
    };
    const toAlly = {
      ...cmd,
      launchpadId: PAD,
      friendId: 'ally:bob',
      villagerIds: [home.villagers[0]!.id],
    };
    expect(validateCommand(ally, toAlly, { now: home.now, map })).toBe('invalidCrew');
    const everyone = { ...cmd, villagerIds: sister.villagers.map((k) => k.id) };
    expect(validateCommand(sister, everyone, { now: sister.now, map: sMap })).toBe('crewTooLarge');
  });
});

describe('online: two linked game rows', () => {
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
    return { ctx, repo, at: (t: number) => (now = t) };
  }
  const hidden = (r: GameResponse) => {
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"aliens":\{/);
    expect(text).not.toMatch(/secret-\d+\/aliens:/);
    return r;
  };
  const rows = (repo: ReturnType<typeof createMemoryRepository>) => [...repo.games.values()];

  async function founded() {
    const { ctx, repo, at } = ctxFor();
    await handleGameRequest(ctx, { action: 'load' });
    const game = rows(repo)[0]!;
    const { s } = conquered('colony-online');
    repo.games.set(game.id, { ...game, state: s });
    const crew = settlers(s);
    const r = hidden(
      await handleGameRequest(ctx, { action: 'command', command: foundCmd(s, crew) }),
    );
    expect(r.ok).toBe(true);
    const e = r.ok ? r.state!.expeditions.find((x) => x.mission === 'found')! : null;
    at(e!.arriveAt + HOUR_MS);
    return { ctx, repo, at, e: e! };
  }

  it('creates the sister row when the settlers land, and loads either colony', async () => {
    const { ctx, repo } = await founded();
    const home = hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(home.ok).toBe(true);
    if (!home.ok) return;
    expect(home.state!.colony.foundedAt).toBeGreaterThan(0);
    expect(home.state!.colony.founding).toBeNull();
    expect(home.sister?.face).toBe('kiwino');
    expect(home.state!.friends.map((f) => f.id)).toContain(SISTER_FRIEND);
    expect(rows(repo).filter((g) => g.colony === 1)).toHaveLength(1);
    const sister = hidden(await handleGameRequest(ctx, { action: 'load', colony: 1 }));
    expect(sister.ok && sister.state!.face).toBe('kiwino');
    expect(sister.ok && sister.state!.colony.index).toBe(1);
    expect(sister.ok && sister.state!.targets).toEqual([]);
    expect(sister.ok && sister.sister?.face).toBe('kiwisu');
    // Loading again changes nothing (no second sister).
    await handleGameRequest(ctx, { action: 'load' });
    expect(rows(repo).filter((g) => g.colony === 1)).toHaveLength(1);
  });

  it('refuses the sister colony before it exists', async () => {
    const { ctx } = ctxFor();
    await handleGameRequest(ctx, { action: 'load' });
    const r = await handleGameRequest(ctx, { action: 'load', colony: 1 });
    expect(r.ok).toBe(false);
  });

  it('chooses the research at home and sends the sister points there', async () => {
    const { ctx, repo } = await founded();
    await handleGameRequest(ctx, { action: 'load' });
    const r = await handleGameRequest(ctx, {
      action: 'command',
      colony: 1,
      command: { type: 'setResearch', tech: 'masonry' },
    });
    expect(r.ok && r.state!.colony.index).toBe(1);
    expect(r.ok && r.state!.research.current).toBe('masonry');
    const homeRow = rows(repo).find((g) => !g.colony)!;
    expect(homeRow.state.research.current).toBe('masonry');
    const sisterRow = rows(repo).find((g) => g.colony === 1)!;
    repo.games.set(sisterRow.id, {
      ...sisterRow,
      state: {
        ...sisterRow.state,
        research: { ...sisterRow.state.research, outbox: 5 * RESEARCH_SCALE },
      },
    });
    const before = rows(repo).find((g) => !g.colony)!.state.research.points;
    await handleGameRequest(ctx, { action: 'load' });
    expect(rows(repo).find((g) => !g.colony)!.state.research.points).toBe(
      before + 5 * RESEARCH_SCALE,
    );
    expect(rows(repo).find((g) => g.colony === 1)!.state.research.outbox).toBe(0);
  });

  it('writes a ship to the sister into its row', async () => {
    const { ctx, repo, e } = await founded();
    await handleGameRequest(ctx, { action: 'load' });
    const homeRow = rows(repo).find((g) => !g.colony)!;
    // Once the settlers' ship is back.
    const { at } = { at: (t: number) => t };
    void at;
    const back = advance(homeRow.state, e.returnAt).state;
    repo.games.set(homeRow.id, { ...homeRow, state: back });
    (ctx as { now: () => number }).now = () => e.returnAt + 1;
    const mover = back.villagers.find((v) => v.job.kind !== 'expedition')!;
    const r = await handleGameRequest(ctx, {
      action: 'command',
      command: {
        type: 'sendCargo',
        launchpadId: PAD,
        friendId: SISTER_FRIEND,
        resources: { seeds: 50 },
        villagerIds: [mover.id],
      },
    });
    expect(r.ok).toBe(true);
    const sister = rows(repo).find((g) => g.colony === 1)!.state;
    expect(sister.incoming).toHaveLength(1);
    expect(sister.incoming[0]!.villagers?.[0]?.name).toBe(mover.name);
    expect(r.ok && r.state!.shipments[0]!.delivered).toBe(true);
  });
});

describe('online: allies and the sister colony', () => {
  it('an ally sees the sister colony and can deliver to it', async () => {
    const repo = createMemoryRepository();
    let n = 0;
    const as = (userId: string): ServiceContext => ({
      repo,
      userId,
      now: () => T0,
      randomSeed: () => `seed-${++n}`,
      randomBytes: (len) => Uint8Array.from({ length: len }, (_, i) => (n * 31 + i * 17) % 256),
    });
    const created = await handleGameRequest(as('alice'), {
      action: 'createUniverse',
      name: 'Kiwis',
      displayName: 'Alice',
    });
    if (!created.ok) throw new Error(created.error);
    const u = created.universe!;
    await handleGameRequest(as('bob'), {
      action: 'joinUniverse',
      code: u.code,
      displayName: 'Bob',
    });
    // Bob founded his sister colony.
    const bobHome = [...repo.games.values()].find((g) => g.userId === 'bob')!;
    const f = {
      at: T0,
      settlers: bobHome.state.villagers.slice(0, 5),
      resources: bobHome.state.resources,
    };
    const sister = newSister(bobHome.state, f);
    repo.games.set(bobHome.id, {
      ...bobHome,
      state: { ...bobHome.state, colony: { index: 0, founding: null, foundedAt: T0 } },
    });
    await repo.create('bob', u.id, sister, 1);
    // Alice has a launchpad.
    const alice = [...repo.games.values()].find((g) => g.userId === 'alice')!;
    const map = faceMapOf(alice.state);
    const site = findTile(map, 'flesh', 2);
    repo.games.set(alice.id, {
      ...alice,
      state: {
        ...rich(alice.state),
        buildings: [
          ...alice.state.buildings,
          { id: PAD, type: 'launchpad', q: site.q, r: site.r, level: 1, richness: 1, builtAt: T0 },
        ],
      },
    });
    const load = await handleGameRequest(as('alice'), { action: 'load', universe: u.id });
    if (!load.ok) throw new Error(load.error);
    const bobSnap = load.allies!.find((a) => a.owner === 'Bob')!;
    expect(bobSnap.sister).toMatchObject({ face: 'kiwino', friendId: 'ally:bob:1' });
    expect(bobSnap.sister).not.toHaveProperty('resources');
    const sent = await handleGameRequest(as('alice'), {
      action: 'command',
      universe: u.id,
      command: {
        type: 'sendCargo',
        launchpadId: PAD,
        friendId: 'ally:bob:1',
        resources: { seeds: 40 },
      },
    });
    expect(sent.ok).toBe(true);
    const bobSister = [...repo.games.values()].find((g) => g.userId === 'bob' && g.colony === 1)!;
    expect(bobSister.state.incoming.map((d) => d.resources.seeds)).toEqual([40]);
    const bobHomeAfter = [...repo.games.values()].find((g) => g.userId === 'bob' && !g.colony)!;
    expect(bobHomeAfter.state.incoming).toEqual([]);
  });
});

describe('saves', () => {
  it('migrates v22 games to a home colony with nothing to send', () => {
    const { s } = conquered();
    const raw = structuredClone(s) as unknown as Record<string, unknown>;
    raw.schemaVersion = 22;
    delete raw.colony;
    delete (raw.research as Record<string, unknown>).outbox;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.colony).toEqual({ index: 0, founding: null, foundedAt: 0 });
    expect(m.state.research.outbox).toBe(0);
  });

  it('keeps a founding and a sister through a save', () => {
    const { home } = landed('colony-save');
    const m = migrateState(structuredClone(home));
    expect(m.ok && m.state.colony.founding?.settlers.length).toBe(6);
    const sister = takeFounding(structuredClone(home))!;
    const n = migrateState(structuredClone(sister));
    expect(n.ok && n.state.colony.index).toBe(1);
  });
});
