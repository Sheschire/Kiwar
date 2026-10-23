import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  BUILDINGS,
  buildingCount,
  defenseOf,
  guardPower,
  isRampart,
  FRONT_AZIMUTH,
  hexToPixel,
  rampartSectors,
  sectorClash,
  SECTORS,
  turretCoverage,
  type FaceMap,
  type SectorId,
  turretCount,
  TURRETS,
  forecastWave,
  HOUR_MS,
  INCIDENTS,
  METEORS,
  migrateState,
  SHELTER,
  THREATS,
  workforce,
  workersOf,
  wavePower,
  wealthFactor,
  reserveCapOf,
  RESOURCE_IDS,
  type GameEvent,
  type GameState,
} from '../src';
import { findTile, kiwi, rich, run, setup, T0 } from './helpers';

const DAY = 24 * HOUR_MS;

/** Angle of a tile from the front, in (−π, π]. */
function offset(h: { q: number; r: number }): number {
  const p = hexToPixel(h);
  const a = Math.atan2(p.x, p.y) - FRONT_AZIMUTH;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The k-th rampart tile from the middle of a sector (every few tiles). */
function middleOf(map: FaceMap, sector: SectorId, k: number) {
  const centre = { front: 0, left: (2 * Math.PI) / 3, right: (-2 * Math.PI) / 3 }[sector];
  return rampartAt(map, centre, sector, k * 3);
}

/** The n-th closest rampart tile of a sector to an angle from the front. */
function rampartAt(map: FaceMap, angle: number, sector: SectorId, n = 0) {
  const r = rampartSectors(map);
  const tiles = r.tiles
    .filter((_, i) => r.sectors[i] === sector)
    .sort((a, b) => Math.abs(offset(a) - angle) - Math.abs(offset(b) - angle));
  return tiles[n]!;
}

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

  it('strikes after the protection, announced 3–6 h ahead, twice a day or so', () => {
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
    // Pool stocks are floats: compare them within rounding.
    const strip = (st: GameState) =>
      st.buildings.map((b) => ({ ...b, pool: b.pool && { ...b.pool, stock: 0 } }));
    expect(strip(stepped)).toEqual(strip(oneStep));
    stepped.buildings.forEach((b, i) =>
      expect(b.pool?.stock ?? 0).toBeCloseTo(oneStep.buildings[i]!.pool?.stock ?? 0, 6),
    );
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
    // The pulpery's worker stays there (no crater nor stardust task, chantier 15).
    let s: GameState = {
      ...state,
      automation: { ...state.automation, meteor: false, stardust: false },
    };
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

describe('waves awakened (chantier 31)', () => {
  it('the first wave strikes within the first day', () => {
    const { state } = colony();
    const { events } = advance(state, T0 + DAY);
    const struck = events.filter((e) => e.type === 'waveStruck');
    expect(struck.length).toBeGreaterThanOrEqual(1);
  });

  it('a rich colony draws stronger waves', () => {
    const { state } = colony();
    const poor = { ...state, resources: { pulp: 0, fiber: 0, seeds: 0, juice: 0 } };
    expect(wealthFactor(state)).toBeGreaterThan(wealthFactor(poor));
    expect(wavePower(state, T0)).toBeGreaterThan(wavePower(poor, T0));
    const crowded = { ...poor, villagers: [...poor.villagers, kiwi('x1'), kiwi('x2'), kiwi('x3')] };
    expect(wealthFactor(crowded)).toBeGreaterThan(wealthFactor(poor));
  });

  /** An undefended colony with a warehouse full of reserves, a wave about to strike. */
  function looted() {
    const { map, state } = colony();
    const flesh = findTile(map, 'flesh', 3);
    let s = rich(state);
    s = run(s, { type: 'build', buildingType: 'warehouse', q: flesh.q, r: flesh.r }, s.now, map);
    s = advance(s, s.now + HOUR_MS).state;
    const w = s.buildings.find((b) => b.type === 'warehouse')!;
    const cap = reserveCapOf(s, w);
    w.reserve = { pulp: cap, fiber: cap, seeds: cap, juice: cap };
    s = { ...s, resources: { pulp: 200, fiber: 200, seeds: 0, juice: 200 } };
    s.threats.next = {
      id: 'w9',
      announceAt: s.now - 1,
      at: s.now + 10 * 60_000,
      announced: true,
      ground: 400,
      air: 400,
    };
    return { map, s, warehouseId: w.id, cap };
  }

  it('loots the reserves first, then the stock above its protected share', () => {
    const { s, warehouseId, cap } = looted();
    const f = forecastWave(s)!;
    expect(f.expected.victory).toBe(false);
    expect(f.expected.lootReserve.pulp).toBeGreaterThan(0);
    // The stock (200) lies under the Nest's protected share: only the reserves are taken.
    expect(f.expected.loot.pulp).toBe(f.expected.lootReserve.pulp);
    const after = advance(s, s.threats.next!.at + 1).state;
    const report = after.threats.reports.at(-1)!;
    expect(report.loot.pulp).toBeGreaterThan(0);
    const w = after.buildings.find((b) => b.id === warehouseId)!;
    expect(w.reserve!.pulp).toBeLessThan(cap);
    expect(after.resources.pulp).toBeGreaterThanOrEqual(200);
  });

  it('bringing the reserves back before the strike saves part of them', () => {
    const { map, s } = looted();
    const kept = run(s, { type: 'collectAll' }, s.now, map);
    const lost = (x: GameState) => {
      const f = forecastWave(x)!;
      return RESOURCE_IDS.reduce((sum, id) => sum + f.expected.loot[id], 0);
    };
    expect(lost(kept)).toBeLessThan(lost(s));
  });

  it('never kills without a real defeat', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const { map, state } = setup('kiwisu', seed);
      void map;
      let s = rich(state);
      s.buildings[0]!.level = 2;
      for (let i = 0; i < 6; i++) s.villagers.push(kiwi(`${seed}${i}`));
      s = advance(s, T0 + 5 * DAY).state;
      for (const r of s.threats.reports) {
        if (r.dead.length === 0) continue;
        expect(r.victory).toBe(false);
        expect(r.threat.ground + r.threat.air).toBeGreaterThan(
          THREATS.deathRatio * (r.defense.ground + r.defense.air),
        );
      }
    }
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

describe('defenses', () => {
  function rampart(map: ReturnType<typeof setup>['map'], skip = 0) {
    const tiles = map.tiles
      .filter((t) => isRampart(map, t.q, t.r))
      .sort((a, b) => a.q - b.q || a.r - b.r);
    return tiles[skip]!;
  }

  it('turrets stand on the rampart, outside the building cap, limited by the Nest', () => {
    const { map, state } = setup();
    let s = rich(state);
    const flesh = findTile(map, 'flesh');
    const bad = applyCommand(
      s,
      { type: 'build', buildingType: 'seedTurret', q: flesh.q, r: flesh.r },
      { now: T0, map },
    );
    expect(!bad.ok && bad.error).toBe('tileNotAllowed');
    const inner = map.tiles.find((t) => t.type === 'skin' && !isRampart(map, t.q, t.r));
    if (inner) {
      const r = applyCommand(
        s,
        { type: 'build', buildingType: 'seedTurret', q: inner.q, r: inner.r },
        { now: T0, map },
      );
      expect(!r.ok && r.error).toBe('notOnRampart');
    }
    const before = buildingCount(s);
    for (let i = 0; i < TURRETS.max[1]!; i++) {
      const t = rampart(map, i * 3);
      s = run(s, { type: 'build', buildingType: 'seedTurret', q: t.q, r: t.r }, T0, map);
      s = advance(s, s.now + 10 * 60_000).state;
    }
    expect(buildingCount(s)).toBe(before);
    expect(turretCount(s)).toBe(TURRETS.max[1]);
    const t = rampart(map, 30);
    const over = applyCommand(
      s,
      { type: 'build', buildingType: 'skyTurret', q: t.q, r: t.r },
      { now: s.now, map },
    );
    expect(!over.ok && over.error).toBe('turretLimit');
  });

  it('turrets need seeds; swords never reach the bats', () => {
    const { map, state } = colony();
    let s = rich(state);
    const t1 = map.tiles.find((t) => isRampart(map, t.q, t.r))!;
    s = run(s, { type: 'build', buildingType: 'seedTurret', q: t1.q, r: t1.r }, s.now, map);
    s = advance(s, s.now + 10 * 60_000).state;
    const threat = { ground: 10, air: 10 };
    const full = defenseOf(s, threat);
    expect(full.turrets.ground).toBe(BUILDINGS.seedTurret.levels[0]!.defense!.ground);
    expect(full.ammo.need).toBe(BUILDINGS.seedTurret.levels[0]!.ammo);
    const empty = defenseOf({ ...s, resources: { ...s.resources, seeds: 0 } }, threat);
    expect(empty.turrets.ground).toBe(0);
    // A warrior on guard: strong on the ground, useless against bats.
    const w = s.villagers[0]!;
    w.classId = 'warrior';
    s = run(s, { type: 'setGarrison', villagerIds: [w.id] }, s.now, map);
    expect(s.villagers[0]!.job.kind).toBe('guard');
    const d = defenseOf(s, threat);
    expect(d.garrison.ground).toBeCloseTo(guardPower(s.villagers[0]!).ground, 9);
    expect(d.garrison.air).toBe(0);
    // A mage reaches them.
    const m = s.villagers[1]!;
    m.classId = 'mage';
    s = run(s, { type: 'setGarrison', villagerIds: [w.id, m.id] }, s.now, map);
    expect(defenseOf(s, threat).garrison.air).toBeGreaterThan(0);
    // Relieving the guards sends them back to work.
    s = run(s, { type: 'setGarrison', villagerIds: [] }, s.now, map);
    expect(s.villagers.some((v) => v.job.kind === 'guard')).toBe(false);
    const dup = applyCommand(
      s,
      { type: 'setGarrison', villagerIds: [w.id, w.id] },
      { now: s.now, map },
    );
    expect(!dup.ok && dup.error).toBe('invalidCrew');
  });

  it('a well defended colony repels the wave and spends seeds', () => {
    const { map, state } = colony();
    let s = rich(state);
    s.buildings[0]!.level = 3;
    // Chantier 12: turrets where the predators come (mostly by the front).
    // Ferrets: two turrets at the front, one on each flank; bats: two turrets where the front
    // meets a flank (each covers both).
    const edge = SECTORS.frontHalfAngle;
    const plan = [
      ['seedTurret', middleOf(map, 'front', 0)],
      ['seedTurret', middleOf(map, 'front', 1)],
      ['seedTurret', middleOf(map, 'left', 0)],
      ['seedTurret', middleOf(map, 'right', 0)],
      ['skyTurret', rampartAt(map, edge, 'front')],
      ['skyTurret', rampartAt(map, -edge, 'front')],
    ] as const;
    for (const [type, t] of plan) {
      s = run(s, { type: 'build', buildingType: type, q: t.q, r: t.r }, s.now, map);
      s = advance(s, s.now + 10 * 60_000).state;
    }
    s = { ...s, resources: { pulp: 1500, fiber: 1500, seeds: 1500, juice: 1500 } };
    while (!s.threats.next?.announced) s = advance(s, s.now + HOUR_MS).state;
    const f = forecastWave(s)!;
    expect(f.odds).toBe('likely');
    const seeds = s.resources.seeds;
    const after = advance(s, f.wave.at + 1).state;
    const report = after.threats.reports.at(-1)!;
    expect(report.victory).toBe(true);
    expect(report.ammoUsed).toBeGreaterThan(0);
    expect(report.ammoUsed).toBeLessThanOrEqual(f.defense.ammo.need);
    // The harvest goes on until the strike (chantier 31: a shorter notice).
    const harvested = after.stats.produced.seeds - s.stats.produced.seeds;
    expect(after.resources.seeds).toBeLessThanOrEqual(seeds + harvested - report.ammoUsed + 1e-6);
    expect(after.threats.shieldUntil).toBe(0);
  });
});

describe('sectors and range (chantier 12)', () => {
  it('cuts the rampart in a front facing the alien planet and two flanks', () => {
    const { map } = setup();
    const r = rampartSectors(map);
    expect(r.tiles.length).toBeGreaterThan(30);
    const count = (s: SectorId) => r.sectors.filter((x) => x === s).length;
    for (const s of ['front', 'left', 'right'] as const)
      expect(count(s) / r.tiles.length).toBeGreaterThan(0.25);
    r.tiles.forEach((t, i) => {
      const d = Math.abs(offset(t));
      expect(r.sectors[i] === 'front').toBe(d <= SECTORS.frontHalfAngle + 1e-9);
    });
    // Memoized per map.
    expect(rampartSectors(map)).toBe(r);
  });

  it('a turret defends the rampart within its range only', () => {
    const { map } = setup();
    const front = middleOf(map, 'front', 0);
    const flank = middleOf(map, 'right', 0);
    expect(turretCoverage(map, 'seedTurret', 1, front).front).toBe(1);
    expect(turretCoverage(map, 'seedTurret', 1, flank).front).toBe(0);
    const c = turretCoverage(map, 'skyTurret', 3, flank);
    expect(c.front + c.left + c.right).toBeCloseTo(1, 9);
  });

  it('what breaks through turns partly to the weakest flank', () => {
    const zero = { ground: 0, air: 0 };
    const threat = { ground: 10, air: 0 };
    // The front stops nothing (6 through); the weakest flank (right) has nothing to spare.
    let r = sectorClash(threat, {
      front: zero,
      left: { ground: 20, air: 0 },
      right: { ground: 2, air: 0 },
    });
    expect(r.through.ground).toBeCloseTo(6, 9);
    // With 3 to spare on the right, half of the front's excess (3) is stopped there.
    r = sectorClash(threat, {
      front: zero,
      left: { ground: 20, air: 0 },
      right: { ground: 5, air: 0 },
    });
    expect(r.through.ground).toBeCloseTo(3, 9);
    expect(r.sectors.front.through.ground).toBeCloseTo(3, 9);
    expect(r.sectors.front.threat.ground).toBeCloseTo(6, 9);
  });

  it('turrets far from the front show in the forecast, the garrison fills the gap', () => {
    const { map, state } = colony();
    const build = (sector: SectorId) => {
      let s = rich(state);
      s.buildings[0]!.level = 3;
      for (const k of [0, 1, 2]) {
        const t = middleOf(map, sector, k);
        s = run(s, { type: 'build', buildingType: 'seedTurret', q: t.q, r: t.r }, s.now, map);
        s = advance(s, s.now + 10 * 60_000).state;
      }
      s = { ...s, resources: { pulp: 1500, fiber: 1500, seeds: 1500, juice: 1500 } };
      s.threats.next = {
        id: 'w1',
        announceAt: s.now - 1,
        at: s.now + HOUR_MS,
        announced: true,
        ground: 30,
        air: 0,
      };
      return s;
    };
    const atFront = forecastWave(build('front'))!;
    const onFlank = forecastWave(build('right'))!;
    expect(atFront.defense.ground).toBeCloseTo(onFlank.defense.ground, 9);
    expect(atFront.defense.sectors.front.ground).toBeGreaterThan(
      onFlank.defense.sectors.front.ground,
    );
    expect(onFlank.expected.severity).toBeGreaterThan(atFront.expected.severity);
    // A guard goes where defense is missing (the front, for the misplaced turrets).
    let s = build('right');
    const id = s.villagers.find((v) => v.job.kind === 'idle' || v.job.kind === 'work')!.id;
    s = run(s, { type: 'setGarrison', villagerIds: [id] }, s.now, map);
    expect(defenseOf(s, { ground: 30, air: 0 }).guards).toEqual([{ id, sector: 'front' }]);
  });
});

describe('gifts from the sky', () => {
  it('a shooting star announces a meteorite that lands on free land, then fades', () => {
    const { state } = setup();
    const { state: after, events } = advance(state, T0 + 3 * DAY);
    const announced = events.filter((e) => e.type === 'meteorAnnounced');
    const landed = events.filter((e) => e.type === 'meteorLanded');
    expect(landed.length).toBeGreaterThanOrEqual(2);
    expect(landed[0]!.at).toBe(T0 + METEORS.firstMs);
    expect(announced[0]!.at).toBe(T0 + METEORS.firstMs - METEORS.noticeMs);
    for (const e of landed) {
      if (e.type !== 'meteorLanded') continue;
      expect(e.stock).toBeGreaterThan(0);
    }
    expect(events.some((e) => e.type === 'meteorFaded')).toBe(true);
    for (const m of after.sky.meteors) expect(m.expiresAt).toBeGreaterThan(after.now);
  });

  it('kiwis sent to the crater pick it, exact offline (chantier 15: a post, no camp)', () => {
    const { map, state } = setup();
    let s = advance(state, T0 + METEORS.firstMs + 1).state;
    const m = s.sky.meteors[0]!;
    expect(m).toBeDefined();
    s = { ...s, resources: { pulp: 300, fiber: 300, seeds: 0, juice: 300 } };
    const camp = applyCommand(s, { type: 'gather', q: m.q, r: m.r }, { now: s.now, map });
    expect(!camp.ok && camp.error).toBe('onCrater');
    s = run(s, { type: 'debugGrant', resources: {} }, s.now, map);
    expect(s.villagers.some((v) => v.job.kind === 'meteor')).toBe(true);
    const end = s.now + 6 * HOUR_MS;
    const one = advance(s, end).state;
    let stepped = s;
    for (let t = s.now; t <= end; t += 11 * 60_000 + 7) stepped = advance(stepped, t).state;
    stepped = advance(stepped, end).state;
    const m1 = one.sky.meteors.find((x) => x.id === m.id)!;
    expect(m1.stock).toBeLessThan(m.stock);
    expect(stepped.sky).toEqual(one.sky);
    expect(stepped.resources[m.resource]).toBeCloseTo(one.resources[m.resource], 4);
    expect(one.resources[m.resource]).toBeGreaterThan(0);
  });

  it('migrates v10 saves', () => {
    const { state } = setup();
    const raw = structuredClone(state) as unknown as Record<string, unknown>;
    delete raw.sky;
    raw.schemaVersion = 10;
    const r = migrateState(raw);
    expect(r.ok && r.state.sky.meteors).toEqual([]);
  });
});
