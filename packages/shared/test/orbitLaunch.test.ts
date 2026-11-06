import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  buildingCount,
  buildLock,
  CRYSTAL_SCALE,
  crystalUnits,
  dustPoints,
  featsOf,
  commandSchema,
  plausibleOrbit,
  kiwaiCap,
  launchLock,
  meteorIronOf,
  moduleSlots,
  ORBIT,
  objectiveProgress,
  AGE_OBJECTIVES,
  type Command,
  type GameState,
} from '../src';
import { findTile, run, siteFor, starsColony, yardColony } from './helpers';

const errorOf = (s: GameState, cmd: Command, map: Parameters<typeof run>[3]) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};
const launch = (kiwaiType: 'harvest' | 'greenhouse' | 'observatory' | 'dock'): Command => ({
  type: 'launchKiwai',
  kiwaiType,
});

describe('chantier 53, the orbital yard', () => {
  it('stands at the Age of the stars, once, outside the building cap', () => {
    const { map, s } = starsColony();
    expect(buildLock(s, 'orbitalYard')).toBeNull();
    const before = buildingCount(s);
    const at = siteFor(s, map, 'orbitalYard', findTile(map, 'flesh', 4));
    const t = run(s, { type: 'build', buildingType: 'orbitalYard', ...at }, s.now, map);
    expect(buildingCount(t)).toBe(before);
    const built = advance(t, t.now + 20 * 3_600_000).state;
    expect(built.buildings.some((b) => b.type === 'orbitalYard')).toBe(true);
    expect(buildLock(built, 'orbitalYard')).toBe('yardExists');
    // Not before the Nest 13.
    const low = structuredClone(s) as GameState;
    low.buildings[0]!.level = 12;
    expect(buildLock(low, 'orbitalYard')).toBe('nestLevelTooLow');
  });

  it('holds one kiwai at its first level, two then three', () => {
    for (const level of [1, 2, 3]) {
      const { s } = yardColony(level);
      expect(kiwaiCap(s)).toBe(level);
      expect(moduleSlots(s)).toBe(ORBIT.moduleSlots[level]);
    }
  });
});

describe('chantier 53, launching a kiwai', () => {
  it('pays a core of giant seeds, crystal, iron and stardust, and reaches its orbit later', () => {
    const { map, s } = yardColony(2);
    const cost = ORBIT.launch[0];
    const t = run(s, launch('greenhouse'), s.now, map);
    const k = t.orbit.kiwais[0]!;
    expect(k).toMatchObject({ type: 'greenhouse', place: 0, modules: [], dust: 0 });
    expect(k.readyAt).toBe(s.now + cost.durationMs);
    expect(t.orbit.launched).toBe(1);
    expect(t.giantSeeds).toBe(s.giantSeeds - cost.giantSeeds);
    expect(crystalUnits(t.crystal)).toBe(crystalUnits(s.crystal) - cost.crystal);
    expect(meteorIronOf(t)).toBe(meteorIronOf(s) - cost.iron);
    expect(dustPoints(t.stardust)).toBe(dustPoints(s.stardust) - cost.stardust);
    // The second one costs more, takes longer, takes the next place.
    const u = run(t, launch('harvest'), t.now, map);
    expect(u.orbit.kiwais[1]!.place).toBe(1);
    expect(u.orbit.kiwais[1]!.readyAt - u.now).toBe(ORBIT.launch[1].durationMs);
    expect(u.giantSeeds).toBe(t.giantSeeds - ORBIT.launch[1].giantSeeds);
    // The yard holds no third at level 2.
    expect(errorOf(u, launch('dock'), map)).toBe('kiwaiLimit');
    // The kiwai reaches its orbit: an event, at its time.
    const r = advance(u, k.readyAt + 1);
    expect(r.events.filter((e) => e.type === 'kiwaiReady')).toEqual([
      { type: 'kiwaiReady', at: k.readyAt, kiwaiId: k.id, kiwaiType: 'greenhouse' },
    ]);
  });

  it('refuses without a yard, an unknown type, or short stocks', () => {
    const { map, s } = starsColony();
    expect(errorOf(s, launch('harvest'), map)).toBe('noOrbitalYard');
    const y = yardColony(1);
    const bad = { type: 'launchKiwai', kiwaiType: 'moon' } as unknown as Command;
    expect(errorOf(y.s, bad, y.map)).toBe('unknownKiwaiType');
    const poor = structuredClone(y.s) as GameState;
    poor.giantSeeds = 1;
    expect(launchLock(poor)).toBe('notEnoughGiantSeeds');
    expect(errorOf(poor, launch('harvest'), y.map)).toBe('notEnoughGiantSeeds');
    poor.giantSeeds = 8;
    poor.crystal = 10 * CRYSTAL_SCALE;
    expect(errorOf(poor, launch('harvest'), y.map)).toBe('notEnoughCrystal');
    poor.crystal = 300 * CRYSTAL_SCALE;
    poor.stardust = 0;
    expect(errorOf(poor, launch('harvest'), y.map)).toBe('notEnoughStardust');
  });

  it('works in the second colony too', () => {
    const { map, s } = yardColony(1);
    const sister = structuredClone(s) as GameState;
    sister.colony = { index: 1, founding: null, foundedAt: s.now };
    sister.targets = [];
    delete sister.aliens;
    const t = run(sister, launch('observatory'), sister.now, map);
    expect(t.orbit.kiwais).toHaveLength(1);
  });

  it('counts for the objective and the league feat, and stays plausible', () => {
    const { map, s } = yardColony(1);
    const def = AGE_OBJECTIVES.find((o) => o.id === 'starsKiwai')!;
    let t = run(s, launch('dock'), s.now, map);
    expect(objectiveProgress(t, def)).toEqual({ current: 0, target: 1 });
    expect(featsOf(t)).not.toContain('firstKiwai');
    t = advance(t, t.orbit.kiwais[0]!.readyAt).state;
    expect(featsOf(t)).toContain('firstKiwai');
    expect(plausibleOrbit(t)).toBe(true);
    const k = t.orbit.kiwais[0]!;
    // Three modules set: the objective is done.
    const free = [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
    ];
    k.modules = free.map((h, i) => ({ id: `m${i}`, type: 'habitat', ...h, readyAt: t.now }));
    expect(objectiveProgress(t, def)).toEqual({ current: 1, target: 1 });
    // A module that does not fit its kiwai, or one more kiwai than launched, is not plausible.
    const odd = structuredClone(t) as GameState;
    odd.orbit.kiwais[0]!.modules[0]!.type = 'dome';
    expect(plausibleOrbit(odd)).toBe(false);
    const more = structuredClone(t) as GameState;
    more.orbit.launched = 0;
    expect(plausibleOrbit(more)).toBe(false);
  });

  it('is a command the server reads', () => {
    expect(commandSchema.safeParse(launch('harvest')).success).toBe(true);
    expect(commandSchema.safeParse({ type: 'launchKiwai', kiwaiType: 'moon' }).success).toBe(false);
  });
});
