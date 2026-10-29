import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  canBorrow,
  cloneState,
  hexKey,
  type BuildingId,
  type GameState,
  type QueueItemId,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** A rich Nest-3 colony (decorations open). */
function colony() {
  const { map, state } = setup('kiwisu', 'owner-fixes');
  const s: GameState = cloneState(rich(state));
  s.buildings[0]!.level = 3;
  return { map, s };
}

describe('the vine arch stands over a path', () => {
  it('keeps the path under it, and a path can be drawn under it', () => {
    const { map, s } = colony();
    const a = findTile(map, 'flesh', 4);
    const b = findTile(map, 'flesh', 5);
    let t = run(s, { type: 'buildPath', tiles: [a] }, T0, map);
    t = run(t, { type: 'build', buildingType: 'vineArch', q: a.q, r: a.r }, T0, map);
    expect(t.paths).toContain(hexKey(a));
    t = run(t, { type: 'build', buildingType: 'vineArch', q: b.q, r: b.r }, T0, map);
    t = run(t, { type: 'buildPath', tiles: [b] }, T0, map);
    expect(t.paths).toContain(hexKey(b));
  });

  it('other buildings still take the path off their tile', () => {
    const { map, s } = colony();
    const a = findTile(map, 'flesh', 4);
    let t = run(s, { type: 'buildPath', tiles: [a] }, T0, map);
    t = run(t, { type: 'build', buildingType: 'lanterns', q: a.q, r: a.r }, T0, map);
    expect(t.paths).not.toContain(hexKey(a));
    const r = applyCommand(t, { type: 'buildPath', tiles: [a] }, { now: T0, map });
    expect(r.ok ? null : r.error).toBe('tileOccupied');
  });
});

describe('the training camp keeps the kiwis the player sends', () => {
  function withCamp() {
    const { map, s } = colony();
    const at = findTile(map, 'flesh', 9);
    s.buildings.push({
      id: 'bcamp' as BuildingId,
      type: 'trainingCamp',
      q: at.q,
      r: at.r,
      level: 1,
      richness: at.richness,
      builtAt: T0,
      cramped: true,
    });
    s.villagers[0]!.classId = 'builder';
    return { map, s };
  }

  it('the automation borrows a drilling kiwi for the garrison only', () => {
    const { map, s } = withCamp();
    const v = s.villagers[0]!;
    const t = run(
      s,
      { type: 'assignKiwi', villagerId: v.id, buildingId: 'bcamp' as BuildingId },
      T0,
      map,
    );
    const w = t.villagers[0]!;
    expect(w.job).toEqual({ kind: 'work', buildingId: 'bcamp' });
    expect(canBorrow(t, w, 'build')).toBe(false);
    expect(canBorrow(t, w, 'pick')).toBe(false);
    expect(canBorrow(t, w, 'garrison')).toBe(true);
  });

  it('a builder can be sent: its site waits for another one, its work kept', () => {
    const { map, s } = withCamp();
    const site = findTile(map, 'flesh', 14);
    let t = run(s, { type: 'build', buildingType: 'hut', q: site.q, r: site.r }, T0, map);
    const item = t.queue[0]!;
    const v = t.villagers[0]!;
    t.villagers = t.villagers.map((x) =>
      x.id === v.id
        ? { ...x, job: { kind: 'build', queueItemId: item.id as QueueItemId, returnTo: null } }
        : x,
    );
    t.queue = [{ ...item, startedAt: T0 }];
    t = run(
      t,
      { type: 'assignKiwi', villagerId: v.id, buildingId: 'bcamp' as BuildingId },
      T0 + 1000,
      map,
    );
    expect(t.villagers.find((x) => x.id === v.id)!.job.kind).toBe('work');
    // The site paused, then the automation gave it another builder.
    const builders = t.villagers.filter((x) => x.job.kind === 'build');
    expect(builders.map((x) => x.id)).not.toContain(v.id);
    if (t.queue[0]!.startedAt !== null) expect(builders).toHaveLength(1);
  });
});
