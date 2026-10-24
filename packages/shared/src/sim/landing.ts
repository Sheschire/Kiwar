import { CIV } from '../data/aliens';
import { alienDefOf, EXPEDITIONS, INTEL, shipIdForAge } from '../data/expeditions';
import { LANDING, LANDING_GOALS, LANDING_PRIORITIES, type LandingOrders } from '../data/landing';
import { emptyResources, RESOURCE_IDS } from '../data/resources';
import { POSTURES } from '../data/units';
import { SKILLS } from '../data/classes';
import { simulateBattle } from '../battle/simulate';
import {
  landingOutcome,
  landingSetup,
  type LandingHelp,
  type LandingOutcome,
} from '../battle/landing';
import type { BattleLog } from '../battle/types';
import type { TimeMs, VillagerId } from '../types/ids';
import {
  civAgeOfHours,
  civAt,
  civBuildings,
  civOf,
  growthOfHours,
  isInner,
  liveCiv,
  neighbourSectors,
  recordBurn,
  recordDefeat,
  recordFight,
  scheduleGrowth,
  scheduleHours,
  sectorUnits,
  standingBarracks,
  type AlienBuilding,
  type AlienUnit,
} from './civ';
import { ageOf } from './research';
import type {
  AlienGarrison,
  Expedition,
  FaceView,
  GameState,
  IntelRange,
  ParcelView,
  Villager,
} from './state';
import { crewMembers, crewWeight, lootByAge, removeVillagers, type Odds } from './expeditions';
import { getBuilding } from './selectors';
import { emergeQueen } from './queen';

/**
 * Chantier 40: the landing on a parcel of an alien face. The battle is played where the truth is
 * held (the server online, the client in solo); what the crew saw becomes public: a beacon after
 * a victory (the parcel stays in sight, refreshed every game day, with the edge of its
 * neighbours), a dated glimpse after a retreat, nothing after a defeat (the fog comes back).
 */

const round1 = (v: number) => Math.round(v * 10) / 10;
const NO_VIEW: FaceView = { beacons: [], parcels: {} };

// --- Public views ------------------------------------------------------------------------------

export function faceViewOf(state: Pick<GameState, 'faceViews'>, targetId: string): FaceView {
  return state.faceViews[targetId] ?? NO_VIEW;
}

export function liveFaceView(state: GameState, targetId: string): FaceView {
  state.faceViews[targetId] ??= { beacons: [], parcels: {} };
  return state.faceViews[targetId];
}

/** Parcels under our beacons on a face. */
export function beaconsOf(state: Pick<GameState, 'faceViews'>, targetId: string): number[] {
  return faceViewOf(state, targetId).beacons.map((b) => b.sector);
}

export function parcelView(
  state: Pick<GameState, 'faceViews'>,
  targetId: string,
  sector: number,
): ParcelView | null {
  return faceViewOf(state, targetId).parcels[String(sector)] ?? null;
}

export type ViewFreshness = 'live' | 'fresh' | 'stale' | 'old';

/** How old a parcel view is (a beacon's view is live). */
export function viewFreshness(view: ParcelView, now: TimeMs): ViewFreshness {
  if (view.source === 'beacon') return 'live';
  const days = (now - view.at) / CIV.tickMs;
  return days <= LANDING.fresh ? 'fresh' : days <= LANDING.stale ? 'stale' : 'old';
}

// --- Orders and locks --------------------------------------------------------------------------

export function validOrders(o: LandingOrders | undefined): o is LandingOrders {
  if (!o) return false;
  const r = LANDING.retreat;
  return (
    POSTURES.includes(o.posture) &&
    LANDING_PRIORITIES.includes(o.priority) &&
    LANDING_GOALS.includes(o.goal) &&
    Number.isFinite(o.retreatAt) &&
    o.retreatAt >= r.min - 1e-9 &&
    o.retreatAt <= r.max + 1e-9
  );
}

export type LandingLock = 'notASector' | 'beaconHere' | 'invalidOrders' | 'landingThere';

/** Why a landing cannot go to this parcel (the target is checked by the command). */
export function landingLock(
  state: GameState,
  targetId: string,
  sector: number | undefined,
  orders: LandingOrders | undefined,
): LandingLock | null {
  if (sector === undefined || !Number.isInteger(sector) || sector < 0 || sector >= INTEL.sectors)
    return 'notASector';
  if (beaconsOf(state, targetId).includes(sector)) return 'beaconHere';
  if (
    state.expeditions.some(
      (e) =>
        e.mission === 'land' &&
        e.status === 'outbound' &&
        e.targetId === targetId &&
        e.sector === sector,
    )
  )
    return 'landingThere';
  if (!validOrders(orders)) return 'invalidOrders';
  return null;
}

/**
 * A local save imported online: nobody can check its beacons and glimpses, nor the landings in
 * flight (their crews come home at once).
 */
export function resetLandings(s: GameState): void {
  // Chantier 42: the guards of the beacons and their ships too.
  const flying = new Set(
    s.expeditions
      .filter((e) => ['land', 'guard', 'retreat'].includes(e.mission) && e.status !== 'done')
      .map((e) => e.id),
  );
  for (const v of s.villagers)
    if (v.job.kind === 'outpost' || (v.job.kind === 'expedition' && flying.has(v.job.expeditionId)))
      v.job = { kind: 'idle' };
  s.expeditions = s.expeditions.filter((e) => !flying.has(e.id));
  s.faceViews = {};
}

// --- The truth (only where it is held) ---------------------------------------------------------

export interface ParcelTruth {
  age: number;
  power: number;
  units: AlienUnit[];
  /** Every building of the face (the field takes those it covers). */
  buildings: AlienBuilding[];
  help: LandingHelp[];
}

/** The garrison and the buildings of a parcel, and the help its neighbouring barracks send. */
export function parcelTruth(
  state: GameState,
  g: AlienGarrison,
  targetId: string,
  sector: number,
  at: TimeMs,
): ParcelTruth {
  const civ = civOf(g);
  const view = civAt(g, at, civ);
  const s = view.sectors[sector]!;
  const beacons = beaconsOf(state, targetId);
  const barracks = new Set(standingBarracks(civ, at, beacons).map((k) => k.sector));
  const help: LandingHelp[] = [];
  for (const n of neighbourSectors(sector)) {
    if (!barracks.has(n)) continue;
    const other = view.sectors[n]!;
    const units = sectorUnits(
      { ...other, power: other.power * LANDING.reinforce.share },
      g.ferretShare,
    );
    if (units.length > 0) help.push({ from: n, units });
  }
  return {
    age: s.age,
    power: s.power,
    units: sectorUnits(s, g.ferretShare),
    buildings: civBuildings(g, civ, view, at),
    help,
  };
}

export function viewOfTruth(
  truth: Pick<ParcelTruth, 'age' | 'power' | 'units' | 'buildings'>,
  sector: number,
  at: TimeMs,
  source: ParcelView['source'],
): ParcelView {
  return {
    at,
    source,
    age: truth.age,
    power: { min: truth.power, max: truth.power },
    units: truth.units.map((u) => ({ ...u })),
    buildings: truth.buildings.filter((b) => b.sector === sector).map((b) => ({ ...b })),
  };
}

/**
 * Our beacons look at their parcels (the garrison, its gear, the buildings) and at the edge of
 * the neighbouring ones (their buildings, their garrison within a range). Truth needed.
 */
export function refreshBeacons(state: GameState, targetId: string, at: TimeMs): void {
  const face = state.faceViews[targetId];
  const g = state.aliens?.[targetId];
  if (!face || face.beacons.length === 0 || !g) return;
  const civ = civOf(g);
  const view = civAt(g, at, civ);
  const buildings = civBuildings(g, civ, view, at);
  const lit = new Set(face.beacons.map((b) => b.sector));
  for (const b of face.beacons) {
    const s = view.sectors[b.sector]!;
    face.parcels[String(b.sector)] = viewOfTruth(
      { age: s.age, power: s.power, units: sectorUnits(s, g.ferretShare), buildings },
      b.sector,
      at,
      'beacon',
    );
  }
  for (const sector of lit)
    for (const n of neighbourSectors(sector)) {
      if (lit.has(n)) continue;
      const old = face.parcels[String(n)];
      // A glimpse of the battle says more than the edge: it stays until it is older.
      if (old && old.source !== 'edge' && old.source !== 'report' && old.at >= at - CIV.tickMs)
        continue;
      const s = view.sectors[n]!;
      const spread = LANDING.edgeSpread;
      face.parcels[String(n)] = {
        at,
        source: 'edge',
        age: s.age,
        power: { min: round1(s.power * (1 - spread)), max: round1(s.power * (1 + spread)) },
        units: [],
        buildings: buildings.filter((x) => x.sector === n).map((x) => ({ ...x })),
      };
    }
}

/** The bestiary keeps every kind met: its best level and gear, how many were seen. */
export function recordBestiary(state: GameState, units: readonly AlienUnit[], at: TimeMs): void {
  for (const u of units) {
    const old = state.bestiary[u.kind];
    const better = (a: string | undefined, b: string | undefined) =>
      (b ?? '') > (a ?? '') ? b : a;
    state.bestiary[u.kind] = {
      level: Math.max(old?.level ?? 0, u.level),
      ...(better(old?.weapon, u.weapon) ? { weapon: better(old?.weapon, u.weapon) } : {}),
      ...(better(old?.armor, u.armor) ? { armor: better(old?.armor, u.armor) } : {}),
      seen: (old?.seen ?? 0) + u.count,
      firstAt: old?.firstAt ?? at,
      lastAt: at,
    } as GameState['bestiary'][typeof u.kind];
  }
}

/** Units of several groups merged by kind, level and gear (what the report shows). */
export function mergeUnits(groups: readonly AlienUnit[][]): AlienUnit[] {
  const out: AlienUnit[] = [];
  for (const g of groups)
    for (const u of g) {
      const same = out.find(
        (x) =>
          x.kind === u.kind && x.level === u.level && x.weapon === u.weapon && x.armor === u.armor,
      );
      if (same) same.count += u.count;
      else out.push({ ...u });
    }
  return out;
}

// --- The landing ------------------------------------------------------------------------------

/** The ship lands: the battle is played, then a beacon, a glimpse or nothing comes of it. */
export function resolveLanding(
  state: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
): void {
  const g = state.aliens?.[e.targetId];
  if (!g || e.sector === undefined || !e.orders) throw new Error('resolveLanding: hidden garrison');
  const sector = e.sector;
  const at = e.arriveAt;
  const truth = parcelTruth(state, g, e.targetId, sector, at);
  const setup = landingSetup(state, members, {
    sector,
    units: truth.units,
    help: truth.help,
    buildings: truth.buildings,
    orders: e.orders,
    fed,
  });
  const log: BattleLog = simulateBattle(setup, `${g.seed}/land/${e.id}`);
  const outcome = landingOutcome(log);
  const crewIds = new Set(members.map((v) => v.id as string));
  const dead = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  const deadKiwis = crewMembers(state, dead);
  const gearPieces = deadKiwis.reduce(
    (n, v) => n + (v.gear?.weapon ? 1 : 0) + (v.gear?.armor ? 1 : 0),
    0,
  );
  // The field held keeps the gear of the fallen; a retreat or a defeat leaves it to the aliens.
  removeVillagers(state, dead, 'battle', at, outcome !== 'victory');
  e.crew = e.crew.filter((id) => !dead.includes(id));

  const civ = liveCiv(g);
  const defenders = setup.units.filter((u) => u.side === 0).length;
  const close = defenders > 0 ? log.result.fallen.length / defenders : 0;
  recordFight(
    civ,
    sector,
    at,
    outcome === 'victory' ? CIV.fightLoss.victory : CIV.fightLoss.defeat * close,
  );
  const seen = mergeUnits([truth.units, ...truth.help.map((h) => h.units)]);
  const face = liveFaceView(state, e.targetId);
  const goal = e.orders.goal;
  const loot = emptyResources();
  let burnt = false;
  let queenOut = false;
  if (outcome === 'victory') {
    state.victories[e.targetId] = (state.victories[e.targetId] ?? 0) + 1;
    if (goal === 'burn') {
      recordBurn(civ, sector, at);
      burnt = true;
    }
    face.beacons.push({ sector, since: at });
    face.beacons.sort((a, b) => a.sector - b.sector);
    refreshBeacons(state, e.targetId, at);
    // Chantier 42: the twin's last beacon brings the queen out of the depths.
    queenOut = emergeQueen(state, e.targetId, at);
    recordBestiary(state, seen, at);
    // Loot: the face's stores × the age, the centre richer, much more when looting.
    const survivors = crewMembers(state, e.crew);
    const ranger = survivors.some((v) => v.classId === 'ranger') ? SKILLS.rangerLoot : 1;
    const k =
      LANDING.loot[goal] * (isInner(sector) ? LANDING.loot.inner : 1) * lootByAge(state) * ranger;
    const w = EXPEDITIONS.resourceWeight;
    let room =
      e.cargo -
      crewWeight(survivors) -
      RESOURCE_IDS.reduce((sum, id) => sum + e.provisions[id], 0) * w;
    for (const id of ['seeds', 'juice', 'fiber', 'pulp'] as const) {
      const take = Math.max(0, Math.min(Math.floor(g.loot[id] * k), Math.floor(room / w + 1e-9)));
      loot[id] = take;
      room -= take * w;
    }
  } else if (outcome === 'retreat') {
    face.parcels[String(sector)] = viewOfTruth(truth, sector, at, 'retreat');
    recordBestiary(state, seen, at);
    if (dead.length > 0)
      recordDefeat(civ, at, dead.length, sector, gearPieces * LANDING.defeat.gearH);
  } else {
    // Nobody came back: the fog comes back over the parcel, the ship is theirs.
    delete face.parcels[String(sector)];
    recordDefeat(
      civ,
      at,
      dead.length,
      sector,
      LANDING.defeat.shipH + gearPieces * LANDING.defeat.gearH,
    );
    const pad = getBuilding(state, e.launchpadId);
    if (pad) {
      pad.damaged = true;
      pad.shipLost = shipIdForAge(ageOf(state));
    }
  }
  e.result = {
    victory: outcome === 'victory',
    outcome,
    strength: members.length,
    defense: truth.power,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: dead.map((id) => e.roster.find((r) => r.id === id)?.name ?? id),
    lostOnReturn: [],
    loot,
    sector,
    log,
    ...(burnt ? { burnt: true } : {}),
    ...(queenOut ? { queenOut: true } : {}),
    ...(outcome === 'victory' ? { beacon: true } : {}),
    ...(outcome !== 'defeat' ? { seen } : { shipLost: true }),
  };
  if (outcome === 'defeat') {
    e.status = 'done';
    e.provisions = emptyResources();
    const done = state.expeditions.filter((x) => x.status === 'done');
    if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
  } else e.status = 'returning';
}

// --- The forecast (public data only) -----------------------------------------------------------

export type Knowledge = 'seen' | 'edge' | 'guess' | 'formidable';

export interface LandingForecast {
  knowledge: Knowledge;
  /** The view it rests on (null: a guess from the public numbers, or nothing). */
  view: ParcelView | null;
  /** The garrison as estimated today (null: formidable, unknown). */
  power: IntelRange | null;
  age: number | null;
  odds: Odds;
  /** Kiwis expected to fall in the middle practice battle. */
  expectedDead: number;
  /** Outcomes of the practice battles, weakest garrison first. */
  trials: LandingOutcome[];
  /** Chantier 42, the final battle: share of the queen's strength left after the middle trial. */
  queenLeft?: number;
}

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number }>();

function practice(
  state: GameState,
  crew: readonly Villager[],
  sector: number,
  units: AlienUnit[],
  buildings: AlienBuilding[],
  orders: LandingOrders,
  fed: number,
  seed: string,
): { outcome: LandingOutcome; dead: number } {
  const setup = landingSetup(state, crew, { sector, units, help: [], buildings, orders, fed });
  const key = JSON.stringify([setup.units, setup.buildings, setup.orders, seed]);
  const hit = trialCache.get(key);
  if (hit) return hit;
  const log = simulateBattle(setup, seed);
  const out = { outcome: landingOutcome(log), dead: log.result.lost?.length ?? 0 };
  if (trialCache.size > 32) trialCache.delete(trialCache.keys().next().value!);
  trialCache.set(key, out);
  return out;
}

/** Units of a view scaled by a factor (the garrison has grown, or luck). */
function scaled(units: readonly AlienUnit[], k: number): AlienUnit[] {
  return units.map((u) => ({ ...u, count: Math.max(1, Math.round(u.count * k)) }));
}

/**
 * The honest forecast: three practice battles against what we know of the parcel (what a
 * battle or a beacon showed, grown on the public schedule; the edge seen from a beacon; the
 * public numbers for an unseen edge parcel). An unseen centre parcel is "formidable", no number.
 */
export function landingForecast(
  state: GameState,
  targetId: string,
  sector: number,
  crew: readonly Villager[],
  orders: LandingOrders,
  fed: number,
  now: TimeMs,
): LandingForecast {
  const target = state.targets.find((t) => t.id === targetId);
  const distance = target?.distance ?? 0;
  const view = parcelView(state, targetId, sector);
  const inner = isInner(sector);
  const none: LandingForecast = {
    knowledge: 'formidable',
    view: null,
    power: null,
    age: null,
    odds: 'unknown',
    expectedDead: 0,
    trials: [],
  };
  if (!view && inner) return none;
  const growth = view ? scheduleGrowth(state, distance, view.at, now) : 1;
  let knowledge: Knowledge;
  let power: IntelRange;
  let age: number;
  let armies: AlienUnit[][];
  const buildings = view?.buildings ?? [];
  if (view && view.units.length > 0) {
    knowledge = 'seen';
    const p = view.power.max * growth;
    power = { min: round1(p * LANDING.trials[0]!), max: round1(p * LANDING.trials[2]!) };
    age = view.age;
    armies = LANDING.trials.map((k) => scaled(view.units, growth * k));
  } else {
    const hours = scheduleHours(state, distance, now);
    age = view ? view.age : civAgeOfHours(hours);
    if (view) {
      knowledge = 'edge';
      power = { min: round1(view.power.min * growth), max: round1(view.power.max * growth) };
    } else {
      knowledge = 'guess';
      const base = alienDefOf(distance).defense * growthOfHours(hours);
      power = { min: round1(base * LANDING.guess[0]), max: round1(base * LANDING.guess[1]) };
    }
    const at = [power.min, (power.min + power.max) / 2, power.max];
    armies = at.map((p) => sectorUnits({ sector, inner, age, power: p }, 0.5));
  }
  if (crew.length === 0)
    return { knowledge, view, power, age, odds: 'unknown', expectedDead: 0, trials: [] };
  const runs = armies.map((units, i) =>
    practice(
      state,
      crew,
      sector,
      units,
      buildings,
      orders,
      fed,
      `${targetId}/trial/${sector}/${i}`,
    ),
  );
  const won = runs.map((r) => r.outcome === 'victory');
  const odds: Odds = won[2] ? 'likely' : won[1] || won[0] ? 'uncertain' : 'unlikely';
  return {
    knowledge,
    view,
    power,
    age,
    odds,
    expectedDead: runs[1]!.dead,
    trials: runs.map((r) => r.outcome),
  };
}
