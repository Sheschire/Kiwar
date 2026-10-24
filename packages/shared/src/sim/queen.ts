import { EXPEDITIONS, INTEL, shipIdForAge } from '../data/expeditions';
import { LANDING, type LandingOrders } from '../data/landing';
import { emptyResources, RESOURCE_IDS } from '../data/resources';
import { SIEGE } from '../data/siege';
import { landingOutcome, type LandingOutcome } from '../battle/landing';
import { queenSetup, type QueenInput } from '../battle/queen';
import { simulateBattle } from '../battle/simulate';
import type { TimeMs, VillagerId } from '../types/ids';
import {
  civAt,
  liveCiv,
  recordDefeat,
  royalSector,
  sectorGrowth,
  sectorUnits,
  scheduleGrowth,
  type AlienUnit,
} from './civ';
import { crewMembers, crewWeight, lootByAge, removeVillagers, type Odds } from './expeditions';
import {
  liveFaceView,
  mergeUnits,
  parcelTruth,
  recordBestiary,
  validOrders,
  viewOfTruth,
} from './landing';
import type { LandingForecast } from './landing';
import { ageOf } from './research';
import { getBuilding } from './selectors';
import { queenTruth, twinTarget } from './siege';
import type { AlienGarrison, Expedition, GameState, QueenView, Villager } from './state';

/**
 * Chantier 42: the ferret queen. Once our 12 beacons light the twin she comes out of the depths
 * at its centre (an event; her public view follows her every game day), and the final battle is
 * a landing on her parcel: a victory conquers the twin (chantier 19's second colony follows), a
 * defeat leaves her wounded for a while. Her real power is the truth: only resolved where held.
 */

const round1 = (v: number) => Math.round(v * 10) / 10;

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
  const growth = sectorGrowth(g, sector, at);
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
 * The 12 beacons shine on the twin: the queen comes out (truth needed). True when she just did.
 * Once out she stays out, whatever happens to the beacons.
 */
export function emergeQueen(state: GameState, targetId: string, at: TimeMs): boolean {
  const face = state.faceViews[targetId];
  const g = state.aliens?.[targetId];
  if (!face || !g || face.queen || twinTarget(state)?.id !== targetId) return false;
  if (state.siege.conqueredAt > 0 || face.beacons.length < INTEL.sectors) return false;
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
  const dead = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  const gearPieces = crewMembers(state, dead).reduce(
    (n, v) => n + (v.gear?.weapon ? 1 : 0) + (v.gear?.armor ? 1 : 0),
    0,
  );
  removeVillagers(state, dead, 'battle', at, outcome !== 'victory');
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
      face.queen = { ...face.queen, ...q, at, wounds: { share: round1(1 - left) || 0, at } };
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
        pad.shipLost = shipIdForAge(ageOf(state));
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

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number }>();

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
  const growth = scheduleGrowth(state, 0, q.at, now) * luck;
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
      hit = { outcome: landingOutcome(log), dead: log.result.lost?.length ?? 0 };
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
    expectedDead: runs[1]!.dead,
    trials: runs.map((r) => r.outcome),
  };
}
