import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  createRng,
  HOUR_MS,
  KIWI,
  levelForXp,
  migrateState,
  productionRates,
  rankOf,
  rollKiwi,
  SHINY_COLORS,
  STAT_IDS,
  workerPower,
  workersOf,
  XP_SCALE,
  xpForLevel,
  PRACTICE_SCALE,
  type GameState,
  type Villager,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const statSum = (v: Pick<Villager, 'stats'>) => STAT_IDS.reduce((s, id) => s + v.stats[id], 0);

/** A colony with a pulpery and a fibre workshop, everybody at work. */
function workingColony(): { s: GameState; map: ReturnType<typeof setup>['map'] } {
  const { map, state } = setup('kiwisu', 'kiwis');
  let s = rich(state);
  const flesh = findTile(map, 'flesh');
  const grove = findTile(map, 'grove');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = run(s, { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r }, T0, map);
  s = advance(s, T0 + HOUR_MS).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  s = run(s, { type: 'upgrade', buildingId: pulpery.id }, s.now, map);
  s = advance(s, s.now + HOUR_MS).state;
  s = run(s, { type: 'assignWorkers', buildingId: pulpery.id, count: 2 }, s.now, map);
  return { s, map };
}

describe('kiwi birth', () => {
  it('draws bounded stats, and every kiwi of a new game has them', () => {
    const rng = createRng('stats');
    for (let i = 0; i < 2000; i++) {
      const k = rollKiwi(rng);
      const sum = statSum(k);
      expect(sum).toBeGreaterThanOrEqual(KIWI.statTotal.min);
      expect(sum).toBeLessThanOrEqual(KIWI.statTotal.max);
      for (const id of STAT_IDS) {
        expect(k.stats[id]).toBeGreaterThanOrEqual(KIWI.stat.min);
        expect(k.stats[id]).toBeLessThanOrEqual(KIWI.stat.max);
      }
    }
    const { state } = setup();
    for (const v of state.villagers) {
      expect(v.level).toBe(1);
      expect(v.xp).toBe(0);
      expect(statSum(v)).toBeGreaterThanOrEqual(KIWI.statTotal.min);
    }
  });

  it('hatches a shiny about once in 512, in four equally likely colours', () => {
    const rng = createRng('shiny');
    const n = 512 * 400;
    const colours = Object.fromEntries(SHINY_COLORS.map((c) => [c, 0])) as Record<string, number>;
    let shinies = 0;
    for (let i = 0; i < n; i++) {
      const k = rollKiwi(rng);
      if (k.shiny) {
        shinies++;
        colours[k.shiny]!++;
      }
    }
    // Expected 400, standard deviation ≈ 20: allow 4 deviations.
    expect(shinies).toBeGreaterThan(320);
    expect(shinies).toBeLessThan(480);
    for (const c of SHINY_COLORS) {
      expect(colours[c]).toBeGreaterThan(60);
      expect(colours[c]).toBeLessThan(140);
    }
  });

  it('gives about 30 % of the kiwis a trait', () => {
    const rng = createRng('traits');
    let traits = 0;
    for (let i = 0; i < 10_000; i++) if (rollKiwi(rng).trait) traits++;
    expect(traits / 10_000).toBeCloseTo(KIWI.traitChance, 1);
  });
});

describe('kiwi progression', () => {
  it('follows the experience curve (level 10 in about three days of work)', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(10) / KIWI.xpPerHour.work / 24).toBeGreaterThan(2.5);
    expect(xpForLevel(10) / KIWI.xpPerHour.work / 24).toBeLessThan(3.5);
    expect(levelForXp(xpForLevel(7) * XP_SCALE)).toBe(7);
    expect(levelForXp(xpForLevel(7) * XP_SCALE - 1)).toBe(6);
    expect(rankOf(2 * PRACTICE_SCALE)).toBe(1);
  });

  it('levels up workers over time, with exact offline progress (big step = small steps)', () => {
    const { s } = workingColony();
    const end = s.now + 3 * 24 * HOUR_MS;
    const { state: big, events } = advance(s, end);
    let small = s;
    for (let t = s.now; t <= end; t += 600_007) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.villagers);
    expect(small.buildings).toEqual(big.buildings);
    expect(small.rng).toEqual(big.rng);

    const workers = big.villagers.filter((v) => v.job.kind === 'work');
    expect(workers.length).toBeGreaterThan(0);
    for (const v of workers) {
      expect(v.level).toBeGreaterThanOrEqual(8);
      expect(v.level).toBeLessThanOrEqual(11);
      // Half the levels are drawn, half are points to place.
      expect(v.statPoints).toBe(Math.floor(v.level / 2));
      const born = s.villagers.find((x) => x.id === v.id)!;
      expect(statSum(v) - statSum(born)).toBe(Math.floor((v.level - 1) / 2));
    }
    const ups = events.filter((e) => e.type === 'levelUp');
    expect(ups.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'masteryUp')).toBe(true);
    // Events are emitted in time order.
    for (let i = 1; i < events.length; i++)
      expect(events[i]!.at).toBeGreaterThanOrEqual(events[i - 1]!.at);
  });

  it('makes masters harvest more', () => {
    const { s: start } = workingColony();
    let s = { ...start, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const worker = workersOf(s, pulpery.id)[0]!;
    const before = workerPower(worker, 'pulp');
    s = advance(s, s.now + 20 * HOUR_MS).state;
    const trained = s.villagers.find((v) => v.id === worker.id)!;
    expect(rankOf(trained.mastery.pulp)).toBeGreaterThanOrEqual(3);
    expect(workerPower(trained, 'pulp')).toBeGreaterThan(before);
    expect(
      productionRates({ ...s, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } }).pulp,
    ).toBeGreaterThan(0);
  });
});

describe('kiwi commands', () => {
  it('renames a kiwi and rejects bad names', () => {
    const { map, state } = setup();
    const v = state.villagers[0]!;
    const s = run(
      state,
      { type: 'renameVillager', villagerId: v.id, name: '  Plume   d’or ' },
      T0,
      map,
    );
    expect(s.villagers[0]!.name).toBe('Plume d’or');
    for (const name of ['', '   ', 'x'.repeat(21)]) {
      const r = applyCommand(
        state,
        { type: 'renameVillager', villagerId: v.id, name },
        { now: T0, map },
      );
      expect(r.ok ? null : r.error).toBe('invalidName');
    }
    const r = applyCommand(
      state,
      { type: 'renameVillager', villagerId: 'nope' as never, name: 'A' },
      { now: T0, map },
    );
    expect(r.ok ? null : r.error).toBe('unknownVillager');
  });

  it('places earned stat points only', () => {
    const { map, state } = setup();
    const v = state.villagers[0]!;
    const none = applyCommand(
      state,
      { type: 'spendStatPoint', villagerId: v.id, stat: 'charisma' },
      { now: T0, map },
    );
    expect(none.ok ? null : none.error).toBe('noStatPoint');
    const s: GameState = {
      ...state,
      villagers: state.villagers.map((x, i) => (i === 0 ? { ...x, statPoints: 1 } : x)),
    };
    const after = run(s, { type: 'spendStatPoint', villagerId: v.id, stat: 'charisma' }, T0, map);
    expect(after.villagers[0]!.stats.charisma).toBe(v.stats.charisma + 1);
    expect(after.villagers[0]!.statPoints).toBe(0);
    const maxed: GameState = {
      ...s,
      villagers: s.villagers.map((x, i) =>
        i === 0 ? { ...x, stats: { ...x.stats, charisma: KIWI.stat.cap } } : x,
      ),
    };
    const r = applyCommand(
      maxed,
      { type: 'spendStatPoint', villagerId: v.id, stat: 'charisma' },
      { now: T0, map },
    );
    expect(r.ok ? null : r.error).toBe('statMaxed');
  });
});

describe('schema v3 → v4', () => {
  it('gives existing kiwis deterministic stats and an empty memorial', () => {
    const { state } = setup();
    const v3 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 3 })) as Record<
      string,
      unknown
    >;
    delete v3.memorial;
    v3.villagers = (v3.villagers as Villager[]).map(({ id, name, bornAt, job }) => ({
      id,
      name,
      bornAt,
      job,
    }));
    const a = migrateState(v3);
    const b = migrateState(JSON.parse(JSON.stringify(v3)));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.state.villagers).toEqual(b.state.villagers);
    expect(a.state.memorial).toEqual([]);
    for (const v of a.state.villagers) {
      expect(v.level).toBe(1);
      expect(statSum(v)).toBeGreaterThanOrEqual(KIWI.statTotal.min);
    }
    // The game RNG is untouched by the migration.
    expect(a.state.rng).toEqual(state.rng);
  });
});
