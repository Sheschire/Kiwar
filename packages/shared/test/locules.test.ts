import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cloneState,
  DEPTHS,
  delveForecast,
  delveLock,
  depthsMapOf,
  generateDepths,
  isLocule,
  LANDING,
  roomTruth,
  nestsNear,
  upwellPower,
  type GameState,
  type VillagerId,
} from '../src';
import { delveColony } from './helpers';

const orders = LANDING.defaultOrders;

function crewIds(s: GameState, n: number): VillagerId[] {
  return s.villagers
    .filter((v) => v.id.startsWith('dk'))
    .slice(0, n)
    .map((v) => v.id);
}

/** Opens the Industry age (monument level 3). */
function industry(s: GameState): GameState {
  const c = cloneState(s);
  c.buildings.find((b) => b.type === 'monument')!.level = 3;
  return c;
}

describe('the locules (chantier 50)', () => {
  it('leaves the flesh as chantier 48 drew it', () => {
    // Hashes of the flesh's rooms drawn before the locules existed.
    const before: Record<string, string> = {
      'net/kiwisu': '68132710f3d1',
      'a/kiwino': '22f7466c73ef',
      'demo/kiwisu': 'bb1eb3a44dce',
    };
    for (const [key, hash] of Object.entries(before)) {
      const rooms = generateDepths(key).rooms.filter((r) => !isLocule(r));
      const ids = new Set(rooms.map((r) => r.id));
      const flesh = rooms.map((r) => ({ ...r, links: r.links.filter((id) => ids.has(id)) }));
      expect(createHash('sha1').update(JSON.stringify(flesh)).digest('hex').slice(0, 12)).toBe(
        hash,
      );
    }
  });

  it('draws an arc of 30–42 locules below the flesh, all reachable', () => {
    for (const key of ['net/kiwisu', 'a/kiwino', 'b/kiwisu', 'c/kiwino']) {
      const map = generateDepths(key);
      const locules = map.rooms.filter(isLocule);
      expect(locules.length).toBeGreaterThanOrEqual(DEPTHS.locules.count[0]);
      expect(locules.length).toBeLessThanOrEqual(DEPTHS.locules.count[1]);
      // Each locule opens onto the next one; some open onto the flesh.
      for (let i = 0; i + 1 < locules.length; i++)
        expect(locules[i]!.links).toContain(locules[i + 1]!.id);
      expect(locules.some((l) => l.links.some((id) => map.byId.get(id)!.depth === 3))).toBe(true);
      const seen = new Set(map.rooms.filter((r) => r.entrance).map((r) => r.id));
      const todo = [...seen];
      while (todo.length)
        for (const id of map.byId.get(todo.pop()!)!.links)
          if (!seen.has(id)) {
            seen.add(id);
            todo.push(id);
          }
      expect(seen.size).toBe(map.rooms.length);
    }
  });

  it('fills each locule with giant seeds, a forest or a lake, and often a nest', () => {
    const map = generateDepths('fill/kiwisu');
    const locules = map.rooms.filter(isLocule);
    const truths = locules.map((r) => roomTruth('secret-l/depths', r));
    for (const t of truths) {
      expect(['forest', 'lake']).toContain(t.kind);
      expect(t.hazard?.kind).toBe(t.kind === 'lake' ? 'acid' : 'cuts');
      expect(t.giantSeeds).toBeGreaterThanOrEqual(DEPTHS.locules.giantSeeds[0]);
      expect(t.giantSeeds).toBeLessThanOrEqual(DEPTHS.locules.giantSeeds[1]);
    }
    expect(truths.some((t) => t.kind === 'lake')).toBe(true);
    expect(truths.some((t) => t.kind === 'forest')).toBe(true);
    const nests = truths.filter((t) => t.nest).length;
    expect(nests).toBeGreaterThan(0);
    expect(nests).toBeLessThan(truths.length);
    // The flesh holds no giant seeds.
    for (const r of map.rooms.filter((x) => !isLocule(x)))
      expect(roomTruth('secret-l/depths', r).giantSeeds).toBe(0);
  });

  it('opens the locules in the Industry age only', () => {
    const { s } = delveColony();
    const map = depthsMapOf(s);
    // Take the whole flesh: the locules next to it are within reach.
    for (const r of map.rooms)
      if (!isLocule(r)) s.depths.galleries[r.id] = { kind: 'bundle', since: s.now };
    const loc = map.rooms.find((r) => isLocule(r) && r.links.some((id) => s.depths.galleries[id]))!;
    expect(delveLock(s, loc.id, crewIds(s, 4), orders)).toBe('layerLocked');
    expect(delveLock(industry(s), loc.id, crewIds(s, 4), orders)).toBeNull();
  });

  it('forecasts an unknown locule with a hazard and a possible nest', () => {
    const { s } = delveColony();
    const map = depthsMapOf(s);
    const loc = map.rooms.find(isLocule)!;
    const crew = s.villagers.filter((v) => v.id.startsWith('dk')).slice(0, 4);
    const f = delveForecast(industry(s), loc.id, crew, orders)!;
    expect(f.knowledge).toBe('unknown');
    expect(f.possibleHazard).toBe(true);
    expect(f.harm.length).toBe(4);
    expect(f.travelMs).toBe(DEPTHS.travelMs[3]);
  });

  it('feeds the upwellings with the locules’ nests near our works, until taken', () => {
    const { s } = delveColony();
    const map = depthsMapOf(s);
    for (const r of map.rooms)
      if (!isLocule(r)) s.depths.galleries[r.id] = { kind: 'bundle', since: s.now };
    expect(nestsNear(s).flesh).toBe(0);
    const near = map.rooms.filter(
      (r) =>
        isLocule(r) &&
        r.links.some((id) => s.depths.galleries[id]) &&
        roomTruth(s.depthSeed!, r).nest,
    );
    expect(nestsNear(s).locules).toBe(near.length);
    const before = upwellPower(s);
    expect(near.length).toBeGreaterThan(0);
    const nest = near[0]!;
    const taken = cloneState(s);
    taken.depths.galleries[nest.id] = { kind: roomTruth(s.depthSeed!, nest).kind, since: s.now };
    expect(upwellPower(taken)).toBeLessThan(before);
  });
});
