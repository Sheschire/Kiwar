import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  BLESSINGS,
  KIWI,
  migrateState,
  SCHEMA_VERSION,
  STARDUST_SCALE,
  STAT_IDS,
  stardustOf,
  type Command,
  type GameState,
} from '../src';
import { rich, run, setup, T0 } from './helpers';

const HOUR = 3_600_000;

function withDust(points: number) {
  const { map, state } = setup();
  const s: GameState = { ...rich(state), stardust: points * STARDUST_SCALE };
  return { map, s };
}

describe('blessings', () => {
  it('heals a wounded kiwi at once', () => {
    const { map, s: base } = withDust(10);
    const s = structuredClone(base) as GameState;
    const v = s.villagers[0]!;
    v.job = { kind: 'injured', until: T0 + 5 * HOUR };
    const after = run(s, { type: 'bless', villagerId: v.id, kind: 'heal' }, T0, map);
    expect(after.villagers[0]!.job.kind).not.toBe('injured');
    expect(stardustOf(after)).toBe(10 - BLESSINGS.heal);
    const r = applyCommand(
      after,
      { type: 'bless', villagerId: v.id, kind: 'heal' },
      { now: T0, map },
    );
    expect(!r.ok && r.error).toBe('notInjured');
  });

  it('redistributes every stat point', () => {
    const { map, s } = withDust(10);
    const v = s.villagers[0]!;
    const total = STAT_IDS.reduce((sum, id) => sum + v.stats[id], 0);
    const after = run(s, { type: 'bless', villagerId: v.id, kind: 'respec' }, T0, map);
    const w = after.villagers[0]!;
    for (const id of STAT_IDS) expect(w.stats[id]).toBe(KIWI.stat.min);
    expect(w.statPoints).toBe(v.statPoints + total - KIWI.stat.min * STAT_IDS.length);
  });

  it('adds a permanent point, three times at most, and costs stardust', () => {
    const { map, s } = withDust(BLESSINGS.stat * 4);
    const id = s.villagers[0]!.id;
    const bless: Command = { type: 'bless', villagerId: id, kind: 'stat', stat: 'dexterity' };
    let st = s;
    for (let i = 0; i < BLESSINGS.statMax; i++) st = run(st, bless, T0, map);
    const v = st.villagers[0]!;
    expect(v.stats.dexterity).toBe(s.villagers[0]!.stats.dexterity + BLESSINGS.statMax);
    expect(v.blessings).toBe(BLESSINGS.statMax);
    const r = applyCommand(st, bless, { now: T0, map });
    expect(!r.ok && r.error).toBe('blessingLimit');
    const poor = applyCommand({ ...s, stardust: 0 }, bless, { now: T0, map });
    expect(!poor.ok && poor.error).toBe('notEnoughStardust');
  });

  it('a star egg costs stardust and often hatches a golden shiny', () => {
    let golden = 0;
    const tries = 40;
    for (let i = 0; i < tries; i++) {
      const { map, state } = setup('kiwisu', `star-${i}`);
      const s: GameState = { ...rich(state), stardust: BLESSINGS.starEgg * STARDUST_SCALE };
      const laid = run(s, { type: 'hatchEgg', star: true }, T0, map);
      expect(laid.egg?.star).toBe(true);
      expect(laid.stardust).toBe(0);
      const born = advance(laid, laid.egg!.readyAt).state;
      const kid = born.villagers[born.villagers.length - 1]!;
      if (kid.shiny === 'star') golden++;
    }
    // 1 in 8 on average: a few out of 40, never all.
    expect(golden).toBeGreaterThan(0);
    expect(golden).toBeLessThan(tries / 2);
    const { map, state } = setup();
    const r = applyCommand(rich(state), { type: 'hatchEgg', star: true }, { now: T0, map });
    expect(!r.ok && r.error).toBe('notEnoughStardust');
  });

  it('migrates v19 saves', () => {
    const { state } = setup();
    const raw = { ...structuredClone(state), schemaVersion: 19 } as Record<string, unknown>;
    const r = migrateState(raw);
    expect(r.ok && r.state.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
