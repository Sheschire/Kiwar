import { describe, expect, it } from 'vitest';
import {
  CIV,
  INTEL,
  civAt,
  civBuildings,
  civHours,
  civOf,
  cloneState,
  ensureAliens,
  keysWanted,
  neighbourSectors,
  newCiv,
  outerPower,
  recordBurn,
  recordDefeat,
  recordFight,
  sectorUnits,
  sectorOf,
  queenTruth,
  standingBarracks,
  advance,
  awaitingServer,
  civDay,
  civEyes,
  civEstimate,
  civWave,
  hiddenDue,
  waveAwaited,
  wavePower,
  createMemoryRepository,
  handleGameRequest,
  type GameResponse,
  type GameState,
  type ServiceContext,
  exposureOf,
  planCiv,
  publicState,
  type AlienGarrison,
} from '../src';
import { setup, T0 } from './helpers';

const H = 3_600_000;
const DAY = 24 * H;

function twin(seed = 'civ') {
  const { state } = setup('kiwisu', seed);
  const g = state.aliens![state.targets[0]!.id]!;
  return { state, g };
}

describe('alien civilisation (chantier 39)', () => {
  it('starts with the royal burrow where the queen lives and its key buildings hidden', () => {
    const { g } = twin();
    const civ = civOf(g);
    const royal = civ.keys.filter((k) => k.kind === 'royal');
    expect(royal).toHaveLength(1);
    expect(royal[0]!.sector).toBe(queenTruth(g).sector);
    const wanted = keysWanted(0);
    expect(civ.keys.filter((k) => k.kind === 'barracks')).toHaveLength(wanted.barracks);
    // One key building per parcel, the centre first.
    expect(new Set(civ.keys.map((k) => k.sector)).size).toBe(civ.keys.length);
    expect(civ.keys.every((k) => k.sector < INTEL.sectors / 2)).toBe(true);
  });

  it('is a pure function of the seed, the time and the impacts', () => {
    const a = twin('same');
    const b = twin('same');
    for (const t of [0, 5 * H, 2 * DAY, 9 * DAY])
      expect(civAt(a.g, T0 + t)).toEqual(civAt(b.g, T0 + t));
    expect(civAt(twin('other').g, T0)).not.toEqual(civAt(a.g, T0));
  });

  it('passes its ages on fixed dates, whatever the colony does', () => {
    const { g } = twin();
    expect(civAt(g, T0).age).toBe(0);
    expect(civAt(g, T0 + CIV.ageAtH[1]! * H - 1).age).toBe(0);
    expect(civAt(g, T0 + CIV.ageAtH[1]! * H).age).toBe(1);
    expect(civAt(g, T0 + CIV.ageAtH[2]! * H).age).toBe(2);
    expect(civAt(g, T0 + CIV.ageAtH[3]! * H).age).toBe(3);
  });

  it('a slow colony finds it further ahead than a fast one, at the same dates', () => {
    const fast = twin('pair');
    const slow = twin('pair');
    // Same seed, same start: the same civilisation on the same day, whatever their own age.
    const at = T0 + 5 * DAY;
    expect(civAt(fast.g, at)).toEqual(civAt(slow.g, at));
    // The fast colony reached the Iron age, the slow one the Stone age: the gap differs.
    expect(civAt(fast.g, at).age - 2).toBeLessThan(civAt(slow.g, at).age - 1);
  });

  it('keeps the edge weak and the centre two to three times stronger', () => {
    const { g } = twin();
    const view = civAt(g, T0);
    const outer = view.sectors.filter((s) => !s.inner);
    const inner = view.sectors.filter((s) => s.inner);
    expect(outerPower(view)).toBeCloseTo(g.defense, 0);
    for (const s of inner) {
      const edge = view.sectors[s.sector + INTEL.sectors / 2]!;
      expect(s.power / edge.power).toBeGreaterThanOrEqual(CIV.innerMultiple[0] - 0.01);
      expect(s.power / edge.power).toBeLessThanOrEqual(CIV.innerMultiple[1] + 0.01);
    }
    expect(outer.length).toBe(6);
  });

  it('grows with time and better equips the centre', () => {
    const { g } = twin();
    const early = civAt(g, T0);
    const late = civAt(g, T0 + 12 * DAY);
    expect(outerPower(late)).toBeGreaterThan(2 * outerPower(early));
    const centre = sectorUnits(late.sectors[0]!, g.ferretShare);
    const edge = sectorUnits(late.sectors[6]!, g.ferretShare);
    const soldier = (u: typeof centre) => u.find((x) => x.kind === 'soldier');
    expect(soldier(centre)?.weapon).toBe('blade-steel');
    expect(soldier(edge)?.weapon).toBe('blade-steel');
    expect(soldier(centre)!.level).toBeGreaterThan(soldier(edge)!.level);
    const stone = civAt(g, T0 + CIV.ageAtH[1]! * H);
    expect(soldier(sectorUnits(stone.sectors[0]!, g.ferretShare))?.weapon).toBe('blade-iron');
    expect(soldier(sectorUnits(stone.sectors[6]!, g.ferretShare))?.weapon).toBe('blade-stone');
    expect(sectorUnits(early.sectors[6]!, g.ferretShare)[0]!.weapon).toBeUndefined();
  });

  it('places buildings on the tiles of their parcels, the key ones once each', () => {
    const { g } = twin();
    const civ = civOf(g);
    const view = civAt(g, T0 + 5 * DAY);
    const all = civBuildings(g, civ, view, T0 + 5 * DAY);
    for (const b of all) expect(sectorOf(b.q, b.r)).toBe(b.sector);
    expect(all.filter((b) => b.kind === 'royal')).toHaveLength(1);
    expect(new Set(all.map((b) => `${b.q},${b.r}`)).size).toBe(all.length);
    expect(civBuildings(g, civ, view, T0 + 5 * DAY)).toEqual(all);
  });

  it('a burn slows the civilisation down measurably, a lost crew speeds it up', () => {
    const { g } = twin();
    const civ = civOf(g);
    const at = T0 + 3 * DAY;
    const before = civAt(g, at, civ);
    const burnt = structuredClone(civ);
    expect(recordBurn(burnt, 7, at)).toBeLessThan(0);
    const after = civAt(g, at, burnt);
    expect(after.hours).toBe(before.hours - CIV.burn.civH);
    expect(after.sectors[7]!.power).toBeLessThan(before.sectors[7]!.power);
    // The Iron age comes later.
    const iron = T0 + CIV.ageAtH[2]! * H;
    expect(civAt(g, iron, civ).age).toBe(2);
    expect(civAt(g, iron, burnt).age).toBe(1);

    const fed = structuredClone(civ);
    expect(recordDefeat(fed, at, 3)).toBe(CIV.defeat.civH + 3 * CIV.defeat.perKiwiH);
    expect(civAt(g, iron - 5 * H, fed).age).toBe(2);
    expect(fed.log.at(-1)?.kind).toBe('defeat');
  });

  it('burns the key buildings of a parcel for a while, never the royal burrow', () => {
    const { g } = twin();
    const civ = structuredClone(civOf(g));
    const barracks = civ.keys.find((k) => k.kind === 'barracks')!;
    const royal = civ.keys.find((k) => k.kind === 'royal')!;
    const at = T0 + DAY;
    expect(standingBarracks(civ, at, [])).toHaveLength(keysWanted(0).barracks);
    recordBurn(civ, barracks.sector, at);
    recordBurn(civ, royal.sector, at);
    expect(standingBarracks(civ, at, [])).toHaveLength(keysWanted(0).barracks - 1);
    expect(standingBarracks(civ, at + CIV.burn.keyMs, [])).toHaveLength(keysWanted(0).barracks);
    expect(royal.readyAt).toBeUndefined();
    // A beacon on a barracks parcel takes it too.
    expect(standingBarracks(civ, at + CIV.burn.keyMs, [barracks.sector])).toHaveLength(
      keysWanted(0).barracks - 1,
    );
  });

  it('a fight empties part of a parcel, which fills up again', () => {
    const { g } = twin();
    const civ = structuredClone(civOf(g));
    const at = T0 + DAY;
    const full = civAt(g, at, civ).sectors[8]!.power;
    recordFight(civ, 8, at, 0.6);
    expect(civAt(g, at, civ).sectors[8]!.power).toBeCloseTo(full * 0.4, 0);
    expect(civAt(g, at + CIV.rebuildMs, civ).sectors[8]!.power).toBeGreaterThan(full);
  });

  it('caps what burns and defeats can do', () => {
    const civ = newCiv('caps', 0);
    for (let i = 0; i < 50; i++) recordBurn(civ, 6, T0 + i);
    expect(civ.sectors[6]).toBe(-CIV.burn.maxSectorH);
    expect(civ.hours).toBe(-CIV.burn.maxCivH);
    for (let i = 0; i < 100; i++) recordDefeat(civ, T0 + i, 10);
    expect(civ.hours).toBe(CIV.defeat.maxCivH);
    expect(civ.log.length).toBeLessThanOrEqual(12);
  });

  it('gives older garrisons a civilisation, further faces a lead', () => {
    const { state } = setup('kiwisu', 'old');
    const s = cloneState(state);
    const id = s.targets[0]!.id;
    delete (s.aliens![id] as AlienGarrison).civ;
    expect(ensureAliens(s, 'x')).toBe(true);
    expect(s.aliens![id]!.civ).toEqual(newCiv(s.aliens![id]!.seed, 0));
    const far = newCiv('far', 2);
    expect(far.lead).toBe(2 * CIV.leadPerDistanceH);
    const g = { ...s.aliens![id]!, civ: far };
    expect(civHours(g, far, s.createdAt)).toBe(2 * CIV.leadPerDistanceH);
    expect(civAt(g, s.createdAt).age).toBe(1);
  });

  it('knows the neighbours of a parcel', () => {
    expect(neighbourSectors(0).sort((a, b) => a - b)).toEqual([1, 5, 6]);
    expect(neighbourSectors(11).sort((a, b) => a - b)).toEqual([5, 6, 10]);
  });
});

describe('the AI that hides (chantier 39)', () => {
  const eyes = (beacons: number[] = [], seen: number[] = []) => ({ beacons, seen });

  it('moves the key buildings away from a new beacon, to a hidden free parcel', () => {
    const { g } = twin('hide');
    const civ = structuredClone(civOf(g));
    // Put a barracks on the edge, then plant a beacon right next to it.
    const b = civ.keys.find((k) => k.kind === 'barracks')!;
    b.sector = 7;
    const beacon = 8;
    planCiv(g, civ, T0 + CIV.tickMs, eyes([beacon], [beacon]));
    const exposure = exposureOf([beacon], [beacon]);
    expect(b.sector).not.toBe(7);
    expect(exposure[b.sector]).toBe(0);
    for (const k of civ.keys) if (k.kind !== 'royal') expect(exposure[k.sector]).toBeLessThan(2);
  });

  it('keeps the royal burrow where it is once seen', () => {
    const { g } = twin('royal');
    const civ = structuredClone(civOf(g));
    const royal = civ.keys.find((k) => k.kind === 'royal')!;
    const lair = royal.sector;
    const beacon = lair + 6;
    // Chantier 42: once the queen is out, her burrow is marked seen and stays put.
    const seen = structuredClone(civ);
    seen.royalSeen = true;
    planCiv(g, seen, T0 + CIV.tickMs, eyes([beacon]));
    expect(seen.keys.find((k) => k.kind === 'royal')!.sector).toBe(lair);
    planCiv(g, civ, T0 + CIV.tickMs, eyes([beacon]));
    const moved = civ.keys.find((k) => k.kind === 'royal')!.sector;
    expect(moved).not.toBe(lair);
    expect(moved).toBeLessThan(INTEL.sectors / 2);
  });

  it('builds the new key buildings of an age where our scouts have looked least', () => {
    const { g } = twin('grow');
    const civ = structuredClone(civOf(g));
    const seen = [0, 1, 2, 3, 4, 5, 6, 7];
    const at = T0 + CIV.ageAtH[3]! * H;
    planCiv(g, civ, at, eyes([], seen));
    const wanted = keysWanted(3);
    expect(civ.keys.filter((k) => k.kind === 'barracks')).toHaveLength(wanted.barracks);
    expect(civ.keys.filter((k) => k.kind === 'store')).toHaveLength(wanted.store);
    const added = civ.keys.slice(civOf(g).keys.length);
    // The four parcels never seen fill first.
    const hidden = new Set([8, 9, 10, 11]);
    expect(added.slice(0, 4).every((k) => hidden.has(k.sector))).toBe(true);
  });

  it('stays put when no hidden parcel is left', () => {
    const { g } = twin('full');
    const civ = structuredClone(civOf(g));
    const all = Array.from({ length: INTEL.sectors }, (_, i) => i);
    const before = civ.keys.map((k) => k.sector);
    planCiv(g, civ, T0 + CIV.tickMs, eyes([6, 8, 10], all));
    // Every parcel is seen or exposed: only those under or beside a beacon could move, and
    // only towards a less exposed one.
    const exposure = exposureOf([6, 8, 10], all);
    civ.keys.forEach((k, i) => {
      if (k.sector !== before[i]) expect(exposure[k.sector]).toBeLessThan(exposure[before[i]!]!);
    });
  });

  it('rebuilds a burnt barracks in a better place', () => {
    const { g } = twin('rebuild');
    const civ = structuredClone(civOf(g));
    const b = civ.keys.find((k) => k.kind === 'barracks')!;
    b.sector = 9;
    recordBurn(civ, 9, T0);
    planCiv(g, civ, T0 + CIV.tickMs, eyes([], [9]));
    expect(b.sector).not.toBe(9);
  });

  it('looks once a game day in advance, the same in one step or many', () => {
    const { state } = setup('kiwisu', 'tick');
    const s = cloneState(state);
    s.threats.next = null;
    s.threats.shieldUntil = T0 + 100 * DAY;
    const id = s.targets[0]!.id;
    s.faceViews[id] = { beacons: [{ sector: 7, since: T0 }], parcels: {} };
    s.intel[id] = {
      at: T0,
      source: 'recon',
      defense: { min: 1, max: 2 },
      ferrets: { min: 1, max: 1 },
      bats: { min: 1, max: 1 },
      victoriesAt: 0,
      sectors: [0, 1, 7],
      structures: [],
    };
    const end = T0 + 3 * DAY;
    const big = advance(cloneState(s), end).state;
    let small = cloneState(s);
    for (let t = T0; t < end; t += 37 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(big.aliens![id]!.civ).toEqual(small.aliens![id]!.civ);
    expect(big.aliens![id]!.civ!.day).toBe(civDay(big.aliens![id]!, end));
    // The client without the truth never looks.
    const blind = advance(publicState(cloneState(s)), end).state;
    expect(blind.aliens).toBeUndefined();
  });
});

describe('its waves against us (chantier 39)', () => {
  /** A Nest 2 colony whose next wave is planned and due to be announced soon. */
  function waving(seed = 'waves') {
    const { state } = setup('kiwisu', seed);
    const s = cloneState(state);
    s.buildings[0]!.level = 2;
    s.now = T0 + 2 * DAY;
    s.threats.next = {
      id: 'w1',
      announceAt: s.now + H,
      at: s.now + 5 * H,
      announced: false,
      ground: 0,
      air: 0,
    };
    s.threats.nextIncidentAt = s.now + 100 * DAY;
    // The civilisation has looked at the map today (its Stone-age barracks are up).
    const g = s.aliens![s.targets[0]!.id]!;
    planCiv(g, g.civ!, s.now, civEyes(s, s.targets[0]!.id));
    return s;
  }
  const twinOf = (s: GameState) => s.aliens![s.targets[0]!.id]!;

  it('comes from a parcel with barracks, announced', () => {
    const s = advance(waving(), T0 + 2 * DAY + 2 * H).state;
    const w = s.threats.next!;
    expect(w.announced).toBe(true);
    const barracks = civOf(twinOf(s))
      .keys.filter((k) => k.kind === 'barracks')
      .map((k) => k.sector);
    expect(barracks).toContain(w.origin);
  });

  it('follows the civilisation: burns weaken it, defeats feed it', () => {
    const s = waving();
    const at = s.now;
    const base = wavePower(s, at, 'w1');
    const burnt = cloneState(s);
    recordBurn(twinOf(burnt).civ!, 6, at);
    expect(wavePower(burnt, at, 'w1')).toBeLessThan(base);
    const fed = cloneState(s);
    recordDefeat(twinOf(fed).civ!, at, 4);
    expect(wavePower(fed, at, 'w1')).toBeGreaterThan(base);
    // Without a civilisation (a sister colony): days of play and provocation, as before.
    const sister = cloneState(s);
    sister.colony = { ...sister.colony, index: 1 };
    expect(civWave(sister, at, 'w1').origin).toBeNull();
  });

  it('weakens when we take the parcels of its barracks', () => {
    const s = waving();
    const at = s.now;
    const civ = twinOf(s).civ!;
    const barracks = civ.keys.filter((k) => k.kind === 'barracks');
    const before = civWave(s, at, 'w1');
    const held = cloneState(s);
    held.faceViews[held.targets[0]!.id] = {
      beacons: barracks.map((b) => ({ sector: b.sector, since: at })),
      parcels: {},
    };
    const after = civWave(held, at, 'w1');
    expect(after.factor).toBeCloseTo(before.factor * CIV.barracksFloor, 5);
    expect(barracks.map((b) => b.sector)).not.toContain(after.origin);
    // A burnt barracks counts for nothing until rebuilt.
    const burnt = cloneState(s);
    recordBurn(twinOf(burnt).civ!, barracks[0]!.sector, at);
    expect(civWave(burnt, at, 'w1').factor).toBeLessThan(before.factor);
  });

  it('waits for the server to be announced when the client lacks the truth', () => {
    const s = waving();
    const client = publicState(s);
    const later = advance(client, s.now + 3 * H).state;
    expect(later.threats.next!.announced).toBe(false);
    expect(waveAwaited(later, later.now)).toBe(true);
    expect(awaitingServer(later, later.now)).toBe(true);
    expect(hiddenDue(s, s.now + 3 * H)).toContain(s.threats.next!.announceAt);
    // The server announces; rebased, the client plays the strike itself.
    const server = advance(s, s.now + 3 * H).state;
    expect(server.threats.next!.announced).toBe(true);
    const rebased = publicState(server);
    expect(waveAwaited(rebased, rebased.now)).toBe(false);
    const end = s.now + 6 * H;
    expect(advance(rebased, end).state.threats.reports).toEqual(
      advance(server, end).state.threats.reports,
    );
    // A colony without a civilisation (a sister) announces alone.
    const sister = publicState(cloneState(s));
    sister.colony = { ...sister.colony, index: 1 };
    expect(advance(sister, s.now + 3 * H).state.threats.next!.announced).toBe(true);
  });

  it('a slow colony meets a stronger civilisation for its age than a fast one', () => {
    const fast = waving('pace');
    const slow = waving('pace');
    // Same seed, same dates: the same civilisation; the fast colony is one age ahead.
    const at = fast.now;
    expect(civWave(fast, at, 'w1')).toEqual(civWave(slow, at, 'w1'));
    // Later on the civilisation keeps growing whoever we are.
    expect(civWave(slow, at + 6 * DAY, 'w1').factor).toBeGreaterThan(
      civWave(slow, at, 'w1').factor,
    );
  });
});

describe('the server keeps the civilisation (chantier 39)', () => {
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
    expect(text).not.toMatch(/"aliens":\{|"civ":\{|"keys":\[|"royalSeen"|"fights":\[/);
    expect(text).not.toMatch(/secret-\d+\/aliens:/);
    return r;
  };

  it('announces a wave due while away on load, from a parcel, nothing hidden sent', async () => {
    const { ctx, repo, at } = ctxFor();
    hidden(await handleGameRequest(ctx, { action: 'load' }));
    const game = [...repo.games.values()][0]!;
    const s = cloneState(game.state);
    s.buildings[0]!.level = 2;
    s.threats.next = {
      id: 'w1',
      announceAt: T0 + 8 * H,
      at: T0 + 12 * H,
      announced: false,
      ground: 0,
      air: 0,
    };
    s.threats.nextIncidentAt = T0 + 100 * DAY;
    repo.games.set(game.id, { ...game, state: s });
    at(T0 + 9 * H);
    const r = hidden(await handleGameRequest(ctx, { action: 'load' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.state!.threats.next!;
    expect(w.announced).toBe(true);
    expect(w.origin).toBeGreaterThanOrEqual(0);
    expect(r.events.some((e) => e.type === 'waveAnnounced')).toBe(true);
    // The stored truth lives on, looked at every game day.
    const stored = [...repo.games.values()][0]!.state;
    const g = Object.values(stored.aliens!)[0]!;
    expect(g.civ!.day).toBe(civDay(g, T0 + 8 * H));
  });

  it('is exact after ten days away', () => {
    const { state } = setup('kiwisu', 'away');
    const s = cloneState(state);
    s.buildings[0]!.level = 2;
    const end = T0 + 10 * DAY;
    const big = advance(cloneState(s), end).state;
    let small = cloneState(s);
    for (let t = T0; t < end; t += 5 * H + 7 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(big.aliens).toEqual(small.aliens);
    expect(big.threats).toEqual(small.threats);
    expect(big.threats.waves).toBeGreaterThan(5);
  });
});

describe('what the client can tell (chantier 39)', () => {
  it('estimates the age from our reports and the public schedule only', () => {
    const { state } = setup('kiwisu', 'estimate');
    const s = publicState(cloneState(state));
    const id = s.targets[0]!.id;
    const blind = civEstimate(s, T0 + 2 * DAY)!;
    expect(blind).toMatchObject({ targetId: id, seenAge: null, likelyAge: 1, waveFrom: null });
    expect(blind.nextAgeAt).toBe(T0 + CIV.ageAtH[2]! * H);
    // Seen still in Eden on day 2 (burnt back): the delay is kept.
    s.intel[id] = {
      at: T0 + 30 * H,
      source: 'recon',
      defense: { min: 5, max: 6 },
      ferrets: { min: 3, max: 3 },
      bats: { min: 2, max: 2 },
      victoriesAt: 0,
      sectors: [6],
      structures: [],
      civAge: 0,
    };
    const then = civEstimate(s, T0 + 30 * H)!;
    expect(then.seenAge).toBe(0);
    expect(then.likelyAge).toBe(0);
    // An hour later it may well have reached the Stone age.
    expect(civEstimate(s, T0 + 31 * H)!.likelyAge).toBe(1);
    // A sister colony has no civilisation.
    expect(civEstimate({ ...s, colony: { ...s.colony, index: 1 } }, T0)).toBeNull();
  });
});
