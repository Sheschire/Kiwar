import { describe, expect, it } from 'vitest';
import {
  cloneState,
  migrateState,
  publicState,
  SIEGE,
  siegeLock,
  siegeTruth,
  civAt,
  holdStrength,
  type BuildingId,
  type GameState,
} from '../src';
import { findTile, kiwi, rich, setup, T0 } from './helpers';

const PAD = 'bpad' as BuildingId;

/** Iron age, a Kikiwiwi, a big launchpad and a crowd of strong warriors and mages. */
function siegeColony(seed = 'siege') {
  const { map, state } = setup('kiwisu', seed);
  const s: GameState = rich(state);
  s.buildings[0]!.level = 7;
  const pad = findTile(map, 'flesh', 2);
  const mon = findTile(map, 'flesh', 6);
  s.buildings.push(
    { id: PAD, type: 'launchpad', q: pad.q, r: pad.r, level: 3, richness: 1, builtAt: T0 },
    {
      id: 'bmon' as BuildingId,
      type: 'monument',
      q: mon.q,
      r: mon.r,
      level: 2,
      richness: 1,
      builtAt: T0,
    },
  );
  const crowd = Array.from({ length: 30 }, (_, i) => {
    const v = kiwi(`vs${i}`, `S${i}`);
    v.level = 15;
    v.classId = i % 3 === 2 ? 'mage' : 'warrior';
    v.stats = { ...v.stats, strength: 10, endurance: 10, dexterity: 10 };
    return v;
  });
  const titan = kiwi('vtitan', 'Titan');
  titan.level = 15;
  titan.kikiwiwi = { since: T0 };
  s.villagers = [...s.villagers, ...crowd, titan];
  return { map, s };
}

describe('the siege opens at the Iron age with a Kikiwiwi (chantier 19)', () => {
  it('stays closed before, and never for a conquered face', () => {
    const { s } = siegeColony();
    expect(siegeLock(s)).toBeNull();
    const young = cloneState(s);
    young.buildings = young.buildings.map((b) => (b.type === 'monument' ? { ...b, level: 1 } : b));
    expect(siegeLock(young)).toBe('ageTooLow');
    const plain = cloneState(s);
    plain.villagers = plain.villagers.filter((v) => !v.kikiwiwi);
    expect(siegeLock(plain)).toBe('needsKikiwiwi');
    const won = cloneState(s);
    won.siege.conqueredAt = T0;
    expect(siegeLock(won)).toBe('conquered');
  });

  it('draws the holds and the queen from the secret seed only', () => {
    const { s } = siegeColony();
    const g = s.aliens![s.targets[0]!.id]!;
    const a = siegeTruth(g);
    expect(siegeTruth({ seed: g.seed })).toEqual(a);
    expect(siegeTruth({ seed: `${g.seed}x` })).not.toEqual(a);
    expect(a.queenSector).toBeGreaterThanOrEqual(0);
    expect(a.queenSector).toBeLessThan(6);
    // Chantier 39: the holds are the outer parcels' garrisons, dug in.
    for (const x of SIEGE.outerSectors) {
      const parcel = civAt(g, s.now).sectors[x]!.power;
      expect(holdStrength(g, x, s.now)).toBeCloseTo(parcel * SIEGE.hold.share, 0);
    }
    // Nothing of it is in the state a client receives.
    expect(JSON.stringify(publicState(s))).not.toContain(g.seed);
  });
});

describe('offline and saves', () => {
  it('migrates v21 saves without a siege', () => {
    const { state } = setup('kiwisu', 'mig');
    const old = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    old.schemaVersion = 21;
    delete old.siege;
    const m = migrateState(old);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.state.siege.bridgeheads).toEqual([]);
    expect(m.state.siege.counter).toBeNull();
  });
});
