import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  advance,
  caveInOf,
  cloneState,
  DEPTHS,
  delveForecast,
  delveLock,
  delveWeight,
  depthsMapOf,
  galleryRate,
  generateDepths,
  isCavern,
  isCore,
  isLocule,
  isStem,
  LANDING,
  nestsNear,
  roomTruth,
  upwellPower,
  type Command,
  type GameState,
  type VillagerId,
} from '../src';
import { delveColony, run } from './helpers';

const orders = LANDING.defaultOrders;

function crewIds(s: GameState, n: number): VillagerId[] {
  return s.villagers
    .filter((v) => v.id.startsWith('dk'))
    .slice(0, n)
    .map((v) => v.id);
}

/** Opens the Age of the stars (monument level 4). */
function stars(s: GameState, age = 4): GameState {
  const c = cloneState(s);
  c.buildings.find((b) => b.type === 'monument')!.level = age;
  return c;
}

/** Takes every room above the core: its caverns next to the locules are within reach. */
function takeAbove(s: GameState): void {
  for (const r of depthsMapOf(s).rooms)
    if (!isCore(r)) s.depths.galleries[r.id] = { kind: 'bundle', since: s.now };
}

describe('the core (chantier 52)', () => {
  it('leaves the flesh and the locules as chantier 50 drew them', () => {
    const before: Record<string, string> = {
      'net/kiwisu': 'aea9d4ba9869',
      'a/kiwino': '8efa0b001224',
      'demo/kiwisu': 'c9c0debfaabc',
    };
    for (const [key, hash] of Object.entries(before)) {
      const rooms = generateDepths(key).rooms.filter((r) => !isCore(r));
      const ids = new Set(rooms.map((r) => r.id));
      const above = rooms.map((r) => ({ ...r, links: r.links.filter((id) => ids.has(id)) }));
      expect(createHash('sha1').update(JSON.stringify(above)).digest('hex').slice(0, 12)).toBe(
        hash,
      );
    }
  });

  it('draws 6–10 white caverns with a ceiling and one stem, all reachable', () => {
    for (const key of ['net/kiwisu', 'a/kiwino', 'b/kiwisu', 'c/kiwino', 'd/kiwisu']) {
      const map = generateDepths(key);
      const caverns = map.rooms.filter(isCavern);
      expect(caverns.length).toBeGreaterThanOrEqual(DEPTHS.core.count[0]);
      expect(caverns.length).toBeLessThanOrEqual(DEPTHS.core.count[1]);
      for (const c of caverns) {
        expect(c.ceiling).toBeGreaterThanOrEqual(DEPTHS.core.ceiling[0]);
        expect(c.ceiling).toBeLessThanOrEqual(DEPTHS.core.ceiling[1]);
        expect(c.links.some((id) => isLocule(map.byId.get(id)!))).toBe(true);
      }
      const stems = map.rooms.filter(isStem);
      expect(stems.length).toBe(1);
      expect(stems[0]!.links.every((id) => isCavern(map.byId.get(id)!))).toBe(true);
      // The stem is the last room drawn.
      expect(map.rooms.at(-1)).toBe(stems[0]);
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

  it('fills the caverns with sap, Grouillants and sometimes a nest', () => {
    const map = generateDepths('fill/kiwisu');
    const truths = map.rooms.filter(isCavern).map((r) => roomTruth('secret-c/depths', r));
    for (const t of truths) {
      expect(t.kind).toBe('cavern');
      expect(t.hazard).toBeNull();
      expect(t.units.length).toBeGreaterThan(0);
      expect(t.loot.juice).toBeGreaterThan(0);
    }
    const stem = map.rooms.find(isStem)!;
    expect(roomTruth('secret-c/depths', stem).kind).toBe('stem');
  });

  it('opens the caverns at the Age of the stars; the stem stays guarded', () => {
    const { s } = delveColony();
    takeAbove(s);
    const map = depthsMapOf(s);
    const cavern = map.rooms.find((r) => isCavern(r))!;
    expect(delveLock(stars(s, 3), cavern.id, crewIds(s, 4), orders)).toBe('layerLocked');
    expect(delveLock(stars(s), cavern.id, crewIds(s, 4), orders)).toBeNull();
    const open = stars(s);
    for (const r of map.rooms)
      if (isCavern(r)) open.depths.galleries[r.id] = { kind: 'cavern', since: s.now };
    const stem = map.rooms.find(isStem)!;
    expect(delveLock(open, stem.id, crewIds(s, 4), orders)).toBe('layerLocked');
  });

  it('weighs the crew with its armour and caves in above the ceiling', () => {
    const { s } = delveColony();
    const crew = s.villagers.filter((v) => v.id.startsWith('dk')).slice(0, 4);
    const light = delveWeight(crew);
    expect(light).toBeGreaterThan(30);
    const armoured = crew.map((v) => ({ ...v, gear: { armor: 'heavy-iron' as const } }));
    expect(delveWeight(armoured)).toBe(light + 4 * DEPTHS.core.armorWeight.heavy);
    const map = depthsMapOf(s);
    const cavern = map.rooms.find(isCavern)!;
    expect(caveInOf(cavern, cavern.ceiling!)).toBeNull();
    const a = caveInOf(cavern, cavern.ceiling! * 1.1)!;
    const b = caveInOf(cavern, cavern.ceiling! * 1.5)!;
    expect(a.kind).toBe('fall');
    expect(b.strength).toBeGreaterThan(a.strength);
    expect(caveInOf(cavern, cavern.ceiling! * 9)!.strength).toBe(DEPTHS.core.caveIn.max);
    // Never in the flesh or the locules.
    expect(
      caveInOf(
        map.rooms.find((r) => r.entrance)!,
        999,
      ),
    ).toBeNull();
  });

  it('forecasts the cave-in and plays it in the battle', () => {
    const { map, s: s0 } = delveColony();
    takeAbove(s0);
    const s1 = stars(s0);
    const net = depthsMapOf(s1);
    const cavern = net.rooms
      .filter(isCavern)
      .find((r) => r.links.some((id) => s1.depths.galleries[id]))!;
    const ids = crewIds(s1, 8);
    const crew = ids.map((id) => s1.villagers.find((v) => v.id === id)!);
    expect(delveWeight(crew)).toBeGreaterThan(cavern.ceiling!);
    const f = delveForecast(s1, cavern.id, crew, orders)!;
    expect(f.ceiling).toBe(cavern.ceiling);
    expect(f.caveIn).not.toBeNull();
    expect(f.possibleHazard).toBe(false);
    expect(f.travelMs).toBe(DEPTHS.travelMs[4]);
    const few = crew.slice(0, 3);
    expect(delveForecast(s1, cavern.id, few, orders)!.caveIn).toBeNull();

    const cmd: Command = {
      type: 'delve',
      roomId: cavern.id,
      crew: ids,
      provisions: { pulp: 900, juice: 900 },
      orders,
    };
    let s = run(s1, cmd, s1.now, map);
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    s = advance(s, e.arriveAt + 1).state;
    const r = s.expeditions.find((x) => x.id === e.id)!.result!;
    expect(r.caveIn?.ceiling).toBe(cavern.ceiling);
    expect(r.caveIn?.hits.length).toBe(8);
  });

  it('doubles a mine’s output in a cavern’s gallery', () => {
    const { s } = delveColony();
    const map = depthsMapOf(s);
    const sap = map.rooms.find((r) => r.depth === 3)!;
    const cavern = map.rooms.find(isCavern)!;
    s.depths.galleries[sap.id] = { kind: 'sap', since: s.now };
    s.depths.galleries[cavern.id] = { kind: 'cavern', since: s.now };
    const a = s.villagers.find((v) => v.id.startsWith('dk'))!;
    a.job = { kind: 'mine', roomId: sap.id, returnTo: null };
    const there = galleryRate(s, sap.id) / DEPTHS.gallery.perMiner[2]!;
    a.job = { kind: 'mine', roomId: cavern.id, returnTo: null };
    // Both yield juice: the same miner gives twice a mine's share in the cavern.
    expect(galleryRate(s, cavern.id) / there).toBeCloseTo(2, 5);
  });

  it('feeds the upwellings with the core’s nests near our works', () => {
    const { s } = delveColony();
    takeAbove(s);
    const before = upwellPower(s);
    const n = nestsNear(s);
    if (n.core === 0) return;
    expect(n.core).toBeGreaterThan(0);
    const c = cloneState(s);
    for (const r of depthsMapOf(c).rooms)
      if (isCavern(r) && roomTruth(c.depthSeed!, r).nest)
        c.depths.galleries[r.id] = { kind: 'cavern', since: c.now };
    expect(upwellPower(c)).toBeLessThan(before);
  });
});
