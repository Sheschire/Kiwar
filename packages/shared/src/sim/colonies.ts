import { COLONY } from '../data/colonies';
import { GARRISON } from '../data/threats';
import { OBJECTIVES } from '../data/objectives';
import { OBSTACLES } from '../data/obstacles';
import { emptyResources, RESOURCE_IDS } from '../data/resources';
import { hexKey, type HexKey } from '../hex/hex';
import { createRng } from '../rng/rng';
import { otherFace, type TimeMs, type VillagerId } from '../types/ids';
import { HEART, twinParams, type FaceMap } from '../worldgen/generateFace';
import type { GameEvent } from './advance';
import { crewMembers, lossShare } from './expeditions';
import { obstacleAt, obstacleId, removeObstacle } from './obstacles';
import { receiveResearch } from './research';
import { capacity } from './selectors';
import { twinTarget } from './siege';
import {
  cloneVillager,
  newGame,
  nextId,
  type Expedition,
  type Founding,
  type GameState,
  type Obstacle,
  type Villager,
} from './state';
import { faceMapOf } from './territory';
import { guardPower } from './threats';

/**
 * Chantier 19 (second half): the second colony on the twin face. Two linked game states: the
 * home colony (`colony.index` 0) holds the shared research, the sister (1) sends its Library's
 * points over at each sync. Everything here is public (the conquered face hides nothing).
 */

export function isSister(state: Pick<GameState, 'colony'>): boolean {
  return state.colony.index === 1;
}

/** The home colony has a sister, or settlers on their way to found it. */
export function hasSister(state: GameState): boolean {
  return state.colony.foundedAt > 0 || state.colony.founding !== null;
}

export type FoundLock = 'unknownTarget' | 'notConquered' | 'alreadyFounded';

/** Why the settlers' ship cannot leave for the twin face. */
export function foundLock(state: GameState): FoundLock | null {
  if (isSister(state) || !twinTarget(state)) return 'unknownTarget';
  if (state.siege.conqueredAt <= 0) return 'notConquered';
  if (hasSister(state) || state.expeditions.some((e) => e.mission === 'found' && !e.result))
    return 'alreadyFounded';
  return null;
}

/** What a kiwi becomes when it settles elsewhere: idle, with no post or flag of the old home. */
export function settle(v: Villager): Villager {
  const out = cloneVillager(v);
  out.job = { kind: 'idle' };
  delete out.locked;
  delete out.builderPriority;
  delete out.homeJob;
  delete out.lent;
  return out;
}

/** Kiwis leaving the colony for good, alive: no memorial, no mourning. */
export function emigrate(state: GameState, ids: readonly VillagerId[]): void {
  if (ids.length === 0) return;
  state.villagers = state.villagers.filter((v) => !ids.includes(v.id));
}

/**
 * The settlers' ship lands on the conquered twin: the settlers and everything aboard stay
 * there (the sister colony is created from `colony.founding`), the ship flies back empty.
 */
export function landSettlers(s: GameState, e: Expedition, members: Villager[], fed: number): void {
  const resources = emptyResources();
  for (const id of RESOURCE_IDS) resources[id] = (e.freight?.[id] ?? 0) + e.provisions[id];
  s.colony.founding = { at: e.arriveAt, settlers: members.map(settle), resources };
  emigrate(
    s,
    members.map((v) => v.id),
  );
  e.provisions = emptyResources();
  e.crew = [];
  e.status = 'returning';
  e.result = {
    victory: true,
    strength: 0,
    defense: 0,
    fed: Math.round(fed * 100) / 100,
    lostInBattle: [],
    lostOnReturn: [],
    loot: emptyResources(),
    founded: true,
  };
}

/** Ruins and ferret dens the aliens left on the twin face (public draw, own stream). */
export function generateTraces(map: FaceMap, taken: ReadonlySet<string>): Obstacle[] {
  const rng = createRng(`${map.seed}/${map.face}/traces`);
  const [lo, hi] = COLONY.traces.rho;
  const used = new Set<HexKey>(taken as ReadonlySet<HexKey>);
  const out: Obstacle[] = [];
  const place = (kind: 'ruin' | 'den', count: number) => {
    const def = OBSTACLES[kind];
    const spots = rng.shuffle(
      map.tiles.filter((t) => def.tiles.includes(t.type) && !t.flood && t.rho >= lo && t.rho <= hi),
    );
    let placed = 0;
    for (const t of spots) {
      if (placed >= count) break;
      const key = hexKey(t);
      if (used.has(key)) continue;
      used.add(key);
      placed++;
      out.push({ id: obstacleId(kind, t.q, t.r), kind, q: t.q, r: t.r, loot: { ...def.loot } });
    }
  };
  place('ruin', rng.int(COLONY.traces.ruins[0], COLONY.traces.ruins[1]));
  place('den', COLONY.traces.dens);
  return out;
}

/**
 * The sister colony made of a founding (pure: same input, same colony). Same calendar and
 * seed as home, the twin face's map, a Nest level 1, the settlers (new ids) and what they
 * carried (up to the Nest's storage), no tutorial, no expedition target, waves held back.
 */
export function newSister(home: GameState, f: Founding): GameState {
  const s = newGame({
    seed: home.seed,
    face: otherFace(home.face),
    now: f.at,
    params: twinParams(home.seed, home.face, home.params),
    playerId: home.playerId,
    universeId: home.universeId,
    kiwiId: home.kiwiId,
    calendarStart: home.calendarStart,
    targets: [],
  });
  delete s.aliens;
  s.villagers = f.settlers.map((v) => ({ ...settle(v), id: nextId(s, 'v') as VillagerId }));
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) s.resources[id] = Math.min(cap[id], f.resources[id]);
  s.objectiveIndex = OBJECTIVES.length;
  s.colony = { index: 1, founding: null, foundedAt: f.at };
  s.threats.shieldUntil = f.at + COLONY.shieldMs;
  s.research = {
    points: 0,
    current: home.research.current,
    done: [...home.research.done],
    outbox: 0,
  };
  const taken = new Set<string>([hexKey(HEART), ...s.obstacles.map((o) => hexKey(o))]);
  s.obstacles = [...s.obstacles, ...generateTraces(faceMapOf(s), taken)];
  return s;
}

/**
 * The home colony's settlers have landed: creates the sister colony (at the landing time, to
 * be advanced to now by the caller) and marks the home colony as founded. Null: nothing new.
 */
export function takeFounding(home: GameState): GameState | null {
  const f = home.colony.founding;
  if (!f) return null;
  const sister = newSister(home, f);
  home.colony = { ...home.colony, founding: null, foundedAt: f.at };
  return sister;
}

/**
 * Shared research (both states advanced to the same time first): the sister's points join the
 * home colony's research, and the sister learns what home knows and works on.
 */
export function syncColonies(home: GameState, sister: GameState): void {
  receiveResearch(home, sister.research.outbox);
  sister.research = {
    points: 0,
    current: home.research.current,
    done: [...home.research.done],
    outbox: 0,
  };
}

// --- Ferret dens ----------------------------------------------------------------------------

/** Guards posted on the rampart (they raid the dens). */
export function denRaiders(state: GameState): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'guard');
}

export interface DenRaidForecast {
  /** Ground power of the guards, and what a den needs. */
  strength: number;
  power: number;
  /** Guards likely hurt (they rest `COLONY.denInjuryMs`). */
  wounded: number;
}

/** What raiding a den with the guards now would do (no luck: the outcome is foreseen). */
export function denRaidForecast(state: GameState): DenRaidForecast {
  const guards = denRaiders(state);
  const strength = guards.reduce((sum, v) => sum + guardPower(v, state).ground, 0);
  const power = COLONY.denPower * GARRISON.power;
  const wounded =
    strength >= power
      ? Math.min(guards.length, Math.round(guards.length * lossShare(strength, power)))
      : 0;
  return { strength, power, wounded };
}

/** The guards raid a den (validated by the command): it is gone, some guards come back hurt. */
export function raidDen(
  state: GameState,
  q: number,
  r: number,
  now: TimeMs,
  events: GameEvent[],
): void {
  const den = obstacleAt(state, q, r)!;
  const { wounded } = denRaidForecast(state);
  // The weakest guards are the ones hurt (no draw: the forecast tells the truth).
  const hurt = [...denRaiders(state)]
    .sort((a, b) => guardPower(a, state).ground - guardPower(b, state).ground)
    .slice(0, wounded);
  for (const v of crewMembers(
    state,
    hurt.map((v) => v.id),
  ))
    v.job = { kind: 'injured', until: now + COLONY.denInjuryMs };
  removeObstacle(state, den, now, events, 'kiwis');
}
