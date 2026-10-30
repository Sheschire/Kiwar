import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  cloneState,
  DEPTHS,
  defenseOf,
  depthsMapOf,
  dispatchTasks,
  galleryRate,
  HOUR_MS,
  jobBoard,
  migrateState,
  productionRates,
  type GameState,
} from '../src';
import { delveColony, run } from './helpers';

/** A colony with a sap gallery at depth 1 (taken already). */
function withGallery(kind: 'sap' | 'bundle' = 'sap') {
  const { map, s } = delveColony('mines');
  const room = depthsMapOf(s).rooms.find((r) => r.entrance)!;
  s.depths.galleries[room.id] = { kind, since: s.now };
  s.resources = { pulp: 2000, fiber: 2000, seeds: 2000, juice: 2000 };
  return { map, s, room };
}

const miners = (s: GameState) => s.villagers.filter((v) => v.job.kind === 'mine');

describe('galleries and mines (chantier 48)', () => {
  it('posts miners by hand, up to the gallery’s places', () => {
    const { map, s: s0, room } = withGallery();
    s0.automation.mine = false;
    const ids = s0.villagers.filter((v) => v.id.startsWith('dk')).map((v) => v.id);
    const s = run(
      s0,
      { type: 'postMiners', roomId: room.id, villagerIds: ids.slice(0, 2) },
      s0.now,
      map,
    );
    expect(miners(s).map((v) => v.id)).toEqual(ids.slice(0, 2));
    const full = applyCommand(
      s,
      { type: 'postMiners', roomId: room.id, villagerIds: ids.slice(0, 3) },
      { now: s.now, map },
    );
    expect(full.ok ? null : full.error).toBe('galleryFull');
    expect(galleryRate(s, room.id)).toBeGreaterThan(0);
    expect(jobBoard(s).galleries[0]!.miners).toHaveLength(2);
    // Back to work: an empty list sends them up.
    const back = run(s, { type: 'postMiners', roomId: room.id, villagerIds: [] }, s.now, map);
    expect(miners(back)).toHaveLength(0);
  });

  it('yields its resource day and night, and stops when the door closes', () => {
    const { s, room } = withGallery();
    s.automation.mine = true;
    dispatchTasks(s, s.now, []);
    expect(miners(s).length).toBe(DEPTHS.gallery.slots[0]);
    const rate = galleryRate(s, room.id);
    expect(rate).toBeGreaterThan(0);
    expect(productionRates(s).juice).toBeGreaterThan(0);
    const closed = cloneState(s);
    closed.depths.door.closed = true;
    expect(galleryRate(closed, room.id)).toBe(0);
    dispatchTasks(closed, closed.now, []);
    expect(miners(closed)).toHaveLength(0);
  });

  it('keeps its miners out of the militia', () => {
    const { s } = withGallery();
    s.automation.mine = false;
    const before = defenseOf(s).ground;
    s.automation.mine = true;
    dispatchTasks(s, s.now, []);
    expect(miners(s).length).toBeGreaterThan(0);
    expect(defenseOf(s).ground).toBeLessThan(before);
  });

  it('is exact offline: one big step or many small ones', () => {
    const { s: s0 } = withGallery();
    s0.automation.mine = true;
    dispatchTasks(s0, s0.now, []);
    const end = s0.now + 30 * HOUR_MS;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now + 37 * 60_000; t < end; t += 37 * 60_000) small = advance(small, t).state;
    small = advance(small, end).state;
    for (const r of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(small.resources[r]).toBeCloseTo(big.resources[r], 6);
    expect(small.villagers).toEqual(big.villagers);
    expect(big.resources.juice).toBeGreaterThan(s0.resources.juice - 1000);
  });

  it('reads the first v39 saves, made before the mines', () => {
    const { s } = withGallery();
    const raw = JSON.parse(JSON.stringify(s)) as { automation: Record<string, boolean> };
    delete raw.automation.mine;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.automation.mine).toBe(true);
  });
});
