import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  consumption,
  crewOf,
  crewWeight,
  EXPEDITIONS,
  GARRISON,
  guardPower,
  kiwiStrength,
  modifiers,
  HOUR_MS,
  infusionRisk,
  isPlausible,
  kikiwiwiCap,
  KIKIWIWI,
  migrateState,
  xpForLevel,
  XP_SCALE,
  type BuildingId,
  type Command,
  type GameState,
  type TechId,
  STARDUST_SCALE,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

/** An Iron-age colony (Nest 4, monument 2) knowing juice infusion, with a level-6 kiwi. */
export function ironColony(techs: TechId[] = ['stoneAge', 'ironAge', 'juiceInfusion']) {
  const { map, state } = setup('kiwisu', 'kikiwiwi');
  const s: GameState = rich(state);
  s.buildings[0]!.level = 7;
  const mon = findTile(map, 'flesh', 6);
  s.buildings.push({
    id: 'bmon' as BuildingId,
    type: 'monument',
    q: mon.q,
    r: mon.r,
    level: 2,
    richness: mon.richness,
    builtAt: T0,
  });
  s.research.done = [...techs];
  const v = s.villagers[0]!;
  v.level = 6;
  v.xp = xpForLevel(6) * XP_SCALE;
  return { map, s, v };
}

function withLab(s: GameState, map: ReturnType<typeof setup>['map'], level = 1): GameState {
  const site = findTile(map, 'flesh', 8);
  const out = structuredClone(s);
  out.buildings.push({
    id: 'blab' as BuildingId,
    type: 'lab',
    q: site.q,
    r: site.r,
    level,
    richness: site.richness,
    builtAt: T0,
  });
  // Chantier 13: an infusion costs stardust too.
  out.stardust = 2 * KIKIWIWI.stardust * STARDUST_SCALE;
  return out;
}

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

describe('laboratory against nature', () => {
  it('needs the Iron age, its technology, and is unique', () => {
    const { map, s } = ironColony(['stoneAge', 'ironAge']);
    const site = findTile(map, 'flesh', 8);
    const build: Command = { type: 'build', buildingType: 'lab', q: site.q, r: site.r };
    expect(errorOf(s, build, map)).toBe('techMissing');
    const young = structuredClone(s);
    young.buildings = young.buildings.filter((b) => b.type !== 'monument');
    expect(errorOf(young, build, map)).toBe('ageTooLow');
    const knows = {
      ...s,
      research: { ...s.research, done: [...s.research.done, 'juiceInfusion' as TechId] },
    };
    const ordered = run(knows, build, s.now, map);
    const other = findTile(map, 'flesh', 9);
    expect(errorOf(ordered, { ...build, q: other.q, r: other.r }, map)).toBe('labExists');
  });

  it('caps the Kikiwiwis by age: none before Iron, one at Iron, two at Industry', () => {
    const { s } = ironColony();
    expect(kikiwiwiCap(s)).toBe(1);
    const stone = structuredClone(s);
    stone.buildings.find((b) => b.type === 'monument')!.level = 1;
    expect(kikiwiwiCap(stone)).toBe(0);
    const industry = structuredClone(s);
    industry.buildings.find((b) => b.type === 'monument')!.level = 3;
    expect(kikiwiwiCap(industry)).toBe(2);
  });

  it('transforms a kiwi after a long infusion, exactly in one big step or many small ones', () => {
    const { map, s: base, v } = ironColony();
    const s0 = withLab(base, map);
    const lab = s0.buildings.find((b) => b.type === 'lab')!;
    const cmd: Command = { type: 'transform', villagerId: v.id, labId: lab.id };
    const young = structuredClone(s0);
    young.villagers[0]!.level = 2;
    expect(errorOf(young, cmd, map)).toBe('levelTooLow');
    const s = run(s0, cmd, s0.now, map);
    const job = s.villagers[0]!.job;
    expect(job).toMatchObject({ kind: 'transform', labId: lab.id });
    if (job.kind !== 'transform') return;
    expect(job.until - s.now).toBe(KIKIWIWI.durationMs[0]);
    expect(job.risk).toBe(infusionRisk(s0, v, lab));
    expect(s.resources.juice).toBe(s0.resources.juice - KIKIWIWI.cost.juice!);
    // One vat, one Kikiwiwi at the Iron age.
    const second = structuredClone(s);
    second.villagers[1]!.level = 6;
    expect(
      errorOf(
        second,
        { type: 'transform', villagerId: second.villagers[1]!.id, labId: lab.id },
        map,
      ),
    ).toBe('labBusy');
    const end = job.until + HOUR_MS;
    const big = advance(s, end);
    let small = s;
    for (let t = s.now; t < end; t += HOUR_MS / 3) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.villagers).toEqual(big.state.villagers);
    expect(small.rng).toEqual(big.state.rng);
    const after = big.state.villagers[0]!;
    const born = big.events.some((e) => e.type === 'kikiwiwiBorn');
    const failed = big.events.some((e) => e.type === 'infusionFailed');
    expect(born !== failed).toBe(true);
    if (born) {
      expect(after.kikiwiwi).toEqual({ since: job.until });
      // A Kikiwiwi never takes a workplace by itself.
      expect(after.job.kind).toBe('idle');
    } else {
      expect(after.job.kind).toBe('injured');
      expect(after.stats.strength).toBe(Math.max(1, v.stats.strength - 1));
    }
  });

  it('a sure failure leaves the kiwi alive, hurt and weakened; a sure success makes a Kikiwiwi', () => {
    const { map, s: base, v } = ironColony();
    const s0 = withLab(base, map);
    const lab = s0.buildings.find((b) => b.type === 'lab')!;
    const s = run(s0, { type: 'transform', villagerId: v.id, labId: lab.id }, s0.now, map);
    const job = s.villagers[0]!.job;
    if (job.kind !== 'transform') throw new Error('no infusion');
    const doomed = structuredClone(s);
    (doomed.villagers[0]!.job as { risk: number }).risk = 1;
    const failed = advance(doomed, job.until).state;
    const lost = failed.villagers[0]!;
    // Chantier 13: the stardust comes back on a failure (the resources are lost).
    expect(failed.stardust).toBe(s0.stardust);
    expect(lost.kikiwiwi).toBeUndefined();
    expect(lost.job).toEqual({ kind: 'injured', until: job.until + KIKIWIWI.failure.injuredMs });
    expect(lost.stats.endurance).toBe(Math.max(1, v.stats.endurance - 1));
    const blessed = structuredClone(s);
    (blessed.villagers[0]!.job as { risk: number }).risk = 0;
    const r = advance(blessed, job.until);
    expect(r.state.villagers[0]!.kikiwiwi).toBeDefined();
    // The cap is reached: no second one at the Iron age.
    const other = r.state.villagers[1]!;
    other.level = 6;
    expect(errorOf(r.state, { type: 'transform', villagerId: other.id, labId: lab.id }, map)).toBe(
      'kikiwiwiLimit',
    );
    // An imported save cannot bring more than the cap.
    const two = structuredClone(r.state);
    two.villagers[1]!.kikiwiwi = { since: T0 };
    expect(isPlausible(two, two.now)).toBe(false);
  });

  it('lowers the risk with Endurance, level, a better laboratory and green blood', () => {
    const { map, s, v } = ironColony();
    const l1 = withLab(s, map, 1).buildings.find((b) => b.type === 'lab')!;
    const l3 = { ...l1, level: 3 };
    const base = infusionRisk(s, v, l1);
    expect(infusionRisk(s, v, l3)).toBeLessThan(base);
    const tough = { ...v, stats: { ...v.stats, endurance: v.stats.endurance + 3 } };
    expect(infusionRisk(s, tough, l1)).toBeCloseTo(base - 0.06, 6);
    const green = {
      ...s,
      research: { ...s.research, done: [...s.research.done, 'greenBlood' as TechId] },
    };
    expect(infusionRisk(green, v, l1)).toBeLessThan(base);
    expect(
      infusionRisk(s, { ...v, level: 1, stats: { ...v.stats, endurance: 1 } }, l1),
    ).toBeLessThanOrEqual(KIKIWIWI.risk.max);
  });

  it('refunds an infusion when the laboratory is demolished, and migrates v15 saves', () => {
    const { map, s: base, v } = ironColony();
    const s0 = withLab(base, map);
    const lab = s0.buildings.find((b) => b.type === 'lab')!;
    const s = run(s0, { type: 'transform', villagerId: v.id, labId: lab.id }, s0.now, map);
    const d = run(s, { type: 'demolish', buildingId: lab.id }, s.now, map);
    expect(d.villagers[0]!.job.kind).not.toBe('transform');
    expect(d.resources.juice).toBeGreaterThanOrEqual(s.resources.juice + KIKIWIWI.cost.juice!);
    expect(s.stardust).toBe(s0.stardust - KIKIWIWI.stardust * STARDUST_SCALE);
    expect(d.stardust).toBe(s0.stardust);
    const old = { ...s0, schemaVersion: 15 } as Record<string, unknown>;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
  });
});

describe('the Kikiwiwi', () => {
  function titan() {
    const { map, s } = ironColony();
    const t = withLab(s, map);
    t.villagers[0]!.kikiwiwi = { since: T0 };
    return { map, s: t, k: t.villagers[0]!, plain: { ...t.villagers[0]!, kikiwiwi: undefined } };
  }

  it('guards against ferrets and bats alike, four times as strong', () => {
    const { s, k, plain } = titan();
    const p = guardPower(k, s);
    const base = guardPower(plain, s);
    expect(p.air).toBeGreaterThan(0);
    expect(p.ground).toBeCloseTo(p.air, 9);
    expect(p.ground / kiwiStrength(plain)).toBeCloseTo(
      (base.ground / kiwiStrength(plain) / GARRISON.affinity[plain.classId ?? 'none'].ground) *
        KIKIWIWI.modifiers.fight,
      6,
    );
    // No juice left: weakened.
    const dry = { ...s, resources: { ...s.resources, juice: 0 } };
    expect(guardPower(k, dry).ground).toBeCloseTo(p.ground * KIKIWIWI.weakPower, 9);
    // Green blood: stronger.
    const green = {
      ...s,
      research: { ...s.research, done: [...s.research.done, 'greenBlood' as TechId] },
    };
    expect(guardPower(k, green).ground).toBeGreaterThan(p.ground);
  });

  it('drinks juice at home, exactly offline until the stock runs dry', () => {
    const { s } = titan();
    const without = structuredClone(s);
    delete without.villagers[0]!.kikiwiwi;
    expect(consumption(s).juice - consumption(without).juice).toBeCloseTo(KIKIWIWI.upkeep, 9);
    const low = structuredClone(s);
    low.resources.juice = 50;
    const end = low.now + 12 * HOUR_MS;
    const big = advance(low, end);
    let small = low;
    for (let t = low.now; t < end; t += HOUR_MS / 5) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.resources.juice).toBeCloseTo(big.state.resources.juice, 6);
    expect(small.hunger).toBe(big.state.hunger);
  });

  it('boards only by name, one per ship, and weighs five kiwis', () => {
    const { map, s, k } = titan();
    const pad = findTile(map, 'flesh', 10);
    const t = structuredClone(s);
    t.buildings.push({
      id: 'bpad' as BuildingId,
      type: 'launchpad',
      q: pad.q,
      r: pad.r,
      level: 3,
      richness: pad.richness,
      builtAt: T0,
    });
    const crewByCount = crewOf(t, 3)!;
    expect(crewByCount.some((v) => v.kikiwiwi)).toBe(false);
    expect(crewWeight([k])).toBeCloseTo(
      EXPEDITIONS.kiwiWeight *
        KIKIWIWI.modifiers.weight *
        modifiers({ ...k, kikiwiwi: undefined }).weight,
      9,
    );
    const second = t.villagers[1]!;
    second.kikiwiwi = { since: T0 };
    const launch: Command = {
      type: 'launchExpedition',
      launchpadId: 'bpad' as BuildingId,
      targetId: t.targets[0]!.id,
      crew: [k.id, second.id],
      provisions: { pulp: 200, juice: 200 },
    };
    expect(errorOf(t, launch, map)).toBe('oneKikiwiwi');
  });
});
