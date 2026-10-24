import { CIV } from '../data/aliens';
import { BEACONS } from '../data/beacons';
import { levelDef } from '../data/buildings';
import { alienDefOf, INTEL } from '../data/expeditions';
import { LANDING, type LandingOrders } from '../data/landing';
import { emptyResources, RESOURCE_IDS, type Resources } from '../data/resources';
import { beaconHeld, beaconSetup } from '../battle/beacon';
import { simulateBattle } from '../battle/simulate';
import { createRng } from '../rng/rng';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import {
  civAgeOfHours,
  civAt,
  civHash,
  civOf,
  growthOfHours,
  liveCiv,
  neighbourSectors,
  recordDefeat,
  recordFight,
  royalSector,
  scheduleGrowth,
  scheduleHours,
  sectorUnits,
  standingBarracks,
  type AlienUnit,
} from './civ';
import { crewMembers, rations, removeVillagers, type Odds } from './expeditions';
import { validOrders } from './landing';
import { ageOf } from './research';
import {
  nextId,
  type AlienGarrison,
  type Beacon,
  type BeaconAttack,
  type Expedition,
  type ExpeditionTarget,
  type FaceView,
  type GameState,
  type IntelRange,
  type Villager,
} from './state';

/**
 * Chantier 42: attacks on our beacons (see `data/beacons.ts`). The time of the next attack on a
 * face is public (hashed from the face, planned at the loop top like a wave); which beacon, from
 * which parcel and how strong is the civilisation's choice, made only where the truth is held
 * (the server online, the client in solo): the announcement and the strike wait for it.
 */

const HOUR = 3_600_000;
const round1 = (v: number) => Math.round(v * 10) / 10;

function beaconAt(face: FaceView | undefined, sector: number): Beacon | undefined {
  return face?.beacons.find((b) => b.sector === sector);
}

/** Our beacon on a parcel of a face (undefined: none). */
export function beaconOf(
  state: Pick<GameState, 'faceViews'>,
  targetId: string,
  sector: number,
): Beacon | undefined {
  return beaconAt(state.faceViews[targetId], sector);
}

/** The kiwis guarding a beacon. */
export function guardsOf(state: GameState, b: Pick<Beacon, 'guards'>): Villager[] {
  return crewMembers(state, b.guards ?? []);
}

/** Every kiwi guarding a beacon of a face. */
export function allGuards(state: GameState, targetId: string): Villager[] {
  return (state.faceViews[targetId]?.beacons ?? []).flatMap((b) => guardsOf(state, b));
}

/** The face can be attacked: a civilisation lives there (not a conquered twin). */
function attackable(state: GameState, t: ExpeditionTarget): boolean {
  return !(t.distance === 0 && state.siege.conqueredAt > 0);
}

/** When the civilisation of a face reaches the age of the attacks on the public schedule. */
export function attacksFrom(state: Pick<GameState, 'createdAt'>, distance: number): TimeMs {
  const hours = Math.max(0, CIV.ageAtH[BEACONS.minCivAge]! - distance * CIV.leadPerDistanceH);
  return state.createdAt + hours * HOUR;
}

// --- Planning (public) -------------------------------------------------------------------------

/** Plans the next attack on every face where we hold beacons (no draw from the colony's RNG). */
export function planBeaconAttacks(s: GameState): void {
  for (const t of s.targets) {
    const face = s.faceViews[t.id];
    if (!face || face.beacons.length === 0 || face.attack || !attackable(s, t)) continue;
    const n = face.attacks ?? 0;
    const since = Math.min(...face.beacons.map((b) => b.since));
    const base = Math.max(face.lastAttackAt ?? 0, since, attacksFrom(s, t.distance));
    const rng = createRng(`${s.seed}/${t.id}/beacon/${n}`);
    const [lo, hi] = BEACONS.attack.intervalMs;
    const at = base + Math.round(rng.range(lo, hi) / 60_000) * 60_000;
    face.attack = {
      id: `ba${n + 1}`,
      sector: null,
      origin: null,
      announceAt: at - BEACONS.attack.noticeMs,
      at,
      announced: false,
    };
  }
}

/** Next beacon event: a fortification done, an announcement or a strike (those with the truth). */
export function nextBeaconEvent(s: GameState): TimeMs {
  let next = Infinity;
  for (const [id, face] of Object.entries(s.faceViews)) {
    for (const b of face.beacons) if (b.fortifying) next = Math.min(next, b.fortifying.until);
    const a = face.attack;
    if (!a || !s.aliens?.[id]) continue;
    next = Math.min(next, a.announced ? a.at : a.announceAt);
  }
  return Math.max(s.now, next);
}

/** An attack is due and only the server can tell what it does. */
export function beaconAwaited(s: GameState, now: TimeMs): boolean {
  return Object.entries(s.faceViews).some(
    ([id, f]) => !!f.attack && !s.aliens?.[id] && dueAt(f.attack) <= now,
  );
}

const dueAt = (a: BeaconAttack) => (a.announced ? a.at : a.announceAt);

/** Times of the attacks due by `now` (the server resolves them on `load`). */
export function beaconsDue(s: GameState, now: TimeMs): TimeMs[] {
  return Object.values(s.faceViews)
    .map((f) => (f.attack ? dueAt(f.attack) : Infinity))
    .filter((at) => at <= now);
}

export function beaconTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const [id, face] of Object.entries(s.faceViews)) {
    for (const b of face.beacons) {
      if (!b.fortifying || b.fortifying.until > at) continue;
      b.fort = b.fortifying.level;
      delete b.fortifying;
      events.push({ type: 'beaconFortified', at, targetId: id, sector: b.sector });
    }
    const g = s.aliens?.[id];
    const a = face.attack;
    if (!g || !a) continue;
    if (!a.announced && a.announceAt <= at) announce(s, id, g, face, a, at, events);
    else if (a.announced && a.at <= at) strike(s, id, g, face, a, at, events);
  }
}

/** The civilisation picks the beacon closest to its barracks, and the parcel it comes from. */
function announce(
  s: GameState,
  targetId: string,
  g: AlienGarrison,
  face: FaceView,
  a: BeaconAttack,
  at: TimeMs,
  events: GameEvent[],
): void {
  const civ = civOf(g);
  const view = civAt(g, at, civ);
  const held = face.beacons.map((b) => b.sector);
  if (view.age < BEACONS.minCivAge || held.length === 0) {
    // Not yet (our burns kept it young): the next attack is planned from now.
    face.attack = null;
    face.lastAttackAt = at;
    return;
  }
  const barracks = new Set(standingBarracks(civ, at, held).map((k) => k.sector));
  const score = (sector: number) => {
    const free = neighbourSectors(sector).filter((n) => !held.includes(n));
    return (
      (free.some((n) => barracks.has(n)) ? 4 : 0) +
      (free.length > 0 ? 2 : 0) +
      civHash(g.seed, `beacon/${targetId}/${a.id}/${sector}`)
    );
  };
  const sector = held.reduce((best, x) => (score(x) > score(best) ? x : best));
  const free = neighbourSectors(sector).filter((n) => !held.includes(n));
  const power = (x: number) => view.sectors[x]?.power ?? 0;
  let origin: number;
  const near = free.filter((n) => barracks.has(n));
  if (near.length > 0) origin = near.reduce((p, x) => (power(x) > power(p) ? x : p));
  else if (free.length > 0) origin = free.reduce((p, x) => (power(x) > power(p) ? x : p));
  else if (barracks.size > 0) origin = Math.min(...barracks);
  // Every parcel around is ours: they come up through the queen's tunnels.
  else origin = royalSector(g);
  a.sector = sector;
  a.origin = origin;
  a.announced = true;
  events.push({ type: 'beaconAttackAnnounced', at, targetId, sector, strikeAt: a.at });
}

/** The attackers' army: the parcel they come from × the share drawn × the escalation. */
function attackArmy(
  g: AlienGarrison,
  face: FaceView,
  a: BeaconAttack,
  at: TimeMs,
): { units: AlienUnit[]; power: number } {
  const view = civAt(g, at);
  const parcel = view.sectors[a.origin!]!;
  const [lo, hi] = BEACONS.attack.share;
  const share = lo + (hi - lo) * civHash(g.seed, `beacon/${a.id}/share/${face.attacks ?? 0}`);
  const power = round1(parcel.power * share * escalation(face.attacks ?? 0));
  return { units: sectorUnits({ ...parcel, power }, g.ferretShare), power };
}

/** Attacks grow stronger, one after the other. */
export function escalation(attacks: number): number {
  const A = BEACONS.attack;
  return Math.min(A.maxEscalation, 1 + A.perAttack * attacks);
}

function strike(
  s: GameState,
  targetId: string,
  g: AlienGarrison,
  face: FaceView,
  a: BeaconAttack,
  at: TimeMs,
  events: GameEvent[],
): void {
  face.attack = null;
  face.attacks = (face.attacks ?? 0) + 1;
  face.lastAttackAt = at;
  const b = a.sector === null ? undefined : beaconAt(face, a.sector);
  if (!b || a.origin === null) return;
  const sector = b.sector;
  const army = attackArmy(g, face, a, at);
  const guards = guardsOf(s, b);
  const fort = b.fort ?? 0;
  let held = false;
  let fought = false;
  let dead: VillagerId[] = [];
  let fled: VillagerId[] = [];
  let log = undefined as Parameters<typeof beaconHeld>[0] | undefined;
  const civ = liveCiv(g);
  if (guards.length > 0 || fort > 0) {
    fought = true;
    const setup = beaconSetup(s, guards, {
      sector,
      origin: a.origin,
      attackers: army.units,
      buildings: face.parcels[String(sector)]?.buildings ?? [],
      orders: b.orders ?? LANDING.defaultOrders,
      fort,
    });
    log = simulateBattle(setup, `${g.seed}/beacon/${targetId}/${a.id}`);
    held = beaconHeld(log);
    const ids = new Set(guards.map((v) => v.id as string));
    dead = log.result.fallen.filter((ref) => ids.has(ref)) as VillagerId[];
    fled = log.result.fled.filter((ref) => ids.has(ref)) as VillagerId[];
    const attackers = log.result.attackers;
    // The attackers who fell are missing from their parcel for a while.
    recordFight(
      civ,
      a.origin,
      at,
      CIV.fightLoss.defeat * (attackers.total > 0 ? attackers.fallen / attackers.total : 0),
    );
  }
  const names = new Map(guards.map((v) => [v.id, v.name]));
  const gear = crewMembers(s, dead).reduce(
    (n, v) => n + (v.gear?.weapon ? 1 : 0) + (v.gear?.armor ? 1 : 0),
    0,
  );
  removeVillagers(s, dead, 'battle', at, !held);
  let back = 0;
  if (held) {
    // Those who ran to the ship fly home; the others stay on guard.
    b.guards = (b.guards ?? []).filter((id) => !dead.includes(id) && !fled.includes(id));
    if (fled.length > 0) sendHome(s, targetId, fled, at, sector);
    back = fled.length;
  } else {
    // The beacon falls: the fog comes back over the parcel, the survivors fly home.
    const survivors = (b.guards ?? []).filter((id) => !dead.includes(id));
    face.beacons = face.beacons.filter((x) => x !== b);
    delete face.parcels[String(sector)];
    if (survivors.length > 0) sendHome(s, targetId, survivors, at, sector);
    back = survivors.length;
    if (dead.length > 0 || fought)
      recordDefeat(civ, at, dead.length, sector, gear * LANDING.defeat.gearH);
  }
  face.reports = [
    ...(face.reports ?? []),
    {
      id: a.id,
      at,
      sector,
      origin: a.origin,
      held,
      fought,
      power: army.power,
      dead: dead.map((id) => names.get(id) ?? id),
      back,
      ...(log ? { log } : {}),
    },
  ].slice(-BEACONS.reports);
  events.push({ type: 'beaconAttacked', at, targetId, sector, held, fought, dead: dead.length });
}

/** Guards flying home after a fall or a retreat (the colony's rations: no famine on the way). */
function sendHome(
  s: GameState,
  targetId: string,
  ids: VillagerId[],
  at: TimeMs,
  sector: number,
): void {
  const target = s.targets.find((t) => t.id === targetId);
  const travelMs = target?.travelMs ?? 0;
  const members = crewMembers(s, ids);
  const need = rations(s, members, travelMs);
  const id = nextId(s, 'x');
  for (const v of members) v.job = { kind: 'expedition', expeditionId: id };
  const e: Expedition = {
    id,
    mission: 'retreat',
    targetId,
    launchpadId: 'none' as BuildingId,
    crew: [...ids],
    roster: members.map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
    })),
    provisions: { ...emptyResources(), pulp: need.pulp, juice: need.juice },
    cargo: 0,
    departedAt: at,
    arriveAt: at,
    returnAt: at + travelMs,
    status: 'returning',
    sector,
    result: {
      victory: false,
      strength: 0,
      defense: 0,
      fed: 1,
      lostInBattle: [],
      lostOnReturn: [],
      loot: emptyResources(),
    },
  };
  s.expeditions.push(e);
}

/** Kiwis removed from the colony are gone from their beacon too. */
export function forgetGuards(s: GameState, ids: readonly VillagerId[]): void {
  if (ids.length === 0) return;
  for (const face of Object.values(s.faceViews))
    for (const b of face.beacons)
      if (b.guards?.some((id) => ids.includes(id)))
        b.guards = b.guards.filter((id) => !ids.includes(id));
}

// --- Fortifying (from home) --------------------------------------------------------------------

/** Level of the turrets a fortification ordered now would have (the best of our age). */
export function fortLevel(state: GameState): number {
  return Math.min(12, BEACONS.fortify.levelsPerAge * (ageOf(state) + 1));
}

/** What fortifying a beacon costs now (resources and iron). */
export function fortifyCost(state: GameState): { resources: Resources; iron: number } {
  const level = fortLevel(state);
  const resources = emptyResources();
  let iron = 0;
  for (const type of ['seedTurret', 'skyTurret'] as const) {
    const def = levelDef(type, level);
    for (const r of RESOURCE_IDS)
      resources[r] += Math.round((def?.cost[r] ?? 0) * BEACONS.fortify.costFactor);
    iron += Math.round((def?.iron ?? 0) * BEACONS.fortify.costFactor);
  }
  return { resources, iron };
}

export type FortifyLock = 'notASector' | 'noBeacon' | 'fortifying' | 'alreadyFortified';

export function fortifyLock(
  state: GameState,
  targetId: string,
  sector: number,
): FortifyLock | null {
  if (!Number.isInteger(sector) || sector < 0 || sector >= INTEL.sectors) return 'notASector';
  const b = beaconOf(state, targetId, sector);
  if (!b) return 'noBeacon';
  if (b.fortifying) return 'fortifying';
  if ((b.fort ?? 0) >= fortLevel(state)) return 'alreadyFortified';
  return null;
}

/** Starts the fortification (paid by the command). */
export function startFortify(
  state: GameState,
  targetId: string,
  sector: number,
  now: TimeMs,
): void {
  const b = beaconOf(state, targetId, sector)!;
  b.fortifying = { until: now + BEACONS.fortify.durationMs, level: fortLevel(state) };
}

// --- Guards (mission `guard`) -----------------------------------------------------------------

export type GuardLock =
  'notASector' | 'noBeacon' | 'invalidCrew' | 'crewTooLarge' | 'invalidOrders';

/** Why a ship cannot take this guard to (or bring these guards back from) a beacon. */
export function guardLock(
  state: GameState,
  targetId: string,
  sector: number | undefined,
  crew: number,
  bringBack: readonly VillagerId[],
  orders: LandingOrders | undefined,
): GuardLock | null {
  if (sector === undefined || !Number.isInteger(sector) || sector < 0 || sector >= INTEL.sectors)
    return 'notASector';
  const b = beaconOf(state, targetId, sector);
  if (!b) return 'noBeacon';
  if (new Set(bringBack).size !== bringBack.length) return 'invalidCrew';
  if (bringBack.some((id) => !(b.guards ?? []).includes(id))) return 'invalidCrew';
  if (crew === 0 && bringBack.length === 0) return 'invalidCrew';
  if ((b.guards?.length ?? 0) - bringBack.length + crew > BEACONS.maxGuards) return 'crewTooLarge';
  if (orders !== undefined && !validOrders(orders)) return 'invalidOrders';
  return null;
}

/** The guard ship lands by the beacon: the crew takes its post, the relieved board. */
export function landGuard(state: GameState, e: Expedition, members: Villager[], fed: number): void {
  e.status = 'returning';
  const b = e.sector === undefined ? undefined : beaconOf(state, e.targetId, e.sector);
  const base = {
    victory: false,
    strength: 0,
    defense: 0,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: [],
    lostOnReturn: [],
    loot: emptyResources(),
  };
  if (!b) {
    // The beacon fell meanwhile: everybody comes back.
    e.result = { ...base, aborted: true };
    return;
  }
  for (const v of members) v.job = { kind: 'outpost', sector: b.sector, targetId: e.targetId };
  b.guards = [...(b.guards ?? []), ...members.map((v) => v.id)];
  if (e.orders) b.orders = { ...e.orders };
  const back = (e.bringBack ?? []).filter(
    (id) => b.guards!.includes(id) && !members.some((v) => v.id === id),
  );
  b.guards = b.guards.filter((id) => !back.includes(id));
  for (const v of crewMembers(state, back)) {
    v.job = { kind: 'expedition', expeditionId: e.id };
    e.roster.push({ id: v.id, name: v.name, level: v.level, shiny: v.shiny, classId: v.classId });
  }
  e.crew = back;
  e.result = base;
}

// --- Forecast (public) -------------------------------------------------------------------------

export interface BeaconForecast {
  /** The attackers as estimated (power range), from what we see of their parcel. */
  power: IntelRange;
  odds: Exclude<Odds, 'unknown'>;
  /** Practice battles, weakest attack first: the beacon held. */
  trials: boolean[];
  /** Guards expected to fall in the middle practice battle. */
  expectedDead: number;
  /** Nobody and nothing defends it: it falls without a fight. */
  bare: boolean;
}

const trialCache = new Map<string, { held: boolean; dead: number }>();

/**
 * The honest forecast of an attack on a beacon: the parcel it comes from as we see it (a view,
 * the edge seen from a beacon, or the public numbers), × the shares and the escalation, against
 * the guard and the fortification of today. Three practice battles (public seeds).
 */
export function beaconForecast(
  state: GameState,
  targetId: string,
  sector: number,
  origin: number,
  now: TimeMs,
  /** Guards to count (default: those on the beacon now). */
  guards?: readonly Villager[],
): BeaconForecast | null {
  const face = state.faceViews[targetId];
  const b = beaconAt(face, sector);
  const target = state.targets.find((t) => t.id === targetId);
  if (!face || !b || !target) return null;
  const crew = guards ?? guardsOf(state, b);
  const fort = b.fort ?? 0;
  const view = face.parcels[String(origin)];
  const growth = view ? scheduleGrowth(state, target.distance, view.at, now) : 1;
  const base: IntelRange = view
    ? { min: view.power.min * growth, max: view.power.max * growth }
    : (() => {
        const p =
          alienDefOf(target.distance).defense *
          growthOfHours(scheduleHours(state, target.distance, now));
        return { min: p * LANDING.guess[0], max: p * LANDING.guess[1] };
      })();
  const esc = escalation(face.attacks ?? 0);
  const [lo, hi] = BEACONS.attack.share;
  const power = { min: round1(base.min * lo * esc), max: round1(base.max * hi * esc) };
  if (crew.length === 0 && fort === 0)
    return { power, odds: 'unlikely', trials: [false, false, false], expectedDead: 0, bare: true };
  const age = view?.age ?? civAgeOfHours(scheduleHours(state, target.distance, now));
  const inner = origin < INTEL.sectors / 2;
  const levels = [power.min, (power.min + power.max) / 2, power.max];
  const runs = levels.map((p, i) => {
    const units = view?.units.length
      ? scaleTo(view.units, view.power.max, p)
      : sectorUnits({ sector: origin, inner, age, power: p }, 0.5);
    const setup = beaconSetup(state, crew, {
      sector,
      origin,
      attackers: units,
      buildings: face.parcels[String(sector)]?.buildings ?? [],
      orders: b.orders ?? LANDING.defaultOrders,
      fort,
    });
    const seed = `${targetId}/beacon-trial/${sector}/${i}`;
    const key = JSON.stringify([setup.units, setup.buildings, seed]);
    let hit = trialCache.get(key);
    if (!hit) {
      const log = simulateBattle(setup, seed);
      const ids = new Set(crew.map((v) => v.id as string));
      hit = {
        held: beaconHeld(log),
        dead: log.result.fallen.filter((ref) => ids.has(ref)).length,
      };
      if (trialCache.size > 32) trialCache.delete(trialCache.keys().next().value!);
      trialCache.set(key, hit);
    }
    return hit;
  });
  const trials = runs.map((r) => r.held);
  const odds = trials[2] ? 'likely' : trials[1] || trials[0] ? 'uncertain' : 'unlikely';
  return { power, odds, trials, expectedDead: runs[1]!.dead, bare: false };
}

function scaleTo(units: readonly AlienUnit[], from: number, to: number): AlienUnit[] {
  const k = from > 0 ? to / from : 1;
  return units.map((u) => ({ ...u, count: Math.max(1, Math.round(u.count * k)) }));
}
