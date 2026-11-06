import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  bedsOf,
  capacity,
  consumption,
  dockTravel,
  exposedKiwis,
  greenhouseRates,
  moduleSlots,
  MODULES,
  observatoryNotice,
  observatoryResearch,
  ORBIT,
  orbitCrew,
  researchPerHour,
  STARDUST_SCALE,
  travelFactor,
  workModules,
  type Command,
  type GameState,
  type ModuleType,
  type VillagerId,
} from '../src';
import { run, yardColony } from './helpers';
import { ground, kiwaiReady, sendUp } from './orbitHelpers';

const HOUR = 3_600_000;
type Map = Parameters<typeof run>[3];

const errorOf = (s: GameState, cmd: Command, map: Map) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

describe('chantier 53, modules', () => {
  it('sets modules on free ground of a kiwai in orbit, paid and assembled', () => {
    const { map, s: s0 } = yardColony(1);
    let s = run(s0, { type: 'launchKiwai', kiwaiType: 'greenhouse' }, s0.now, map);
    const k = s.orbit.kiwais[0]!;
    const at = ground(s, k.id)[0]!;
    const cmd = (moduleType: ModuleType, h: { q: number; r: number } = at): Command => ({
      type: 'buildModule',
      kiwaiId: k.id,
      moduleType,
      q: h.q,
      r: h.r,
    });
    expect(errorOf(s, cmd('dome'), map)).toBe('kiwaiNotReady');
    s = advance(s, k.readyAt).state;
    expect(errorOf(s, cmd('sensor'), map)).toBe('moduleNotFit');
    expect(errorOf(s, cmd('dome', { q: 0, r: 0 }), map)).toBe('tileNotAllowed');
    expect(errorOf(s, cmd('dome', { q: 3, r: 0 }), map)).toBe('unknownTile');
    const before = s.resources.pulp;
    const t = run(s, cmd('dome'), s.now, map);
    expect(t.resources.pulp).toBe(before - MODULES.dome.cost.pulp!);
    const m = t.orbit.kiwais[0]!.modules[0]!;
    expect(m.readyAt).toBe(s.now + MODULES.dome.durationMs);
    expect(errorOf(t, cmd('panel'), map)).toBe('tileOccupied');
    const r = advance(t, m.readyAt);
    expect(r.events.some((e) => e.type === 'moduleReady' && e.at === m.readyAt)).toBe(true);
    expect(workModules(r.state.orbit.kiwais[0]!, r.state.now)).toHaveLength(1);
    // As many modules as the yard's level allows.
    let u = r.state;
    const tiles = ground(u, k.id);
    for (let i = 1; i < moduleSlots(u); i++) u = run(u, cmd('habitat', tiles[i]!), u.now, map);
    expect(errorOf(u, cmd('habitat', tiles[moduleSlots(u)]!), map)).toBe('moduleLimit');
  });

  it('takes a module down for a quarter of its price, never a habitat in use', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const k = s.orbit.kiwais[0]!;
    const panel = k.modules.find((m) => m.type === 'panel')!;
    const t = run(s, { type: 'removeModule', kiwaiId, moduleId: panel.id }, s.now, map);
    expect(t.orbit.kiwais[0]!.modules).toHaveLength(k.modules.length - 1);
    const { t: up } = sendUp(s, map, kiwaiId, 2);
    const habitat = k.modules.find((m) => m.type === 'habitat')!;
    expect(errorOf(up, { type: 'removeModule', kiwaiId, moduleId: habitat.id }, map)).toBe(
      'habitatInUse',
    );
  });
});

describe('chantier 53, the shuttle and the kiwis up there', () => {
  it('takes kiwis up in half the trip and brings others down at its end', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const { t, up } = sendUp(s, map, kiwaiId, 2);
    const sh = t.orbit.shuttle!;
    expect(sh.upAt - t.now).toBe(ORBIT.shuttle.tripMs / 2);
    for (const id of up) {
      const v = t.villagers.find((x) => x.id === id)!;
      expect(v.job).toMatchObject({ kind: 'orbit', kiwaiId, aboard: 'up' });
    }
    expect(orbitCrew(t, kiwaiId)).toHaveLength(0);
    expect(errorOf(t, { type: 'sendShuttle', kiwaiId, up: [], down: [] }, map)).toBe('shuttleBusy');
    const docked = advance(t, sh.upAt).state;
    expect(
      orbitCrew(docked, kiwaiId)
        .map((v) => v.id)
        .sort(),
    ).toEqual([...up].sort());
    const back = advance(t, sh.backAt).state;
    expect(back.orbit.shuttle).toBeNull();
    // Down again: home at the shuttle's return, back to their old work.
    const before = new Map(s.villagers.map((v) => [v.id, v.job]));
    const d = run(back, { type: 'sendShuttle', kiwaiId, up: [], down: up }, back.now, map);
    const home = advance(d, d.orbit.shuttle!.backAt).state;
    for (const id of up) {
      const v = home.villagers.find((x) => x.id === id)!;
      expect(v.job.kind).not.toBe('orbit');
      const old = before.get(id)!;
      if (old.kind === 'work') expect(v.job).toEqual(old);
    }
  });

  it('needs room in the habitats, seats in the shuttle and kiwis free to go', () => {
    const { map, s, kiwaiId } = kiwaiReady('observatory');
    const free = s.villagers
      .filter((v) => !v.kikiwiwi && (v.job.kind === 'work' || v.job.kind === 'idle'))
      .map((v) => v.id);
    expect(free.length).toBeGreaterThanOrEqual(5);
    const send = (up: VillagerId[], down: VillagerId[] = []): Command => ({
      type: 'sendShuttle',
      kiwaiId,
      up,
      down,
    });
    // One habitat: two places.
    expect(errorOf(s, send(free.slice(0, 3)), map)).toBe('noHabitat');
    expect(errorOf(s, send(free.slice(0, 5)), map)).toBe('shuttleFull');
    expect(errorOf(s, send([], free.slice(0, 1)), map)).toBe('notInOrbit');
    const busy = structuredClone(s) as GameState;
    busy.villagers.find((v) => v.id === free[0])!.job = { kind: 'injured', until: s.now + HOUR };
    expect(errorOf(busy, send(free.slice(0, 1)), map)).toBe('kiwiBusy');
    const nope: Command = { type: 'sendShuttle', kiwaiId: 'nope', up: [], down: [] };
    expect(errorOf(s, nope, map)).toBe('unknownKiwai');
  });

  it('keeps them fed from the colony, out of the beds and out of the militia', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const { t, up } = sendUp(s, map, kiwaiId, 2);
    const u = advance(t, t.orbit.shuttle!.backAt).state;
    expect(consumption(u).pulp).toBeCloseTo(consumption(s).pulp, 6);
    const beds = bedsOf(u);
    const militia = new Set(exposedKiwis(u).map((v) => v.id));
    for (const id of up) {
      expect(beds.has(id)).toBe(false);
      expect(militia.has(id)).toBe(false);
    }
  });
});

describe('chantier 53, what each kiwai gives', () => {
  it('greenhouse: juice and fibre day and night, once the kiwis are up', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    expect(greenhouseRates(s)).toEqual({});
    const { t } = sendUp(s, map, kiwaiId, 2);
    const u = advance(t, t.orbit.shuttle!.upAt).state;
    const rates = greenhouseRates(u);
    expect(rates.juice).toBeGreaterThan(0);
    expect(rates.fiber).toBeGreaterThan(0);
    // A broken dome stops it.
    const b = structuredClone(u) as GameState;
    for (const m of b.orbit.kiwais[0]!.modules) if (m.type === 'dome') m.broken = b.now;
    expect(greenhouseRates(b)).toEqual({});
  });

  it('observatory: research points and earlier notices', () => {
    const { map, s, kiwaiId } = kiwaiReady('observatory');
    const base = researchPerHour(s);
    expect(observatoryNotice(s)).toBe(0);
    const { t } = sendUp(s, map, kiwaiId, 2);
    const u = advance(t, t.orbit.shuttle!.upAt).state;
    expect(observatoryResearch(u)).toBeGreaterThan(0);
    expect(researchPerHour(u)).toBeGreaterThan(base);
    expect(observatoryNotice(u)).toBe(ORBIT.observatory.noticeMs);
  });

  it('star harvest: fills its own tank, the shuttle brings the dust down', () => {
    const { map, s, kiwaiId } = kiwaiReady('harvest');
    const { t } = sendUp(s, map, kiwaiId, 2);
    const u = advance(t, t.orbit.shuttle!.backAt).state;
    const full = advance(u, u.now + 400 * HOUR).state;
    expect(full.orbit.kiwais[0]!.dust).toBe(ORBIT.dust.tank * STARDUST_SCALE);
    const low = structuredClone(full) as GameState;
    low.stardust = 0;
    const trip = run(low, { type: 'sendShuttle', kiwaiId, up: [], down: [] }, low.now, map);
    const back = advance(trip, trip.orbit.shuttle!.backAt);
    expect(back.state.stardust).toBeGreaterThanOrEqual(ORBIT.dust.tank * STARDUST_SCALE);
    expect(back.events.find((e) => e.type === 'shuttleBack')).toMatchObject({
      stardust: ORBIT.dust.tank,
    });
  });

  it('dock: shorter trips while a berth is staffed', () => {
    const { map, s, kiwaiId } = kiwaiReady('dock');
    expect(dockTravel(s)).toBe(1);
    const before = travelFactor(s, {});
    const { t } = sendUp(s, map, kiwaiId, 1);
    const u = advance(t, t.orbit.shuttle!.upAt).state;
    expect(dockTravel(u)).toBeCloseTo(ORBIT.dock.travel, 9);
    expect(travelFactor(u, {})).toBeCloseTo(before * ORBIT.dock.travel, 9);
  });

  it('is exact offline: one big step or many small ones', () => {
    for (const type of ['greenhouse', 'harvest', 'observatory'] as const) {
      const { map, s, kiwaiId } = kiwaiReady(type);
      const { t } = sendUp(s, map, kiwaiId, 2);
      const end = t.now + 30 * HOUR;
      const big = advance(t, end).state;
      let small = t;
      for (let at = t.now + 777_777; at < end; at += 777_777) small = advance(small, at).state;
      small = advance(small, end).state;
      expect(small.orbit).toEqual(big.orbit);
      expect(small.research.points).toBe(big.research.points);
      expect(small.stardust).toBe(big.stardust);
      for (const id of ['juice', 'fiber'] as const)
        expect(small.resources[id]).toBeCloseTo(big.resources[id], 3);
      expect(capacity(big).juice).toBeGreaterThan(0);
    }
  });
});
