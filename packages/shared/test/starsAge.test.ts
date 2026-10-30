import { describe, expect, it } from 'vitest';
import {
  advance,
  AGE_IDS,
  ageOf,
  applyCommand,
  BUILDINGS,
  CRYSTAL,
  CRYSTAL_SCALE,
  GIANT_SEEDS,
  IRON,
  crystalOf,
  levelDef,
  MAX_AGE,
  maxLevelNow,
  migrateState,
  PASSAGE_TECHS,
  SAIL,
  shipOf,
  STARDUST_SCALE,
  stardustOf,
  techStatus,
  travelFactor,
  type BuildingId,
  type Command,
  type GameState,
} from '../src';
import { findTile, rich, run, setup, siteFor, T0 } from './helpers';
import { HOUR_MS } from '../src/sim/selectors';

/** Levels 13–15 cost millions: far above `rich`. */
const wealthy = (s: GameState): GameState => ({
  ...rich(s),
  resources: { pulp: 5e6, fiber: 5e6, seeds: 1e6, juice: 1e6 },
});

/** An Industry colony at its last levels (Nest 12, monument 3), stocked for the stars. */
function industryColony() {
  const { map, state } = setup('kiwisu', 'stars');
  const s: GameState = wealthy(state);
  s.buildings[0]!.level = 12;
  const add = (
    id: string,
    type: 'monument' | 'library' | 'launchpad' | 'pulpery',
    level: number,
  ) => {
    const at =
      type === 'pulpery'
        ? findTile(map, 'flesh', 3)
        : siteFor(s, map, type, findTile(map, 'flesh', 8));
    s.buildings.push({
      id: id as BuildingId,
      type,
      q: at.q,
      r: at.r,
      ...('rot' in at ? { rot: at.rot } : {}),
      level,
      richness: 1,
      builtAt: T0,
    });
  };
  add('bmon', 'monument', 3);
  add('blib', 'library', 12);
  add('bpad', 'launchpad', 12);
  add('bpul', 'pulpery', 12);
  s.research.done = ['stoneAge', 'ironAge', 'industryAge', 'glass'];
  s.threats.shieldUntil = s.now + 1000 * HOUR_MS;
  s.threats.next = null;
  s.crystal = 250 * CRYSTAL_SCALE;
  s.giantSeeds = 5;
  s.stardust = 50 * STARDUST_SCALE;
  return { map, s };
}

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

const upgrade = (id: string): Command => ({ type: 'upgrade', buildingId: id as BuildingId });

/** Raises the monument to the Age of the stars. */
function starsColony() {
  const { map, s } = industryColony();
  s.research.done.push('starsAge');
  const t = run(s, upgrade('bmon'), s.now, map);
  return { map, s: wealthy(advance(t, t.now + 30 * HOUR_MS).state) };
}

describe('the Age of the stars (chantier 51)', () => {
  it('is the fifth age, opened by its passage technology', () => {
    expect(AGE_IDS[4]).toBe('stars');
    expect(MAX_AGE).toBe(4);
    expect(PASSAGE_TECHS[4]).toBe('starsAge');
    const { s } = industryColony();
    expect(techStatus(s, 'starsAge')).not.toBe('age');
    expect(techStatus(s, 'crystalGrafts')).toBe('age');
  });

  it('raises the monument with crystal and giant seeds, and the age begins', () => {
    const { map, s } = industryColony();
    expect(errorOf(s, upgrade('bmon'), map)).toBe('passageMissing');
    s.research.done.push('starsAge');
    const def = levelDef('monument', 4)!;
    expect(def.crystal).toBeGreaterThan(0);
    expect(def.giantSeeds).toBeGreaterThan(0);
    expect(errorOf({ ...s, giantSeeds: def.giantSeeds! - 1 }, upgrade('bmon'), map)).toBe(
      'notEnoughGiantSeeds',
    );
    expect(errorOf({ ...s, crystal: 0 }, upgrade('bmon'), map)).toBe('notEnoughCrystal');
    const ordered = run(s, upgrade('bmon'), s.now, map);
    expect(crystalOf(ordered)).toBe(250 - def.crystal!);
    expect(ordered.giantSeeds).toBe(5 - def.giantSeeds!);
    const { state: after, events } = advance(ordered, ordered.now + 30 * HOUR_MS);
    expect(ageOf(after)).toBe(4);
    expect(events.some((e) => e.type === 'ageReached' && e.age === 4)).toBe(true);
    expect(maxLevelNow(after, 'pulpery')).toBe(15);
  });

  it('refunds the crystal and the giant seeds of a cancelled level', () => {
    const { map, s } = starsColony();
    const seeds = s.giantSeeds;
    const crystal = crystalOf(s);
    const def = levelDef('nest', 13)!;
    expect(def.crystal).toBeGreaterThan(0);
    expect(def.giantSeeds).toBe(1);
    const nestId = s.buildings[0]!.id;
    const t = run(s, upgrade(nestId), s.now, map);
    expect(crystalOf(t)).toBe(crystal - def.crystal!);
    expect(t.giantSeeds).toBe(seeds - 1);
    const item = t.queue.find((q) => q.buildingId === nestId)!;
    const back = run(t, { type: 'cancel', queueItemId: item.id }, t.now, map);
    expect(crystalOf(back)).toBe(crystal);
    expect(back.giantSeeds).toBe(seeds);
  });

  it('opens levels 13–15 behind the Nest, paid in crystal, not in giant seeds', () => {
    const { map, s } = starsColony();
    expect(errorOf(s, upgrade('bpul'), map)).toBe('nestLevelTooLow');
    expect(levelDef('pulpery', 13)!.crystal).toBeGreaterThan(0);
    expect(levelDef('pulpery', 13)!.giantSeeds).toBeUndefined();
    expect(levelDef('library', 13)!.giantSeeds).toBe(1);
    expect(levelDef('pulpery', 12)!.crystal).toBeUndefined();
  });

  it('rigs the star sailboat with the launchpad 13, paid once in stardust', () => {
    const { map, s } = starsColony();
    expect(shipOf(s).id).toBe('jet');
    expect(levelDef('launchpad', SAIL.padLevel)!.stardust).toBe(SAIL.stardust);
    s.buildings[0]!.level = 13;
    s.stardust = 50 * STARDUST_SCALE;
    const dust = stardustOf(s);
    const t = run(s, upgrade('bpad'), s.now, map);
    expect(stardustOf(t)).toBe(dust - SAIL.stardust);
    const after = advance(t, t.now + 200 * HOUR_MS).state;
    expect(shipOf(after).id).toBe('sail');
    expect(shipOf(after).reliability).toBeGreaterThan(0.99);
    // Fuel takes the sailboat further than the jet.
    expect(travelFactor(after, { fuel: true })).toBeLessThan(travelFactor(s, { fuel: true }));
  });

  it('has a notebook of objectives and keeps every level within the caps of its Nest', () => {
    for (const type of ['nest', 'library', 'pulpery', 'launchpad', 'seedTurret'] as const)
      for (let level = 13; level <= 15; level++) {
        const def = levelDef(type, level)!;
        expect(def.crystal ?? 0).toBeLessThanOrEqual(250);
        expect(def.giantSeeds ?? 0).toBeLessThanOrEqual(8);
      }
    expect(BUILDINGS.monument.levels).toHaveLength(4);
    // The monument of the stars fits the stocks of the Nest it asks, in the Industry age.
    const mon = levelDef('monument', 4)!;
    expect(mon.crystal!).toBeLessThanOrEqual(CRYSTAL.cap[mon.requiresNestLevel]!);
    expect(mon.iron!).toBeLessThanOrEqual(IRON.cap[mon.requiresNestLevel]!);
    expect(mon.giantSeeds!).toBeLessThanOrEqual(GIANT_SEEDS.cap[3]!);
  });

  it('migrates a v40 save', () => {
    const { s } = industryColony();
    const raw = structuredClone(s) as unknown as Record<string, unknown>;
    raw.schemaVersion = 40;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
  });
});
