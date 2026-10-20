import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  bestDustCrew,
  COMETS,
  isPlausible,
  migrateState,
  pickRate,
  SCHEMA_VERSION,
  STARDUST,
  STARDUST_CAP,
  STARDUST_SCALE,
  stardustOf,
  type GameState,
} from '../src';
import { run, setup, T0 } from './helpers';

const HOUR = 3_600_000;

/** A colony right after the first comet dropped its dust. */
function afterFirstComet() {
  const { map, state } = setup();
  const s = advance(state, T0 + COMETS.firstMs).state;
  return { map, s };
}

describe('comets', () => {
  it('the first comet is announced, then drops stardust on a few free tiles', () => {
    const { state } = setup();
    const { state: after, events } = advance(state, T0 + COMETS.firstMs);
    const announced = events.filter((e) => e.type === 'cometAnnounced');
    const passed = events.filter((e) => e.type === 'cometPassed');
    expect(announced.map((e) => e.at)).toEqual([T0 + COMETS.firstMs - COMETS.firstNoticeMs]);
    expect(passed.map((e) => e.at)).toEqual([T0 + COMETS.firstMs]);
    const patches = after.comets.patches;
    expect(patches.length).toBeGreaterThanOrEqual(COMETS.tiles[0]);
    expect(patches.length).toBeLessThanOrEqual(COMETS.tiles[1]);
    const total = patches.reduce((sum, p) => sum + p.stock, 0);
    expect(total).toBe(COMETS.stock * STARDUST_SCALE);
    for (const p of patches) {
      expect(after.buildings.some((b) => b.q === p.q && b.r === p.r)).toBe(false);
      expect(p.expiresAt).toBe(T0 + COMETS.firstMs + COMETS.lifeMs);
    }
    // The next comet is planned a few days later, announced hours ahead.
    const next = after.comets.next!;
    expect(next.at - after.comets.lastAt).toBeGreaterThanOrEqual(COMETS.intervalMs[0]);
    expect(next.at - after.comets.lastAt).toBeLessThanOrEqual(COMETS.intervalMs[1]);
    expect(next.at - next.announceAt).toBeGreaterThanOrEqual(COMETS.noticeMs[0]);
    expect(next.at - next.announceAt).toBeLessThanOrEqual(COMETS.noticeMs[1]);
  });

  it('unpicked stardust scatters after a day', () => {
    const { s } = afterFirstComet();
    const { state: after, events } = advance(s, s.now + COMETS.lifeMs);
    expect(after.comets.patches).toEqual([]);
    expect(events.filter((e) => e.type === 'dustFaded').length).toBe(s.comets.patches.length);
    expect(after.stardust).toBe(0);
  });

  it('kiwis pick it up, exact offline, then go back to their workplace', () => {
    const { map, s: start } = afterFirstComet();
    const patch = start.comets.patches[0]!;
    const crew = bestDustCrew(start, patch.id);
    expect(crew.length).toBe(Math.min(STARDUST.slots, start.villagers.length));
    const homes = new Map(start.villagers.map((v) => [v.id, v.job]));
    const s = run(
      start,
      { type: 'collectStardust', patchId: patch.id, villagerIds: crew },
      start.now,
      map,
    );
    for (const id of crew) {
      const v = s.villagers.find((x) => x.id === id)!;
      expect(v.job.kind).toBe('stardust');
    }
    const end = s.now + 30 * HOUR;
    const one = advance(s, end);
    let stepped: GameState = s;
    for (let t = s.now; t <= end; t += 7 * 60_000 + 13) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    expect(stepped.stardust).toBe(one.state.stardust);
    expect(stepped.comets).toEqual(one.state.comets);
    expect(stepped.villagers).toEqual(one.state.villagers);
    expect(stepped.rng).toEqual(one.state.rng);
    // All the dust of the tile was picked; the kiwis went back.
    expect(one.state.stardust).toBe(patch.stock);
    expect(one.events.some((e) => e.type === 'dustPicked')).toBe(true);
    for (const id of crew) {
      const v = one.state.villagers.find((x) => x.id === id)!;
      const before = homes.get(id)!;
      expect(v.job.kind).not.toBe('stardust');
      if (before.kind === 'work') expect(v.job).toEqual(before);
    }
    // The time it took matches the pick rates.
    const rate = crew.reduce((sum, id) => sum + pickRate(s.villagers.find((v) => v.id === id)!), 0);
    const picked = one.events.find((e) => e.type === 'dustPicked')!;
    expect(picked.at - s.now).toBe(Math.ceil(patch.stock / rate));
  });

  it('stops at the cap and sends the pickers back', () => {
    const { map, s: start } = afterFirstComet();
    const patch = start.comets.patches[0]!;
    let s: GameState = { ...start, stardust: STARDUST_CAP - 2 * STARDUST_SCALE };
    s = run(
      s,
      { type: 'collectStardust', patchId: patch.id, villagerIds: bestDustCrew(s, patch.id) },
      s.now,
      map,
    );
    const { state: after, events } = advance(s, s.now + 10 * HOUR);
    expect(after.stardust).toBe(STARDUST_CAP);
    expect(stardustOf(after)).toBe(STARDUST.cap);
    expect(events.some((e) => e.type === 'stardustFull')).toBe(true);
    expect(after.villagers.some((v) => v.job.kind === 'stardust')).toBe(false);
    const r = applyCommand(
      after,
      { type: 'collectStardust', patchId: patch.id, villagerIds: [after.villagers[0]!.id] },
      { now: after.now, map },
    );
    expect(!r.ok && r.error).toBe('stardustFull');
  });

  it('refuses unknown tiles, crowds and busy kiwis; an empty list calls them back', () => {
    const { map, s } = afterFirstComet();
    const patch = s.comets.patches[0]!;
    const ctx = { now: s.now, map };
    const ids = s.villagers.map((v) => v.id);
    const err = (cmd: Parameters<typeof applyCommand>[1], st: GameState = s) => {
      const r = applyCommand(st, cmd, ctx);
      return r.ok ? null : r.error;
    };
    expect(err({ type: 'collectStardust', patchId: 'nope', villagerIds: [] })).toBe('unknownPatch');
    if (ids.length > STARDUST.slots)
      expect(
        err({
          type: 'collectStardust',
          patchId: patch.id,
          villagerIds: ids.slice(0, STARDUST.slots + 1),
        }),
      ).toBe('patchFull');
    const injured = structuredClone(s) as GameState;
    injured.villagers[0]!.job = { kind: 'injured', until: s.now + HOUR };
    expect(
      err({ type: 'collectStardust', patchId: patch.id, villagerIds: [ids[0]!] }, injured),
    ).toBe('kiwiBusy');
    const titan = structuredClone(s) as GameState;
    titan.villagers[0]!.kikiwiwi = { since: s.now };
    expect(err({ type: 'collectStardust', patchId: patch.id, villagerIds: [ids[0]!] }, titan)).toBe(
      'kikiwiwiNoWork',
    );
    const sent = run(
      s,
      { type: 'collectStardust', patchId: patch.id, villagerIds: [ids[0]!] },
      s.now,
      map,
    );
    const back = run(
      sent,
      { type: 'collectStardust', patchId: patch.id, villagerIds: [] },
      s.now,
      map,
    );
    expect(back.villagers.some((v) => v.job.kind === 'stardust')).toBe(false);
  });

  it('migrates v18 saves and checks imported stardust', () => {
    const { state } = setup();
    const raw = structuredClone(state) as unknown as Record<string, unknown>;
    delete raw.comets;
    delete raw.stardust;
    raw.schemaVersion = 18;
    const r = migrateState(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.state.stardust).toBe(0);
    expect(r.state.comets.next!.at).toBe(state.now + COMETS.firstMs);
    expect(isPlausible(state, state.now)).toBe(true);
    expect(isPlausible({ ...state, stardust: 5 * STARDUST_SCALE }, state.now)).toBe(false);
  });
});
