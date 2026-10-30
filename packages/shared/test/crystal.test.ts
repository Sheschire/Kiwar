import { describe, expect, it } from 'vitest';
import {
  advance,
  addCrystal,
  addGiantSeeds,
  cloneState,
  CRYSTAL_SCALE,
  crystalCap,
  crystalOf,
  crystalRate,
  depthsMapOf,
  dispatchTasks,
  giantSeedCap,
  HOUR_MS,
  isLocule,
  isPlausible,
  LANDING,
  migrateState,
  roomTruth,
  type GameState,
} from '../src';
import { delveColony, run } from './helpers';

/** An Industry colony with a raphide forest taken (the flesh above it taken too). */
function withForest() {
  const { map, s } = delveColony('crystal');
  s.buildings.find((b) => b.type === 'monument')!.level = 3;
  const rooms = depthsMapOf(s).rooms;
  const forest = rooms.find(isLocule)!;
  s.depths.galleries[forest.id] = { kind: 'forest', since: s.now };
  s.resources = { pulp: 2000, fiber: 2000, seeds: 2000, juice: 2000 };
  return { map, s, forest };
}

const minersIn = (s: GameState, roomId: string) =>
  s.villagers.filter((v) => v.job.kind === 'mine' && v.job.roomId === roomId);

describe('crystal and giant seeds (chantier 50)', () => {
  it('cuts crystal in a raphide forest, apart from the storage', () => {
    const { s, forest } = withForest();
    s.automation.mine = true;
    dispatchTasks(s, s.now, []);
    expect(minersIn(s, forest.id).length).toBeGreaterThan(0);
    expect(crystalRate(s)).toBeGreaterThan(0);
    expect(Number.isInteger(crystalRate(s))).toBe(true);
    const later = advance(s, s.now + 10 * HOUR_MS).state;
    expect(crystalOf(later)).toBeGreaterThan(0);
    const closed = cloneState(s);
    closed.depths.door.closed = true;
    expect(crystalRate(closed)).toBe(0);
  });

  it('fills up exactly, then sends the forest’s miners back up', () => {
    const { s, forest } = withForest();
    s.automation.mine = true;
    s.crystal = crystalCap(s) - 2 * CRYSTAL_SCALE;
    dispatchTasks(s, s.now, []);
    const { state, events } = advance(s, s.now + 40 * HOUR_MS);
    expect(state.crystal).toBe(crystalCap(state));
    expect(events.some((e) => e.type === 'crystalFull')).toBe(true);
    expect(minersIn(state, forest.id)).toHaveLength(0);
  });

  it('gives the same crystal in one big step or many small ones', () => {
    const { s } = withForest();
    s.automation.mine = true;
    dispatchTasks(s, s.now, []);
    const end = s.now + 30 * HOUR_MS;
    const big = advance(s, end).state;
    let small = s;
    for (let t = s.now + 37 * 60_000; t < end; t += 37 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.crystal).toBe(big.crystal);
  });

  it('adds up to the caps', () => {
    const { s } = withForest();
    expect(addCrystal(s, 1e6)).toBe(crystalOf(s));
    expect(s.crystal).toBe(crystalCap(s));
    s.giantSeeds = 0;
    expect(addGiantSeeds(s, 99)).toBe(giantSeedCap(s));
    expect(addGiantSeeds(s, 1)).toBe(0);
  });

  it('brings a locule’s giant seeds up with the crew', () => {
    const { map, s: s0 } = withForest();
    for (const r of depthsMapOf(s0).rooms)
      if (!isLocule(r)) s0.depths.galleries[r.id] = { kind: 'bundle', since: s0.now };
    // A locule next to the flesh, without a nest (a classed crew takes it).
    const room = depthsMapOf(s0).rooms.find(
      (r) =>
        isLocule(r) &&
        !s0.depths.galleries[r.id] &&
        !roomTruth(s0.depthSeed!, r).nest &&
        r.links.some((id) => s0.depths.galleries[id]?.kind === 'bundle'),
    )!;
    for (const v of s0.villagers)
      if (v.id.startsWith('dk')) {
        v.level = 20;
        v.classId = v.classId === 'warrior' ? 'champion' : 'archmage';
      }
    const crew = s0.villagers.filter((v) => v.id.startsWith('dk')).map((v) => v.id);
    let s = run(
      s0,
      {
        type: 'delve',
        roomId: room.id,
        crew,
        provisions: { pulp: 400, juice: 400 },
        orders: LANDING.defaultOrders,
      },
      s0.now,
      map,
    );
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    s = advance(s, e.returnAt + 1).state;
    const done = s.expeditions.find((x) => x.id === e.id)!;
    expect(done.result!.outcome).toBe('victory');
    if (done.result!.outcome === 'victory') {
      expect(done.result!.giantSeeds).toBe(roomTruth(s.depthSeed!, room).giantSeeds);
      expect(s.giantSeeds).toBe(Math.min(giantSeedCap(s), done.result!.giantSeeds!));
    } else expect(s.giantSeeds).toBe(0);
  });

  it('migrates v39 saves to empty stocks and refuses impossible imports', () => {
    const { s } = withForest();
    const inner = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    inner.schemaVersion = 39;
    delete inner.crystal;
    delete inner.giantSeeds;
    const back = migrateState(inner);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.crystal).toBe(0);
    expect(back.state.giantSeeds).toBe(0);
    const over = cloneState(s);
    over.crystal = crystalCap(s) + CRYSTAL_SCALE;
    expect(isPlausible(over, s.now)).toBe(false);
    const fresh = cloneState(s);
    fresh.depths.galleries = {};
    fresh.giantSeeds = 1;
    expect(isPlausible(fresh, s.now)).toBe(false);
  });
});
