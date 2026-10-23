import { accrueForge, forgePower, forgeRate, forgeTick, nextForgeEvent } from './forge';
import type { ItemId } from '../data/gear';
import { accrueStardust, cometTick, nextCometEvent, planComet } from './comets';
import { footprintOf, isManualWorkplace, isProducer, type BuildingType } from '../data/buildings';
import type { TechId } from '../data/research';
import { RESOURCE_IDS, emptyResources, type ResourceId, type Resources } from '../data/resources';
import type { BuildingId, QueueItemId, TimeMs, VillagerId } from '../types/ids';
import { autoGarrisonAt, dispatchTasks, nextConstructionEnd, releaseFullCraters } from './tasks';
import {
  buildingHarvest,
  passiveRates,
  capacity,
  getBuilding,
  HOUR_MS,
  idleVillagers,
  reserveCapOf,
  reserveHolders,
  reserves,
  reserveTarget,
  storageFullCheck,
  workerSlots,
  workersOf,
} from './selectors';
import { resolveArrival, resolveReturn } from './expeditions';
import { deliveryTick, nextDeliveryEvent } from './deliveries';
import { canResolveArrival } from './aliens';
import { nextSiegeEvent, planCounter, siegeTick } from './siege';
import type { MasteryId, ShinyColor, StatId } from '../data/kiwis';
import { inLine, type ClassId } from '../data/classes';
import { accrueKiwis, buildingResource, nextKiwiEvent, workerPower } from './kiwis';
import { BIOMES } from '../data/biomes';
import { faceMapOf, rebaseFreeDeposits, syncPools, type Harvest } from './territory';
import type { Season } from '../data/cycles';
import { calendarAt, nextCalendarChange } from './calendar';
import { HUNGER_SCALE, NEEDS, type HungerStage } from '../data/needs';
import {
  canStarve,
  consumption,
  hungerCap,
  hungerRate,
  hungerStage,
  nextHungerEvent,
  pickStarving,
} from './needs';
import { removeVillagers } from './expeditions';
import type { IncidentKind } from '../data/threats';
import { nextThreatEvent, planWave, threatTick } from './threats';
import { accrueIron, meteorIronRate, meteorRate, nextSkyEvent, planMeteor, skyTick } from './sky';
import { obstacleAt, removeObstacle } from './obstacles';
import { finishInfusions, nextInfusionEnd } from './kikiwiwi';
import { finishTitanWorks, nextTitanEnd } from './titan';
import type { TerraformKind, TitanWork } from '../data/titan';
import type { ObstacleKind } from '../data/obstacles';
import { accrueResearch, nextResearchEvent, researchPower, researchTick } from './research';
import { autoPlace, awaitedResources, belowReturn, redirectFull, returnHome } from './posts';
import { JOBS } from '../data/jobs';
import {
  addVillager,
  cloneState,
  nextId,
  type Building,
  type Expedition,
  type MissionKind,
  type GameState,
  type Meteor,
  type QueueItem,
  type Villager,
} from './state';

export type GameEvent =
  | {
      type: 'constructionComplete';
      at: TimeMs;
      buildingId: BuildingId;
      buildingType: BuildingType;
      level: number;
      q: number;
      r: number;
    }
  | {
      type: 'constructionStarted';
      at: TimeMs;
      queueItemId: QueueItemId;
      builderId: VillagerId | null;
    }
  | {
      type: 'hatched';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      shiny: ShinyColor | null;
    }
  /** `stat`: the point drawn on odd levels (null on even levels: a point to place). */
  | {
      type: 'levelUp';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      level: number;
      stat: StatId | null;
    }
  | { type: 'trained'; at: TimeMs; villagerId: VillagerId; name: string; classId: ClassId }
  | { type: 'speechOver'; at: TimeMs }
  | { type: 'mourningOver'; at: TimeMs }
  | {
      type: 'masteryUp';
      at: TimeMs;
      villagerId: VillagerId;
      name: string;
      mastery: MasteryId;
      rank: number;
    }
  /** Chantier 37: a kiwi reached a new rank in its class. */
  | { type: 'classRankUp'; at: TimeMs; villagerId: VillagerId; name: string; rank: number }
  | { type: 'storageFull'; at: TimeMs; resource: ResourceId }
  /** Chantier 09: harvesters of a full stock went elsewhere, or came back to it. */
  | { type: 'kiwisRedirected'; at: TimeMs; resource: ResourceId; count: number }
  | { type: 'kiwisReturned'; at: TimeMs; resource: ResourceId; count: number }
  /** Chantier 08: an obstacle was removed (loot credited), a crater left a wreck. */
  | {
      type: 'obstacleCleared';
      at: TimeMs;
      q: number;
      r: number;
      kind: ObstacleKind;
      loot: Partial<Resources>;
      by: 'kiwis' | 'titan';
      /** Chantier 38: whole units of meteoric iron (wrecks). */
      iron?: number;
    }
  | { type: 'wreckLeft'; at: TimeMs; q: number; r: number }
  /** Chantier 08: an infusion ended (a Kikiwiwi, or a failure: hurt and weakened). */
  | { type: 'kikiwiwiBorn'; at: TimeMs; villagerId: VillagerId; name: string }
  | { type: 'infusionFailed'; at: TimeMs; villagerId: VillagerId; name: string }
  /** Chantier 08: a titan work ended; a tile took a new shape. */
  | { type: 'titanDone'; at: TimeMs; villagerId: VillagerId; name: string; work: TitanWork }
  | {
      type: 'terraformed';
      at: TimeMs;
      q: number;
      r: number;
      kind: TerraformKind;
      villagerId: VillagerId;
    }
  | { type: 'seasonChanged'; at: TimeMs; season: Season }
  /** A food stock ran dry: the colony eats what is harvested and goes hungry. */
  | { type: 'foodRanOut'; at: TimeMs; resource: 'pulp' | 'juice' }
  | { type: 'hungerChanged'; at: TimeMs; stage: HungerStage }
  | { type: 'starved'; at: TimeMs; villagerId: VillagerId; name: string }
  | {
      type: 'expeditionArrived';
      at: TimeMs;
      expeditionId: string;
      victory: boolean;
      mission?: MissionKind;
      spotted?: boolean;
      broken?: boolean;
    }
  | { type: 'expeditionReturned'; at: TimeMs; expeditionId: string }
  /** Deliveries between allies: our ship reached the ally, came back; a gift landed here. */
  | { type: 'cargoDelivered'; at: TimeMs; shipmentId: string; to: string; resources: Resources }
  | { type: 'shipmentReturned'; at: TimeMs; shipmentId: string }
  | {
      type: 'cargoReceived';
      at: TimeMs;
      deliveryId: string;
      from: string;
      received: Resources;
      /** What did not fit in the storage. */
      lost: Resources;
    }
  /** Chantier 19: kiwis from our other colony landed (new ids here). */
  | { type: 'settlersArrived'; at: TimeMs; deliveryId: string; names: string[] }
  /** Chantier 06: predators. */
  | {
      type: 'waveAnnounced';
      at: TimeMs;
      waveId: string;
      strikeAt: TimeMs;
      ground: number;
      air: number;
    }
  | { type: 'waveStruck'; at: TimeMs; waveId: string; victory: boolean }
  | {
      type: 'incident';
      at: TimeMs;
      kind: IncidentKind;
      blocked: boolean;
      resource: ResourceId | null;
      amount: number;
    }
  | { type: 'shelterOver'; at: TimeMs }
  | { type: 'injuryHealed'; at: TimeMs; villagerId: VillagerId; name: string }
  | {
      type: 'meteorAnnounced';
      at: TimeMs;
      strikeAt: TimeMs;
      q: number;
      r: number;
      resource: ResourceId;
    }
  | {
      type: 'meteorLanded';
      at: TimeMs;
      q: number;
      r: number;
      resource: ResourceId;
      stock: number;
      /** Chantier 38: whole units of meteoric iron in the crater. */
      iron: number;
    }
  /** Chantier 38: a piece left the Forge for the armory. */
  | { type: 'itemForged'; at: TimeMs; item: ItemId }
  /** Chantier 38: the meteoric iron stock is full (the craters' miners go back to work). */
  | { type: 'ironFull'; at: TimeMs }
  | { type: 'meteorFaded'; at: TimeMs; q: number; r: number; resource: ResourceId }
  /** Chantier 13: a comet is seen in the sky, then drops stardust on a few tiles. */
  | { type: 'cometAnnounced'; at: TimeMs; passAt: TimeMs }
  | { type: 'cometPassed'; at: TimeMs; patches: { q: number; r: number; stock: number }[] }
  /** All the stardust of a tile was picked up. */
  | { type: 'dustPicked'; at: TimeMs; q: number; r: number }
  /** The stardust of a tile scattered (`left` points lost). */
  | { type: 'dustFaded'; at: TimeMs; q: number; r: number; left: number }
  /** The stardust stock is full: the pickers go back to work. */
  | { type: 'stardustFull'; at: TimeMs }
  /** Chantier 08: a technology is researched; the monument opens a new age. */
  | { type: 'researchDone'; at: TimeMs; tech: TechId }
  | { type: 'ageReached'; at: TimeMs; age: number }
  /** Chantier 19: the siege of the twin face. */
  | { type: 'counterAnnounced'; at: TimeMs; sector: number; strikeAt: TimeMs }
  | { type: 'counterStruck'; at: TimeMs; sector: number; victory: boolean; dead: number }
  | { type: 'bridgeheadFortified'; at: TimeMs; sector: number }
  | {
      type: 'repaired';
      at: TimeMs;
      buildingId: BuildingId;
      buildingType: BuildingType;
      q: number;
      r: number;
    };

export interface AdvanceResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Pure time-based simulation (Ogame model): computes everything that happened between
 * `state.now` and `now` — production, finished constructions, hatched eggs — no matter how long
 * the player was away. It jumps from event to event; between two events every rate is constant,
 * so production is integrated exactly.
 */
export function advance(state: GameState, now: TimeMs): AdvanceResult {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  advanceInPlace(s, now, events);
  return { state: s, events };
}

/** Mutating version used internally (and by command handlers working on a fresh copy). */
export function advanceInPlace(s: GameState, now: TimeMs, events: GameEvent[]): void {
  // Reshaped tiles change the map (titan works): it is read again after each of them.
  let map = faceMapOf(s);
  syncPools(s, map, s.now);
  returnHome(s, s.now, events);
  let stage = hungerStage(s);
  // Guard against pathological loops; each iteration consumes at least one event.
  for (let guard = 0; guard < 100_000; guard++) {
    // The next wave is planned as soon as the beginners' protection is over (or after a wave).
    planWave(s);
    planMeteor(s);
    planComet(s);
    planCounter(s);
    const constructionEnd = nextConstructionEnd(s);
    const eggEnd = s.egg ? s.egg.readyAt : Infinity;
    const expedition = nextExpeditionEvent(s);
    const flows = computeFlows(s);
    const trainingEnd = nextTrainingEnd(s);
    const speechEnd = s.speechUntil > s.now ? s.speechUntil : Infinity;
    const mourningEnd = s.mourningUntil > s.now ? s.mourningUntil : Infinity;
    // Nightfall and dawn change work rates (seasons change at dawn).
    const calendarChange = nextCalendarChange(s.calendarStart, s.now);
    const threatAt = nextThreatEvent(s);
    const skyAt = nextSkyEvent(s);
    const cometAt = nextCometEvent(s);
    const injuryEnd = nextInjuryEnd(s);
    const researchAt = nextResearchEvent(s);
    const forgeAt = nextForgeEvent(s);
    const deliveryAt = nextDeliveryEvent(s);
    const infusionEnd = nextInfusionEnd(s);
    const titanEnd = nextTitanEnd(s);
    const siegeAt = nextSiegeEvent(s);
    // Chantier 15: the automatic garrison posts its guards a little before a strike.
    const garrisonAt = autoGarrisonAt(s);
    const nextEvent = Math.min(
      garrisonAt,
      siegeAt,
      infusionEnd,
      titanEnd,
      researchAt,
      forgeAt,
      deliveryAt,
      threatAt,
      skyAt,
      cometAt,
      injuryEnd,
      calendarChange,
      flows.hungerAt,
      mourningEnd,
      constructionEnd,
      eggEnd,
      expedition?.at ?? Infinity,
      flows.nextChange,
      nextKiwiEvent(s),
      trainingEnd,
      speechEnd,
    );
    const target = Math.min(nextEvent, now);
    const before = events.length;
    if (target > s.now) {
      accrue(s, flows, target - s.now, target, events);
      s.now = target;
    }
    if (nextEvent > now) break;
    if (constructionEnd === nextEvent) {
      // Several sites can end at the same time (chantier 15: constructions in parallel).
      for (const item of s.queue.filter(
        (i) => i.startedAt !== null && i.startedAt + i.durationMs === constructionEnd,
      ))
        completeConstruction(s, item, constructionEnd, events);
      syncPools(s, map, constructionEnd);
    }
    if (s.egg && s.egg.readyAt <= now && s.egg.readyAt === nextEvent) {
      hatch(s, s.egg.readyAt, events);
    }
    if (trainingEnd === nextEvent) finishTrainings(s, trainingEnd, events);
    if (infusionEnd === nextEvent) finishInfusions(s, infusionEnd, events);
    if (titanEnd === nextEvent) {
      finishTitanWorks(s, titanEnd, events);
      map = faceMapOf(s);
    }
    if (speechEnd === nextEvent) events.push({ type: 'speechOver', at: speechEnd });
    if (mourningEnd === nextEvent) events.push({ type: 'mourningOver', at: mourningEnd });
    if (calendarChange === nextEvent) calendarTick(s, calendarChange, events);
    if (flows.hungerAt === nextEvent) starve(s, nextEvent, events);
    if (injuryEnd === nextEvent) healInjuries(s, injuryEnd, events);
    if (threatAt === nextEvent) threatTick(s, threatAt, events);
    if (skyAt === nextEvent) skyTick(s, skyAt, events);
    if (cometAt === nextEvent) cometTick(s, cometAt, events);
    if (researchAt === nextEvent) researchTick(s, researchAt, events);
    if (forgeAt === nextEvent) forgeTick(s, forgeAt, events);
    if (deliveryAt === nextEvent) deliveryTick(s, deliveryAt, events);
    if (siegeAt === nextEvent) siegeTick(s, siegeAt, events);
    const st = hungerStage(s);
    if (st !== stage) {
      events.push({ type: 'hungerChanged', at: s.now, stage: st });
      stage = st;
    }
    if (expedition && expedition.at === nextEvent) {
      const e = expedition.expedition;
      if (e.status === 'outbound') {
        resolveArrival(s, e);
        events.push({
          type: 'expeditionArrived',
          at: e.arriveAt,
          expeditionId: e.id,
          victory: e.result!.victory,
          mission: e.mission,
          ...(e.result!.spotted ? { spotted: true } : {}),
          ...(e.result!.broken ? { broken: true } : {}),
        });
      } else {
        resolveReturn(s, e, events);
        for (const v of s.villagers)
          if (v.job.kind === 'idle' && e.crew.includes(v.id)) autoAssign(s, v);
        events.push({ type: 'expeditionReturned', at: e.returnAt, expeditionId: e.id });
      }
    }
    // A stock fell or filled up, a workplace opened: kiwis move on their own (chantier 09).
    returnHome(s, nextEvent, events);
    const filled = new Set<ResourceId>();
    for (let i = before; i < events.length; i++) {
      const e = events[i]!;
      if (e.type === 'storageFull') filled.add(e.resource);
    }
    if (filled.size > 0) releaseFullCraters(s);
    if (s.automation.redirect) {
      if (constructionEnd === nextEvent) redirectFull(s, nextEvent, events);
      else if (filled.size > 0) redirectFull(s, nextEvent, events, filled);
    }
    dispatchTasks(s, nextEvent, events);
  }
  s.now = Math.max(s.now, now);
}

/** Dawn or nightfall: a new season starts at the first dawn of its first day. */
function calendarTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const c = calendarAt(s.calendarStart, at);
  if (!c.night && c.day === 0 && c.sinceDawn === 0) {
    const map = faceMapOf(s);
    rebaseFreeDeposits(s, map, at);
    // Floods (lagoons) take tiles out of the catchments for the season, and give them back.
    if (BIOMES[s.params.biome].floods) syncPools(s, map, at);
    events.push({ type: 'seasonChanged', at, season: c.season });
  }
}

/** At the last hunger stage a kiwi starves (guard rails permitting), then the gauge eases. */
function starve(s: GameState, at: TimeMs, events: GameEvent[]): void {
  if (s.hunger < NEEDS.stages.starving * HUNGER_SCALE || !canStarve(s)) return;
  const v = pickStarving(s);
  if (!v) return;
  removeVillagers(s, [v.id], 'famine', at);
  s.hunger -= NEEDS.deathRelief * HUNGER_SCALE;
  events.push({ type: 'starved', at, villagerId: v.id, name: v.name });
}

interface Flows {
  /** Net change of every stock per hour (production minus what the kiwis eat). */
  rates: Resources;
  pools: { b: Building; delta: number; cap: number }[];
  /** Meteorite craters being picked (stock change per hour, negative). */
  meteors: { m: Meteor; delta: number }[];
  /** Chantier 38: craters giving iron (raw units per ms, integers). */
  iron: { m: Meteor; rate: number }[];
  /** Chantier 38: work on the Forge's first order (raw units per ms). */
  forge: number;
  /** Hunger gauge change in raw units per ms. */
  hunger: number;
  /** Next time a rate changes on its own (a deposit runs dry, a storage fills or empties). */
  nextChange: TimeMs;
  /** Next hunger stage change or death. */
  hungerAt: TimeMs;
}

/** Every rate of the colony, constant until `nextChange` or the next game event. */
function computeFlows(s: GameState): Flows {
  const never = () => false;
  // Gross production (as if no storage were full) and the harvested part of it.
  const production = emptyResources();
  const harvested = emptyResources();
  const harvests: { b: Building; h: Harvest }[] = [];
  for (const b of s.buildings) {
    const p = passiveRates(s, b);
    for (const id of RESOURCE_IDS) production[id] += p[id];
    const h = buildingHarvest(s, b, never);
    if (!h) continue;
    production[h.resource] += h.output;
    harvested[h.resource] += h.output;
    if (b.pool) harvests.push({ b, h });
  }
  // Meteorite craters: temporary posts (chantier 15; no climate: a gift from the sky).
  const picked: { m: Meteor; rate: number }[] = [];
  for (const m of s.sky.meteors) {
    const rate = meteorRate(s, m);
    if (rate <= 0) continue;
    production[m.resource] += rate;
    harvested[m.resource] += rate;
    picked.push({ m, rate });
  }
  const iron: Flows['iron'] = [];
  for (const m of s.sky.meteors) {
    const rate = meteorIronRate(s, m);
    if (rate > 0) iron.push({ m, rate });
  }
  const full = storageFullCheck(s, production);
  const eaten = consumption(s);
  // A full storage only takes what the kiwis eat: harvesting slows down to the meals (the
  // deposits still drain for them), the stock stays full.
  const share = emptyResources();
  for (const id of RESOURCE_IDS) {
    if (!full(id)) share[id] = 1;
    else if (harvested[id] > 0) {
      const passive = production[id] - harvested[id];
      share[id] = Math.min(1, Math.max(0, (eaten[id] - passive) / harvested[id]));
    }
  }
  const pools: Flows['pools'] = [];
  let next = Infinity;
  for (const { b, h } of harvests) {
    const harvest = h.harvest * share[h.resource];
    pools.push({ b, delta: h.regen - harvest, cap: h.cap });
    if (h.status === 'ok' && harvest > h.regen) {
      const dry = (h.stock / (harvest - h.regen)) * HOUR_MS;
      next = Math.min(next, s.now + Math.max(1, Math.ceil(dry)));
    }
  }
  const meteors: Flows['meteors'] = [];
  for (const { m, rate } of picked) {
    const take = rate * share[m.resource];
    if (take <= 0) continue;
    meteors.push({ m, delta: -take });
    next = Math.min(next, s.now + Math.max(1, Math.ceil((m.stock / take) * HOUR_MS)));
  }
  const rates = emptyResources();
  const deficit = { pulp: 0, juice: 0 };
  for (const id of RESOURCE_IDS) {
    if (full(id)) continue;
    let net = production[id] - eaten[id];
    if (net < 0 && s.resources[id] <= 0) {
      // Nothing left in stock: the kiwis eat what is harvested, the rest is missing.
      if (id === 'pulp' || id === 'juice') deficit[id] = -net / eaten[id];
      net = 0;
    }
    rates[id] = net;
  }
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) {
    if (rates[id] > 0 && s.resources[id] < cap[id]) {
      const fill = ((cap[id] - s.resources[id]) / rates[id]) * HOUR_MS;
      next = Math.min(next, s.now + Math.max(1, Math.ceil(fill)));
    } else if (rates[id] > 0) {
      // Chantier 30: the warehouse taking the overflow fills up.
      const target = reserveTarget(s, id);
      if (target) {
        const fill = (target.room / rates[id]) * HOUR_MS;
        next = Math.min(next, s.now + Math.max(1, Math.ceil(fill)));
      }
    } else if (rates[id] < 0) {
      const empty = (s.resources[id] / -rates[id]) * HOUR_MS;
      next = Math.min(next, s.now + Math.max(1, Math.ceil(empty)));
    }
  }
  // Redirected kiwis go home when their stock falls below the return threshold.
  for (const id of awaitedResources(s)) {
    const threshold = cap[id] * JOBS.returnBelow;
    if (rates[id] < 0 && !belowReturn(s, id)) {
      const ms = ((s.resources[id] - threshold) / -rates[id]) * HOUR_MS;
      next = Math.min(next, s.now + Math.max(1, Math.ceil(ms)));
    }
  }
  const hunger = hungerRate(s, deficit);
  return {
    rates,
    pools,
    meteors,
    iron,
    forge: forgeRate(s),
    hunger,
    nextChange: next,
    hungerAt: nextHungerEvent(s, hunger),
  };
}

function accrue(s: GameState, flows: Flows, dtMs: number, at: TimeMs, events: GameEvent[]): void {
  const { rates } = flows;
  const cap = capacity(s);
  for (const id of RESOURCE_IDS) {
    const before = s.resources[id];
    const gain = (rates[id] * dtMs) / HOUR_MS;
    if (gain < 0) {
      // Eaten: the stock never goes below zero (the next round starts the shortage).
      const after = before + gain > 1e-9 ? before + gain : 0;
      s.resources[id] = after;
      if (after === 0 && before > 0 && (id === 'pulp' || id === 'juice')) {
        const emptyMs = (before / -rates[id]) * HOUR_MS;
        events.push({ type: 'foodRanOut', at: Math.round(at - dtMs + emptyMs), resource: id });
      }
      continue;
    }
    if (gain === 0) continue;
    // Never destroy stock above capacity (e.g. rewards), just stop producing.
    let after = before >= cap[id] ? before : Math.min(cap[id], before + gain);
    if (after < cap[id] && cap[id] - after < 1e-6) after = cap[id];
    s.resources[id] = after;
    s.stats.produced[id] += after - before;
    // Chantier 30: the overflow goes into the warehouses' reserves.
    const overflow = before >= cap[id] ? gain : Math.max(0, before + gain - cap[id]);
    if (overflow > 0) {
      const room = reserves(s);
      const free = room.cap[id] - room.stock[id];
      s.stats.produced[id] += pourReserve(s, id, overflow);
      if (free > 1e-6 && !reserveTarget(s, id)) {
        const fillMs = (free / rates[id]) * HOUR_MS;
        events.push({ type: 'storageFull', at: Math.round(at - dtMs + fillMs), resource: id });
      }
    }
    if (before < cap[id] && after >= cap[id] && !reserveTarget(s, id)) {
      // Exact time the storage filled up (for the "while you were away" summary).
      const fillMs = ((cap[id] - before) / rates[id]) * HOUR_MS;
      events.push({ type: 'storageFull', at: Math.round(at - dtMs + fillMs), resource: id });
    }
  }
  for (const p of flows.pools) {
    const stock = p.b.pool!.stock + (p.delta * dtMs) / HOUR_MS;
    p.b.pool!.stock = stock < 1e-6 ? 0 : Math.min(p.cap, stock);
  }
  for (const { m, delta } of flows.meteors) {
    const stock = m.stock + (delta * dtMs) / HOUR_MS;
    m.stock = stock < 1e-6 ? 0 : stock;
  }
  if (flows.hunger !== 0)
    s.hunger = Math.min(hungerCap(s), Math.max(0, s.hunger + flows.hunger * dtMs));
  // Research first: its rate depends on the kiwis as they were during the interval.
  accrueResearch(s, dtMs);
  accrueStardust(s, dtMs);
  accrueIron(s, flows.iron, dtMs, at, events);
  accrueForge(s, flows.forge, dtMs);
  accrueKiwis(s, dtMs, at, events);
}

/** Pours an overflow into the reserves, one warehouse after another; returns what fitted. */
function pourReserve(s: GameState, id: ResourceId, amount: number): number {
  let left = amount;
  for (const b of reserveHolders(s)) {
    if (left <= 0) break;
    const reserve = (b.reserve ??= emptyResources());
    const room = reserveCapOf(s, b) - reserve[id];
    if (room <= 1e-6) continue;
    const put = Math.min(room, left);
    reserve[id] = room - put < 1e-6 ? reserve[id] + room : reserve[id] + put;
    left -= put;
  }
  return amount - Math.max(0, left);
}

function completeConstruction(
  s: GameState,
  item: QueueItem,
  at: TimeMs,
  events: GameEvent[],
): void {
  s.queue = s.queue.filter((i) => i.id !== item.id);
  let buildingId: BuildingId;
  if (item.kind === 'repair') {
    const b = getBuilding(s, item.buildingId!);
    if (b) {
      delete b.damaged;
      events.push({
        type: 'repaired',
        at,
        buildingId: b.id,
        buildingType: b.type,
        q: b.q,
        r: b.r,
      });
    }
    releaseBuilder(s, item.id, false);
    return;
  }
  if (item.kind === 'clear') {
    const o = obstacleAt(s, item.q, item.r);
    if (o) removeObstacle(s, o, at, events, 'kiwis');
    releaseBuilder(s, item.id, false);
    return;
  }
  if (item.kind === 'build') {
    buildingId = nextId(s, 'b') as BuildingId;
    s.buildings.push({
      id: buildingId,
      type: item.buildingType,
      q: item.q,
      r: item.r,
      level: 1,
      richness: item.richness,
      builtAt: at,
      ...(item.rot !== undefined ? { rot: item.rot } : {}),
      // A big site from an older save without room comes out cramped (chantier 35).
      ...(item.rot === undefined && footprintOf(item.buildingType) > 1
        ? { cramped: true as const }
        : {}),
    });
  } else {
    const b = getBuilding(s, item.buildingId!);
    if (!b) return releaseBuilder(s, item.id, false);
    b.level = item.targetLevel;
    // Chantier 35: a cramped building spreads over the room its upgrade reserved.
    if (b.cramped && item.rot !== undefined) {
      delete b.cramped;
      b.rot = item.rot;
    }
    // A new level comes out as good as new.
    delete b.damaged;
    buildingId = b.id;
  }
  s.stats.constructionsCompleted++;
  events.push({
    type: 'constructionComplete',
    at,
    buildingId,
    buildingType: item.buildingType,
    level: item.targetLevel,
    q: item.q,
    r: item.r,
  });
  if (item.buildingType === 'monument')
    events.push({ type: 'ageReached', at, age: item.targetLevel });

  // A brand-new workplace gets an idle kiwi automatically (autonomous villagers).
  if (
    item.kind === 'build' &&
    isProducer(item.buildingType) &&
    !isManualWorkplace(item.buildingType)
  ) {
    const idle = bestIdleFor(s, getBuilding(s, buildingId)!);
    if (idle) idle.job = { kind: 'work', buildingId };
  }

  releaseBuilder(s, item.id, true);
}

/**
 * Releases the builder of a finished item: back to its previous workplace if there is still
 * room, otherwise it looks for work by itself.
 */
function releaseBuilder(s: GameState, itemId: QueueItemId, built: boolean): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'build' || v.job.queueItemId !== itemId) continue;
    if (built) v.history.built++;
    const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
    if (back && workersOf(s, back.id).length < workerSlots(back)) {
      v.job = { kind: 'work', buildingId: back.id };
    } else {
      v.job = { kind: 'idle' };
      autoAssign(s, v);
    }
  }
}

function hatch(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const star = !!s.egg?.star;
  s.egg = null;
  const v = addVillager(s, at, star);
  s.stats.eggsHatched++;
  events.push({ type: 'hatched', at, villagerId: v.id, name: v.name, shiny: v.shiny });
  autoAssign(s, v);
}

/**
 * Newborn and freed kiwis look for work on their own: they go to the producing building with
 * a free slot and the lowest staffing ratio, where they are the most skilled on ties. Kiwis
 * idled by the player stay idle.
 */
export function autoAssign(s: GameState, v: Villager): void {
  // Kikiwiwis never take a workplace (garrison, expeditions and titan works only).
  if (v.kikiwiwi) return;
  const b = autoPlace(s, v);
  if (b) v.job = { kind: 'work', buildingId: b.id };
}

/** The idle kiwi that would work best in a building (masters first). */
export function bestIdleFor(s: GameState, b: Building): Villager | undefined {
  return idleByPower(s, b)[0];
}

/** Idle kiwis, best workers for this building first (stable on ties). */
export function idleByPower(s: GameState, b: Building): Villager[] {
  const resource = buildingResource(s, b);
  const idle = idleVillagers(s).filter(
    // Chantier 37: only kiwis with a class drill at the training camp.
    (v) => !v.kikiwiwi && (b.type !== 'trainingCamp' || v.classId !== null),
  );
  // Chantier 15: the Library takes the kiwis with the most Spirit first (38: the Forge, its smiths).
  const power =
    b.type === 'library'
      ? researchPower
      : b.type === 'forge'
        ? forgePower
        : resource
          ? (v: Villager) => workerPower(v, resource)
          : null;
  if (!power) return idle;
  return idle
    .map((v, i) => ({ v, i, p: power(v) }))
    .sort((a, c) => c.p - a.p || a.i - c.i)
    .map((x) => x.v);
}

function nextInjuryEnd(s: GameState): TimeMs {
  let next = Infinity;
  for (const v of s.villagers) if (v.job.kind === 'injured') next = Math.min(next, v.job.until);
  return next;
}

/** Injured kiwis whose rest ends at `at` go back to work. */
function healInjuries(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'injured' || v.job.until !== at) continue;
    v.job = { kind: 'idle' };
    events.push({ type: 'injuryHealed', at, villagerId: v.id, name: v.name });
    autoAssign(s, v);
  }
}

function nextTrainingEnd(s: GameState): TimeMs {
  let next = Infinity;
  for (const v of s.villagers) if (v.job.kind === 'train') next = Math.min(next, v.job.until);
  return next;
}

/** Trainees whose course ends at `at` get their class and go back to work. */
function finishTrainings(s: GameState, at: TimeMs, events: GameEvent[]): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'train' || v.job.until !== at) continue;
    // Chantier 37: a promotion keeps the skills (and their cooldowns); any new class starts
    // at rank 1.
    if (!inLine(v.job.classId, v.classId ?? v.job.classId) || !v.classId) v.skillReadyAt = {};
    v.classId = v.job.classId;
    v.classXp = 0;
    v.job = { kind: 'idle' };
    events.push({ type: 'trained', at, villagerId: v.id, name: v.name, classId: v.classId });
    autoAssign(s, v);
  }
}

function nextExpeditionEvent(s: GameState): { at: TimeMs; expedition: Expedition } | null {
  let best: { at: TimeMs; expedition: Expedition } | null = null;
  for (const e of s.expeditions) {
    // Online, the client never holds the real garrison: the server resolves the landing.
    const at =
      e.status === 'outbound'
        ? canResolveArrival(s, e)
          ? e.arriveAt
          : Infinity
        : e.status === 'returning'
          ? e.returnAt
          : Infinity;
    if (at !== Infinity && (!best || at < best.at)) best = { at, expedition: e };
  }
  return best;
}

/** Utility for UIs: remaining time of the first construction to end. */
export function constructionRemaining(s: GameState, now: TimeMs): number {
  const end = nextConstructionEnd(s);
  return end === Infinity ? 0 : Math.max(0, end - now);
}
