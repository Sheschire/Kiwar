import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  attitudeOf,
  cloneState,
  drupeletTruth,
  LANDING,
  NECTAR_SCALE,
  nectarOf,
  ORCHARD,
  POST,
  postKiwis,
  publicState,
  raspberryOfState,
  standingOf,
  STANDING,
  voyageForecast,
  type BuildingId,
  type GameState,
  type VillagerId,
  type VoyagePlan,
} from '../src';
import { orchardColony, T0 } from './helpers';
import {
  AGE_OBJECTIVES,
  featsOf,
  objectiveProgress,
  postAttackForecast,
  POST_ATTACK,
  STANDING as STAND,
} from '../src';

const HOUR_MS = 3_600_000;

const provisions = { pulp: 400, juice: 400 };

function plan(s: GameState, crew: VillagerId[], over: Partial<VoyagePlan> = {}): VoyagePlan {
  const map = raspberryOfState(s);
  return {
    launchpadId: 'bpad' as BuildingId,
    mission: 'visit',
    stops: [map.parcels[0]!.id],
    crew: crew.slice(0, 2),
    provisions,
    ...over,
  };
}

describe('voyages to the raspberry (chantier 54)', () => {
  it('needs the wormholes and a launchpad of level 9', () => {
    const { map, s, crew } = orchardColony();
    const closed = cloneState(s);
    closed.research.done = closed.research.done.filter((t) => t !== 'wormholes');
    const r1 = applyCommand(closed, { type: 'voyage', ...plan(closed, crew) }, { now: T0, map });
    expect(r1.ok ? null : r1.error).toBe('wormholeClosed');
    const low = cloneState(s);
    low.buildings.find((b) => b.id === 'bpad')!.level = 8;
    const r2 = applyCommand(low, { type: 'voyage', ...plan(low, crew) }, { now: T0, map });
    expect(r2.ok ? null : r2.error).toBe('launchpadTooLow');
    // A sister colony never reaches the orchard.
    const sister = cloneState(s);
    sister.colony = { ...sister.colony, index: 1 };
    const r3 = applyCommand(sister, { type: 'voyage', ...plan(sister, crew) }, { now: T0, map });
    expect(r3.ok ? null : r3.error).toBe('wormholeClosed');
  });

  it('trades with a clan at its public rate, and the clan likes us better', () => {
    const { map, s, crew } = orchardColony();
    const rasp = raspberryOfState(s);
    const d = rasp.parcels[0]!;
    const clan = rasp.clanById.get(d.clan)!;
    const goods = { [clan.wants]: 10000 };
    const p = plan(s, crew, { goods });
    const f = voyageForecast(s, p)!;
    expect(f.stops[0]).toMatchObject({ clan: clan.id, amount: 10000 });
    const r = applyCommand(s, { type: 'voyage', ...p }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'visit')!;
    expect(e.returnAt - e.arriveAt).toBe(f.travelMs);
    const there = advance(r.state, e.arriveAt).state;
    const done = there.expeditions.find((x) => x.id === e.id)!;
    expect(done.status).toBe('returning');
    expect(done.result!.stops![0]!.nectar).toBe(f.stops[0]!.nectar);
    expect(standingOf(there, clan.id, e.arriveAt)).toBe(STANDING.trade);
    // The beetles were met: a dated view of the drupelet.
    expect(there.orchard.views[d.id]?.source).toBe('visit');
    expect(there.orchard.views[d.id]?.units).toEqual(drupeletTruth(s.orchardSeed!, d).units);
    const home = advance(there, e.returnAt).state;
    expect(nectarOf(home)).toBe(f.stops[0]!.nectar);
  });

  it('waits for the server online (the orchard is hidden), and never leaks its truth', () => {
    const { map, s, crew } = orchardColony();
    const r = applyCommand(s, { type: 'voyage', ...plan(s, crew) }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const seen = publicState(r.state);
    expect(seen.orchardSeed).toBeUndefined();
    const e = seen.expeditions.find((x) => x.mission === 'visit')!;
    const later = advance(seen, e.arriveAt + HOUR_MS).state;
    expect(later.expeditions.find((x) => x.id === e.id)!.status).toBe('outbound');
    expect(JSON.stringify(later)).not.toContain('/drupelet/');
  });

  it('pillages a drupelet: nectar if won, the clan and its neighbours hostile whatever', () => {
    const { map, s, crew } = orchardColony();
    const rasp = raspberryOfState(s);
    // A weak drupelet at the tip.
    const d = rasp.parcels[0]!;
    const p = plan(s, crew, {
      mission: 'pillage',
      crew,
      orders: { ...LANDING.defaultOrders, retreatAt: 0.3 },
    });
    const f = voyageForecast(s, p)!;
    expect(f.pillage?.knowledge).toBe('unknown');
    const r = applyCommand(s, { type: 'voyage', ...p }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    const e = r.state.expeditions.find((x) => x.mission === 'pillage')!;
    const there = advance(r.state, e.arriveAt).state;
    const res = there.expeditions.find((x) => x.id === e.id)!.result!;
    expect(res.log).toBeDefined();
    expect(attitudeOf(there, d.clan, e.arriveAt)).toBe('hostile');
    if (res.outcome === 'victory') {
      expect(res.nectar).toBe(drupeletTruth(s.orchardSeed!, d).nectar);
      expect(there.orchard.taken[d.id]).toBe(e.arriveAt);
      // A hostile clan does not trade any more.
      const back = advance(there, e.returnAt + 1).state;
      const again = applyCommand(
        back,
        {
          type: 'voyage',
          ...plan(back, crew, {
            stops: [d.links.find((l) => rasp.byId.get(l)!.clan === d.clan) ?? d.id],
          }),
        },
        { now: back.now, map },
      );
      expect(again.ok ? null : again.error).toBe('clanHostile');
    }
  });

  it('founds a trading post with a friendly clan, leaves kiwis there who gather nectar', () => {
    const { map, s, crew } = orchardColony();
    const rasp = raspberryOfState(s);
    const d = rasp.parcels[3]!;
    // Not friendly yet: refused.
    s.nectar = 100 * NECTAR_SCALE;
    const p = plan(s, crew, {
      stops: [d.id],
      settle: true,
      crew: crew.slice(0, 3),
      stay: crew.slice(0, 2),
    });
    const r0 = applyCommand(s, { type: 'voyage', ...p }, { now: T0, map });
    expect(r0.ok ? null : r0.error).toBe('notFriendly');
    s.orchard.standing[d.clan] = { value: 50, at: T0 };
    const r = applyCommand(s, { type: 'voyage', ...p }, { now: T0, map });
    if (!r.ok) throw new Error(r.error);
    expect(nectarOf(r.state)).toBe(100 - POST.cost.nectar);
    const e = r.state.expeditions.find((x) => x.mission === 'visit')!;
    const there = advance(r.state, e.arriveAt).state;
    expect(there.expeditions.find((x) => x.id === e.id)!.result!.postFounded).toBe(true);
    expect(there.orchard.posts.raspberry?.drupelet).toBe(d.id);
    expect(
      postKiwis(there)
        .map((v) => v.id)
        .sort(),
    ).toEqual(crew.slice(0, 2).sort());
    // A stall: the two kiwis gather into the store, exactly, whatever the steps.
    const ready = advance(there, there.orchard.posts.raspberry!.readyAt).state;
    const b = applyCommand(
      ready,
      { type: 'buildPostModule', moduleType: 'stall', q: 1, r: 0 },
      { now: ready.now, map },
    );
    if (!b.ok) throw new Error(b.error);
    const t1 = b.state.orchard.posts.raspberry!.modules[0]!.readyAt + 10 * HOUR_MS;
    const one = advance(b.state, t1).state;
    let steps = b.state;
    for (let t = b.state.now; t < t1; t += 37 * 60_000)
      steps = advance(steps, Math.min(t1, t)).state;
    steps = advance(steps, t1).state;
    expect(one.orchard.posts.raspberry!.store).toBe(steps.orchard.posts.raspberry!.store);
    expect(Math.floor(one.orchard.posts.raspberry!.store / NECTAR_SCALE)).toBe(
      Math.floor(POST.perHour * 2 * 10),
    );
    // They stay away from the village (fed by the colony).
    expect(one.villagers.filter((v) => v.job.kind === 'post')).toHaveLength(2);
  });

  it('keeps a voyage within the hold and the crew size', () => {
    const { map, s, crew } = orchardColony();
    const heavy = applyCommand(
      s,
      { type: 'voyage', ...plan(s, crew, { goods: { pulp: 1e6 } }) },
      { now: T0, map },
    );
    expect(heavy.ok ? null : heavy.error).toBe('overloaded');
    const far = raspberryOfState(s).parcels.find(
      (x) => !raspberryOfState(s).parcels[0]!.links.includes(x.id) && x.index > 5,
    )!;
    const apart = applyCommand(
      s,
      {
        type: 'voyage',
        ...plan(s, crew, { stops: [raspberryOfState(s).parcels[0]!.id, far.id] }),
      },
      { now: T0, map },
    );
    expect(apart.ok ? null : apart.error).toBe('stopsApart');
    expect(ORCHARD.crew.max).toBe(8);
  });
});

/** A colony with its trading post standing on a drupelet, `guards` kiwis there. */
function postColony(guards = 2) {
  const { map, s, crew } = orchardColony('post-attacks');
  const rasp = raspberryOfState(s);
  const d = rasp.parcels[10]!;
  s.orchard.posts.raspberry = {
    drupelet: d.id,
    since: T0 - 10 * HOUR_MS,
    readyAt: T0 - 8 * HOUR_MS,
    modules: [],
    store: 30 * NECTAR_SCALE,
    attacks: 0,
    attack: null,
    reports: [],
  };
  for (const id of crew.slice(0, guards))
    s.villagers.find((v) => v.id === id)!.job = { kind: 'post', returnTo: null };
  return { map, s, crew, d, rasp };
}

describe('attacks on the trading post (chantier 54)', () => {
  it('plans attacks on a public clock, and none comes without a hostile clan next door', () => {
    const { s } = postColony();
    const a = advance(s, T0 + 1).state;
    const planned = a.orchard.posts.raspberry!.attack!;
    expect(planned.at - planned.announceAt).toBe(POST_ATTACK.noticeMs);
    expect(planned.at - T0).toBeGreaterThanOrEqual(POST_ATTACK.intervalMs[0]);
    // The same for anyone who looks (no hidden draw).
    const b = advance(publicState(s), T0 + 1).state;
    expect(b.orchard.posts.raspberry!.attack).toEqual(planned);
    const after = advance(a, planned.announceAt + 1).state;
    expect(after.orchard.posts.raspberry!.attacks).toBe(1);
    expect(after.orchard.posts.raspberry!.attack?.announced ?? false).toBe(false);
  });

  it('announces the most hostile clan next door, and a gift calls it off', () => {
    const { s, d } = postColony();
    s.orchard.standing[d.clan] = { value: -90, at: T0 };
    const a = advance(s, T0 + 1).state;
    const planned = a.orchard.posts.raspberry!.attack!;
    const r = advance(a, planned.announceAt);
    const att = r.state.orchard.posts.raspberry!.attack!;
    expect(att.announced).toBe(true);
    expect(att.clan).toBe(d.clan);
    expect(r.events.some((e) => e.type === 'postAttackAnnounced')).toBe(true);
    expect(postAttackForecast(r.state)?.clan).toBe(d.clan);
    // A gift (standing back above hostile) before the strike: nothing comes.
    const calm = cloneState(r.state);
    calm.orchard.standing[d.clan] = { value: 0, at: calm.now };
    const c = advance(calm, att.at);
    expect(c.events.some((e) => e.type === 'postAttackCalmed')).toBe(true);
    expect(c.state.orchard.posts.raspberry!.ruined).toBeUndefined();
  });

  it('strikes where the truth is held: a post left empty falls to a ruin, never lost', () => {
    const { s, d } = postColony(0);
    s.orchard.standing[d.clan] = { value: -100, at: T0 };
    const a = advance(s, T0 + 1).state;
    const at = a.orchard.posts.raspberry!.attack!.at;
    // Online, the client waits for the server.
    const waiting = advance(publicState(a), at + HOUR_MS).state;
    expect(waiting.orchard.posts.raspberry!.attack?.at).toBe(at);
    const r = advance(a, at);
    const hit = r.events.find((e) => e.type === 'postAttacked');
    expect(hit).toMatchObject({ held: false, dead: 0 });
    const post = r.state.orchard.posts.raspberry!;
    expect(post.ruined).toBe(true);
    expect(post.reports[0]!.taken).toBe(30);
    expect(post.store).toBe(0);
    expect(STAND.hostile).toBeLessThan(0);
  });
});

describe('the orchard in the objectives and the leagues (chantier 54)', () => {
  it('counts the first voyage and the trading post', () => {
    const { s } = postColony();
    const obj = AGE_OBJECTIVES.find((o) => o.id === 'starsWormhole')!;
    expect(objectiveProgress(s, obj).current).toBe(0);
    s.orchard.visits = 1;
    s.orchard.visited = ['raspberry'];
    expect(objectiveProgress(s, obj).current).toBe(1);
    const feats = featsOf(s);
    expect(feats).toContain('raspberry');
    expect(feats).toContain('tradingPost');
  });
});
