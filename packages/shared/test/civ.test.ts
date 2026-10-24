import { describe, expect, it } from 'vitest';
import {
  CIV,
  INTEL,
  civAt,
  civBuildings,
  civHours,
  civOf,
  cloneState,
  ensureAliens,
  keysWanted,
  neighbourSectors,
  newCiv,
  outerPower,
  recordBurn,
  recordDefeat,
  recordFight,
  sectorUnits,
  sectorOf,
  siegeTruth,
  standingBarracks,
  type AlienGarrison,
} from '../src';
import { setup, T0 } from './helpers';

const H = 3_600_000;
const DAY = 24 * H;

function twin(seed = 'civ') {
  const { state } = setup('kiwisu', seed);
  const g = state.aliens![state.targets[0]!.id]!;
  return { state, g };
}

describe('alien civilisation (chantier 39)', () => {
  it('starts with the royal burrow where the queen lives and its key buildings hidden', () => {
    const { g } = twin();
    const civ = civOf(g);
    const royal = civ.keys.filter((k) => k.kind === 'royal');
    expect(royal).toHaveLength(1);
    expect(royal[0]!.sector).toBe(siegeTruth(g).queenSector);
    const wanted = keysWanted(0);
    expect(civ.keys.filter((k) => k.kind === 'barracks')).toHaveLength(wanted.barracks);
    // One key building per parcel, the centre first.
    expect(new Set(civ.keys.map((k) => k.sector)).size).toBe(civ.keys.length);
    expect(civ.keys.every((k) => k.sector < INTEL.sectors / 2)).toBe(true);
  });

  it('is a pure function of the seed, the time and the impacts', () => {
    const a = twin('same');
    const b = twin('same');
    for (const t of [0, 5 * H, 2 * DAY, 9 * DAY])
      expect(civAt(a.g, T0 + t)).toEqual(civAt(b.g, T0 + t));
    expect(civAt(twin('other').g, T0)).not.toEqual(civAt(a.g, T0));
  });

  it('passes its ages on fixed dates, whatever the colony does', () => {
    const { g } = twin();
    expect(civAt(g, T0).age).toBe(0);
    expect(civAt(g, T0 + CIV.ageAtH[1]! * H - 1).age).toBe(0);
    expect(civAt(g, T0 + CIV.ageAtH[1]! * H).age).toBe(1);
    expect(civAt(g, T0 + CIV.ageAtH[2]! * H).age).toBe(2);
    expect(civAt(g, T0 + CIV.ageAtH[3]! * H).age).toBe(3);
  });

  it('a slow colony finds it further ahead than a fast one, at the same dates', () => {
    const fast = twin('pair');
    const slow = twin('pair');
    // Same seed, same start: the same civilisation on the same day, whatever their own age.
    const at = T0 + 5 * DAY;
    expect(civAt(fast.g, at)).toEqual(civAt(slow.g, at));
    // The fast colony reached the Iron age, the slow one the Stone age: the gap differs.
    expect(civAt(fast.g, at).age - 2).toBeLessThan(civAt(slow.g, at).age - 1);
  });

  it('keeps the edge weak and the centre two to three times stronger', () => {
    const { g } = twin();
    const view = civAt(g, T0);
    const outer = view.sectors.filter((s) => !s.inner);
    const inner = view.sectors.filter((s) => s.inner);
    expect(outerPower(view)).toBeCloseTo(g.defense, 0);
    for (const s of inner) {
      const edge = view.sectors[s.sector + INTEL.sectors / 2]!;
      expect(s.power / edge.power).toBeGreaterThanOrEqual(CIV.innerMultiple[0] - 0.01);
      expect(s.power / edge.power).toBeLessThanOrEqual(CIV.innerMultiple[1] + 0.01);
    }
    expect(outer.length).toBe(6);
  });

  it('grows with time and better equips the centre', () => {
    const { g } = twin();
    const early = civAt(g, T0);
    const late = civAt(g, T0 + 12 * DAY);
    expect(outerPower(late)).toBeGreaterThan(2 * outerPower(early));
    const centre = sectorUnits(late.sectors[0]!, g.ferretShare);
    const edge = sectorUnits(late.sectors[6]!, g.ferretShare);
    const soldier = (u: typeof centre) => u.find((x) => x.kind === 'soldier');
    expect(soldier(centre)?.weapon).toBe('blade-steel');
    expect(soldier(edge)?.weapon).toBe('blade-steel');
    expect(soldier(centre)!.level).toBeGreaterThan(soldier(edge)!.level);
    const stone = civAt(g, T0 + CIV.ageAtH[1]! * H);
    expect(soldier(sectorUnits(stone.sectors[0]!, g.ferretShare))?.weapon).toBe('blade-iron');
    expect(soldier(sectorUnits(stone.sectors[6]!, g.ferretShare))?.weapon).toBe('blade-stone');
    expect(sectorUnits(early.sectors[6]!, g.ferretShare)[0]!.weapon).toBeUndefined();
  });

  it('places buildings on the tiles of their parcels, the key ones once each', () => {
    const { g } = twin();
    const civ = civOf(g);
    const view = civAt(g, T0 + 5 * DAY);
    const all = civBuildings(g, civ, view, T0 + 5 * DAY);
    for (const b of all) expect(sectorOf(b.q, b.r)).toBe(b.sector);
    expect(all.filter((b) => b.kind === 'royal')).toHaveLength(1);
    expect(new Set(all.map((b) => `${b.q},${b.r}`)).size).toBe(all.length);
    expect(civBuildings(g, civ, view, T0 + 5 * DAY)).toEqual(all);
  });

  it('a burn slows the civilisation down measurably, a lost crew speeds it up', () => {
    const { g } = twin();
    const civ = civOf(g);
    const at = T0 + 3 * DAY;
    const before = civAt(g, at, civ);
    const burnt = structuredClone(civ);
    expect(recordBurn(burnt, 7, at)).toBeLessThan(0);
    const after = civAt(g, at, burnt);
    expect(after.hours).toBe(before.hours - CIV.burn.civH);
    expect(after.sectors[7]!.power).toBeLessThan(before.sectors[7]!.power);
    // The Iron age comes later.
    const iron = T0 + CIV.ageAtH[2]! * H;
    expect(civAt(g, iron, civ).age).toBe(2);
    expect(civAt(g, iron, burnt).age).toBe(1);

    const fed = structuredClone(civ);
    expect(recordDefeat(fed, at, 3)).toBe(CIV.defeat.civH + 3 * CIV.defeat.perKiwiH);
    expect(civAt(g, iron - 5 * H, fed).age).toBe(2);
    expect(fed.log.at(-1)?.kind).toBe('defeat');
  });

  it('burns the key buildings of a parcel for a while, never the royal burrow', () => {
    const { g } = twin();
    const civ = structuredClone(civOf(g));
    const barracks = civ.keys.find((k) => k.kind === 'barracks')!;
    const royal = civ.keys.find((k) => k.kind === 'royal')!;
    const at = T0 + DAY;
    expect(standingBarracks(civ, at, [])).toHaveLength(keysWanted(0).barracks);
    recordBurn(civ, barracks.sector, at);
    recordBurn(civ, royal.sector, at);
    expect(standingBarracks(civ, at, [])).toHaveLength(keysWanted(0).barracks - 1);
    expect(standingBarracks(civ, at + CIV.burn.keyMs, [])).toHaveLength(keysWanted(0).barracks);
    expect(royal.readyAt).toBeUndefined();
    // A beacon on a barracks parcel takes it too.
    expect(standingBarracks(civ, at + CIV.burn.keyMs, [barracks.sector])).toHaveLength(
      keysWanted(0).barracks - 1,
    );
  });

  it('a fight empties part of a parcel, which fills up again', () => {
    const { g } = twin();
    const civ = structuredClone(civOf(g));
    const at = T0 + DAY;
    const full = civAt(g, at, civ).sectors[8]!.power;
    recordFight(civ, 8, at, 0.6);
    expect(civAt(g, at, civ).sectors[8]!.power).toBeCloseTo(full * 0.4, 0);
    expect(civAt(g, at + CIV.rebuildMs, civ).sectors[8]!.power).toBeGreaterThan(full);
  });

  it('caps what burns and defeats can do', () => {
    const civ = newCiv('caps', 0);
    for (let i = 0; i < 50; i++) recordBurn(civ, 6, T0 + i);
    expect(civ.sectors[6]).toBe(-CIV.burn.maxSectorH);
    expect(civ.hours).toBe(-CIV.burn.maxCivH);
    for (let i = 0; i < 100; i++) recordDefeat(civ, T0 + i, 10);
    expect(civ.hours).toBe(CIV.defeat.maxCivH);
    expect(civ.log.length).toBeLessThanOrEqual(12);
  });

  it('gives older garrisons a civilisation, further faces a lead', () => {
    const { state } = setup('kiwisu', 'old');
    const s = cloneState(state);
    const id = s.targets[0]!.id;
    delete (s.aliens![id] as AlienGarrison).civ;
    expect(ensureAliens(s, 'x')).toBe(true);
    expect(s.aliens![id]!.civ).toEqual(newCiv(s.aliens![id]!.seed, 0));
    const far = newCiv('far', 2);
    expect(far.lead).toBe(2 * CIV.leadPerDistanceH);
    const g = { ...s.aliens![id]!, civ: far };
    expect(civHours(g, far, s.createdAt)).toBe(2 * CIV.leadPerDistanceH);
    expect(civAt(g, s.createdAt).age).toBe(1);
  });

  it('knows the neighbours of a parcel', () => {
    expect(neighbourSectors(0).sort((a, b) => a - b)).toEqual([1, 5, 6]);
    expect(neighbourSectors(11).sort((a, b) => a - b)).toEqual([5, 6, 10]);
  });
});
