import { describe, expect, it } from 'vitest';
import {
  advance,
  buildSlots,
  cloneState,
  migrateState,
  SCHEMA_VERSION,
  startedItems,
  waitingForBuilder,
  workersOf,
  TECHS,
  validateCommand,
  type GameState,
  type TechId,
} from '../src';
import { findTile, rich, run, setup, T0 } from './helpers';

const HOUR = 3_600_000;

/** A rich colony with a pulpery and a fiber workshop, both staffed. */
function colony() {
  const { map, state } = setup();
  let s = rich(state);
  const flesh = findTile(map, 'flesh');
  const grove = findTile(map, 'grove');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = advance(s, T0 + 2 * HOUR).state;
  s = run(s, { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r }, s.now, map);
  s = advance(s, s.now + 2 * HOUR).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  const workshop = s.buildings.find((b) => b.type === 'fiberWorkshop')!;
  return { map, s, pulpery, workshop };
}

/** Sets the Nest level directly (more construction places). */
function withNest(state: GameState, level: number): GameState {
  const s = cloneState(state);
  s.buildings.find((b) => b.type === 'nest')!.level = level;
  return s;
}

/** Orders huts on the first free flesh tiles. */
function orderHuts(s: GameState, map: ReturnType<typeof setup>['map'], count: number) {
  let placed = 0;
  for (const t of map.tiles.filter((x) => x.type === 'flesh')) {
    if (placed === count) break;
    const cmd = { type: 'build', buildingType: 'hut', q: t.q, r: t.r } as const;
    if (validateCommand(s, cmd, { now: s.now, map })) continue;
    s = run(s, cmd, s.now, map);
    placed++;
  }
  return s;
}

describe('constructions as tasks (chantier 15)', () => {
  it('builds in parallel according to the Nest level (1/1/2/2/3/3)', () => {
    const { map, s: start } = colony();
    expect(buildSlots(start)).toBe(1);
    let s = orderHuts(start, map, 2);
    expect(startedItems(s)).toHaveLength(1);
    s = orderHuts(withNest(start, 3), map, 3);
    expect(buildSlots(s)).toBe(2);
    expect(startedItems(s)).toHaveLength(2);
    expect(s.queue[2]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toEqual([]);
    // Every started site has its own builder.
    const builders = s.villagers.filter((v) => v.job.kind === 'build');
    expect(new Set(builders.map((v) => (v.job as { queueItemId: string }).queueItemId)).size).toBe(
      2,
    );
  });

  it('sends the strongest kiwi, borrowed from its post, and sends it back afterwards', () => {
    const { map, s: start, pulpery } = colony();
    const s0 = cloneState(start);
    const worker = workersOf(s0, pulpery.id)[0]!;
    worker.stats.strength = 10;
    let s = orderHuts(s0, map, 1);
    const builder = s.villagers.find((v) => v.job.kind === 'build')!;
    expect(builder.id).toBe(worker.id);
    expect(builder.job).toMatchObject({ returnTo: pulpery.id });
    s = advance(s, s.now + 6 * HOUR).state;
    expect(s.queue).toHaveLength(0);
    expect(s.villagers.find((v) => v.id === worker.id)!.job).toEqual({
      kind: 'work',
      buildingId: pulpery.id,
    });
  });

  it('never starts without a kiwi: the site waits, then starts when one is free', () => {
    const { map, s: start } = colony();
    // Everybody on the rampart: nobody can be borrowed for a construction.
    const all = start.villagers.map((v) => v.id);
    let s = run(start, { type: 'setGarrison', villagerIds: all }, start.now, map);
    s = orderHuts(s, map, 1);
    expect(s.queue[0]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toHaveLength(1);
    // Nothing happens on its own…
    s = advance(s, s.now + 3 * HOUR).state;
    expect(s.queue[0]!.startedAt).toBeNull();
    // …until a kiwi can be borrowed.
    s = run(s, { type: 'setGarrison', villagerIds: all.slice(1) }, s.now, map);
    expect(s.queue[0]!.startedAt).toBe(s.now);
    expect(s.villagers[0]!.job.kind).toBe('build');
  });

  it('waits for the player when the construction task is manual', () => {
    const { map, s: start } = colony();
    const s0 = cloneState(start);
    s0.automation.build = false;
    const s = orderHuts(s0, map, 1);
    expect(s.queue[0]!.startedAt).toBeNull();
    expect(waitingForBuilder(s)).toHaveLength(1);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s: start } = colony();
    const s0 = orderHuts(withNest(start, 5), map, 4);
    expect(startedItems(s0)).toHaveLength(3);
    const end = s0.now + 12 * HOUR;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now; t < end; t += 7 * 60_000 + 13) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.queue).toEqual(big.queue);
    expect(small.buildings.map((b) => [b.type, b.level])).toEqual(
      big.buildings.map((b) => [b.type, b.level]),
    );
    expect(small.villagers).toEqual(big.villagers);
    expect(small.rng).toEqual(big.rng);
  });

  it('migrates v20 saves with every task in automatic mode', () => {
    const { state } = setup();
    const raw = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete raw.automation;
    raw.schemaVersion = 20;
    const r = migrateState(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Object.values(r.state.automation).every(Boolean)).toBe(true);
  });
});

/** A colony with a Nest 2, a pulpery and a Library level 2 (nobody researching). */
function libraryColony() {
  const { map, state } = setup('kiwisu', 'library');
  let s: GameState = rich(state);
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, T0, map);
  s = advance(s, T0 + HOUR).state;
  const flesh = findTile(map, 'flesh');
  const site = findTile(map, 'flesh', 3);
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, s.now, map);
  s = run(s, { type: 'build', buildingType: 'library', q: site.q, r: site.r }, s.now, map);
  s = advance(s, s.now + HOUR).state;
  const library = s.buildings.find((b) => b.type === 'library')!;
  s = run(rich(s), { type: 'upgrade', buildingId: library.id }, s.now, map);
  s = advance(s, s.now + 2 * HOUR).state;
  const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
  return { map, s: rich(s), library, pulpery };
}

const firstTech = (Object.keys(TECHS) as TechId[]).find(
  (id) => TECHS[id].age === 0 && TECHS[id].libraryLevel <= 2 && !TECHS[id].stardust,
)!;

describe('research as a task (chantier 15)', () => {
  it('a chosen technology sends the kiwis with the most Spirit, who go back once it is done', () => {
    const { map, s: start, library, pulpery } = libraryColony();
    const s0 = cloneState(start);
    const worker = workersOf(s0, pulpery.id)[0]!;
    worker.stats.spirit = 10;
    expect(workersOf(s0, library.id)).toHaveLength(0);
    let s = run(s0, { type: 'setResearch', tech: firstTech }, s0.now, map);
    const researchers = workersOf(s, library.id);
    expect(researchers).toHaveLength(2);
    expect(researchers[0]!.id).toBe(worker.id);
    expect(researchers[0]!.lent).toBe(pulpery.id);
    s = advance(s, s.now + 48 * HOUR).state;
    expect(s.research.done).toContain(firstTech);
    expect(workersOf(s, library.id)).toHaveLength(0);
    expect(s.villagers.find((v) => v.id === worker.id)!.job).toEqual({
      kind: 'work',
      buildingId: pulpery.id,
    });
  });

  it('keeps the kiwis the player placed there, and does nothing in manual mode', () => {
    const { map, s: start, library } = libraryColony();
    let s = run(start, { type: 'assignWorkers', buildingId: library.id, count: 1 }, start.now, map);
    const placed = workersOf(s, library.id)[0]!;
    s = run(s, { type: 'setResearch', tech: firstTech }, s.now, map);
    s = run(s, { type: 'setResearch', tech: null }, s.now, map);
    expect(workersOf(s, library.id).map((v) => v.id)).toEqual([placed.id]);
    const manual = cloneState(start);
    manual.automation.research = false;
    s = run(manual, { type: 'setResearch', tech: firstTech }, manual.now, map);
    expect(workersOf(s, library.id)).toHaveLength(0);
  });

  it('the "+" of the Library takes the kiwi with the most Spirit', () => {
    const { map, s: start, library } = libraryColony();
    const s0 = cloneState(start);
    const idle = s0.villagers.filter((v) => v.job.kind === 'idle');
    expect(idle.length).toBeGreaterThan(1);
    idle[idle.length - 1]!.stats.spirit = 10;
    const s = run(s0, { type: 'assignWorkers', buildingId: library.id, count: 1 }, s0.now, map);
    expect(workersOf(s, library.id)[0]!.id).toBe(idle[idle.length - 1]!.id);
  });

  it('gives the same result in one big step or many small ones', () => {
    const { map, s: start } = libraryColony();
    const s0 = run(start, { type: 'setResearch', tech: firstTech }, start.now, map);
    const end = s0.now + 30 * HOUR;
    const big = advance(s0, end).state;
    let small = s0;
    for (let t = s0.now; t < end; t += 23 * 60_000 + 7) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(small.research).toEqual(big.research);
    expect(small.villagers).toEqual(big.villagers);
  });
});
