import { describe, expect, it } from 'vitest';
import {
  advance,
  ageOf,
  applyCommand,
  BUILDING_TYPES,
  BUILDINGS,
  HOUR_MS,
  isPlausible,
  levelDef,
  maxLevelNow,
  maxLevelOf,
  meteorStock,
  migrateState,
  shipOf,
  wavePower,
  type Command,
  type GameState,
  type TechId,
  isVillageLife,
} from '../src';
import { findTile, rich, run, setup, T0, siteFor } from './helpers';

/** A colony with a Nest 3 and a pulpery, nothing researched. */
function nest3() {
  const { map, state } = setup('kiwisu', 'ages');
  let s: GameState = rich(state);
  const nestId = s.buildings[0]!.id;
  s = run(s, { type: 'upgrade', buildingId: nestId }, T0, map);
  s = advance(s, T0 + HOUR_MS).state;
  s = run(rich(s), { type: 'upgrade', buildingId: nestId }, s.now, map);
  s = advance(s, s.now + 2 * HOUR_MS).state;
  const flesh = findTile(map, 'flesh');
  s = run(rich(s), { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, s.now, map);
  s = advance(s, s.now + HOUR_MS).state;
  return { map, s: rich(s), nestId };
}

const knowing = (s: GameState, ...techs: TechId[]): GameState => ({
  ...s,
  research: { ...s.research, done: [...s.research.done, ...techs] },
});

const errorOf = (s: GameState, cmd: Command, map: ReturnType<typeof setup>['map']) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

describe('ages', () => {
  it('extends every building but camps and the monument to twelve levels, three per age', () => {
    for (const type of BUILDING_TYPES) {
      // Chantier 37: the training camp has its own three levels (Stone, Stone, Iron), like the lab
      // and the Forge (chantier 38); the campfire (chantier 43) and the decorations and games
      // (chantier 44) have a single level.
      if (
        [
          'camp',
          'monument',
          'lab',
          'trainingCamp',
          'forge',
          'campfire',
          'cabaret',
          'fireworks',
        ].includes(type)
      )
        continue;
      if (isVillageLife(type)) continue;
      expect(maxLevelOf(type)).toBe(12);
      for (let level = 4; level <= 12; level++) {
        const def = levelDef(type, level)!;
        expect(def.requiresAge).toBe(Math.floor((level - 1) / 3));
        expect(def.requiresNestLevel).toBe(type === 'nest' ? level - 1 : level);
        const prev = levelDef(type, level - 1)!;
        expect(def.durationMs).toBeGreaterThan(prev.durationMs);
        for (const [id, v] of Object.entries(prev.cost))
          expect(def.cost[id as keyof typeof def.cost]).toBeGreaterThan(v);
      }
    }
    expect(maxLevelOf('monument')).toBe(3);
    expect(maxLevelOf('lab')).toBe(3);
    expect(maxLevelOf('trainingCamp')).toBe(3);
  });

  it('builds the monument once its passage is researched, and the Stone age begins', () => {
    const { map, s } = nest3();
    const site = findTile(map, 'flesh', 4);
    const other = findTile(map, 'flesh', 5);
    const build: Command = {
      type: 'build',
      buildingType: 'monument',
      ...siteFor(s, map, 'monument', site),
    };
    expect(errorOf(s, build, map)).toBe('passageMissing');
    const ready = knowing(s, 'stoneAge');
    const ordered = run(ready, build, ready.now, map);
    expect(errorOf(ordered, { ...build, ...siteFor(ordered, map, 'monument', other) }, map)).toBe(
      'monumentExists',
    );
    const { state: after, events } = advance(
      ordered,
      ordered.now + BUILDINGS.monument.levels[0]!.durationMs * 2,
    );
    expect(ageOf(after)).toBe(1);
    expect(events.some((e) => e.type === 'ageReached' && e.age === 1)).toBe(true);
    expect(shipOf(after).id).toBe('logs');
    const monument = after.buildings.find((b) => b.type === 'monument')!;
    expect(errorOf(after, { type: 'demolish', buildingId: monument.id }, map)).toBe(
      'notDemolishable',
    );
    expect(errorOf(rich(after), { type: 'upgrade', buildingId: monument.id }, map)).toBe(
      'passageMissing',
    );
  });

  it('opens levels 4–6 with the Stone age, each behind a Nest of the same level', () => {
    const { map, s, nestId } = nest3();
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    // Pulpery to level 3 first.
    let t = s;
    for (let i = 0; i < 2; i++) {
      t = run(rich(t), { type: 'upgrade', buildingId: pulpery.id }, t.now, map);
      t = advance(t, t.now + HOUR_MS).state;
    }
    expect(errorOf(rich(t), { type: 'upgrade', buildingId: nestId }, map)).toBe('ageTooLow');
    expect(errorOf(rich(t), { type: 'upgrade', buildingId: pulpery.id }, map)).toBe('ageTooLow');
    expect(maxLevelNow(t, 'pulpery')).toBe(3);
    const site = findTile(map, 'flesh', 4);
    t = knowing(rich(t), 'stoneAge');
    t = run(
      t,
      { type: 'build', buildingType: 'monument', ...siteFor(t, map, 'monument', site) },
      t.now,
      map,
    );
    t = advance(t, t.now + 8 * HOUR_MS).state;
    expect(maxLevelNow(t, 'pulpery')).toBe(6);
    expect(errorOf(rich(t), { type: 'upgrade', buildingId: pulpery.id }, map)).toBe(
      'nestLevelTooLow',
    );
    // Three levels in the Stone age, then the Iron age is needed.
    for (let level = 4; level <= 6; level++) {
      t = run(rich(t), { type: 'upgrade', buildingId: nestId }, t.now, map);
      t = advance(t, t.now + 12 * HOUR_MS).state;
      expect(t.buildings[0]!.level).toBe(level);
      t = run(rich(t), { type: 'upgrade', buildingId: pulpery.id }, t.now, map);
      t = advance(t, t.now + 12 * HOUR_MS).state;
      expect(t.buildings.find((b) => b.id === pulpery.id)!.level).toBe(level);
    }
    expect(errorOf(rich(t), { type: 'upgrade', buildingId: nestId }, map)).toBe('ageTooLow');
    expect(errorOf(rich(t), { type: 'upgrade', buildingId: pulpery.id }, map)).toBe('ageTooLow');
  });

  it('migrates the old age levels 4/5/6 to 4/7/10 (chantier 30)', () => {
    const { s } = nest3();
    const raw = structuredClone(s) as unknown as Record<string, unknown>;
    raw.schemaVersion = 23;
    const buildings = raw.buildings as { id: string; type: string; level: number }[];
    buildings[0]!.level = 6;
    const pulpery = buildings.find((b) => b.type === 'pulpery')!;
    pulpery.level = 5;
    const stats = raw.stats as { constructionsCompleted: number };
    const before = stats.constructionsCompleted;
    raw.queue = [
      {
        id: 'q-old',
        kind: 'upgrade',
        buildingType: 'pulpery',
        q: 0,
        r: 0,
        buildingId: pulpery.id,
        targetLevel: 6,
        richness: 1,
        durationMs: HOUR_MS,
        startedAt: null,
        paid: {},
        orderedAt: s.now,
      },
    ];
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.buildings[0]!.level).toBe(10);
    expect(m.state.buildings.find((b) => b.id === pulpery.id)!.level).toBe(7);
    expect(m.state.queue[0]!.targetLevel).toBe(8);
    expect(m.state.stats.constructionsCompleted).toBe(before + 4 + 2);
  });

  it('makes predators and gifts from the sky grow with the age', () => {
    const { s } = nest3();
    const withAge = (age: number): GameState => ({
      ...s,
      buildings: [
        ...s.buildings,
        { id: 'bm' as never, type: 'monument', q: 3, r: 0, level: age, richness: 1, builtAt: T0 },
      ],
    });
    const at = s.now + 24 * HOUR_MS;
    expect(wavePower(withAge(1), at)).toBeGreaterThan(wavePower(s, at));
    expect(wavePower(withAge(3), at)).toBeGreaterThan(wavePower(withAge(2), at));
    expect(meteorStock(withAge(2), at)).toBeGreaterThan(meteorStock(s, at));
  });

  it('rejects imported ages that were not researched', () => {
    const { s } = nest3();
    const monument = {
      id: 'bm' as never,
      type: 'monument' as const,
      q: 0,
      r: 1,
      level: 1,
      richness: 1,
      builtAt: T0,
    };
    const cheat: GameState = { ...s, buildings: [...s.buildings, monument] };
    expect(isPlausible(cheat, s.now)).toBe(false);
  });
});
