import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  defenseOf,
  rampartSectors,
  uncoveredGates,
  decodeEvents,
  EV,
  forecastWave,
  hexDistance,
  migrateState,
  waveBattle,
  waveGates,
  waveSetup,
  waveSquads,
  HOUR_MS,
  THREATS,
  type GameState,
  type PlannedWave,
} from '../src';
import { findTile, kiwi, rich, run, setup, siteFor, T0 } from './helpers';

const DAY = 24 * HOUR_MS;

/** A level-3 colony with ten kiwis, a pulpery and a juice well. */
function colony(): { map: ReturnType<typeof setup>['map']; state: GameState } {
  const { map, state } = setup();
  let s = rich(state);
  s.buildings[0]!.level = 3;
  for (let i = 0; i < 7; i++) s.villagers.push(kiwi(`k${i}`));
  const flesh = findTile(map, 'flesh');
  const juice = findTile(map, 'juice');
  s = run(s, { type: 'build', buildingType: 'pulpery', q: flesh.q, r: flesh.r }, T0, map);
  s = run(s, { type: 'build', buildingType: 'juiceWell', q: juice.q, r: juice.r }, T0, map);
  s = advance(s, T0 + 10 * 60_000).state;
  s = { ...s, resources: { pulp: 1500, fiber: 1500, seeds: 1500, juice: 1500 } };
  return { map, state: s };
}

function wave(s: GameState, ground: number, air: number): PlannedWave {
  const w: PlannedWave = {
    id: 'w9',
    announceAt: s.now - 1,
    at: s.now + HOUR_MS,
    announced: true,
    ground,
    air,
  };
  w.squads = waveSquads(s, { ground, air });
  w.gates = waveGates(s, w.id);
  return w;
}

describe('waves as battles (chantier 36)', () => {
  it('sends packs by sector, through gates on the rampart', () => {
    const { state } = colony();
    const w = wave(state, 12, 6);
    const ground = w.squads!.filter((q) => q.kind !== 'diver' && q.kind !== 'spitter');
    expect(ground.filter((q) => q.sector === 'front').reduce((a, q) => a + q.count, 0)).toBe(
      Math.max(
        ...(['front', 'left', 'right'] as const).map((s) =>
          ground.filter((q) => q.sector === s).reduce((a, q) => a + q.count, 0),
        ),
      ),
    );
    const setupNow = waveSetup(state, w, { ground: 12, air: 6 }, { luck: 1, sheltered: false });
    const enemies = setupNow.units.filter((u) => u.side === 1);
    for (const e of enemies) expect(hexDistance(e.at, w.gates![e.sector!]!)).toBeLessThanOrEqual(3);
    // Same wave, same journal; another seed, another battle.
    const s2 = { ...state, threats: { ...state.threats, next: w } };
    expect(JSON.stringify(waveBattle(s2, w, 1, 'a'))).toBe(
      JSON.stringify(waveBattle(s2, w, 1, 'a')),
    );
  });

  it('a warehouse by the rampart is looted before the one in the middle', () => {
    const { map, state } = colony();
    let s = state;
    const w = wave(s, 10, 0);
    const gate = w.gates!.front!;
    // One warehouse by the front gate, one near the Nest, both full of reserves.
    const land = map.tiles.filter((t) => t.type === 'flesh' || t.type === 'grove');
    const byGate = [...land].sort((a, b) => hexDistance(a, gate) - hexDistance(b, gate));
    const byHeart = [...land].sort((a, b) => a.rho - b.rho);
    for (const near of [byGate[3]!, byHeart[6]!]) {
      const site = siteFor(s, map, 'warehouse', near);
      s = run(s, { type: 'build', buildingType: 'warehouse', ...site }, s.now, map);
      s = advance(s, s.now + 2 * HOUR_MS).state;
    }
    const [edge, middle] = s.buildings.filter((b) => b.type === 'warehouse');
    expect(hexDistance(edge!, gate)).toBeLessThan(hexDistance(middle!, gate));
    for (const b of [edge!, middle!]) b.reserve = { pulp: 2000, fiber: 2000, seeds: 0, juice: 0 };
    s = { ...s, threats: { ...s.threats, next: w } };
    const log = waveBattle(s, w, 1, 'loot');
    const first = decodeEvents(log.events, log.dt).find((e) => e.code === EV.loot)!;
    expect(s.buildings[first.args[1]!]!.id).toBe(edge!.id);
  });

  it('nobody dies outside a real defeat, at most one on a real one', () => {
    const { state } = colony();
    // A small wave against an unguarded colony: losses, never a death.
    let s: GameState = { ...state, threats: { ...state.threats, next: wave(state, 3, 1) } };
    s = advance(s, s.threats.next!.at + 1).state;
    expect(s.threats.reports.at(-1)!.dead).toEqual([]);
    // A crushing wave: the kiwis fall, one at most dies, the others are hurt.
    let big: GameState = { ...state, threats: { ...state.threats, next: wave(state, 80, 40) } };
    big = advance(big, big.threats.next!.at + 1).state;
    const report = big.threats.reports.at(-1)!;
    expect(report.victory).toBe(false);
    expect(report.dead.length).toBeLessThanOrEqual(THREATS.maxDeaths);
    expect(report.damaged.length).toBeLessThanOrEqual(THREATS.maxDamaged);
    expect(big.buildings.some((b) => b.type === 'nest' && !b.damaged)).toBe(true);
    expect(report.log).toBeDefined();
    // Sheltered: no kiwi can fall.
    let safe: GameState = { ...state, threats: { ...state.threats, next: wave(state, 80, 40) } };
    safe.threats.shelterUntil = safe.threats.next!.at + HOUR_MS;
    safe = advance(safe, safe.threats.next!.at + 1).state;
    expect(safe.threats.reports.at(-1)!.dead).toEqual([]);
    expect(safe.threats.reports.at(-1)!.injured).toEqual([]);
  });

  it('forecasts with practice battles and keeps them while nothing changes', () => {
    const { state } = colony();
    const s: GameState = { ...state, threats: { ...state.threats, next: wave(state, 6, 2) } };
    const t0 = performance.now();
    const a = forecastWave(s)!;
    const first = performance.now() - t0;
    const t1 = performance.now();
    const b = forecastWave({ ...s, now: s.now + 1000 })!;
    const again = performance.now() - t1;
    expect(b.expected).toBe(a.expected);
    expect(again).toBeLessThan(first);
    expect(['likely', 'uncertain', 'unlikely']).toContain(a.odds);
  });

  it('keeps the saved state small with five battle journals', () => {
    const { state } = colony();
    let s = state;
    for (let i = 0; i < 6; i++) {
      s = {
        ...s,
        threats: { ...s.threats, shieldUntil: 0, next: { ...wave(s, 20, 10), id: `w${i}` } },
      };
      s = advance(s, s.threats.next!.at + 1).state;
    }
    expect(s.threats.reports.length).toBe(THREATS.history);
    expect(JSON.stringify(s.threats).length).toBeLessThan(150_000);
  });

  it('the player sets the posture and pins a guard to a sector', () => {
    const { map, state } = colony();
    let s = run(state, { type: 'setPosture', posture: 'bold' }, state.now, map);
    expect(s.threats.posture).toBe('bold');
    const id = s.villagers[1]!.id;
    const notYet = applyCommand(
      s,
      { type: 'pinGuard', villagerId: id, sector: 'left' },
      { now: s.now, map },
    );
    expect(!notYet.ok && notYet.error).toBe('notGuard');
    s = run(s, { type: 'setGarrison', villagerIds: [id] }, s.now, map);
    s = run(s, { type: 'pinGuard', villagerId: id, sector: 'right' }, s.now, map);
    expect(defenseOf(s, { ground: 10, air: 0 }).guards).toEqual([{ id, sector: 'right' }]);
    // The battle posts it near the right gate, and its leash follows the posture.
    const w = wave(s, 10, 0);
    const guard = waveSetup(s, w, { ground: 10, air: 0 }, { luck: 1, sheltered: false }).units.find(
      (u) => u.ref === id,
    )!;
    expect(guard.sector).toBe('right');
    expect(guard.role).toBe('guard');
    s = run(s, { type: 'pinGuard', villagerId: id, sector: null }, s.now, map);
    expect(s.threats.pins).toEqual({});
  });

  it('names the gates no turret reaches', () => {
    const { map, state } = colony();
    let s = state;
    const w = wave(s, 10, 0);
    expect(
      uncoveredGates(s, w)
        .map((g) => g.sector)
        .sort(),
    ).toEqual(['front', 'left', 'right']);
    // A seed turret on the rampart next to the front gate covers it.
    const gate = w.gates!.front!;
    const spot = rampartSectors(map)
      .tiles.filter((t) => !(t.q === gate.q && t.r === gate.r))
      .sort((a, b) => hexDistance(a, gate) - hexDistance(b, gate))[0]!;
    s = run(s, { type: 'build', buildingType: 'seedTurret', q: spot.q, r: spot.r }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    expect(uncoveredGates(s, w).some((g) => g.sector === 'front')).toBe(false);
  });

  it('migrates v27 saves: a cautious garrison, no pin', () => {
    const { state } = setup();
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    const threats = old.threats as Record<string, unknown>;
    delete threats.posture;
    delete threats.pins;
    old.schemaVersion = 27;
    const r = migrateState(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.threats.posture).toBe('cautious');
    expect(r.state.threats.pins).toEqual({});
  });

  it('plays the waves of a week the same in one step or many', () => {
    const { state } = colony();
    const end = state.now + 2 * DAY;
    const one = advance(state, end).state;
    let st = state;
    for (let t = state.now; t <= end; t += 53 * 60_000 + 7) st = advance(st, t).state;
    st = advance(st, end).state;
    expect(st.threats).toEqual(one.threats);
  });
});
