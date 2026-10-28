import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  CANALS,
  canalError,
  canalsLeft,
  canalFloods,
  DEPOSITS,
  faceMapOf,
  getTile,
  hexKey,
  hexNeighbors,
  HOUR_MS,
  isBank,
  plausibleTerraform,
  mapTileDeposit,
  migrateState,
  newGame,
  occupancy,
  techStatus,
  validateCommand,
  type FaceMap,
  type GameState,
  type Tile,
} from '../src';
import { rich, run, setup, T0 } from './helpers';

const withCanals = (s: GameState): GameState =>
  rich({ ...s, research: { ...s.research, done: [...s.research.done, 'foraging', 'canals'] } });

/** Flesh tiles where a canal may go now, nearest to the heart first. */
function diggable(s: GameState, map: FaceMap): Tile[] {
  return map.tiles
    .filter((t) => canalError(s, map, t.q, t.r) === null)
    .sort((a, b) => a.rho - b.rho || a.q - b.q || a.r - b.r);
}

describe('juice canals (chantier 45)', () => {
  it('Canals come after Foraging', () => {
    const { state, map } = setup();
    const lib = map.tiles.find((t) => t.type === 'flesh' && t.rho > 0.3)!;
    const s0: GameState = {
      ...state,
      buildings: [
        ...state.buildings,
        {
          id: 'b-lib' as never,
          type: 'library',
          q: lib.q,
          r: lib.r,
          level: 1,
          richness: 1,
          builtAt: T0,
        },
      ],
    };
    expect(techStatus(s0, 'canals')).toBe('after');
    expect(validateCommand(s0, { type: 'setResearch', tech: 'canals' }, { now: T0, map })).toBe(
      'techAfter',
    );
    const s = { ...s0, research: { ...s0.research, done: ['foraging' as const] } };
    expect(techStatus(s, 'canals')).toBe('available');
  });

  it('builders dig a flesh tile next to juice into a small juice deposit', () => {
    const { state, map } = setup();
    const s0 = withCanals(state);
    const [tile] = diggable(s0, map);
    expect(tile).toBeDefined();
    expect(
      validateCommand(state, { type: 'digCanal', q: tile!.q, r: tile!.r }, { now: T0, map }),
    ).toBe('techMissing');
    const s = run(s0, { type: 'digCanal', q: tile!.q, r: tile!.r }, T0, map);
    expect(s.queue.at(-1)).toMatchObject({ kind: 'canal', q: tile!.q, r: tile!.r });
    expect(s.resources.pulp).toBe(s0.resources.pulp - CANALS.cost.pulp);
    // A colony saved mid-dig loads again (the server refused it as corrupt).
    expect(migrateState(JSON.parse(JSON.stringify(s)))).toMatchObject({ ok: true });
    // The tile is held: nothing is built or paved there meanwhile.
    expect(occupancy(s).tiles.has(hexKey(tile!))).toBe(true);
    expect(
      validateCommand(s, { type: 'buildPath', tiles: [tile!] } as never, { now: T0, map }),
    ).not.toBeNull();
    const end = T0 + 6 * HOUR_MS;
    const r = advance(s, end);
    expect(r.state.terraform[hexKey(tile!)]).toBe('canal');
    expect(r.events.some((e) => e.type === 'canal' && e.dug && !e.failed)).toBe(true);
    const after = faceMapOf(r.state);
    const t = getTile(after, tile!)!;
    expect(t).toMatchObject({ type: 'juice', canal: true });
    const dep = mapTileDeposit(after, t)!;
    expect(dep.cap).toBeCloseTo(DEPOSITS.juice!.stock * t.richness * CANALS.deposit, 6);
    // Its flesh neighbours are fertile banks now.
    for (const n of hexNeighbors(t)) {
      const nt = getTile(after, n);
      if (nt?.type === 'flesh') expect(isBank(after, nt)).toBe(true);
    }
    // One big step = many small ones.
    let small = s;
    for (let at = T0; at < end; at += HOUR_MS / 7) small = advance(small, at).state;
    small = advance(small, end).state;
    expect(small.terraform).toEqual(r.state.terraform);
    expect(small.villagers).toEqual(r.state.villagers);
    expect(small.resources.juice).toBeCloseTo(r.state.resources.juice, 6);
    // The server accepts a canal on flesh, within the cap and after its technology.
    const known = { ...state, research: { ...state.research, done: ['foraging', 'canals'] } };
    const key = hexKey(tile!);
    expect(plausibleTerraform({ ...state, terraform: { [key]: 'canal' } } as GameState)).toBe(
      false,
    );
    expect(plausibleTerraform({ ...known, terraform: { [key]: 'canal' } } as GameState)).toBe(true);
    const many = Object.fromEntries(
      Array.from({ length: CANALS.max + 1 }, (_, i) => [hexKey({ q: i, r: 0 }), 'canal']),
    );
    expect(plausibleTerraform({ ...known, terraform: many } as GameState)).toBe(false);
    // Cancelling gives the resources back.
    const c = run(s, { type: 'cancel', queueItemId: s.queue.at(-1)!.id }, T0, map);
    expect(c.resources).toEqual(s0.resources);
    // Filling it back in brings the flesh back.
    const f = run(r.state, { type: 'fillCanal', q: tile!.q, r: tile!.r }, end, after);
    const back = advance(f, end + 6 * HOUR_MS).state;
    expect(back.terraform[hexKey(tile!)]).toBeUndefined();
    expect(getTile(faceMapOf(back), tile!)!.type).toBe('flesh');
  });

  it('a chain grows from a queued canal, with no limit by age', () => {
    const { state, map } = setup();
    let s = withCanals(state);
    const [first] = diggable(s, map);
    s = run(s, { type: 'digCanal', q: first!.q, r: first!.r }, T0, map);
    // A tile next to the queued canal (and not to the river) may follow.
    const next = hexNeighbors(first!)
      .map((n) => getTile(map, n))
      .find(
        (t) =>
          t?.type === 'flesh' &&
          !hexNeighbors(t).some((n) => getTile(map, n)?.type === 'juice') &&
          canalError(s, map, t.q, t.r) === null,
      );
    if (next) {
      s = run(s, { type: 'digCanal', q: next.q, r: next.r }, T0, map);
    }
    // Well past the old caps (3 to 15 by age): still diggable, a few minutes a tile.
    let now = T0;
    for (let i = 0; i < 20; i++) {
      now += HOUR_MS / 6;
      s = advance(s, now).state;
      const m = faceMapOf(s);
      const t = diggable(s, m)[0];
      if (!t) break;
      s = run(s, { type: 'digCanal', q: t.q, r: t.r }, now, m);
    }
    s = advance(s, now + HOUR_MS).state;
    expect(Object.values(s.terraform).filter((k) => k === 'canal').length).toBeGreaterThan(15);
    expect(canalsLeft(s)).toBeGreaterThan(0);
    const far = map.tiles.find(
      (t) =>
        t.type === 'flesh' && t.rho < 0.6 && canalError(withCanals(state), map, t.q, t.r) !== null,
    );
    expect(far && canalError(withCanals(state), map, far.q, far.r)).toBeTruthy();
  });

  it('never cuts the land', () => {
    // A strip of flesh A - B - C along a juice tile: digging B would cut A from C.
    const { state } = setup();
    const s = withCanals(state);
    const base = faceMapOf(s);
    const strip = [
      { q: 5, r: 0, type: 'flesh' as const },
      { q: 6, r: 0, type: 'flesh' as const },
      { q: 7, r: 0, type: 'flesh' as const },
      { q: 6, r: -1, type: 'juice' as const },
    ].map((t) => ({ ...t, height: 0.4, richness: 1, variant: 0, rho: 0.4 }));
    const map: FaceMap = {
      ...base,
      tiles: strip,
      index: new Map(strip.map((t, i) => [hexKey(t), i])),
    };
    expect(canalError(s, map, 6, 0)).toBe('canalCutsLand');
    // The ends of the strip touch the juice too, and cut nothing.
    expect(canalError(s, map, 5, 0)).toBeNull();
  });

  it('in a flooding biome the flesh around floods, never under a building', () => {
    const state = newGame({ seed: 'lagoon-canals', face: 'kiwino', now: T0, biome: 'lagoons' });
    const map = faceMapOf(state);
    const s = withCanals(state);
    const spot = diggable(s, map).find((t) => canalFloods(map, {}, [hexKey(t)]).size > 0);
    expect(spot).toBeDefined();
    const wet = [...canalFloods(map, {}, [hexKey(spot!)])][0]!;
    const [q, r] = wet.split(',').map(Number) as [number, number];
    const built: GameState = {
      ...s,
      buildings: [
        ...s.buildings,
        { id: 'b-test' as never, type: 'hut', q, r, level: 1, richness: 1, builtAt: T0 },
      ],
    };
    expect(canalError(built, map, spot!.q, spot!.r)).toBe('wouldFlood');
    // Without the hut the canal goes, and the tile floods in spring.
    const dug = advance(
      run(s, { type: 'digCanal', q: spot!.q, r: spot!.r }, T0, map),
      T0 + 6 * HOUR_MS,
    ).state;
    expect(getTile(faceMapOf(dug), { q, r })!.flood).toBe(true);
    const ok = applyCommand(
      dug,
      { type: 'fillCanal', q: spot!.q, r: spot!.r },
      { now: dug.now, map: faceMapOf(dug) },
    );
    expect(ok.ok).toBe(true);
  });
});
