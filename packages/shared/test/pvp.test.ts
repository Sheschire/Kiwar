import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  applyPvpResult,
  awaitingServer,
  cloneState,
  comingWave,
  deserializeSave,
  hiddenDue,
  HOUR_MS,
  migrateState,
  newGame,
  protectedStock,
  publicState,
  PVP,
  pvpGuardOf,
  pvpOutcome,
  pvpRaidOf,
  serializeSave,
  type GameState,
  type PvpPlan,
  type Villager,
} from '../src';
import { findTile, ironColony, kiwi, rich, run, setup, siteFor, T0 } from './helpers';

const DAY = 24 * HOUR_MS;
/** Late enough for every beginner to be out of the protection. */
const T = T0 + 4 * DAY;

/** An attacker: a Nest 2, a launchpad, seasoned kiwis, PvP on with one target. */
function attacker(seed = 'pvp-att', kiwis = 6, level = 12) {
  const { map, state } = setup('kiwisu', seed);
  let s: GameState = rich(state);
  let t = T0;
  s = run(s, { type: 'upgrade', buildingId: s.buildings[0]!.id }, t, map);
  t += HOUR_MS;
  s = advance(s, t).state;
  const flesh = findTile(map, 'flesh');
  s = run(
    s,
    { type: 'build', buildingType: 'launchpad', ...siteFor(s, map, 'launchpad', flesh) },
    t,
    map,
  );
  s = advance(s, T).state;
  s = cloneState(s);
  for (let i = 0; i < kiwis; i++) {
    const v: Villager = { ...kiwi(`ax${i}`, `Raider${i}`, T0), level, classId: 'warrior' };
    v.stats = { ...v.stats, strength: 16, endurance: 16 };
    s.villagers.push(v);
  }
  s.resources = { pulp: 5000, fiber: 5000, seeds: 5000, juice: 5000 };
  s.threats.next = null;
  s.threats.shieldUntil = T + 1000 * HOUR_MS;
  s.pvp.on = true;
  s.pvp.targets = [
    { id: 'ally:def', owner: 'Def', kiwiIndex: 1, distance: 1, travelMs: 2.5 * HOUR_MS },
  ];
  const pad = s.buildings.find((b) => b.type === 'launchpad')!;
  return { map, s, padId: pad.id };
}

/** A defender: an Iron-age colony with stock to lose, out of the beginners' protection. */
function defender(guards = 0) {
  const { map, s: base } = ironColony('pvp-def');
  const s = advance(base, T).state;
  s.resources = { pulp: 20000, fiber: 20000, seeds: 20000, juice: 20000 };
  s.pvp.on = true;
  s.pvp.lastActiveAt = T;
  s.threats.next = null;
  s.threats.shieldUntil = T + 1000 * HOUR_MS;
  for (let i = 0; i < guards; i++) {
    const v: Villager = { ...kiwi(`dg${i}`, `Guard${i}`, T0), level: 20, classId: 'warrior' };
    v.stats = { ...v.stats, strength: 18, endurance: 18 };
    v.job = { kind: 'guard' };
    s.villagers.push(v);
  }
  return { map, s };
}

function plan(padId: string, crew: string[]): PvpPlan {
  return {
    launchpadId: padId as PvpPlan['launchpadId'],
    targetId: 'ally:def',
    crew: crew as PvpPlan['crew'],
    provisions: { pulp: 200, juice: 200 },
    sector: 'front',
    orders: { posture: 'bold', retreatAt: 0.5 },
  };
}

/** Launches an attack and announces it to the defender (what the server does). */
function launched(att: ReturnType<typeof attacker>, def: GameState, crew: string[]) {
  const s = run(att.s, { type: 'raidPlayer', ...plan(att.padId, crew) }, T, att.map);
  const e = s.expeditions.find((x) => x.mission === 'pvp')!;
  const d = cloneState(def);
  const raid = pvpRaidOf(s, e, d, {
    id: `att/${e.id}`,
    from: 'ally:att',
    owner: 'Att',
    seed: 'secret',
    shift: 0.3,
  });
  d.pvp.incoming.push(raid);
  return { s, e, d, raid };
}

describe('chantier 57: PvP rules', () => {
  it('needs a PvP universe and a known target', () => {
    const att = attacker();
    const off = cloneState(att.s);
    off.pvp.on = false;
    const r = applyCommand(
      off,
      { type: 'raidPlayer', ...plan(att.padId, ['ax0']) },
      {
        now: T,
        map: att.map,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('notPvp');
    const unknown = applyCommand(
      att.s,
      { type: 'raidPlayer', ...plan(att.padId, ['ax0']), targetId: 'ally:nobody' },
      { now: T, map: att.map },
    );
    if (!unknown.ok) expect(unknown.error).toBe('unknownPvpTarget');
    expect(unknown.ok).toBe(false);
  });

  it('a launch ends our own protection and locks the target for a day', () => {
    const att = attacker();
    expect(att.s.pvp.attacked).toBe(false);
    const s = run(att.s, { type: 'raidPlayer', ...plan(att.padId, ['ax0', 'ax1']) }, T, att.map);
    const e = s.expeditions.find((x) => x.mission === 'pvp')!;
    expect(e.arriveAt - e.departedAt).toBe(2.5 * HOUR_MS);
    expect(e.returnAt - e.arriveAt).toBe(2.5 * HOUR_MS);
    expect(s.pvp.attacked).toBe(true);
    expect(s.pvp.lastAttackOn['ally:def']).toBe(T);
    for (const id of ['ax0', 'ax1'])
      expect(s.villagers.find((v) => v.id === id)!.job.kind).toBe('expedition');
    // The ship is away, and the same target cannot be attacked again within the day.
    const back = cloneState(s);
    back.expeditions = [];
    const again = applyCommand(
      back,
      { type: 'raidPlayer', ...plan(att.padId, ['ax2']) },
      {
        now: T + HOUR_MS,
        map: att.map,
      },
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toBe('pvpCooldown');
  });

  it('protects beginners, shielded and absent colonies', () => {
    const fresh = newGame({ seed: 'g', face: 'kiwisu', now: T0 });
    expect(pvpGuardOf(fresh, T0 + HOUR_MS)?.guard).toBe('beginner');
    const { s } = defender();
    expect(pvpGuardOf(s, T)).toBeNull();
    // Stone age reached but not yet 72 h old: still a beginner.
    const young = cloneState(s);
    young.createdAt = T - HOUR_MS;
    expect(pvpGuardOf(young, T)).toEqual({
      guard: 'beginner',
      until: T - HOUR_MS + PVP.beginner.ms,
    });
    // Attacking someone ends it.
    young.pvp.attacked = true;
    expect(pvpGuardOf(young, T)).toBeNull();
    const shielded = cloneState(s);
    shielded.pvp.shieldUntil = T + HOUR_MS;
    expect(pvpGuardOf(shielded, T)?.guard).toBe('shield');
    expect(pvpGuardOf(s, T + PVP.absentMs + HOUR_MS)?.guard).toBe('absent');
  });
});

describe('chantier 57: the attack played at the target', () => {
  it('is announced like a wave, its crew hidden from the target', () => {
    const { d, raid } = launched(attacker(), defender().s, ['ax0', 'ax1', 'ax2']);
    expect(raid.crew).toBe(3);
    expect(raid.classes).toEqual(['warrior', 'warrior', 'warrior']);
    expect(raid.power[0]).toBeLessThan(raid.power[1]);
    const wave = comingWave(d)!;
    expect(wave.pvp).toBe(raid.id);
    expect(wave.at).toBe(raid.at);
    const pub = publicState(d);
    expect(JSON.stringify(pub)).not.toContain('"units":[');
    expect(JSON.stringify(pub)).not.toContain('secret');
    // Without the crew the client waits for the server at the strike.
    const later = advance(pub, raid.at + HOUR_MS).state;
    expect(later.pvp.incoming).toHaveLength(1);
    expect(awaitingServer(later, raid.at + HOUR_MS)).toBe(true);
    expect(hiddenDue(later, raid.at + HOUR_MS)).toContain(raid.at);
  });

  it('never kills a defender, caps the loot and raises the shield', () => {
    const def = defender(2).s;
    const { d, raid } = launched(attacker('pvp-att', 6, 20), def, [
      'ax0',
      'ax1',
      'ax2',
      'ax3',
      'ax4',
      'ax5',
    ]);
    const kiwis = d.villagers.length;
    const safe = protectedStock(d);
    const after = advance(d, raid.at + 1000).state;
    expect(after.villagers.length).toBe(kiwis);
    const report = after.threats.reports.at(-1)!;
    expect(report.from).toBe('pvp');
    expect(report.by).toBe('Att');
    expect(report.dead).toEqual([]);
    expect(after.pvp.incoming).toHaveLength(0);
    expect(after.pvp.shieldUntil).toBe(raid.at + PVP.shieldMs);
    const end = after.pvp.defended.at(-1)!;
    expect(end.id).toBe(raid.id);
    const taken = Object.values(end.loot).reduce((a, b) => a + b, 0);
    expect(taken).toBeLessThanOrEqual(raid.hold);
    for (const r of ['pulp', 'fiber', 'seeds', 'juice'] as const)
      expect(end.loot[r]).toBeLessThanOrEqual(
        Math.ceil(PVP.loot.stock * Math.max(0, 20000 - safe[r])) + 1,
      );
    // The predator waves keep their own calendar.
    expect(after.threats.waves).toBe(d.threats.waves);
  });

  it('is the same battle every time (the journal holds)', () => {
    const { d, raid } = launched(attacker(), defender(1).s, ['ax0', 'ax1', 'ax2']);
    const a = advance(cloneState(d), raid.at + 1000).state.pvp.defended.at(-1)!;
    const b = advance(cloneState(d), raid.at + 1000).state.pvp.defended.at(-1)!;
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  it('turns back on a colony shielded meanwhile', () => {
    const { d, raid } = launched(attacker(), defender().s, ['ax0']);
    d.pvp.shieldUntil = raid.at + HOUR_MS;
    const after = advance(d, raid.at + 1000).state;
    const end = after.pvp.defended.at(-1)!;
    expect(end.turnedBack).toBe(true);
    expect(after.threats.reports.some((r) => r.id === raid.id)).toBe(false);
  });
});

describe("chantier 57: the attacker's side", () => {
  it('a victory brings its fallen home wounded, a defence held kills them', () => {
    const att = attacker();
    const { s, e } = launched(att, defender().s, ['ax0', 'ax1']);
    const won = cloneState(s);
    const ew = won.expeditions.find((x) => x.id === e.id)!;
    applyPvpResult(won, ew, {
      id: 'r',
      from: 'ally:att',
      owner: 'Att',
      at: e.arriveAt,
      held: false,
      loot: { pulp: 40, fiber: 0, seeds: 0, juice: 10 },
      lost: ['ax0'],
      escaped: 1,
    });
    expect(ew.result!.outcome).toBe('victory');
    expect(ew.result!.injured).toEqual(['ax0']);
    expect(ew.result!.loot.pulp).toBe(40);
    expect(won.villagers.some((v) => v.id === 'ax0')).toBe(true);
    expect(ew.status).toBe('returning');

    const lost = cloneState(s);
    const el = lost.expeditions.find((x) => x.id === e.id)!;
    const d = {
      id: 'r',
      from: 'ally:att',
      owner: 'Att',
      at: e.arriveAt,
      held: true,
      loot: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
      lost: ['ax0', 'ax1'],
      escaped: 0,
    };
    expect(pvpOutcome(d)).toBe('defeat');
    applyPvpResult(lost, el, d);
    expect(el.result!.outcome).toBe('defeat');
    expect(el.result!.shipLost).toBe(true);
    expect(lost.villagers.some((v) => v.id === 'ax0' || v.id === 'ax1')).toBe(false);
    expect(lost.buildings.find((b) => b.id === el.launchpadId)!.damaged).toBe(true);
  });

  it('waits for the server, then turns back without news', () => {
    const att = attacker();
    const { s, e } = launched(att, defender().s, ['ax0']);
    const later = advance(s, e.arriveAt + HOUR_MS).state;
    const ew = later.expeditions.find((x) => x.id === e.id)!;
    expect(ew.status).toBe('outbound');
    expect(awaitingServer(later, e.arriveAt + HOUR_MS)).toBe(true);
    applyPvpResult(later, ew, null);
    expect(ew.result!.aborted).toBe(true);
    const home = advance(later, e.returnAt + 1000).state;
    expect(home.villagers.find((v) => v.id === 'ax0')!.job.kind).not.toBe('expedition');
  });
});

describe('chantier 57: save', () => {
  it('migrates v45 saves and round-trips an announced attack', () => {
    const { d } = launched(attacker(), defender().s, ['ax0']);
    const again = deserializeSave(serializeSave(d, T));
    expect(again.ok && again.save.state.pvp.incoming).toHaveLength(1);
    const raw = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    delete raw.pvp;
    raw.schemaVersion = 45;
    delete (raw.stats as Record<string, unknown>).pvpHeld;
    const m = migrateState(raw);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.pvp.on).toBe(false);
    expect(m.state.stats.pvpHeld).toBe(0);
  });
});
