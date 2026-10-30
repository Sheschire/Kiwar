import { DEPTHS, type RoomKind } from '../data/depths';
import type { LandingOrders } from '../data/landing';
import { RESOURCE_IDS, emptyResources } from '../data/resources';
import { delveSetup, hazardHits, hazardOdds, type HazardHit } from '../battle/delve';
import { landingOutcome, type LandingOutcome } from '../battle/landing';
import { simulateBattle } from '../battle/simulate';
import type { BattleLog } from '../battle/types';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { AlienUnit } from './civ';
import {
  depthsMapOf,
  depthsKnown,
  grouillants,
  isLocule,
  roomTruth,
  type DepthRoom,
} from './depths';
import { ageOf } from './research';
import { crewOf, removeVillagers, type Odds } from './expeditions';
import { recordBestiary, tollOf, validOrders } from './landing';
import type { Building, DepthView, Expedition, GameState, RoomHazard, Villager } from './state';

/**
 * Chantier 48: delves into the depths. A crew goes down from the tunnel entrance to a room next
 * to the entrance or to a gallery, fights the Grouillants there after the room's hazard, and
 * comes back up. A room won becomes a gallery. Like a landing, it resolves only where the truth
 * is held (`depthSeed`): online, the client waits for the server's report.
 */

/** The target id of every delve (no face: our own depths). */
export const DEPTHS_TARGET = 'depths';
/** Delves start from the tunnel, not from a launchpad. */
export const NO_PAD = 'none' as BuildingId;

export function tunnelOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'tunnel');
}

/** Most kiwis on one delve (the entrance's level). */
export function delveCrewMax(state: GameState): number {
  const t = tunnelOf(state);
  return t ? (DEPTHS.crew[Math.min(t.level, DEPTHS.crew.length - 1)] ?? 0) : 0;
}

/** One-way time down to a room. */
export function delveTime(room: DepthRoom): number {
  return DEPTHS.travelMs[room.depth - 1]!;
}

export function isDelve(e: Expedition): boolean {
  return e.mission === 'delve';
}

/** Kiwis are down there (a delve not back yet). */
export function tunnelBusy(state: GameState): boolean {
  return state.expeditions.some((e) => isDelve(e) && e.status !== 'done');
}

export type DelveLock =
  | 'noTunnel'
  | 'doorClosed'
  | 'unknownRoom'
  | 'roomTaken'
  | 'roomOutOfReach'
  | 'layerLocked'
  | 'delveThere'
  | 'invalidOrders'
  | 'invalidCrew'
  | 'crewTooSmall'
  | 'crewTooLarge';

/** Why this crew cannot go down to this room now (resources are checked by the command). */
export function delveLock(
  state: GameState,
  roomId: string,
  crew: readonly VillagerId[],
  orders: LandingOrders | undefined,
): DelveLock | null {
  const tunnel = tunnelOf(state);
  if (!tunnel) return 'noTunnel';
  if (state.depths.door.closed) return 'doorClosed';
  const map = depthsMapOf(state);
  const room = map.byId.get(roomId);
  if (!room) return 'unknownRoom';
  const taken = state.depths.galleries;
  if (taken[roomId]) return 'roomTaken';
  if (!room.entrance && !room.links.some((id) => taken[id])) return 'roomOutOfReach';
  if (!layerOpen(state, room)) return 'layerLocked';
  if (state.expeditions.some((e) => isDelve(e) && e.status === 'outbound' && e.room === roomId))
    return 'delveThere';
  if (!validOrders(orders)) return 'invalidOrders';
  if (new Set(crew).size !== crew.length) return 'invalidCrew';
  const members = crewOf(state, crew);
  // The tunnels are too narrow for a Kikiwiwi.
  if (!members || members.some((v) => v.kikiwiwi)) return 'invalidCrew';
  if (members.length < 1) return 'crewTooSmall';
  if (members.length > delveCrewMax(state)) return 'crewTooLarge';
  return null;
}

/** Chantier 50: the locules open in the Industry age (the flesh is open with the tunnel). */
export function layerOpen(state: GameState, room: DepthRoom): boolean {
  return !isLocule(room) || ageOf(state) >= DEPTHS.locules.age;
}

/** The crew goes down (validation is done by the command). */
export function launchDelve(
  state: GameState,
  roomId: string,
  crewIds: readonly VillagerId[],
  provisions: { pulp: number; juice: number },
  orders: LandingOrders,
  now: TimeMs,
  id: string,
): Expedition {
  const room = depthsMapOf(state).byId.get(roomId)!;
  const crew = crewOf(state, crewIds)!;
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= provisions.pulp;
  state.resources.juice -= provisions.juice;
  const travel = delveTime(room);
  const e: Expedition = {
    id,
    mission: 'delve',
    targetId: DEPTHS_TARGET,
    launchpadId: NO_PAD,
    crew: crew.map((v) => v.id),
    roster: crew.map((v) => ({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
    })),
    provisions: { ...emptyResources(), pulp: provisions.pulp, juice: provisions.juice },
    // No hold to fill: what the room gives is carried up.
    cargo: 0,
    departedAt: now,
    arriveAt: now + travel,
    returnAt: now + 2 * travel,
    status: 'outbound',
    result: null,
    orders: { ...orders },
    room: roomId,
  };
  state.expeditions.push(e);
  return e;
}

/** A view replaces an older one only when it knows at least as much. */
const RANK: Record<DepthView['source'], number> = { edge: 0, lantern: 1, retreat: 2, delve: 3 };

function see(state: GameState, roomId: string, view: DepthView): void {
  const old = state.depths.views[roomId];
  if (old && RANK[old.source] > RANK[view.source]) return;
  state.depths.views[roomId] = view;
}

/** The crew reaches the room: the hazard, then the battle; a gallery, a glimpse or nothing. */
export function resolveDelve(
  state: GameState,
  e: Expedition,
  members: Villager[],
  fed: number,
): void {
  const seed = state.depthSeed;
  const room = e.room ? depthsMapOf(state).byId.get(e.room) : undefined;
  if (seed === undefined || !room || !e.orders) throw new Error('resolveDelve: hidden depths');
  const at = e.arriveAt;
  const truth = roomTruth(seed, room);
  const battleSeed = `${seed}/delve/${e.id}`;
  const hits = hazardHits(members, truth.hazard, battleSeed);
  const setup = delveSetup(state, members, {
    units: truth.units,
    hazard: truth.hazard,
    orders: e.orders,
    fed,
    seed: battleSeed,
  });
  const log: BattleLog = simulateBattle(setup, battleSeed);
  const outcome = landingOutcome(log);
  const crewIds = new Set(members.map((v) => v.id as string));
  const fallen = (log.result.lost ?? []).filter((ref) => crewIds.has(ref)) as VillagerId[];
  // Chantier 46's rule: a room won brings its fallen home wounded; elsewhere they die there.
  const dead = outcome === 'victory' ? [] : fallen;
  const hurt = outcome === 'victory' ? fallen : [];
  removeVillagers(state, dead, 'battle', at, true);
  e.crew = e.crew.filter((id) => !dead.includes(id));

  const loot = emptyResources();
  let iron = 0;
  let lantern: string | undefined;
  if (outcome === 'victory') {
    state.depths.galleries[room.id] = { kind: truth.kind, since: at };
    see(state, room.id, {
      at,
      source: 'delve',
      kind: truth.kind,
      ...nestOf(room, truth.nest),
      units: truth.units.map((u) => ({ ...u })),
      hazard: truth.hazard ? { ...truth.hazard } : null,
    });
    // The rooms next to it are heard: their kind, not who lives there.
    for (const id of room.links) {
      if (state.depths.galleries[id]) continue;
      const next = depthsMapOf(state).byId.get(id)!;
      const heard = roomTruth(seed, next);
      see(state, id, { at, source: 'edge', kind: heard.kind, ...nestOf(next, heard.nest) });
    }
    lantern = lanternRoom(state, room, members);
    if (lantern) {
      const t = roomTruth(seed, depthsMapOf(state).byId.get(lantern)!);
      see(state, lantern, {
        at,
        source: 'lantern',
        kind: t.kind,
        ...nestOf(depthsMapOf(state).byId.get(lantern)!, t.nest),
        units: t.units.map((u) => ({ ...u })),
        hazard: t.hazard ? { ...t.hazard } : null,
      });
    }
    for (const r of RESOURCE_IDS) loot[r] = truth.loot[r] ?? 0;
    iron = truth.iron;
  } else if (outcome === 'retreat') {
    see(state, room.id, {
      at,
      source: 'retreat',
      kind: truth.kind,
      ...nestOf(room, truth.nest),
      units: truth.units.map((u) => ({ ...u })),
      hazard: truth.hazard ? { ...truth.hazard } : null,
    });
  }
  // A defeat leaves the room in the fog: nobody came back to tell.
  if (outcome !== 'defeat') recordBestiary(state, truth.units, at);

  e.result = {
    victory: outcome === 'victory',
    strength: members.length,
    defense: setup.units.filter((u) => u.side === 0).length,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: dead.map((id) => members.find((v) => v.id === id)?.name ?? id),
    lostOnReturn: [],
    loot,
    outcome,
    log,
    injured: hurt,
    ...(outcome !== 'defeat' ? { seen: truth.units.map((u) => ({ ...u })) } : {}),
    ...(truth.hazard && outcome !== 'defeat' ? { hazard: { ...truth.hazard, hits } } : {}),
    ...(iron > 0 ? { iron } : {}),
    ...(outcome === 'victory' ? { gallery: true } : {}),
    ...(lantern ? { lantern } : {}),
  };
  if (e.crew.length === 0) {
    e.status = 'done';
    const done = state.expeditions.filter((x) => x.status === 'done');
    if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
  } else e.status = 'returning';
}

/** A locule's view says whether it holds a nest (a flesh room's kind already says it). */
function nestOf(room: DepthRoom, nest: boolean): { nest?: boolean } {
  return isLocule(room) ? { nest } : {};
}

/**
 * A spelunker of the crew lights a room next to the one won with its lantern: the first one
 * whose Grouillants we have not seen (not a gallery), deepest first.
 */
function lanternRoom(state: GameState, room: DepthRoom, crew: Villager[]): string | undefined {
  if (!crew.some((v) => v.classId === 'spelunker')) return undefined;
  const map = depthsMapOf(state);
  return room.links
    .map((id) => map.byId.get(id)!)
    .filter((r) => !state.depths.galleries[r.id] && !state.depths.views[r.id]?.units)
    .sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id))[0]?.id;
}

// --- The forecast (public data only) -----------------------------------------------------------

export type DelveKnowledge = 'seen' | 'kind' | 'unknown';

export interface DelveForecast {
  knowledge: DelveKnowledge;
  view: DepthView | null;
  /** Kind of the room when known (seen, or heard from next door). */
  kind: RoomKind | null;
  /** Grouillants expected (seen, or the middle of the public estimate). */
  units: AlienUnit[];
  /** The hazard as known; `possible`: none known but one may be there. */
  hazard: RoomHazard | null;
  possibleHazard: boolean;
  /** Per kiwi: chance to be hit and share of hit points it would lose (known or assumed hazard). */
  harm: { id: VillagerId; chance: number; share: number }[];
  odds: Odds;
  expectedDead: number;
  expectedHurt: number;
  trials: LandingOutcome[];
  /** One way, then the round trip. */
  travelMs: number;
}

const trialCache = new Map<string, { outcome: LandingOutcome; dead: number }>();

function practice(
  state: GameState,
  crew: readonly Villager[],
  units: AlienUnit[],
  hazard: RoomHazard | null,
  orders: LandingOrders,
  fed: number,
  seed: string,
): { outcome: LandingOutcome; dead: number } {
  const setup = delveSetup(state, crew, { units, hazard, orders, fed, seed });
  const key = JSON.stringify([setup.units, setup.orders, seed]);
  const hit = trialCache.get(key);
  if (hit) return hit;
  const log = simulateBattle(setup, seed);
  const out = { outcome: landingOutcome(log), dead: log.result.lost?.length ?? 0 };
  if (trialCache.size > 32) trialCache.delete(trialCache.keys().next().value!);
  trialCache.set(key, out);
  return out;
}

/** Hazard of the middle strength at a depth (what an unknown or a heard room is assumed to hold). */
function assumedHazard(room: DepthRoom, kind: RoomKind | null): RoomHazard | null {
  const strength = DEPTHS.hazard.strength[room.depth - 1]!;
  if (kind === 'scree') return { kind: 'fall', strength };
  if (kind === 'raphides' || kind === 'forest') return { kind: 'cuts', strength };
  if (kind === 'lake') return { kind: 'acid', strength };
  return null;
}

/**
 * The honest forecast: three practice battles against what we know of the room — the
 * Grouillants seen there, or the public estimate of its depth (× 0.75, 1, 1.25; a nest, or a
 * room whose kind is unknown, may hold `nestPower` times more in the hardest one). A hazard seen
 * strikes every trial; an assumed one (scree, raphides heard from next door) too; an unknown
 * room meets a fall in the hardest trial.
 */
export function delveForecast(
  state: GameState,
  roomId: string,
  crew: readonly Villager[],
  orders: LandingOrders,
  fed = 1,
): DelveForecast | null {
  const room = depthsMapOf(state).byId.get(roomId);
  if (!room) return null;
  const view = state.depths.views[roomId] ?? null;
  const kind = view?.kind ?? null;
  const knowledge: DelveKnowledge = view?.units ? 'seen' : kind ? 'kind' : 'unknown';
  const base = DEPTHS.power[room.depth - 1]!;
  const level = DEPTHS.level[room.depth - 1]!;
  // A locule heard without its nest known may hold one (the hardest trial).
  const nestKnown = !isLocule(room) || view?.nest !== undefined;
  const nest = kind === 'nest' || view?.nest ? DEPTHS.nestPower : 1;
  const armies: AlienUnit[][] = view?.units
    ? [view.units, view.units, view.units]
    : [
        grouillants(base * DEPTHS.spread[0] * nest, level),
        grouillants(base * nest, level),
        grouillants(base * DEPTHS.spread[1] * (kind && nestKnown ? nest : DEPTHS.nestPower), level),
      ];
  const known = view && view.hazard !== undefined ? view.hazard : undefined;
  const assumed = known === undefined ? assumedHazard(room, kind) : known;
  // Every locule has a hazard: an unknown one meets cuts or acid, the worse for this crew.
  const possibleHazard = known === undefined && !assumed && kind !== 'nest';
  const unknownWorst: RoomHazard = isLocule(room)
    ? worstLoculeHazard(crew, DEPTHS.hazard.strength[room.depth - 1]!)
    : { kind: 'fall', strength: DEPTHS.hazard.strength[room.depth - 1]! };
  const worst: RoomHazard | null = assumed ?? (possibleHazard ? unknownWorst : null);
  const hazards = [assumed, assumed, worst];
  const shown = assumed ?? worst;
  const harm = shown
    ? crew.map((v) => {
        const o = hazardOdds(v, crew, shown);
        return {
          id: v.id,
          chance: round2(o.chance),
          share: round2(Math.min(1 - DEPTHS.hazard.floor, o.harm)),
        };
      })
    : [];
  const out = {
    knowledge,
    view,
    kind,
    units: armies[1]!,
    hazard: assumed,
    possibleHazard,
    harm,
    travelMs: delveTime(room),
  };
  if (crew.length === 0)
    return { ...out, odds: 'unknown', expectedDead: 0, expectedHurt: 0, trials: [] };
  const runs = armies.map((units, i) =>
    practice(state, crew, units, hazards[i]!, orders, fed, `depths/trial/${roomId}/${i}`),
  );
  const won = runs.map((r) => r.outcome === 'victory');
  const odds: Odds = won[2] ? 'likely' : won[1] || won[0] ? 'uncertain' : 'unlikely';
  return { ...out, odds, ...tollOf(runs[1]!), trials: runs.map((r) => r.outcome) };
}

/** Cuts or acid, whichever hurts this crew more (the stat of most of them decides). */
function worstLoculeHazard(crew: readonly Villager[], strength: number): RoomHazard {
  const toll = (kind: 'cuts' | 'acid') =>
    crew.reduce((a, v) => {
      const o = hazardOdds(v, crew, { kind, strength });
      return a + o.chance * o.harm;
    }, 0);
  return { kind: toll('acid') > toll('cuts') ? 'acid' : 'cuts', strength };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Delves this side cannot resolve yet (online: the server holds the depths' seed). */
export function canResolveDelve(state: GameState): boolean {
  return depthsKnown(state);
}

export type { HazardHit };
