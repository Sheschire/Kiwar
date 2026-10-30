import { EXPEDITIONS, INTEL } from '../data/expeditions';
import { LANDING, type LandingOrders } from '../data/landing';
import { emptyResources, RESOURCE_IDS } from '../data/resources';
import { SIEGE } from '../data/siege';
import { landingOutcome, type LandingOutcome } from '../battle/landing';
import { queenSetup, type QueenInput } from '../battle/queen';
import { simulateBattle } from '../battle/simulate';
import type { TimeMs, VillagerId } from '../types/ids';
import {
  civAt,
  growthOfHours,
  liveCiv,
  recordDefeat,
  royalSector,
  sectorGrowth,
  sectorUnits,
  scheduleHours,
  type AlienUnit,
} from './civ';
import { crewMembers, crewWeight, lootByAge, removeVillagers, type Odds } from './expeditions';
import {
  liveFaceView,
  mergeUnits,
  parcelTruth,
  recordBestiary,
  tollOf,
  validOrders,
  viewOfTruth,
} from './landing';
import type { LandingForecast } from './landing';
import { shipIdOf } from './research';
import { getBuilding } from './selectors';
import { queenTruth, twinTarget } from './siege';
import type { GameEvent } from './advance';
import type { AlienGarrison, Expedition, GameState, QueenView, Villager } from './state';

/**
 * Chantier 42: the ferret queen. Once our 12 beacons light the twin she comes out of the depths
 * at its centre (an event; her public view follows her every game day), and the final battle is
 * a landing on her parcel: a victory conquers the twin (chantier 19's second colony follows), a
 * defeat leaves her wounded for a while. Her real power is the truth: only resolved where held.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;
const HOUR = 3_600_000;

/** Chantier 47: the public date before which the queen never comes out. */
export function queenFrom(state: Pick<GameState, 'createdAt'>): TimeMs {
  return state.createdAt + SIEGE.queenFromH * HOUR;
}

/** The twin waiting for its queen under 12 beacons (public): its id, or null. */
export function queenPending(state: GameState): string | null {
  const id = twinTarget(state)?.id;
  const face = id ? state.faceViews[id] : undefined;
  if (!id || !face || face.queen || state.siege.conqueredAt > 0) return null;
  return face.beacons.length >= INTEL.sectors ? id : null;
}

/** When the queen comes out of her own (truth needed: Infinity without). */
export function nextQueenEvent(state: GameState): TimeMs {
  const id = queenPending(state);
  if (!id || !state.aliens?.[id]) return Infinity;
  return Math.max(state.now, queenFrom(state));
}

/** Her date is due and only the server knows her: the time it is due at. */
export function queenDue(state: GameState, now: TimeMs): TimeMs[] {
  const id = queenPending(state);
  const at = queenFrom(state);
  return id && at <= now ? [Math.max(at, state.now)] : [];
}

/** Her date is due and this client cannot bring her out (the server must). */
export function queenAwaited(state: GameState, now: TimeMs): boolean {
  const id = queenPending(state);
  return !!id && !state.aliens?.[id] && queenFrom(state) <= now;
}

/** The date has come while 12 beacons shine: she comes out. */
export function queenTick(state: GameState, at: TimeMs, events: GameEvent[]): void {
  const id = queenPending(state);
  if (!id || !emergeQueen(state, id, at)) return;
  events.push({
    type: 'queenEmerged',
    at,
    targetId: id,
    sector: state.faceViews[id]!.queen!.sector,
  });
}

/** The queen of a face, once out (public). */
export function queenOf(state: Pick<GameState, 'faceViews'>, targetId: string): QueenView | null {
  return state.faceViews[targetId]?.queen ?? null;
}

/** Share of her hit points still missing at a time. */
export function queenWounds(q: Pick<QueenView, 'wounds'>, now: TimeMs): number {
  const w = q.wounds;
  if (!w) return 0;
  return Math.max(0, w.share * (1 - (now - w.at) / SIEGE.final.healMs));
}

/** The queen as she really is (truth): her parcel, its age and growth, her guard. */
function queenNow(g: AlienGarrison, at: TimeMs) {
  const sector = royalSector(g);
  const view = civAt(g, at);
  const parcel = view.sectors[sector]!;
  const growth = Math.max(sectorGrowth(g, sector, at), growthOfHours(SIEGE.final.floorH));
  const base = queenTruth(g).power;
  return {
    sector,
    age: parcel.age,
    ground: round1(base.ground * growth),
    air: round1(base.air * growth),
    escort: sectorUnits(parcel, g.ferretShare),
  };
}

/**
 * The 12 beacons shine on the twin: the queen comes out (truth needed), not before her public
 * date (chantier 47). True when she just did. Once out she stays out, whatever happens to the
 * beacons.
 */
export function emergeQueen(state: GameState, targetId: string, at: TimeMs): boolean {
  const face = state.faceViews[targetId];
  const g = state.aliens?.[targetId];
  if (!face || !g || face.queen || twinTarget(state)?.id !== targetId) return false;
  if (state.siege.conqueredAt > 0 || face.beacons.length < INTEL.sectors) return false;
  if (at < queenFrom(state)) return false;
  liveCiv(g).royalSeen = true;
  const q = queenNow(g, at);
  face.queen = { ...q, since: at, at };
  return true;
}

/** Our beacons follow her every game day (truth needed). */
export function refreshQueen(state: GameState, targetId: string, at: TimeMs): void {
  const face = state.faceViews[targetId];
  const g = state.aliens?.[targetId];
  if (!face?.queen || !g) return;
  const q = queenNow(g, at);
  face.queen = { ...face.queen, ...q, at };
}

export type FinalLock = 'queenHidden' | 'landingThere' | 'invalidOrders';

export function finalLock(
  state: GameState,
  targetId: string,
  orders: LandingOrders | undefined,
): FinalLock | null {
  if (!queenOf(state, targetId)) return 'queenHidden';
  if (
    state.expeditions.some(
      (e) => e.mission === 'final' && e.status === 'outbound' && e.targetId === targetId,
    )
  )
    return 'landingThere';
  if (!validOrders(orders)) return 'invalidOrders';
  return null;
}

// --- The final battle ---------------------------------------------------------------------------

export function resolveFinal(
  state: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
): void {
  const g = state.aliens?.[e.targetId];
  if (!g || !e.orders) throw new Error('resolveFinal: hidden garrison');
  const at = e.arriveAt;
  const face = liveFaceView(state, e.targetId);
  const q = queenNow(g, at);
  const wounds = face.queen ? queenWounds(face.queen, at) : 0;
  const setup = queenSetup(state, members, { ...q, wounds, orders: e.orders, fed });
  const log = simulateBattle(setup, `${g.seed}/final/${e.id}`);
  const outcome = landingOutcome(log);
  const crewIds = new Set(members.map((v) => v.id as string));
  const fallen = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  // Chantier 46: her fall leaves the field to us, the fallen come back wounded.
  const dead = outcome === 'victory' ? [] : fallen;
  const hurt = outcome === 'victory' ? fallen : [];
  const gearPieces = crewMembers(state, dead).reduce(
    (n, v) => n + (v.gear?.weapon ? 1 : 0) + (v.gear?.armor ? 1 : 0),
    0,
  );
  removeVillagers(state, dead, 'battle', at, true);
  e.crew = e.crew.filter((id) => !dead.includes(id));
  const civ = liveCiv(g);
  const seen = mergeUnits([q.escort]);
  recordBestiary(state, seen, at);
  const loot = emptyResources();
  if (outcome === 'victory') {
    // The queen fell: the twin is ours, its fog lifts, every guard flies home with the ship.
    state.siege.conqueredAt = at;
    state.victories[e.targetId] = (state.victories[e.targetId] ?? 0) + 1;
    face.attack = null;
    for (const b of face.beacons) {
      for (const v of crewMembers(state, b.guards ?? [])) {
        v.job = { kind: 'expedition', expeditionId: e.id };
        e.crew.push(v.id);
        if (!e.roster.some((r) => r.id === v.id))
          e.roster.push({
            id: v.id,
            name: v.name,
            level: v.level,
            shiny: v.shiny,
            classId: v.classId,
          });
      }
      delete b.guards;
      delete b.fortifying;
    }
    revealAll(state, g, e.targetId, at);
    if (face.queen) face.queen = { ...face.queen, ...q, at, wounds: { share: 1, at } };
    // Her treasure, as much as the hold takes.
    const survivors = crewMembers(state, e.crew);
    const k = SIEGE.final.loot * lootByAge(state);
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
  } else {
    // She keeps her wounds for a while.
    const left = (1 - wounds) * (log.result.leaderLeft ?? 1);
    if (face.queen)
      face.queen = {
        ...face.queen,
        ...q,
        at,
        wounds: { share: Math.min(SIEGE.final.maxWounds, round1(1 - left) || 0), at },
      };
    if (face.queen?.wounds && face.queen.wounds.share <= 0) delete face.queen.wounds;
    recordDefeat(
      civ,
      at,
      dead.length,
      q.sector,
      (outcome === 'defeat' ? LANDING.defeat.shipH : 0) + gearPieces * LANDING.defeat.gearH,
    );
    if (outcome === 'defeat') {
      const pad = getBuilding(state, e.launchpadId);
      if (pad) {
        pad.damaged = true;
        pad.shipLost = shipIdOf(state);
      }
    }
  }
  e.result = {
    victory: outcome === 'victory',
    outcome,
    strength: members.length,
    defense: round1(q.ground + q.air),
    fed: Math.round(fed * 100) / 100,
    lostInBattle: dead.map((id) => e.roster.find((r) => r.id === id)?.name ?? id),
    lostOnReturn: [],
    loot,
    sector: q.sector,
    log,
    seen,
    ...(hurt.length > 0 ? { injured: hurt } : {}),
    ...(outcome === 'victory' ? { queenFallen: true } : {}),
    ...(outcome === 'defeat' ? { shipLost: true } : {}),
  };
  if (outcome === 'defeat') {
    e.status = 'done';
    e.provisions = emptyResources();
    const done = state.expeditions.filter((x) => x.status === 'done');
    if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
  } else e.status = 'returning';
}

/** The conquered twin: every parcel in sight, a beacon on each. */
function revealAll(state: GameState, g: AlienGarrison, targetId: string, at: TimeMs): void {
  const face = liveFaceView(state, targetId);
  for (let sector = 0; sector < INTEL.sectors; sector++) {
    if (!face.beacons.some((b) => b.sector === sector)) face.beacons.push({ sector, since: at });
    face.parcels[String(sector)] = viewOfTruth(
      parcelTruth(state, g, targetId, sector, at),
      sector,
      at,
      'beacon',
    );
  }
  face.beacons.sort((a, b) => a.sector - b.sector);
}

// --- The forecast (public) ----------------------------------------------------------------------

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number; left: number }>();

/** What the queen's battle would look like today against this crew (her public view). */
export function finalInput(
  state: GameState,
  targetId: string,
  orders: LandingOrders,
  fed: number,
  now: TimeMs,
  luck = 1,
): QueenInput | null {
  const q = queenOf(state, targetId);
  if (!q) return null;
  // Her growth on the public schedule since she was seen, from her floor (`SIEGE.final.floorH`).
  const floor = growthOfHours(SIEGE.final.floorH);
  const grown = (at: TimeMs) => Math.max(floor, growthOfHours(scheduleHours(state, 0, at)));
  const growth = (grown(now) / grown(q.at)) * luck;
  return {
    sector: q.sector,
    age: q.age,
    ground: round1(q.ground * growth),
    air: round1(q.air * growth),
    escort: q.escort.map((u: AlienUnit) => ({
      ...u,
      count: Math.max(1, Math.round(u.count * growth)),
    })),
    wounds: queenWounds(q, now),
    orders,
    fed,
  };
}

/** Three practice battles against the queen as our beacons see her. */
export function finalForecast(
  state: GameState,
  targetId: string,
  crew: readonly Villager[],
  orders: LandingOrders,
  fed: number,
  now: TimeMs,
): LandingForecast {
  const mid = finalInput(state, targetId, orders, fed, now);
  const none: LandingForecast = {
    knowledge: 'formidable',
    view: null,
    power: null,
    age: null,
    odds: 'unknown',
    expectedDead: 0,
    expectedHurt: 0,
    trials: [],
  };
  if (!mid) return none;
  const total = mid.ground + mid.air;
  const power = {
    min: round1(total * LANDING.trials[0]!),
    max: round1(total * LANDING.trials[2]!),
  };
  if (crew.length === 0) return { ...none, knowledge: 'seen', power, age: mid.age };
  const runs = LANDING.trials.map((luck, i) => {
    const input = finalInput(state, targetId, orders, fed, now, luck)!;
    const setup = queenSetup(state, crew, input);
    const seed = `${targetId}/final-trial/${i}`;
    const key = JSON.stringify([setup.units, seed]);
    let hit = trialCache.get(key);
    if (!hit) {
      const log = simulateBattle(setup, seed);
      hit = {
        outcome: landingOutcome(log),
        dead: log.result.lost?.length ?? 0,
        left: log.result.leaderLeft ?? 1,
      };
      if (trialCache.size > 16) trialCache.delete(trialCache.keys().next().value!);
      trialCache.set(key, hit);
    }
    return hit;
  });
  const won = runs.map((r) => r.outcome === 'victory');
  const odds: Odds = won[2] ? 'likely' : won[1] || won[0] ? 'uncertain' : 'unlikely';
  return {
    knowledge: 'seen',
    view: null,
    power,
    age: mid.age,
    odds,
    ...tollOf(runs[1]!),
    trials: runs.map((r) => r.outcome),
    // What would be left of her (her wounds, ×, what she has now).
    queenLeft: Math.round(runs[1]!.left * (1 - mid.wounds) * 100) / 100,
  };
}
