import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  comingSwarm,
  dustPoints,
  meteorIronOf,
  ORBIT,
  orbitCrew,
  repairTime,
  wearAnnounced,
  type Command,
  type GameState,
} from '../src';
import { run } from './helpers';
import { kiwaiReady, sendUp } from './orbitHelpers';

const HOUR = 3_600_000;
type Map = Parameters<typeof run>[3];

const errorOf = (s: GameState, cmd: Command, map: Map) => {
  const r = applyCommand(s, cmd, { now: s.now, map });
  return r.ok ? null : r.error;
};

/** A comet announced, passing in `inMs`. */
function cometComing(s: GameState, inMs: number): GameState {
  const t = structuredClone(s) as GameState;
  t.comets.next = { id: 'c9', announceAt: t.now - HOUR, at: t.now + inMs, announced: true };
  return t;
}

describe('chantier 53, breakdowns', () => {
  it('are planned in public, announced, and stop a module until repaired', () => {
    const { s } = kiwaiReady('greenhouse');
    const k = s.orbit.kiwais[0]!;
    expect(k.wear.at).toBeGreaterThan(s.now);
    const target = k.modules.find((m) => m.id === k.wear.moduleId)!;
    expect(['dome', 'panel']).toContain(target.type);
    expect(wearAnnounced(k, s.now)).toBe(false);
    const r = advance(s, k.wear.at);
    const notice = r.events.find((e) => e.type === 'wearAnnounced');
    expect(notice).toMatchObject({ at: k.wear.at - ORBIT.wear.noticeMs, breakAt: k.wear.at });
    expect(r.events.some((e) => e.type === 'moduleBroken' && e.at === k.wear.at)).toBe(true);
    const after = r.state.orbit.kiwais[0]!;
    expect(after.modules.find((m) => m.id === target.id)!.broken).toBe(k.wear.at);
    // Nobody up there: it waits, then the next breakdown is planned.
    expect(after.modules.find((m) => m.id === target.id)!.repairAt).toBeUndefined();
    expect(after.wear.n).toBe(1);
  });

  it('are put off by a service paid in iron', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const k = s.orbit.kiwais[0]!;
    const t = run(s, { type: 'serviceKiwai', kiwaiId }, s.now, map);
    expect(meteorIronOf(t)).toBe(meteorIronOf(s) - ORBIT.wear.serviceIron);
    expect(t.orbit.kiwais[0]!.wear.n).toBe(k.wear.n + 1);
    expect(t.orbit.kiwais[0]!.wear.at).toBeGreaterThanOrEqual(s.now + ORBIT.wear.gapMs[0]);
    const poor = structuredClone(s) as GameState;
    poor.meteorIron = 0;
    expect(errorOf(poor, { type: 'serviceKiwai', kiwaiId }, map)).toBe('notEnoughIron');
  });

  it('are repaired by the best mechanic up there, or when someone comes up', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    // Broken with nobody up there…
    const k = s.orbit.kiwais[0]!;
    const broken = advance(s, k.wear.at).state;
    const m = broken.orbit.kiwais[0]!.modules.find((x) => x.broken !== undefined)!;
    // …someone comes up: the repair starts at the docking.
    const { t } = sendUp(broken, map, kiwaiId, 2);
    const docked = advance(t, t.orbit.shuttle!.upAt).state;
    const time = repairTime(docked, kiwaiId)!;
    const dex = Math.max(...orbitCrew(docked, kiwaiId).map((v) => v.stats.dexterity));
    expect(time).toBe(Math.round(ORBIT.wear.repairMs * (5 / dex)));
    const repairing = docked.orbit.kiwais[0]!.modules.find((x) => x.id === m.id)!;
    expect(repairing.repairAt).toBe(t.orbit.shuttle!.upAt + time);
    const r = advance(docked, repairing.repairAt!);
    expect(r.events.some((e) => e.type === 'moduleRepaired')).toBe(true);
    expect(r.state.orbit.kiwais[0]!.modules.find((x) => x.id === m.id)!.broken).toBeUndefined();
  });
});

describe('chantier 53, comet swarms', () => {
  it('break modules and send the kiwis down wounded, never destroy', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const { t, up } = sendUp(s, map, kiwaiId, 2);
    const u = cometComing(advance(t, t.orbit.shuttle!.backAt).state, 2 * HOUR);
    const r = advance(u, u.now + 2 * HOUR);
    const hit = r.events.find((e) => e.type === 'swarmHit');
    expect(hit).toMatchObject({ kiwaiId, shielded: false, hurt: 2 });
    expect(hit && 'broken' in hit && hit.broken).toBeGreaterThan(0);
    const k = r.state.orbit.kiwais[0]!;
    expect(k.modules).toHaveLength(s.orbit.kiwais[0]!.modules.length);
    for (const id of up)
      expect(r.state.villagers.find((v) => v.id === id)!.job.kind).toBe('injured');
  });

  it('are held by a raised shield (stardust), only once announced', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    expect(comingSwarm(s)).toBeNull();
    expect(errorOf(s, { type: 'raiseShield', kiwaiId }, map)).toBe('noSwarm');
    const { t } = sendUp(s, map, kiwaiId, 2);
    const u = cometComing(advance(t, t.orbit.shuttle!.backAt).state, 2 * HOUR);
    const shielded = run(u, { type: 'raiseShield', kiwaiId }, u.now, map);
    expect(dustPoints(shielded.stardust)).toBe(dustPoints(u.stardust) - ORBIT.swarm.shieldDust);
    expect(errorOf(shielded, { type: 'raiseShield', kiwaiId }, map)).toBe('shieldRaised');
    const r = advance(shielded, u.now + 2 * HOUR);
    expect(r.events.find((e) => e.type === 'swarmHit')).toMatchObject({
      shielded: true,
      broken: 0,
      hurt: 0,
    });
    expect(orbitCrew(r.state, kiwaiId)).toHaveLength(2);
    expect(r.state.orbit.kiwais[0]!.shield).toBeUndefined();
  });

  it('spare the kiwis evacuated by the shuttle', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const { t, up } = sendUp(s, map, kiwaiId, 2);
    const u = cometComing(advance(t, t.orbit.shuttle!.backAt).state, 2 * HOUR);
    const evac = run(u, { type: 'sendShuttle', kiwaiId, up: [], down: up }, u.now, map);
    const r = advance(evac, u.now + 2 * HOUR);
    expect(r.events.find((e) => e.type === 'swarmHit')).toMatchObject({ hurt: 0 });
    for (const id of up)
      expect(r.state.villagers.find((v) => v.id === id)!.job.kind).not.toBe('injured');
  });

  it('stays exact offline through breakdowns, repairs and a swarm', () => {
    const { map, s, kiwaiId } = kiwaiReady('greenhouse');
    const { t } = sendUp(s, map, kiwaiId, 2);
    const start = cometComing(t, 30 * HOUR);
    const end = start.now + 80 * HOUR;
    const big = advance(start, end).state;
    let small = start;
    for (let at = start.now + 1_234_567; at < end; at += 1_234_567)
      small = advance(small, at).state;
    small = advance(small, end).state;
    expect(small.orbit).toEqual(big.orbit);
    expect(small.villagers.map((v) => v.job)).toEqual(big.villagers.map((v) => v.job));
  });
});
