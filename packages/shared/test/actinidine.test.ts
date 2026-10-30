import { describe, expect, it } from 'vitest';
import {
  actinidineActive,
  advance,
  cloneState,
  DEPTHS,
  delveForecast,
  delveTime,
  depthsMapOf,
  dispatchTasks,
  infusionRisk,
  isLocule,
  LANDING,
  roomTruth,
  woundFactor,
  type BuildingId,
  type GameState,
} from '../src';
import { delveColony, findTile, run, T0 } from './helpers';

/** An Industry colony with an actinidine lake taken (and a laboratory). */
function withLake() {
  const { map, s } = delveColony('acid');
  s.buildings.find((b) => b.type === 'monument')!.level = 3;
  const lake = depthsMapOf(s).rooms.find(isLocule)!;
  s.depths.galleries[lake.id] = { kind: 'lake', since: s.now };
  const at = findTile(map, 'flesh', 9);
  s.buildings.push({
    id: 'blab' as BuildingId,
    type: 'lab',
    q: at.q,
    r: at.r,
    level: 1,
    richness: 1,
    builtAt: T0,
    cramped: true,
  });
  s.research.done = [...s.research.done, 'industryAge', 'juiceInfusion'];
  return { map, s, lake };
}

const lakeMiners = (s: GameState) =>
  s.villagers.filter(
    (v) => v.job.kind === 'mine' && s.depths.galleries[v.job.roomId]?.kind === 'lake',
  );

describe('actinidine (chantier 50)', () => {
  it('sends one miner to a lake while its enzyme serves; halves the infusion risk', () => {
    const { s } = withLake();
    s.automation.mine = true;
    const v = s.villagers.find((x) => x.id.startsWith('dk'))!;
    const lab = s.buildings.find((b) => b.type === 'lab')!;
    const before = infusionRisk(s, v, lab);
    dispatchTasks(s, s.now, []);
    expect(lakeMiners(s)).toHaveLength(1);
    expect(actinidineActive(s)).toBe(true);
    const free = s.villagers.find((x) => x.id.startsWith('dk') && x.job.kind !== 'mine')!;
    expect(infusionRisk(s, free, lab)).toBeCloseTo(
      infusionRisk(
        (() => {
          const c = cloneState(s);
          c.depths.door.closed = true;
          return c;
        })(),
        free,
        lab,
      ) * DEPTHS.actinidine.infusionRisk,
      3,
    );
    expect(before).toBeGreaterThan(0);
    const closed = cloneState(s);
    closed.depths.door.closed = true;
    expect(actinidineActive(closed)).toBe(false);
  });

  it('heals the wounded twice as fast with Enzymes and a lake worked', () => {
    const { s } = withLake();
    s.automation.mine = true;
    dispatchTasks(s, s.now, []);
    expect(woundFactor(s)).toBe(1);
    const e = cloneState(s);
    e.research.done = [...e.research.done, 'enzymes'];
    expect(woundFactor(e)).toBe(0.5);
  });

  it('skirts the lakes on order: longer, and no acid', () => {
    const { map, s: s0 } = withLake();
    delete s0.depths.galleries[depthsMapOf(s0).rooms.find(isLocule)!.id];
    for (const r of depthsMapOf(s0).rooms)
      if (!isLocule(r)) s0.depths.galleries[r.id] = { kind: 'bundle', since: s0.now };
    const seed = s0.depthSeed!;
    const lake = depthsMapOf(s0).rooms.find(
      (r) =>
        isLocule(r) &&
        roomTruth(seed, r).kind === 'lake' &&
        r.links.some((id) => s0.depths.galleries[id]?.kind === 'bundle'),
    )!;
    expect(delveTime(lake, true)).toBe(Math.round(delveTime(lake) * DEPTHS.locules.skirtTravel));
    const crew = s0.villagers.filter((v) => v.id.startsWith('dk'));
    // Known to be a lake: no acid when skirting it.
    s0.depths.views[lake.id] = { at: s0.now, source: 'edge', kind: 'lake', nest: false };
    const f = delveForecast(s0, lake.id, crew.slice(0, 4), LANDING.defaultOrders, 1, true)!;
    expect(f.hazard).toBeNull();
    expect(f.possibleHazard).toBe(false);
    expect(delveForecast(s0, lake.id, crew.slice(0, 4), LANDING.defaultOrders)!.hazard?.kind).toBe(
      'acid',
    );
    let s = run(
      s0,
      {
        type: 'delve',
        roomId: lake.id,
        crew: crew.map((v) => v.id),
        provisions: { pulp: 500, juice: 500 },
        orders: LANDING.defaultOrders,
        skirt: true,
      },
      s0.now,
      map,
    );
    const e = s.expeditions.find((x) => x.mission === 'delve')!;
    expect(e.skirt).toBe(true);
    expect(e.arriveAt - e.departedAt).toBe(delveTime(lake, true));
    s = advance(s, e.arriveAt + 1).state;
    expect(s.expeditions.find((x) => x.id === e.id)!.result!.hazard).toBeUndefined();
  });
});
