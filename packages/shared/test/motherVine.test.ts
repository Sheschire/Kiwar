import { describe, expect, it } from 'vitest';
import {
  advance,
  AGE_OBJECTIVES,
  applyCommand,
  cloneState,
  colonyMood,
  depthsMapOf,
  isCavern,
  isCore,
  isStem,
  LANDING,
  MORALE,
  motherVineAt,
  nestsNear,
  objectiveProgress,
  RESEARCH,
  roomTruth,
  TECHS,
  techCost,
  type Command,
  type GameEvent,
  type GameState,
  type VillagerId,
} from '../src';
import { delveColony, run } from './helpers';

const fight = { ...LANDING.defaultOrders, retreatAt: 0.8 };

function crewIds(s: GameState, n: number): VillagerId[] {
  return s.villagers
    .filter((v) => v.id.startsWith('dk'))
    .slice(0, n)
    .map((v) => v.id);
}

/** The Weevil beaten by a strong crew; the state when the crew is back up. */
function beaten() {
  const { map, s: s0 } = delveColony('vine', 3, 8, 90);
  s0.buildings.find((b) => b.type === 'monument')!.level = 4;
  const net = depthsMapOf(s0);
  for (const r of net.rooms)
    if (!isStem(r))
      s0.depths.galleries[r.id] = { kind: isCore(r) ? 'cavern' : 'bundle', since: s0.now };
  const stem = net.rooms.find(isStem)!;
  // Badly wounded by an earlier battle: this crew finishes it.
  s0.depths.weevil = { attempts: 1, wounds: { share: 0.9, at: s0.now } };
  const cmd: Command = {
    type: 'delve',
    roomId: stem.id,
    crew: crewIds(s0, 8),
    provisions: { pulp: 900, juice: 900 },
    orders: fight,
  };
  const s1 = run(s0, cmd, s0.now, map);
  const e = s1.expeditions.find((x) => x.mission === 'delve')!;
  const arrived = advance(s1, e.arriveAt + 1);
  const back = advance(arrived.state, e.returnAt + 1).state;
  return { map, before: s1, arrived, back, e, stem };
}

describe('the Mother Vine (chantier 52)', () => {
  it('is found when the Weevil falls: an event, a treasure, a memory for everybody', () => {
    const { before, arrived, back, e } = beaten();
    expect(motherVineAt(before)).toBeNull();
    expect(motherVineAt(arrived.state)).toBe(e.arriveAt);
    const found = arrived.events.filter((x: GameEvent) => x.type === 'motherVineFound');
    expect(found.length).toBe(1);
    const r = arrived.state.expeditions.find((x) => x.id === e.id)!.result!;
    expect(r.motherVine).toBe(true);
    expect(back.giantSeeds).toBeGreaterThan(before.giantSeeds);
    expect(back.crystal).toBeGreaterThan(before.crystal);
    for (const v of arrived.state.villagers)
      expect(v.memories?.some((m) => m.kind === 'motherVine')).toBe(true);
  });

  it('silences the core’s nests', () => {
    const { s } = delveColony('vine-nests');
    const net = depthsMapOf(s);
    // Every room above the core taken: the caverns' nests stand next to our works.
    for (const r of net.rooms)
      if (!isCore(r)) s.depths.galleries[r.id] = { kind: 'bundle', since: s.now };
    const nests = net.rooms.filter((r) => isCavern(r) && roomTruth(s.depthSeed!, r).nest).length;
    expect(nestsNear(s).core).toBe(nests);
    const after = cloneState(s);
    after.depths.weevil = { attempts: 1, fellAt: s.now };
    expect(nestsNear(after).core).toBe(0);
  });

  it('keeps pilgrims at the stem, who lift the whole colony while the door is open', () => {
    const { map, back, stem } = beaten();
    // The automation sends one pilgrim (enough for the colony's morale).
    const at = (st: GameState) =>
      st.villagers.filter((v) => v.job.kind === 'mine' && v.job.roomId === stem.id);
    expect(at(back).length).toBe(1);
    expect(colonyMood(back).pilgrimage).toBe(MORALE.pilgrimage);
    // Without the automation, the player posts them.
    const manual = cloneState(back);
    manual.automation.mine = false;
    for (const v of at(manual)) v.job = { kind: 'idle' };
    const base = colonyMood(manual).sum;
    expect(colonyMood(manual).pilgrimage).toBe(0);
    const two = manual.villagers.filter((v) => v.job.kind === 'idle' || v.job.kind === 'work');
    const cmd: Command = {
      type: 'postMiners',
      roomId: stem.id,
      villagerIds: two.slice(0, 2).map((v) => v.id),
    };
    const r = applyCommand(manual, cmd, { now: manual.now, map });
    expect(r.ok).toBe(true);
    const s = r.ok ? r.state : manual;
    expect(at(s).length).toBe(2);
    expect(colonyMood(s).sum).toBe(base + MORALE.pilgrimage);
    const closed = cloneState(s);
    closed.depths.door.closed = true;
    expect(colonyMood(closed).pilgrimage).toBe(0);
  });

  it('makes a technology cheaper with it (the wormholes of chantier 54)', () => {
    const { before, arrived } = beaten();
    const def = TECHS.starSails as { cheaperWith?: 'motherVine' };
    const kept = def.cheaperWith;
    def.cheaperWith = 'motherVine';
    try {
      expect(techCost(before, 'starSails')).toBe(
        Math.round(TECHS.starSails.cost * RESEARCH.withoutVine),
      );
      expect(techCost(arrived.state, 'starSails')).toBe(TECHS.starSails.cost);
    } finally {
      if (kept === undefined) delete def.cheaperWith;
    }
    // Chantier 54: the wormholes are the only technology that uses it.
    for (const t of Object.values(TECHS))
      expect(t.cheaperWith).toBe(t.id === 'wormholes' ? 'motherVine' : undefined);
    expect(techCost(before, 'starSails')).toBe(TECHS.starSails.cost);
    expect(techCost(before, 'wormholes')).toBe(
      Math.round(TECHS.wormholes.cost * RESEARCH.withoutVine),
    );
    expect(techCost(arrived.state, 'wormholes')).toBe(TECHS.wormholes.cost);
  });

  it('counts the caverns and the Weevil in the objectives of the stars', () => {
    const { before, arrived } = beaten();
    const caverns = AGE_OBJECTIVES.find((o) => o.id === 'starsCaverns')!;
    const weevil = AGE_OBJECTIVES.find((o) => o.id === 'starsWeevil')!;
    expect(objectiveProgress(before, caverns).current).toBe(2);
    expect(objectiveProgress(before, weevil).current).toBe(0);
    expect(objectiveProgress(arrived.state, weevil).current).toBe(1);
  });
});
