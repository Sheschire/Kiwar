import { fruitSetup } from '../battle/fruit';
import { landingOutcome, type LandingOutcome } from '../battle/landing';
import { simulateBattle } from '../battle/simulate';
import type { BattleLog } from '../battle/types';
import { EXPEDITIONS } from '../data/expeditions';
import { LANDING, type LandingOrders } from '../data/landing';
import { NECTAR_SCALE, ORCHARD, ORCHARD_TARGET, RASPBERRY, STANDING } from '../data/orchard';
import { RESOURCE_IDS, emptyResources, type Resources } from '../data/resources';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { AlienUnit } from './civ';
import type { CommandError } from './commands';
import { crystalOf } from './crystal';
import {
  crewOf,
  crewWeight,
  coverage,
  launchCost,
  launchpadOf,
  isLaunchpadBusy,
  rations,
  removeVillagers,
  shipCargo,
  shipOf,
  shipReliability,
  travelFactor,
  travelTime,
  type Odds,
} from './expeditions';
import { meteorIronOf } from './iron';
import { recordBestiary, tollOf, validOrders } from './landing';
import {
  addStanding,
  attitudeOf,
  beetles,
  drupeletNow,
  nectarOf,
  orchardOpen,
  pillageStanding,
  raspberryOfState,
  regrowth,
  sellTo,
  tradeRate,
  type Attitude,
  type Drupelet,
} from './orchard';
import { foundPost, postCost, postHousing, postKiwis, postStore, workingPost } from './tradingPost';
import {
  withRng,
  type DrupeletView,
  type Expedition,
  type GameState,
  type Villager,
  type VoyageStop,
} from './state';

/**
 * Chantier 54: voyages through the wormhole to the raspberry. A `visit` calls at one or two
 * drupelets next to each other: it trades what each clan asks for (or gives it), meets the
 * beetles there (a dated view), and may found our trading post, leave kiwis at it or bring
 * some home. A `pillage` lands on one drupelet and fights its beetles (and the help of the clan's
 * drupelets next to it): its nectar if won, the clan's anger whatever happens. Like a landing,
 * a voyage resolves only where the truth is held (`orchardSeed`).
 */

export type VoyageMission = 'visit' | 'pillage';

export interface VoyagePlan {
  launchpadId: BuildingId;
  mission: VoyageMission;
  stops: string[];
  crew: VillagerId[];
  provisions: { pulp: number; juice: number };
  goods?: Partial<Resources>;
  gift?: boolean;
  settle?: boolean;
  stay?: VillagerId[];
  bringBack?: VillagerId[];
  orders?: LandingOrders;
  fuel?: boolean;
}

export function isVoyage(e: Pick<Expedition, 'mission'>): boolean {
  return e.mission === 'visit' || e.mission === 'pillage';
}

/** Voyages not back yet. */
export function voyagesOut(state: GameState): Expedition[] {
  return state.expeditions.filter((e) => isVoyage(e) && e.status !== 'done');
}

/** One way through the wormhole (the post on the raspberry is a relay). */
export function voyageTime(
  state: GameState,
  pad: Parameters<typeof travelTime>[1],
  crew: readonly Villager[],
  fuel = false,
): number {
  const base = travelTime(
    { travelMs: ORCHARD.travelMs },
    pad,
    crew,
    'land',
    travelFactor(state, { fuel }),
  );
  const relay = workingPost(state) ? ORCHARD.relay : 1;
  return Math.round((base * relay) / 1000) * 1000;
}

/** Whole, non-negative goods. */
export function cleanGoods(g: Partial<Resources> | undefined): Resources {
  const out = emptyResources();
  for (const r of RESOURCE_IDS) out[r] = Math.max(0, Math.floor(g?.[r] ?? 0));
  return out;
}

function goodsValid(g: Partial<Resources> | undefined): boolean {
  if (!g) return true;
  return RESOURCE_IDS.every((r) => g[r] === undefined || (Number.isFinite(g[r]) && g[r]! >= 0));
}

/** Who may sail: at home and free like a landing's crew (not a Kikiwiwi: no wormhole fits it). */
function sailors(state: GameState, ids: readonly VillagerId[]): Villager[] | null {
  const crew = crewOf(state, ids);
  if (!crew || crew.some((v) => v.kikiwiwi)) return null;
  return crew;
}

/** Why this voyage cannot leave now (the resources are checked with the forecast). */
export function voyageLock(state: GameState, plan: VoyagePlan): CommandError | null {
  if (!orchardOpen(state)) return 'wormholeClosed';
  const pad = launchpadOf(state, plan.launchpadId);
  if (!pad) return 'notALaunchpad';
  if (pad.level < ORCHARD.padLevel) return 'launchpadTooLow';
  if (isLaunchpadBusy(state, pad.id)) return 'launchpadBusy';
  if (pad.damaged) return 'launchpadDamaged';
  if (plan.mission !== 'visit' && plan.mission !== 'pillage') return 'invalidMission';
  const map = raspberryOfState(state);
  const stops = plan.stops;
  if (stops.length < 1) return 'unknownDrupelet';
  if (stops.length > (plan.mission === 'pillage' ? 1 : ORCHARD.maxStops)) return 'tooManyStops';
  const ds = stops.map((id) => map.byId.get(id));
  if (ds.some((d) => !d) || new Set(stops).size !== stops.length) return 'unknownDrupelet';
  if (ds.length === 2 && !ds[0]!.links.includes(ds[1]!.id)) return 'stopsApart';
  const post = state.orchard.post;
  const now = state.now;
  if (plan.mission === 'pillage') {
    if (post && !post.ruined && post.drupelet === stops[0]) return 'ownPost';
    if (!validOrders(plan.orders)) return 'invalidOrders';
    if (plan.goods || plan.gift || plan.settle || plan.stay?.length || plan.bringBack?.length)
      return 'invalidMission';
  } else {
    if (plan.orders) return 'invalidMission';
    if (!goodsValid(plan.goods)) return 'invalidGoods';
    // A hostile clan does not trade (a gift is still welcome; a taken drupelet may still take
    // our post).
    for (const d of ds)
      if (
        attitudeOf(state, d!.clan, now) === 'hostile' &&
        !plan.gift &&
        !(plan.settle && d === ds[0])
      )
        return 'clanHostile';
    if (plan.settle) {
      if (post && !post.ruined) return 'postThere';
      const d = ds[0]!;
      const ruin = post?.ruined && post.drupelet === d.id;
      if (
        !ruin &&
        attitudeOf(state, d.clan, now) !== 'friendly' &&
        state.orchard.taken[d.id] === undefined
      )
        return 'notFriendly';
      const cost = postCost(state);
      if (nectarOf(state) < cost.nectar) return 'notEnoughNectar';
      if (crystalOf(state) < cost.crystal) return 'notEnoughCrystal';
      if (meteorIronOf(state) < cost.iron) return 'notEnoughIron';
    }
    const at = plan.settle ? stops[0] : post && !post.ruined ? post.drupelet : null;
    if ((plan.stay?.length || plan.bringBack?.length) && (!at || !stops.includes(at)))
      return 'notAtPost';
    if (plan.bringBack?.length) {
      const here = new Set(postKiwis(state).map((v) => v.id));
      if (new Set(plan.bringBack).size !== plan.bringBack.length) return 'invalidCrew';
      if (plan.bringBack.some((id) => !here.has(id))) return 'notAtPost';
    }
    if (plan.stay?.length) {
      if (new Set(plan.stay).size !== plan.stay.length) return 'invalidCrew';
      if (plan.stay.some((id) => !plan.crew.includes(id))) return 'invalidCrew';
      const room = plan.settle
        ? 2
        : post
          ? postHousing(post, Infinity) - postKiwis(state).length + (plan.bringBack?.length ?? 0)
          : 0;
      if (plan.stay.length > room) return 'postFull';
    }
  }
  if (new Set(plan.crew).size !== plan.crew.length) return 'invalidCrew';
  const crew = sailors(state, plan.crew);
  if (!crew) return 'invalidCrew';
  if (crew.length < ORCHARD.crew.min) return 'crewTooSmall';
  if (crew.length > ORCHARD.crew.max) return 'crewTooLarge';
  // Someone must sail the ship home.
  if (crew.length - (plan.stay?.length ?? 0) + (plan.bringBack?.length ?? 0) < 1)
    return 'crewTooSmall';
  const { pulp, juice } = plan.provisions;
  if (![pulp, juice].every((v) => Number.isFinite(v) && v >= 0)) return 'invalidCount';
  return null;
}

export interface StopForecast {
  drupelet: string;
  clan: string;
  attitude: Attitude;
  /** What the clan asks for, what we would sell or give of it, the nectar it would pay. */
  wants: Resources extends Record<infer K, number> ? K : never;
  amount: number;
  nectar: number;
  rate: number;
  standing: number;
}

export interface PillageForecast {
  knowledge: 'seen' | 'unknown';
  view: DrupeletView | null;
  units: AlienUnit[];
  /** The clan's drupelets next to it that may send help (seen or estimated). */
  help: { drupelet: string; units: AlienUnit[] }[];
  nectar: number;
  odds: Odds;
  expectedDead: number;
  expectedHurt: number;
  trials: LandingOutcome[];
}

export interface VoyageForecast {
  travelMs: number;
  /** From the arrival to the last stop. */
  hopsMs: number;
  needOneWay: { pulp: number; juice: number };
  fed: number;
  weight: number;
  cargo: number;
  returnWeight: number;
  launchCost: Resources;
  reliability: number;
  stops: StopForecast[];
  settleCost: { nectar: number; crystal: number; iron: number } | null;
  /** Nectar waiting in the post's store (brought home if the ship calls there). */
  store: number;
  pillage: PillageForecast | null;
}

/** Everything the voyage screen shows (public data only); the same maths drive the voyage. */
export function voyageForecast(state: GameState, plan: VoyagePlan): VoyageForecast | null {
  const pad = launchpadOf(state, plan.launchpadId);
  if (!pad) return null;
  const map = raspberryOfState(state);
  const crew = sailors(state, plan.crew) ?? [];
  const travelMs = voyageTime(state, pad, crew, !!plan.fuel);
  const need = rations(state, crew, travelMs);
  const fed = coverage(plan.provisions, need);
  const goods = cleanGoods(plan.goods);
  const goodsCount = RESOURCE_IDS.reduce((a, r) => a + goods[r], 0);
  const weight =
    crewWeight(crew) +
    (plan.provisions.pulp + plan.provisions.juice + goodsCount) * EXPEDITIONS.resourceWeight;
  const now = state.now;
  const left = { ...goods };
  const stops: StopForecast[] = [];
  if (plan.mission === 'visit')
    for (const id of plan.stops) {
      const d = map.byId.get(id);
      if (!d) continue;
      const clan = map.clanById.get(d.clan)!;
      const amount = left[clan.wants];
      left[clan.wants] = 0;
      const rate = tradeRate(state, clan.id, now);
      stops.push({
        drupelet: id,
        clan: clan.id,
        attitude: attitudeOf(state, clan.id, now),
        wants: clan.wants,
        amount,
        rate,
        nectar: plan.gift ? 0 : Math.floor((amount * rate) / 1000),
        standing: amount > 0 ? (plan.gift ? giftStanding(amount) : STANDING.trade) : 0,
      });
    }
  const backCrew = [
    ...crew.filter((v) => !plan.stay?.includes(v.id)),
    ...(crewOf(state, plan.bringBack ?? []) ?? []),
  ];
  const post = state.orchard.post;
  const calls = post && !post.ruined && plan.stops.includes(post.drupelet);
  return {
    travelMs,
    hopsMs: (plan.stops.length - 1) * ORCHARD.hopMs,
    needOneWay: need,
    fed,
    weight,
    cargo: shipCargo(pad),
    returnWeight: crewWeight(backCrew),
    launchCost: launchCost(state, crew, 'land'),
    reliability: shipReliability(shipOf(state), crew, !!plan.fuel),
    stops,
    settleCost: plan.settle ? postCost(state) : null,
    store: calls && post ? postStore(post) : 0,
    pillage:
      plan.mission === 'pillage' && plan.stops[0]
        ? pillageForecast(state, plan.stops[0], crew, plan.orders ?? LANDING.defaultOrders, fed)
        : null,
  };
}

/** Standing a gift buys: +8 for 5 000 units, up to three times that. */
export function giftStanding(amount: number): number {
  return Math.round(STANDING.gift * Math.min(3, amount / 5000) * 10) / 10;
}

/** The public estimate of a drupelet's beetles (its ring, regrowth after our pillage). */
function guessUnits(state: GameState, d: Drupelet, k: number): AlienUnit[] {
  const f = regrowth(state, d.id, state.now);
  return beetles(RASPBERRY.rings.power[d.ring]! * k * f, RASPBERRY.rings.level[d.ring]!);
}

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number }>();

/**
 * The honest forecast of a pillage: three practice battles — against the beetles seen there
 * (a visit's view, regrown since), or the public estimate of its ring (× 0.8, 1, 1.2 and a nest
 * in the hardest) — each with the help of every drupelet of the clan next to it, counted at
 * its worst in the hardest trial (the lesson of chantier 47).
 */
export function pillageForecast(
  state: GameState,
  drupeletId: string,
  crew: readonly Villager[],
  orders: LandingOrders,
  fed = 1,
): PillageForecast | null {
  const map = raspberryOfState(state);
  const d = map.byId.get(drupeletId);
  if (!d) return null;
  const view = state.orchard.views[drupeletId] ?? null;
  const spread = RASPBERRY.powerSpread;
  const armies: AlienUnit[][] = view
    ? [view.units, view.units, view.units]
    : [
        guessUnits(state, d, 1 - spread),
        guessUnits(state, d, 1),
        guessUnits(state, d, (1 + spread) * RASPBERRY.nestPower),
      ];
  const helpers = d.links.map((id) => map.byId.get(id)!).filter((x) => x.clan === d.clan);
  const helpOf = (i: number) =>
    helpers.map((h) => {
      const seen = state.orchard.views[h.id];
      return seen
        ? seen.units
        : guessUnits(
            state,
            h,
            i === 2 ? (1 + spread) * RASPBERRY.nestPower : i === 0 ? 1 - spread : 1,
          );
    });
  const nectar = view
    ? view.nectar
    : Math.round(RASPBERRY.rings.nectar[d.ring]! * regrowth(state, d.id, state.now));
  const base = {
    knowledge: (view ? 'seen' : 'unknown') as 'seen' | 'unknown',
    view,
    units: armies[1]!,
    help: helpers.map((h, i) => ({ drupelet: h.id, units: helpOf(1)[i]! })),
    nectar,
  };
  if (crew.length === 0)
    return { ...base, odds: 'unknown', expectedDead: 0, expectedHurt: 0, trials: [] };
  const runs = armies.map((units, i) => {
    const seed = `orchard/trial/${drupeletId}/${i}`;
    const setup = fruitSetup(state, crew, { units, help: helpOf(i), orders, fed, seed });
    const key = JSON.stringify([setup.units, setup.orders, seed]);
    const hit = trialCache.get(key);
    if (hit) return hit;
    const log = simulateBattle(setup, seed);
    const out = { outcome: landingOutcome(log), dead: log.result.lost?.length ?? 0 };
    if (trialCache.size > 32) trialCache.delete(trialCache.keys().next().value!);
    trialCache.set(key, out);
    return out;
  });
  const won = runs.map((r) => r.outcome === 'victory');
  const odds: Odds = won[2] ? 'likely' : won[1] || won[0] ? 'uncertain' : 'unlikely';
  return { ...base, odds, ...tollOf(runs[1]!), trials: runs.map((r) => r.outcome) };
}

/** Boards the crew, the provisions and the goods (validation is done by the command). */
export function launchVoyage(
  state: GameState,
  plan: VoyagePlan,
  now: TimeMs,
  id: string,
): Expedition {
  const pad = launchpadOf(state, plan.launchpadId)!;
  const crew = sailors(state, plan.crew)!;
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= plan.provisions.pulp;
  state.resources.juice -= plan.provisions.juice;
  const goods = plan.mission === 'visit' ? cleanGoods(plan.goods) : emptyResources();
  for (const r of RESOURCE_IDS) state.resources[r] -= goods[r];
  const travelMs = voyageTime(state, pad, crew, !!plan.fuel);
  // A breakdown only delays the ship (like a landing): late, with the same hold.
  const failed = withRng(
    state,
    (rng) => !rng.chance(shipReliability(shipOf(state), crew, !!plan.fuel)),
  );
  const outMs = failed ? Math.round((travelMs * LANDING.breakdown.delay) / 1000) * 1000 : travelMs;
  const hops = (plan.stops.length - 1) * ORCHARD.hopMs;
  const e: Expedition = {
    id,
    mission: plan.mission,
    targetId: ORCHARD_TARGET,
    launchpadId: pad.id,
    crew: crew.map((v) => v.id),
    roster: crew.map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
    })),
    provisions: { ...emptyResources(), pulp: plan.provisions.pulp, juice: plan.provisions.juice },
    cargo: shipCargo(pad),
    departedAt: now,
    arriveAt: now + outMs,
    returnAt: now + outMs + hops + travelMs,
    status: 'outbound',
    result: null,
    ...(plan.mission === 'pillage'
      ? { orders: { ...(plan.orders ?? LANDING.defaultOrders) } }
      : {}),
    ...(failed ? { delayed: true } : {}),
    voyage: {
      stops: [...plan.stops],
      goods,
      ...(plan.gift ? { gift: true } : {}),
      ...(plan.settle ? { settle: true } : {}),
      ...(plan.stay?.length ? { stay: [...plan.stay] } : {}),
      ...(plan.bringBack?.length ? { bringBack: [...plan.bringBack] } : {}),
    },
  };
  state.expeditions.push(e);
  return e;
}

/** The ship reaches the raspberry (only where the truth is held). */
export function resolveVoyage(
  state: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
): void {
  const seed = state.orchardSeed;
  if (seed === undefined || !e.voyage) throw new Error('resolveVoyage: hidden orchard');
  if (e.mission === 'pillage') return resolvePillage(state, e, members, fed, seed);
  const at = e.arriveAt;
  const map = raspberryOfState(state);
  const v = e.voyage;
  const goods = { ...v.goods };
  const stops: VoyageStop[] = [];
  let nectar = 0;
  const units: AlienUnit[] = [];
  for (const id of v.stops) {
    const d = map.byId.get(id)!;
    const clan = map.clanById.get(d.clan)!;
    const truth = drupeletNow(state, seed, d, at);
    if (attitudeOf(state, clan.id, at) === 'hostile' && !v.gift) {
      stops.push({ drupelet: id, clan: clan.id, sold: {}, nectar: 0, refused: true });
      continue;
    }
    // Met: their garrison and their stores are seen.
    state.orchard.views[id] = {
      at,
      source: 'visit',
      units: truth.units.map((u) => ({ ...u })),
      nectar: truth.nectar,
      nest: truth.nest,
    };
    units.push(...truth.units);
    const amount = goods[clan.wants];
    goods[clan.wants] = 0;
    let paid = 0;
    if (amount > 0) {
      if (v.gift) addStanding(state, clan.id, giftStanding(amount), at);
      else {
        paid = sellTo(state, clan.id, amount, at);
        addStanding(state, clan.id, STANDING.trade, at);
      }
    }
    nectar += paid;
    stops.push({
      drupelet: id,
      clan: clan.id,
      sold: amount > 0 ? { [clan.wants]: amount } : {},
      nectar: paid,
      ...(v.gift && amount > 0 ? { gift: true } : {}),
    });
  }
  state.orchard.visits++;
  if (units.length) recordBestiary(state, units, at);
  // The trading post: founded on the first stop, then kiwis left there or brought home.
  let founded = false;
  const refund = { nectar: 0, crystal: 0, iron: 0 };
  if (v.settle) {
    const first = map.byId.get(v.stops[0]!)!;
    const post = state.orchard.post;
    const can =
      (post?.ruined && post.drupelet === first.id) ||
      attitudeOf(state, first.clan, at) === 'friendly' ||
      state.orchard.taken[first.id] !== undefined;
    if (can && (!post || post.ruined)) {
      foundPost(state, first.id, at);
      founded = true;
    } else {
      // Nobody would have us there any more: what was paid comes home.
      const cost = postCost(state);
      Object.assign(refund, cost);
    }
  }
  const post = state.orchard.post;
  if (post && !post.ruined && v.stops.includes(post.drupelet)) {
    if (v.stay?.length) {
      const stay = new Set(v.stay);
      for (const m of members) if (stay.has(m.id)) m.job = { kind: 'post', returnTo: null };
      e.crew = e.crew.filter((id) => !stay.has(id));
    }
    if (v.bringBack?.length) {
      for (const k of state.villagers)
        if (v.bringBack.includes(k.id) && k.job.kind === 'post') {
          k.job = { kind: 'expedition', expeditionId: e.id };
          e.crew.push(k.id);
          e.roster.push({
            id: k.id,
            name: k.name,
            level: k.level,
            shiny: k.shiny,
            classId: k.classId,
          });
        }
    }
    // The store's whole units sail home (the crumbs stay).
    const store = postStore(post);
    nectar += store;
    post.store = Math.max(0, post.store - store * NECTAR_SCALE);
  }
  // Unsold goods sail home with the ship.
  const loot = emptyResources();
  for (const r of RESOURCE_IDS) loot[r] = goods[r];
  e.result = {
    victory: true,
    strength: members.length,
    defense: 0,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: [],
    lostOnReturn: [],
    loot,
    stops,
    ...(nectar + refund.nectar > 0 ? { nectar: nectar + refund.nectar } : {}),
    ...(refund.crystal > 0 ? { crystal: refund.crystal } : {}),
    ...(refund.iron > 0 ? { iron: refund.iron } : {}),
    ...(founded ? { postFounded: true } : {}),
  };
  settleVoyage(state, e);
}

function resolvePillage(
  state: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
  seed: string,
): void {
  const at = e.arriveAt;
  const map = raspberryOfState(state);
  const d = map.byId.get(e.voyage!.stops[0]!)!;
  const truth = drupeletNow(state, seed, d, at);
  const help = d.links
    .map((id) => map.byId.get(id)!)
    .filter((x) => x.clan === d.clan)
    .map((x) => drupeletNow(state, seed, x, at).units);
  const battleSeed = `${seed}/pillage/${e.id}`;
  const setup = fruitSetup(state, members, {
    units: truth.units,
    help,
    orders: e.orders ?? LANDING.defaultOrders,
    fed,
    seed: battleSeed,
  });
  const log: BattleLog = simulateBattle(setup, battleSeed);
  const outcome = landingOutcome(log);
  const crewIds = new Set(members.map((v) => v.id as string));
  const fallen = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  // Chantier 46's rule: a field won brings its fallen home wounded; elsewhere they die there.
  const dead = outcome === 'victory' ? [] : fallen;
  const hurt = outcome === 'victory' ? fallen : [];
  removeVillagers(state, dead, 'battle', at, true);
  e.crew = e.crew.filter((id) => !dead.includes(id));
  // Whatever happens, the clan (and the clans next to it) will remember it.
  pillageStanding(state, d.clan, at);
  let nectar = 0;
  const view = {
    at,
    units: truth.units.map((u) => ({ ...u })),
    nectar: truth.nectar,
    nest: truth.nest,
  };
  if (outcome === 'victory') {
    nectar = truth.nectar;
    state.orchard.taken[d.id] = at;
    state.orchard.views[d.id] = { ...view, source: 'pillage', nectar: 0 };
  } else if (outcome === 'retreat') state.orchard.views[d.id] = { ...view, source: 'retreat' };
  if (outcome !== 'defeat') recordBestiary(state, truth.units, at);
  state.orchard.visits++;
  e.result = {
    victory: outcome === 'victory',
    strength: members.length,
    defense: setup.units.filter((u) => u.side === 0).length,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: dead.map((id) => members.find((v) => v.id === id)?.name ?? id),
    lostOnReturn: [],
    loot: emptyResources(),
    outcome,
    log,
    injured: hurt,
    ...(outcome !== 'defeat' ? { seen: truth.units.map((u) => ({ ...u })) } : {}),
    ...(nectar > 0 ? { nectar } : {}),
  };
  if (e.crew.length === 0) {
    // Nobody to sail the ship home: it is lost, the launchpad builds a new one (a repair).
    const pad = launchpadOf(state, e.launchpadId);
    if (pad) pad.damaged = true;
  }
  settleVoyage(state, e);
}

/** After the arrival: home with whoever is aboard, or done when nobody is. */
function settleVoyage(state: GameState, e: Expedition): void {
  if (e.crew.length === 0) {
    e.status = 'done';
    const done = state.expeditions.filter((x) => x.status === 'done');
    if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
  } else e.status = 'returning';
}

/** Voyages this side can resolve (online: the server holds the orchard's seed). */
export function canResolveVoyage(state: GameState): boolean {
  return state.orchardSeed !== undefined;
}
