import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  forecastWave,
  HOUR_MS,
  INCIDENTS,
  migrateState,
  SHELTER,
  THREATS,
  workforce,
  workersOf,
  type GameEvent,
  type GameState,
} from '../src';
import { findTile, kiwi, rich, run, setup, T0 } from './helpers';

const DAY = 24 * HOUR_MS;

/** A small colony with a level-2 Nest, a few producers and eight kiwis. */
function colony() {
  const { map, state } = setup();
  let s = rich(state);
  s.buildings[0]!.level = 2;
  for (let i = 0; i < 5; i++) s.villagers.push(kiwi(`k${i}`));
  const flesh = findTile(map, 'flesh');
  const juice = findTile(map, 'juice');
  const grove = findTile(map, 'grove');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = run(s, { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r }, T0, map);
  s = advance(s, T0 + 5 * 60_000).state;
  s = run(s, { type: 'build', buildingType: 'fiberWorkshop', q: grove.q, r: grove.r }, s.now, map);
  s = advance(s, T0 + 10 * 60_000).state;
  s = { ...s, resources: { pulp: 800, fiber: 800, seeds: 300, juice: 800 } };
  return { map, state: s };
}

function eventsUntil(s: GameState, end: number): { state: GameState; events: GameEvent[] } {
  return advance(s, end);
}

describe('predator waves', () => {
  it('plans nothing while the Nest is level 1 (beginners)', () => {
    const { state } = setup();
    const after = advance(state, T0 + 3 * DAY).state;
    expect(after.threats.next).toBeNull();
    expect(after.threats.waves).toBe(0);
  });

  it('strikes after the protection, announced 8–12 h ahead, about once a day', () => {
    const { state } = colony();
    const { state: after, events } = eventsUntil(state, T0 + 6 * DAY);
    const announced = events.filter((e) => e.type === 'waveAnnounced');
    const struck = events.filter((e) => e.type === 'waveStruck');
    expect(struck.length).toBeGreaterThanOrEqual(2);
    expect(struck[0]!.at).toBeGreaterThanOrEqual(T0 + THREATS.protectionMs);
    for (const a of announced) {
      if (a.type !== 'waveAnnounced') continue;
      const notice = a.strikeAt - a.at;
      expect(notice).toBeGreaterThanOrEqual(THREATS.noticeMs[0]);
      expect(notice).toBeLessThanOrEqual(THREATS.noticeMs[1]);
    }
    for (let i = 1; i < struck.length; i++) {
      expect(struck[i]!.at - struck[i - 1]!.at).toBeGreaterThanOrEqual(THREATS.intervalMs[0]);
    }
    expect(after.threats.reports.length).toBe(Math.min(THREATS.history, struck.length));
  });

  it('never razes a passive colony (a week without playing)', () => {
    const { state } = colony();
    const before = state.buildings.map((b) => b.id).sort();
    const after = advance(state, T0 + 7 * DAY).state;
    expect(after.buildings.map((b) => b.id).sort()).toEqual(before);
    expect(after.buildings.some((b) => b.type === 'nest' && !b.damaged)).toBe(true);
    expect(after.villagers.length).toBeGreaterThanOrEqual(THREATS.minKiwis);
    // Defeats leave a shield: at most one wave a day and a half on average.
    const lost = after.threats.reports.filter((r) => !r.victory);
    expect(lost.length).toBeGreaterThan(0);
    for (const r of lost) {
      expect(r.dead.length).toBeLessThanOrEqual(THREATS.maxDeaths);
      expect(r.damaged.length).toBeLessThanOrEqual(THREATS.maxDamaged);
    }
  });

  it('gives the same result in one big step or many small ones', () => {
    const { state } = colony();
    const end = T0 + 3 * DAY;
    const oneStep = advance(state, end).state;
    let stepped = state;
    for (let t = state.now; t <= end; t += 37 * 60_000 + 13) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    expect(stepped.threats).toEqual(oneStep.threats);
    expect(stepped.villagers).toEqual(oneStep.villagers);
    expect(stepped.buildings).toEqual(oneStep.buildings);
    expect(stepped.paths).toEqual(oneStep.paths);
    for (const id of ['pulp', 'fiber', 'seeds', 'juice'] as const) {
      expect(stepped.resources[id]).toBeCloseTo(oneStep.resources[id], 4);
    }
  });

  it('forecasts with the same maths that resolve the wave', () => {
    const { state } = colony();
    let s = state;
    while (!s.threats.next?.announced) s = advance(s, s.now + HOUR_MS).state;
    const f = forecastWave(s)!;
    expect(f).not.toBeNull();
    expect(f.threat.ground + f.threat.air).toBeGreaterThan(0);
    // No one posted, no turret: the bats are never stopped.
    expect(f.defense.air).toBe(0);
    expect(f.odds).toBe('unlikely');
    expect(f.expected.victory).toBe(false);
    expect(f.expected.damaged).toBeGreaterThanOrEqual(1);
  });

  it('shelters everyone in the Nest: nobody hurt, no harvest meanwhile', () => {
    const { map, state } = colony();
    let s = state;
    while (!s.threats.next?.announced) s = advance(s, s.now + HOUR_MS).state;
    const wave = s.threats.next!;
    const early = applyCommand(s, { type: 'shelter' }, { now: s.now, map });
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toBe('noWaveSoon');
    const at = wave.at - SHELTER.beforeMs + 1000;
    s = run(s, { type: 'shelter' }, at, map);
    expect(s.threats.shelterUntil).toBe(wave.at + SHELTER.afterMs);
    const again = applyCommand(s, { type: 'shelter' }, { now: at + 1000, map });
    expect(!again.ok && again.error).toBe('alreadySheltered');
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    expect(workforce(s, pulpery, workersOf(s, pulpery.id))).toBe(0);
    const { state: after, events } = advance(s, wave.at + SHELTER.afterMs + 1);
    const report = after.threats.reports.at(-1)!;
    expect(report.sheltered).toBe(true);
    expect(report.injured).toHaveLength(0);
    expect(report.dead).toHaveLength(0);
    expect(events.some((e) => e.type === 'shelterOver')).toBe(true);
    const p2 = after.buildings.find((b) => b.id === pulpery.id)!;
    expect(workforce(after, p2, workersOf(after, p2.id))).toBeGreaterThan(0);
  });

  it('repairs damaged buildings through the queue', () => {
    const { map, state } = colony();
    let s = rich(state);
    const pulpery = s.buildings.find((b) => b.type === 'pulpery')!;
    const fresh = applyCommand(s, { type: 'repair', buildingId: pulpery.id }, { now: s.now, map });
    expect(!fresh.ok && fresh.error).toBe('notDamaged');
    pulpery.damaged = true;
    const full = workforce(s, { ...pulpery, damaged: false }, workersOf(s, pulpery.id));
    expect(workforce(s, pulpery, workersOf(s, pulpery.id))).toBeCloseTo(
      full * THREATS.damagedWork,
      9,
    );
    s = run(s, { type: 'repair', buildingId: pulpery.id }, s.now, map);
    const twice = applyCommand(s, { type: 'repair', buildingId: pulpery.id }, { now: s.now, map });
    expect(!twice.ok && twice.error).toBe('alreadyRepairing');
    expect(s.queue.at(-1)!.kind).toBe('repair');
    const { state: after, events } = advance(s, s.now + HOUR_MS);
    expect(after.buildings.find((b) => b.id === pulpery.id)!.damaged).toBeUndefined();
    expect(events.some((e) => e.type === 'repaired')).toBe(true);
  });

  it('injured kiwis rest, then go back to work', () => {
    const { state } = colony();
    const s = structuredClone(state);
    const v = s.villagers[0]!;
    v.job = { kind: 'injured', until: s.now + HOUR_MS };
    const { state: after, events } = advance(s, s.now + 2 * HOUR_MS);
    expect(events.some((e) => e.type === 'injuryHealed')).toBe(true);
    expect(after.villagers.find((x) => x.id === v.id)!.job.kind).not.toBe('injured');
  });
});

describe('incidents', () => {
  it('a few minor incidents a day, without notice', () => {
    const { state } = colony();
    const { state: after, events } = advance(state, T0 + 2 * DAY);
    const incidents = events.filter((e) => e.type === 'incident');
    expect(incidents.length).toBeGreaterThanOrEqual(3);
    expect(incidents.length).toBeLessThanOrEqual(10);
    expect(incidents[0]!.at).toBe(T0 + INCIDENTS.firstMs);
    for (const r of after.threats.incidents) {
      if (r.kind === 'storm') expect(r.amount).toBeLessThanOrEqual(INCIDENTS.stormPaths[1]);
    }
  });
});

describe('save v9 → v10', () => {
  it('adds the predators to old saves', () => {
    const { state } = setup();
    const raw = structuredClone(state) as unknown as Record<string, unknown>;
    delete raw.threats;
    raw.schemaVersion = 9;
    const r = migrateState(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.threats.next).toBeNull();
      expect(r.state.threats.nextIncidentAt).toBe(state.now + INCIDENTS.firstMs);
    }
  });
});
