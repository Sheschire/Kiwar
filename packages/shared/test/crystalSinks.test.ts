import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  cloneState,
  CRYSTAL,
  CRYSTAL_SCALE,
  crystalAmmoCost,
  crystalOf,
  forgeLock,
  faceMapOf,
  ITEMS,
  researchPerHour,
  TECHS,
  turretRange,
  turretUnit,
  type BuildingId,
  type Command,
  type GameState,
} from '../src';
import { delveColony, findTile, run, T0 } from './helpers';

/** An Industry colony with a Forge, a seed turret, a sky turret and crystal in store. */
function crystalColony() {
  const { map, s } = delveColony('sinks');
  s.buildings.find((b) => b.type === 'monument')!.level = 3;
  const f = findTile(map, 'flesh', 9);
  const t1 = findTile(map, 'flesh', 7);
  const t2 = findTile(map, 'flesh', 5);
  s.buildings.push(
    {
      id: 'bforge' as BuildingId,
      type: 'forge',
      q: f.q,
      r: f.r,
      level: 3,
      richness: 1,
      builtAt: T0,
      cramped: true,
    },
    {
      id: 'bseed' as BuildingId,
      type: 'seedTurret',
      q: t1.q,
      r: t1.r,
      level: 2,
      richness: 1,
      builtAt: T0,
    },
    {
      id: 'bsky' as BuildingId,
      type: 'skyTurret',
      q: t2.q,
      r: t2.r,
      level: 2,
      richness: 1,
      builtAt: T0,
    },
  );
  const l = findTile(map, 'flesh', 11);
  s.buildings.push({
    id: 'blib' as BuildingId,
    type: 'library',
    q: l.q,
    r: l.r,
    level: 10,
    richness: 1,
    builtAt: T0,
    cramped: true,
  });
  s.research.done = [...s.research.done, 'industryAge', 'forge', 'smelting', 'firearms'];
  s.crystal = 50 * CRYSTAL_SCALE;
  return { map, s };
}

function err(s: GameState, cmd: Command) {
  const r = applyCommand(s, cmd, { now: s.now, map: faceMapOf(s) });
  return r.ok ? null : r.error;
}

const withTech = (s: GameState, ...ids: (keyof typeof TECHS)[]) => {
  const c = cloneState(s);
  c.research.done = [...c.research.done, ...ids];
  return c;
};

describe('what crystal pays for (chantier 50)', () => {
  it('fits a lens on a turret once glass is known: one more tile of range', () => {
    const { map, s } = crystalColony();
    const fit: Command = { type: 'fitLens', buildingId: 'bseed' as BuildingId };
    expect(err(s, fit)).toBe('techMissing');
    const g = withTech(s, 'glass');
    expect(err(g, { type: 'fitLens', buildingId: 'bforge' as BuildingId })).toBe('notATurret');
    const poor = cloneState(g);
    poor.crystal = 0;
    expect(err(poor, fit)).toBe('notEnoughCrystal');
    const after = run(g, fit, g.now, map);
    const b = after.buildings.find((x) => x.id === 'bseed')!;
    expect(b.lens).toBe(true);
    expect(crystalOf(after)).toBe(crystalOf(g) - CRYSTAL.lens.crystal);
    expect(err(after, fit)).toBe('lensFitted');
    const unit = turretUnit(b, after, 1, 0)!;
    expect(unit.weapon.range).toBe(turretRange('seedTurret', 2) + CRYSTAL.lens.range);
  });

  it('fires crystal ammunition from the seed turrets when on and paid for', () => {
    const { map, s } = crystalColony();
    expect(err(s, { type: 'setCrystalAmmo', on: true })).toBe('techMissing');
    const c = withTech(s, 'glass', 'crystalCut');
    const on = applyCommand(c, { type: 'setCrystalAmmo', on: true }, { now: c.now, map });
    expect(on.ok).toBe(true);
    if (!on.ok) return;
    const st = on.state;
    expect(crystalAmmoCost(st)).toBe(CRYSTAL.ammo.perTurret);
    const seed = turretUnit(
      st.buildings.find((b) => b.id === 'bseed')!,
      st,
      1,
      0,
    )!;
    const sky = turretUnit(
      st.buildings.find((b) => b.id === 'bsky')!,
      st,
      1,
      1,
    )!;
    expect(seed.weapon.pierce).toBe(CRYSTAL.ammo.pierce);
    expect(sky.weapon.pierce).toBeUndefined();
    // Not enough crystal: the seeds fly as before.
    const poor = cloneState(st);
    poor.crystal = 0;
    expect(crystalAmmoCost(poor)).toBe(0);
    expect(
      turretUnit(
        poor.buildings.find((b) => b.id === 'bseed')!,
        poor,
        1,
        0,
      )!.weapon.pierce,
    ).toBeUndefined();
  });

  it('forges crystal weapons for crystal, and gives it back on a cancel', () => {
    const { map, s } = crystalColony();
    expect(ITEMS['blade-crystal'].crystal).toBeGreaterThan(0);
    expect(ITEMS['blade-crystal'].pierce).toBeGreaterThan(0);
    expect(forgeLock(s, 'blade-crystal')).toBe('techMissing');
    const c = withTech(s, 'glass', 'crystalCut');
    const poor = cloneState(c);
    poor.crystal = 0;
    expect(forgeLock(poor, 'blade-crystal')).toBe('notEnoughCrystal');
    const ordered = run(c, { type: 'forgeItem', item: 'blade-crystal' }, c.now, map);
    expect(crystalOf(ordered)).toBe(crystalOf(c) - ITEMS['blade-crystal'].crystal!);
    const order = ordered.forge.orders[0]!;
    const back = run(ordered, { type: 'cancelForge', orderId: order.id }, ordered.now, map);
    expect(crystalOf(back)).toBe(crystalOf(c));
  });

  it('pays a technology’s crystal when chosen, back when abandoned; glass speeds research', () => {
    const { map, s } = crystalColony();
    const paid = run(s, { type: 'setResearch', tech: 'glass' }, s.now, map);
    expect(crystalOf(paid)).toBe(crystalOf(s) - TECHS.glass.crystal!);
    const back = run(paid, { type: 'setResearch', tech: null }, paid.now, map);
    expect(crystalOf(back)).toBe(crystalOf(s));
    const poor = cloneState(s);
    poor.crystal = 0;
    expect(err(poor, { type: 'setResearch', tech: 'glass' })).toBe('notEnoughCrystal');
    const lib = cloneState(s);
    lib.villagers[0]!.job = { kind: 'work', buildingId: 'blib' as BuildingId };
    const before = researchPerHour(lib);
    expect(before).toBeGreaterThan(0);
    expect(researchPerHour(withTech(lib, 'glass'))).toBeCloseTo(before * 1.1, 6);
  });
});
