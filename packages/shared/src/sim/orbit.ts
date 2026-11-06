import {
  moduleFits,
  MODULE_TYPES,
  MODULES,
  ORBIT,
  WORK_MODULE,
  type KiwaiType,
  type ModuleType,
} from '../data/orbit';
import { crystalUnits } from '../data/crystal';
import { dustPoints, STARDUST, STARDUST_SCALE } from '../data/comets';
import { STARDUST_CAP } from './comets';
import { KIWI } from '../data/kiwis';
import { levelDef } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { canAfford } from './selectors';
import { hexDistance, type Hex } from '../hex/hex';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import type { GameEvent } from './advance';
import type { CommandError } from './commands';
import { meteorIronOf } from './iron';
import { workerPower } from './kiwis';
import { hungerWork } from './needs';
import { researchPower } from './research';
import { colonyMood, kiwiMoraleWork, presence, type Bed } from './rest';
import { createRng, type Rng } from '../rng/rng';
import { siteSpotError, smallMap, thingAt, type SiteError, type SmallMap } from './sites';
import { borrow, sendBackAll } from './tasks';
import type { Building, GameState, Kiwai, OrbitModule, Villager } from './state';

/**
 * Chantier 53: the kiwais in orbit. Each is a small map of its own (`sim/sites.ts`) drawn from
 * a public seed (`<seed>/<face>/kiwai/<id>`), with its modules kept on the kiwai, never in
 * `state.buildings`. Everything up there is public.
 */

/** The small map of a kiwai (memoized; the same for the client, the server and the bot). */
export function kiwaiMapOf(
  state: Pick<GameState, 'seed' | 'face'>,
  kiwai: Pick<Kiwai, 'id'>,
): SmallMap {
  return smallMap(`${state.seed}/${state.face}/kiwai/${kiwai.id}`, ORBIT.radius, ORBIT.rocks);
}

export function kiwaiById(state: GameState, id: string): Kiwai | undefined {
  return state.orbit.kiwais.find((k) => k.id === id);
}

/** The module on a tile of that kiwai (its own map only). */
export function moduleAt(kiwai: Kiwai, h: Hex): OrbitModule | undefined {
  return thingAt(kiwai.modules, h);
}

/** Why no module can be set on that tile of the kiwai (null: it can). */
export function moduleSpotError(state: GameState, kiwai: Kiwai, h: Hex): SiteError | null {
  return siteSpotError(kiwaiMapOf(state, kiwai), kiwai.modules, h);
}

/** The orbital yard (one per colony), or undefined. */
export function yardOf(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'orbitalYard');
}

/** Kiwais the yard holds in orbit at its level (0 without a yard). */
export function kiwaiCap(state: GameState): number {
  const yard = yardOf(state);
  return yard ? (ORBIT.kiwais[Math.min(yard.level, ORBIT.kiwais.length - 1)] ?? 0) : 0;
}

/** Module places on each kiwai at the yard's level. */
export function moduleSlots(state: GameState): number {
  const yard = yardOf(state);
  return yard ? (ORBIT.moduleSlots[Math.min(yard.level, ORBIT.moduleSlots.length - 1)] ?? 0) : 0;
}

export type LaunchCost = (typeof ORBIT.launch)[number];

/** What the next launch costs (a core of giant seeds, crystal, iron, stardust) and takes. */
export function kiwaiLaunchCost(state: GameState): LaunchCost {
  return ORBIT.launch[Math.min(state.orbit.launched, ORBIT.launch.length - 1)]!;
}

/** A kiwai is in orbit (its launch is over). */
export function inOrbit(kiwai: Kiwai, now: TimeMs): boolean {
  return kiwai.readyAt <= now;
}

/**
 * Why no kiwai can be launched now (null: it can). The stocks come last, so the screen can
 * show the price of a launch the yard allows.
 */
export function launchLock(state: GameState): CommandError | null {
  if (!yardOf(state)) return 'noOrbitalYard';
  if (state.orbit.kiwais.length >= kiwaiCap(state)) return 'kiwaiLimit';
  const cost = kiwaiLaunchCost(state);
  if (state.giantSeeds < cost.giantSeeds) return 'notEnoughGiantSeeds';
  if (crystalUnits(state.crystal) < cost.crystal) return 'notEnoughCrystal';
  if (meteorIronOf(state) < cost.iron) return 'notEnoughIron';
  if (dustPoints(state.stardust) < cost.stardust) return 'notEnoughStardust';
  return null;
}

/** Sets a new kiwai on its way (the caller paid): in orbit at `now + durationMs`. */
export function startKiwai(s: GameState, type: KiwaiType, now: TimeMs): Kiwai {
  const cost = kiwaiLaunchCost(s);
  const taken = new Set(s.orbit.kiwais.map((k) => k.place));
  let place = 0;
  while (taken.has(place)) place++;
  const kiwai: Kiwai = {
    id: `kiwai-${s.nextId++}`,
    type,
    place,
    launchedAt: now,
    readyAt: now + cost.durationMs,
    modules: [],
    dust: 0,
    wear: { n: 0, at: 0, moduleId: null },
  };
  s.orbit.kiwais.push(kiwai);
  s.orbit.launched++;
  return kiwai;
}

/** The next time something happens in orbit (a launch or a module ends, the shuttle), after `s.now`. */
export function nextOrbitEvent(s: GameState): TimeMs {
  let at = Infinity;
  const later = (t: TimeMs) => {
    if (t > s.now && t < at) at = t;
  };
  for (const k of s.orbit.kiwais) {
    later(k.readyAt);
    for (const m of k.modules) {
      later(m.readyAt);
      if (m.repairAt !== undefined) later(m.repairAt);
    }
    if (k.wear.at > 0) {
      later(k.wear.at - ORBIT.wear.noticeMs);
      later(k.wear.at);
    }
  }
  const sh = s.orbit.shuttle;
  if (sh) later(sh.docked ? sh.backAt : sh.upAt);
  return at;
}

/** What happens in orbit at `at`. */
export function orbitTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const k of s.orbit.kiwais) {
    if (k.readyAt === at) events.push({ type: 'kiwaiReady', at, kiwaiId: k.id, kiwaiType: k.type });
    for (const m of k.modules) {
      if (m.readyAt === at)
        events.push({ type: 'moduleReady', at, kiwaiId: k.id, moduleType: m.type });
      if (m.repairAt === at) {
        delete m.broken;
        delete m.repairAt;
        events.push({ type: 'moduleRepaired', at, kiwaiId: k.id, moduleType: m.type });
      }
    }
    if (k.wear.at > 0 && k.wear.at - ORBIT.wear.noticeMs === at) {
      const m = k.modules.find((x) => x.id === k.wear.moduleId);
      if (m)
        events.push({
          type: 'wearAnnounced',
          at,
          kiwaiId: k.id,
          moduleType: m.type,
          breakAt: k.wear.at,
        });
    }
    if (k.wear.at === at) breakDown(s, k, at, events);
    // A module that wears started working (assembled, repaired): its wear is planned.
    else if (k.wear.at === 0 && k.readyAt <= at) planWear(s, k, at);
  }
  const sh = s.orbit.shuttle;
  if (sh && !sh.docked && sh.upAt === at) dockShuttle(s, at, events);
  if (sh && sh.docked && sh.backAt === at) landShuttle(s, at, events);
}

/**
 * Anti-cheat for imported saves: as many kiwais as launched and as the yard holds, modules on
 * free ground of their own map, fitting their kiwai, within the places; tanks within their cap.
 */
export function plausibleOrbit(state: GameState): boolean {
  const o = state.orbit;
  if (o.kiwais.length !== o.launched || o.kiwais.length > kiwaiCap(state)) return false;
  if (new Set(o.kiwais.map((k) => k.place)).size !== o.kiwais.length) return false;
  for (const k of o.kiwais) {
    if (k.modules.length > moduleSlots(state)) return false;
    if (k.dust > ORBIT.dust.tank * STARDUST_SCALE) return false;
    const map = kiwaiMapOf(state, k);
    for (let i = 0; i < k.modules.length; i++) {
      const m = k.modules[i]!;
      if (!moduleFits(m.type, k.type)) return false;
      if (siteSpotError(map, k.modules.slice(0, i), m) !== null) return false;
    }
  }
  // Kiwis bound to a kiwai that exists, in the shuttle only while it flies to that kiwai.
  const sh = o.shuttle;
  for (const v of state.villagers) {
    if (v.job.kind !== 'orbit') continue;
    const k = kiwaiById(state, v.job.kiwaiId);
    if (!k || k.readyAt > state.now) return false;
    if (v.job.aboard && (!sh || sh.kiwaiId !== k.id)) return false;
  }
  if (sh && (!kiwaiById(state, sh.kiwaiId) || sh.cargo > dustTank())) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Modules, the shuttle and the kiwis up there

/**
 * The bed of a kiwi in orbit: its habitat, next to its work (no walk). Kiwis up there are not
 * in the colony's beds; they eat from its stock.
 */
export const ORBIT_BED: Bed = { buildingId: 'orbit' as BuildingId, distance: 0 };

/** A module works: assembled and not broken. */
export function moduleWorks(m: OrbitModule, now: TimeMs): boolean {
  return m.readyAt <= now && m.broken === undefined;
}

/** Every kiwi bound to that kiwai (up there, or in the shuttle either way). */
export function kiwisOf(state: GameState, kiwaiId: string): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'orbit' && v.job.kiwaiId === kiwaiId);
}

/** The kiwis up there now (not in the shuttle). */
export function orbitCrew(state: GameState, kiwaiId: string): Villager[] {
  return kiwisOf(state, kiwaiId).filter((v) => v.job.kind === 'orbit' && !v.job.aboard);
}

/** Places in the kiwai's habitats (assembled; a habitat never breaks down). */
export function kiwaiHousing(kiwai: Kiwai, now: TimeMs): number {
  return kiwai.modules
    .filter((m) => m.readyAt <= now)
    .reduce((n, m) => n + (MODULES[m.type].housing ?? 0), 0);
}

/** Kiwis that take a place up there (those coming down already left theirs). */
export function housed(state: GameState, kiwaiId: string): number {
  return kiwisOf(state, kiwaiId).filter((v) => v.job.kind === 'orbit' && v.job.aboard !== 'down')
    .length;
}

/** The working modules where the kiwai's kiwis work (its type's work module). */
export function workModules(kiwai: Kiwai, now: TimeMs): OrbitModule[] {
  const type = WORK_MODULE[kiwai.type];
  return kiwai.modules.filter((m) => m.type === type && moduleWorks(m, now));
}

/** What the working panels next to a module add (up to `ORBIT.panel.max` panels). */
export function panelBonus(kiwai: Kiwai, m: Hex, now: TimeMs): number {
  let n = 0;
  for (const o of kiwai.modules)
    if (o.type === 'panel' && moduleWorks(o, now) && hexDistance(o, m) === 1) n++;
  return ORBIT.panel.bonus * Math.min(n, ORBIT.panel.max);
}

/** How much a kiwi brings up there, 1 for an average newborn (the type's own skill). */
export function orbitPower(v: Villager, type: KiwaiType, resource?: ResourceId): number {
  if (type === 'observatory') return researchPower(v);
  if (type === 'greenhouse') return workerPower(v, resource ?? 'juice');
  const dex = 1 + STARDUST.perDexterity * (v.stats.dexterity - KIWI.stat.average);
  return Math.max(KIWI.minPower, dex);
}

/**
 * The summed work of a kiwai's crew: the best kiwis fill the work modules' places (those with
 * the most panels first), each by its power, its rest up there, its morale and the colony's
 * hunger. 0 while nobody works there.
 */
export function kiwaiWork(state: GameState, kiwai: Kiwai, resource?: ResourceId): number {
  if (kiwai.readyAt > state.now) return 0;
  const crew = orbitCrew(state, kiwai.id);
  if (crew.length === 0) return 0;
  const places: number[] = [];
  for (const m of workModules(kiwai, state.now)) {
    const bonus = panelBonus(kiwai, m, state.now);
    for (let i = 0; i < (MODULES[m.type].workSlots ?? 0); i++) places.push(1 + bonus);
  }
  if (places.length === 0) return 0;
  places.sort((a, b) => b - a);
  const beds = new Map<VillagerId, Bed>();
  const mood = colonyMood(state);
  const powers = crew
    .map((v) => {
      beds.set(v.id, ORBIT_BED);
      return (
        orbitPower(v, kiwai.type, resource) *
        presence(state, v, ORBIT_BED) *
        kiwiMoraleWork(state, v, beds, mood)
      );
    })
    .sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < Math.min(places.length, powers.length); i++) sum += powers[i]! * places[i]!;
  return sum * hungerWork(state);
}

/** What one kiwi of the greenhouse yields per hour of a resource (before its power). */
function greenhouseOutput(resource: 'juice' | 'fiber'): number {
  const type = resource === 'juice' ? 'juiceWell' : 'fiberWorkshop';
  const def = levelDef(type, ORBIT.greenhouse.level);
  return (
    ((def?.production?.[resource] ?? 0) / Math.max(1, def?.workerSlots ?? 1)) *
    ORBIT.greenhouse.share
  );
}

/** Juice and fibre per hour from the greenhouses in orbit (no season, no night). */
export function greenhouseRates(state: GameState): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const k of state.orbit.kiwais) {
    if (k.type !== 'greenhouse') continue;
    for (const r of ['juice', 'fiber'] as const) {
      const rate = kiwaiWork(state, k, r) * greenhouseOutput(r);
      if (rate > 0) out[r] = (out[r] ?? 0) + rate;
    }
  }
  return out;
}

/** Research points per hour from the observatories (no night up there). */
export function observatoryResearch(state: GameState): number {
  const base =
    (levelDef('library', ORBIT.observatory.level)?.research ?? 0) * ORBIT.observatory.share;
  let total = 0;
  for (const k of state.orbit.kiwais)
    if (k.type === 'observatory') total += kiwaiWork(state, k) * base;
  return total;
}

/** An observatory watches the sky: a working sensor with a kiwi up there. */
export function observatoryWatches(state: GameState): boolean {
  return state.orbit.kiwais.some((k) => k.type === 'observatory' && kiwaiWork(state, k) > 0);
}

/** Extra notice of comets and upwellings while an observatory watches. */
export function observatoryNotice(state: GameState): number {
  return observatoryWatches(state) ? ORBIT.observatory.noticeMs : 0;
}

/** Staffed, working berths of the docks. */
export function staffedBerths(state: GameState): number {
  let n = 0;
  for (const k of state.orbit.kiwais) {
    if (k.type !== 'dock' || k.readyAt > state.now) continue;
    const crew = orbitCrew(state, k.id).length;
    const berths = workModules(k, state.now).length;
    n += Math.min(berths, Math.ceil(crew / (MODULES.berth.workSlots ?? 1)));
  }
  return n;
}

/** Ships' travel times while the docks' berths are staffed (1: none). */
export function dockTravel(state: GameState): number {
  const n = staffedBerths(state);
  return n > 0 ? Math.max(ORBIT.dock.floor, ORBIT.dock.travel ** n) : 1;
}

/** Raw stardust units per ms the star harvest of a kiwai catches (0 with its tank full). */
export function kiwaiDustRate(state: GameState, kiwai: Kiwai): number {
  if (kiwai.type !== 'harvest' || kiwai.dust >= dustTank()) return 0;
  const work = kiwaiWork(state, kiwai);
  if (work <= 0) return 0;
  return Math.max(1, Math.round((ORBIT.dust.perHour * STARDUST_SCALE * work) / 3_600_000));
}

/** A kiwai's tank, in raw units. */
export function dustTank(): number {
  return ORBIT.dust.tank * STARDUST_SCALE;
}

/** Who may take the shuttle up: at home, not a Kikiwiwi, not wounded nor busy elsewhere. */
export function canFly(v: Villager): boolean {
  if (v.kikiwiwi) return false;
  const k = v.job.kind;
  return (
    k === 'idle' ||
    k === 'work' ||
    k === 'stardust' ||
    k === 'meteor' ||
    k === 'mine' ||
    k === 'guard'
  );
}

/** Why no module of that type can be set there (null: it can). */
export function moduleLock(
  state: GameState,
  kiwai: Kiwai | undefined,
  type: ModuleType,
  h: Hex,
): CommandError | null {
  if (!kiwai) return 'unknownKiwai';
  if (!MODULE_TYPES.includes(type)) return 'unknownModule';
  if (kiwai.readyAt > state.now) return 'kiwaiNotReady';
  if (!moduleFits(type, kiwai.type)) return 'moduleNotFit';
  if (kiwai.modules.length >= moduleSlots(state)) return 'moduleLimit';
  const spot = moduleSpotError(state, kiwai, h);
  if (spot === 'offSite') return 'unknownTile';
  if (spot === 'rock' || spot === 'pad') return 'tileNotAllowed';
  if (spot) return spot;
  const def = MODULES[type];
  if (!canAfford(state.resources, def.cost)) return 'notEnoughResources';
  if (crystalUnits(state.crystal) < def.crystal) return 'notEnoughCrystal';
  if (meteorIronOf(state) < def.iron) return 'notEnoughIron';
  return null;
}

/** Sets a module (the caller paid): assembled at the yard, working from `readyAt`. */
export function setModule(
  s: GameState,
  kiwai: Kiwai,
  type: ModuleType,
  h: Hex,
  now: TimeMs,
): OrbitModule {
  const m: OrbitModule = {
    id: `mod-${s.nextId++}`,
    type,
    q: h.q,
    r: h.r,
    readyAt: now + MODULES[type].durationMs,
  };
  kiwai.modules.push(m);
  return m;
}

/** Why that module cannot be taken down (null: it can). */
export function removeModuleLock(
  state: GameState,
  kiwai: Kiwai | undefined,
  moduleId: string,
): CommandError | null {
  if (!kiwai) return 'unknownKiwai';
  const m = kiwai.modules.find((x) => x.id === moduleId);
  if (!m) return 'unknownModule';
  if (m.type === 'habitat' && m.readyAt <= state.now) {
    const left = kiwaiHousing(kiwai, state.now) - (MODULES.habitat.housing ?? 0);
    if (housed(state, kiwai.id) > left) return 'habitatInUse';
  }
  return null;
}

export interface ShuttlePlan {
  kiwaiId: string;
  up: readonly VillagerId[];
  down: readonly VillagerId[];
}

/** Why the shuttle cannot fly that trip (null: it can). */
export function shuttleLock(state: GameState, plan: ShuttlePlan): CommandError | null {
  if (!yardOf(state)) return 'noOrbitalYard';
  const kiwai = kiwaiById(state, plan.kiwaiId);
  if (!kiwai) return 'unknownKiwai';
  if (kiwai.readyAt > state.now) return 'kiwaiNotReady';
  if (state.orbit.shuttle) return 'shuttleBusy';
  const seats = ORBIT.shuttle.seats;
  if (plan.up.length > seats || plan.down.length > seats) return 'shuttleFull';
  if (new Set([...plan.up, ...plan.down]).size !== plan.up.length + plan.down.length)
    return 'invalidCount';
  for (const id of plan.up) {
    const v = state.villagers.find((x) => x.id === id);
    if (!v) return 'unknownVillager';
    if (!canFly(v)) return v.kikiwiwi ? 'kikiwiwiNoWork' : 'kiwiBusy';
  }
  for (const id of plan.down) {
    const v = state.villagers.find((x) => x.id === id);
    if (!v) return 'unknownVillager';
    if (v.job.kind !== 'orbit' || v.job.kiwaiId !== kiwai.id || v.job.aboard) return 'notInOrbit';
  }
  const after = housed(state, kiwai.id) - plan.down.length + plan.up.length;
  if (plan.up.length > 0 && after > kiwaiHousing(kiwai, state.now)) return 'noHabitat';
  return null;
}

/** Flies the shuttle (checked by `shuttleLock`): up at half the trip, back at its end. */
export function flyShuttle(s: GameState, plan: ShuttlePlan, now: TimeMs): void {
  for (const id of plan.up) {
    const v = s.villagers.find((x) => x.id === id)!;
    const returnTo = borrow(v);
    v.job = { kind: 'orbit', kiwaiId: plan.kiwaiId, returnTo, aboard: 'up' };
  }
  for (const id of plan.down) {
    const v = s.villagers.find((x) => x.id === id)!;
    if (v.job.kind === 'orbit') v.job = { ...v.job, aboard: 'down' };
  }
  const kiwai = kiwaiById(s, plan.kiwaiId);
  if (kiwai && orbitCrew(s, kiwai.id).length === 0) stopRepairs(kiwai);
  s.orbit.shuttle = {
    kiwaiId: plan.kiwaiId,
    leftAt: now,
    upAt: now + ORBIT.shuttle.tripMs / 2,
    backAt: now + ORBIT.shuttle.tripMs,
    up: [...plan.up],
    down: [...plan.down],
    cargo: 0,
  };
}

/** The shuttle docks: the kiwis going up arrive, the tank of a star harvest is emptied. */
function dockShuttle(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const sh = s.orbit.shuttle!;
  sh.docked = true;
  for (const v of s.villagers)
    if (v.job.kind === 'orbit' && v.job.kiwaiId === sh.kiwaiId && v.job.aboard === 'up') {
      const { aboard: _up, ...job } = v.job;
      v.job = job;
    }
  const kiwai = kiwaiById(s, sh.kiwaiId);
  if (kiwai && sh.up.length > 0) startRepairs(s, kiwai, at);
  if (kiwai && kiwai.dust > 0) {
    sh.cargo += kiwai.dust;
    kiwai.dust = 0;
  }
  events.push({ type: 'shuttleDocked', at, kiwaiId: sh.kiwaiId, up: sh.up.length });
}

/** The shuttle is back: the kiwis coming down go home, the stardust into the stock. */
function landShuttle(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const sh = s.orbit.shuttle!;
  s.orbit.shuttle = null;
  const home: [Villager, BuildingId | null][] = [];
  for (const v of s.villagers)
    if (v.job.kind === 'orbit' && v.job.kiwaiId === sh.kiwaiId && v.job.aboard === 'down')
      home.push([v, v.job.returnTo]);
  sendBackAll(s, home);
  let dust = 0;
  if (sh.cargo > 0) {
    const room = Math.max(0, STARDUST_CAP - s.stardust);
    const take = Math.min(room, sh.cargo);
    s.stardust += take;
    dust = take;
    // What does not fit stays in the kiwai's tank: nothing is lost.
    const kiwai = kiwaiById(s, sh.kiwaiId);
    if (kiwai && sh.cargo > take) kiwai.dust = Math.min(dustTank(), kiwai.dust + sh.cargo - take);
  }
  events.push({
    type: 'shuttleBack',
    at,
    kiwaiId: sh.kiwaiId,
    down: home.length,
    stardust: dustPoints(dust),
  });
}

/** Adds `dtMs` of star harvest to the tanks (rates from the interval's start). */
export function accrueOrbit(
  s: GameState,
  rates: readonly { kiwai: Kiwai; rate: number }[],
  dtMs: number,
): void {
  for (const { kiwai, rate } of rates) kiwai.dust = Math.min(dustTank(), kiwai.dust + rate * dtMs);
}

// ---------------------------------------------------------------------------------------------
// Risks: breakdowns (announced, put off by a service, repaired up there) and comet swarms
// (announced with the comet; a shield, an evacuation, or repairs after)

function wearRng(s: GameState, kiwai: Kiwai): Rng {
  return createRng(`${s.seed}/${s.face}/kiwai/${kiwai.id}/wear/${kiwai.wear.n}`);
}

/** Modules that may break down now: assembled, working, of a kind that wears. */
function wearing(kiwai: Kiwai, now: TimeMs): OrbitModule[] {
  return kiwai.modules.filter((m) => MODULES[m.type].wears && moduleWorks(m, now));
}

/**
 * Plans the kiwai's next breakdown from `now` (its own public stream: the same for everyone
 * who looks): when, and which module. Nothing to plan without a module that wears.
 */
export function planWear(s: GameState, kiwai: Kiwai, now: TimeMs): void {
  const candidates = wearing(kiwai, now);
  if (candidates.length === 0) {
    kiwai.wear = { ...kiwai.wear, at: 0, moduleId: null };
    return;
  }
  const rng = wearRng(s, kiwai);
  const gap = Math.round(rng.range(ORBIT.wear.gapMs[0], ORBIT.wear.gapMs[1]));
  const m = candidates[rng.int(0, candidates.length - 1)]!;
  kiwai.wear = { n: kiwai.wear.n, at: now + Math.max(gap, ORBIT.wear.noticeMs), moduleId: m.id };
}

/** The breakdown of that kiwai is announced (its time minus the notice has passed). */
export function wearAnnounced(kiwai: Kiwai, now: TimeMs): boolean {
  return kiwai.wear.at > 0 && kiwai.wear.at - ORBIT.wear.noticeMs <= now;
}

/** How long the best mechanic up there takes to repair one module (Dexterity 5: `repairMs`). */
export function repairTime(state: GameState, kiwaiId: string): number | null {
  const crew = orbitCrew(state, kiwaiId);
  if (crew.length === 0) return null;
  const dex = Math.max(...crew.map((v) => v.stats.dexterity));
  return Math.round(ORBIT.wear.repairMs * (KIWI.stat.average / Math.max(1, dex)));
}

/** The crew up there starts on the broken modules, one after another. */
export function startRepairs(s: GameState, kiwai: Kiwai, now: TimeMs): void {
  const time = repairTime(s, kiwai.id);
  if (time === null) return;
  let at = now;
  for (const m of kiwai.modules) if (m.repairAt !== undefined) at = Math.max(at, m.repairAt);
  for (const m of kiwai.modules) {
    if (m.broken === undefined || m.repairAt !== undefined) continue;
    at += time;
    m.repairAt = at;
  }
}

/** Nobody left up there: the repairs wait. */
function stopRepairs(kiwai: Kiwai): void {
  for (const m of kiwai.modules) delete m.repairAt;
}

/** Why the kiwai's next breakdown cannot be put off now (null: it can). */
export function serviceLock(state: GameState, kiwai: Kiwai | undefined): CommandError | null {
  if (!kiwai) return 'unknownKiwai';
  if (kiwai.wear.at <= 0) return 'nothingToService';
  if (meteorIronOf(state) < ORBIT.wear.serviceIron) return 'notEnoughIron';
  return null;
}

/** A service (the caller paid): the next breakdown is drawn again from now. */
export function serviceKiwai(s: GameState, kiwai: Kiwai, now: TimeMs): void {
  kiwai.wear = { n: kiwai.wear.n + 1, at: 0, moduleId: null };
  planWear(s, kiwai, now);
}

/** The comet whose swarm is coming, once announced (null: none). */
export function comingSwarm(state: GameState): { id: string; at: TimeMs } | null {
  const c = state.comets.next;
  return c && c.announced && c.at > state.now ? { id: c.id, at: c.at } : null;
}

/** Why the kiwai's shield cannot be raised now (null: it can). */
export function shieldLock(state: GameState, kiwai: Kiwai | undefined): CommandError | null {
  if (!kiwai) return 'unknownKiwai';
  if (kiwai.readyAt > state.now) return 'kiwaiNotReady';
  const swarm = comingSwarm(state);
  if (!swarm) return 'noSwarm';
  if (kiwai.shield === swarm.id) return 'shieldRaised';
  if (dustPoints(state.stardust) < ORBIT.swarm.shieldDust) return 'notEnoughStardust';
  return null;
}

/**
 * A comet passes: its swarm sweeps every kiwai in orbit. A shield raised against it holds;
 * otherwise up to `hits` working modules break (drawn from the comet's public stream) and the
 * kiwis up there come down wounded in the pods. Nothing is lost: modules are repaired.
 */
export function swarmStrike(
  s: GameState,
  cometId: string,
  passes: number,
  at: TimeMs,
  events: GameEvent[],
): void {
  for (const k of s.orbit.kiwais) {
    if (k.readyAt > at) continue;
    if (k.shield === cometId) {
      delete k.shield;
      events.push({ type: 'swarmHit', at, kiwaiId: k.id, shielded: true, broken: 0, hurt: 0 });
      continue;
    }
    delete k.shield;
    const rng = createRng(`${s.seed}/${s.face}/comet/${passes}/swarm/${k.id}`);
    const pool = wearing(k, at);
    let broken = 0;
    for (let i = 0; i < ORBIT.swarm.hits && pool.length > 0; i++) {
      const m = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
      m.broken = at;
      broken++;
    }
    const crew = orbitCrew(s, k.id);
    for (const v of crew) v.job = { kind: 'injured', until: at + ORBIT.swarm.injuryMs };
    if (crew.length > 0) stopRepairs(k);
    // The module planned to wear may be broken now: the next breakdown is drawn again.
    if (broken > 0 && k.wear.moduleId && !wearing(k, at).some((m) => m.id === k.wear.moduleId))
      planWear(s, k, at);
    events.push({
      type: 'swarmHit',
      at,
      kiwaiId: k.id,
      shielded: false,
      broken,
      hurt: crew.length,
    });
  }
}

/** A planned breakdown happens: the module stops (repaired by the crew up there, if any). */
function breakDown(s: GameState, kiwai: Kiwai, at: TimeMs, events: GameEvent[]): void {
  const planned = kiwai.modules.find((m) => m.id === kiwai.wear.moduleId);
  const target = planned && moduleWorks(planned, at) ? planned : wearing(kiwai, at)[0];
  kiwai.wear = { n: kiwai.wear.n + 1, at: 0, moduleId: null };
  if (target) {
    target.broken = at;
    events.push({ type: 'moduleBroken', at, kiwaiId: kiwai.id, moduleType: target.type });
    startRepairs(s, kiwai, at);
  }
  planWear(s, kiwai, at);
}
