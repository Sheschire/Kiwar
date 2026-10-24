import { returnGear } from './forge';
import { FUEL } from '../data/comets';
import { COLONY } from '../data/colonies';
import { levelDef } from '../data/buildings';
import {
  alienDefOf,
  EXPEDITIONS,
  RECON,
  SHIP_REPAIR,
  SHIPS,
  shipIdForAge,
  type ShipDef,
} from '../data/expeditions';
import { emptyResources, RESOURCE_IDS, type Resources } from '../data/resources';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { getBuilding, HOUR_MS, idleVillagers, workersOf } from './selectors';
import { ageOf, techEffects } from './research';
import {
  withRng,
  type Building,
  type Expedition,
  type ExpeditionTarget,
  type GameState,
  type MissionKind,
  type IntelRange,
  type Memorial,
  type Villager,
} from './state';
import { KIWI, MEMORIAL_MAX } from '../data/kiwis';
import { MORALE } from '../data/needs';
import type { GameEvent } from './advance';
import { grantClassXp, grantXp, hasSkill, kiwiExposure, kiwiStrength, modifiers } from './kiwis';
import { CAMP, inLine, SKILLS } from '../data/classes';
import { intelView } from './aliens';
import { landSettlers } from './colonies';
import { landingForecast, resolveLanding, type LandingForecast } from './landing';
import { LANDING, type LandingOrders } from '../data/landing';
import {
  allHolders,
  assaultEnemy,
  bridgeheadAt,
  finalForecast,
  forgetHolders,
  type FinalForecast,
} from './siege';

export interface ExpeditionPlan {
  launchpadId: BuildingId;
  targetId: string;
  /** The kiwis chosen to board, or a head count (picked like `availableCrew`). */
  crew: number | readonly VillagerId[];
  /** Food and drink loaded on the ship. */
  provisions: { pulp: number; juice: number };
  /** Raid (default) or reconnaissance. */
  mission?: MissionKind;
  /** Chantier 13: stardust burnt as fuel (faster, fewer breakdowns). */
  fuel?: boolean;
  /** Chantier 19: outer sector of an assault or a reinforcement. */
  sector?: number;
  /** Chantier 19: assault crew members who stay on the bridgehead if it is taken. */
  holders?: readonly VillagerId[];
  /** Chantier 19: posted kiwis a reinforcement brings back home. */
  bringBack?: readonly VillagerId[];
  /** Chantier 19: what the settlers' ship carries to found the colony (mission `found`). */
  freight?: Partial<Resources>;
  /** Chantier 40: the orders of a landing (mission `land`; the parcel is `sector`). */
  orders?: LandingOrders;
}

/** What a reconnaissance crew can expect (chantier 07). */
export interface ReconForecast {
  /** Report quality (0–1): sectors seen and precision of the ranges. */
  quality: number;
  /** Chance to be spotted (skirmish, worse report). */
  spotChance: number;
  /** Sectors revealed if unseen. */
  sectors: number;
  /** Half-width of the reported ranges (share of the real values). */
  spread: number;
}

/** `unknown`: no report on the target yet (chantier 07: the real defense is hidden). */
export type Odds = 'likely' | 'uncertain' | 'unlikely' | 'unknown';

export interface ExpeditionForecast {
  cargo: number;
  /** Cargo used at departure (crew + provisions). */
  weight: number;
  travelMs: number;
  /** Rations needed for each leg (full crew). */
  needOneWay: { pulp: number; juice: number };
  /** Share of the outbound rations covered (0–1). */
  fed: number;
  /** Provisions left for the return if nobody is lost (can be negative = shortfall). */
  returnSurplus: { pulp: number; juice: number };
  strength: { min: number; max: number };
  /** Defense as estimated from the latest report (aged), null when nothing is known. */
  defense: IntelRange | null;
  odds: Odds;
  /** Cargo room free on the way back, for loot (if everyone survives). */
  lootRoom: number;
  /** Kiwis boarding (empty if the choice is invalid). */
  crew: Villager[];
  /** Kiwis hit in battle at average luck (lost, or only wounded when `woundsOnly`). */
  expectedLosses: number;
  /** Chantier 18: a victory is expected, so the kiwis hit come back wounded, not dead. */
  woundsOnly: boolean;
  /** Chance of each kiwi to be hit in battle at average luck (0–1). */
  risk: Record<string, number>;
  mission: MissionKind;
  /** Reconnaissance only. */
  recon: ReconForecast | null;
  ship: ShipDef;
  /** Chance to make the trip without breaking down (ship and crew Dexterity). */
  reliability: number;
  /** Chantier 19: kiwis flying back (assault: without the holders; reinforcement: relieved). */
  returnCrew: Villager[];
  /** Cargo used on the way back by the kiwis aboard. */
  returnWeight: number;
  /** Chantier 19: final assault (both sides, the queen as estimated). */
  final: FinalForecast | null;
  /** Chantier 31: paid at launch, on top of the provisions. */
  launchCost: Resources;
  /** Chantier 40: the landing's practice battles and what they rest on. */
  landing: LandingForecast | null;
}

export function launchpadOf(state: GameState, id: BuildingId): Building | undefined {
  const b = getBuilding(state, id);
  return b?.type === 'launchpad' ? b : undefined;
}

/**
 * The colony's ship: its generation follows the age (the launchpad level gives the cargo and
 * the speed); technologies add armour and better reconnaissance.
 */
export function shipOf(state: GameState): ShipDef {
  const ship = SHIPS[shipIdForAge(ageOf(state))];
  const tech = techEffects(state);
  return { ...ship, armor: ship.armor + tech.armor, recon: ship.recon + tech.recon };
}

/** Ship reliability, mended on the way by the crew's best Dexterity. */
export function shipReliability(ship: ShipDef, crew: readonly Villager[], fuel = false): number {
  const dex = Math.max(KIWI.stat.average, ...crew.map((v) => v.stats.dexterity));
  const mend = Math.min(SHIP_REPAIR.max, SHIP_REPAIR.perDexterity * (dex - KIWI.stat.average));
  const dust = fuel ? FUEL.reliability : 0;
  // Chantier 37: an engineer aboard mends the ship.
  const engineer = crew.some((v) => v.classId === 'engineer') ? SKILLS.engineerMend : 0;
  return round2(Math.min(1, ship.reliability + mend + dust + engineer));
}

/** Technologies and stardust fuel (chantier 13) on the travel time. */
export function travelFactor(state: GameState, plan: Pick<ExpeditionPlan, 'fuel'>): number {
  return techEffects(state).travel * (plan.fuel ? FUEL.travel : 1);
}

export function shipCargo(launchpad: Building): number {
  return levelDef('launchpad', launchpad.level)?.cargo ?? 0;
}

/** One-way travel time; a scout with Tailwind aboard shortens it, a light recon ship too. */
export function travelTime(
  target: Pick<ExpeditionTarget, 'travelMs'>,
  launchpad: Building,
  crew: readonly Villager[] = [],
  mission: MissionKind = 'raid',
  /** Technologies (`techEffects(state).travel`). */
  tech = 1,
): number {
  const pad = levelDef('launchpad', launchpad.level)?.travelTime ?? 1;
  const wind = crew.some((v) => hasSkill(v, 'tailwind')) ? SKILLS.tailwindTravel : 1;
  // Chantier 37: a scout speeds the crew up, a navigator more.
  const scout = crew.some((v) => inLine(v.classId, 'navigator'))
    ? SKILLS.navigatorTravel
    : crew.some((v) => inLine(v.classId, 'scout'))
      ? SKILLS.scoutTravel
      : 1;
  const light = mission === 'recon' ? RECON.travel : 1;
  return Math.round((target.travelMs * pad * wind * scout * light * tech) / 1000) * 1000;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const mean = (crew: readonly Villager[], f: (v: Villager) => number) =>
  crew.length ? crew.reduce((sum, v) => sum + f(v), 0) / crew.length : 0;

/** What scouts can tell: Agility and Spirit, experience, and the Scouting skill. */
export function reconForecast(crew: readonly Villager[], ship?: ShipDef): ReconForecast {
  const q = RECON.quality;
  const avg = KIWI.stat.average;
  const scouting = crew.some((v) => hasSkill(v, 'scouting'));
  const quality = clamp(
    q.base +
      mean(
        crew,
        (v) =>
          q.perStat * ((v.stats.agility + v.stats.spirit) / 2 - avg) + q.perLevel * (v.level - 1),
      ) +
      (scouting ? q.scouting : 0) +
      (ship?.recon ?? 0),
    0.05,
    1,
  );
  const sp = RECON.spot;
  const spotChance = clamp(
    sp.base +
      sp.perExtraKiwi * Math.max(0, crew.length - 1) -
      sp.perAgility * mean(crew, (v) => v.stats.agility - avg) -
      (scouting ? sp.scouting : 0),
    sp.min,
    sp.max,
  );
  return {
    quality: round2(quality),
    spotChance: round2(spotChance),
    sectors: RECON.sectors.base + Math.round(RECON.sectors.perQuality * quality),
    spread: round2(RECON.spread.worst - (RECON.spread.worst - RECON.spread.best) * quality),
  };
}

/** What a crew eats over `ms` (gluttons eat more, preserves less). */
export function rations(
  state: GameState,
  crew: readonly Villager[],
  ms: number,
): { pulp: number; juice: number } {
  const eaters =
    crew.reduce((sum, v) => sum + modifiers(v).rations, 0) * techEffects(state).rations;
  return {
    pulp: (eaters * EXPEDITIONS.hourlyRations.pulp * ms) / HOUR_MS,
    juice: (eaters * EXPEDITIONS.hourlyRations.juice * ms) / HOUR_MS,
  };
}

/** Cargo units taken by a crew. */
export function crewWeight(crew: readonly Villager[]): number {
  return crew.reduce((sum, v) => sum + EXPEDITIONS.kiwiWeight * modifiers(v).weight, 0);
}

/**
 * The kiwis a plan boards: a head count picks like `availableCrew`; a list must name distinct
 * kiwis who can board (null otherwise).
 */
export function crewOf(state: GameState, crew: number | readonly VillagerId[]): Villager[] | null {
  const available = availableCrew(state);
  // A head count never boards a Kikiwiwi: the player picks it by name.
  if (typeof crew === 'number')
    return available.filter((v) => !v.kikiwiwi).slice(0, Math.max(0, crew));
  const free = new Map(available.map((v) => [v.id, v]));
  const out: Villager[] = [];
  for (const id of crew) {
    const v = free.get(id);
    if (!v) return null;
    free.delete(id);
    out.push(v);
  }
  return out;
}

/** Share of the crew lost in battle for a given strength. */
export function lossShare(strength: number, defense: number): number {
  const ratio = defense / Math.max(strength, 1e-6);
  return strength >= defense
    ? Math.min(EXPEDITIONS.victoryLosses.max, EXPEDITIONS.victoryLosses.factor * ratio)
    : Math.min(
        EXPEDITIONS.defeatLosses.max,
        Math.max(EXPEDITIONS.defeatLosses.min, 0.5 + 0.3 * (ratio - 1)),
      );
}

/** Weighted draw without replacement: exposed kiwis fall first, more often. */
export function drawLosses(
  state: GameState,
  crew: readonly Villager[],
  count: number,
): VillagerId[] {
  if (count <= 0) return [];
  return withRng(state, (rng) => {
    const pool = crew.map((v) => ({ id: v.id, w: kiwiExposure(v) }));
    const out: VillagerId[] = [];
    while (out.length < count && pool.length > 0) {
      const total = pool.reduce((sum, p) => sum + p.w, 0);
      let roll = rng.next() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        roll -= pool[i]!.w;
        if (roll < 0) break;
      }
      out.push(pool[i]!.id);
      pool.splice(i, 1);
    }
    return out;
  });
}

export function crewMembers(state: GameState, ids: readonly VillagerId[]): Villager[] {
  return ids.map((id) => state.villagers.find((v) => v.id === id)).filter((v) => !!v);
}

/** Share of `need` covered by `have`, per resource, keeping the worst. */
function coverage(
  have: { pulp: number; juice: number },
  need: { pulp: number; juice: number },
): number {
  const p = need.pulp > 0 ? have.pulp / need.pulp : 1;
  const j = need.juice > 0 ? have.juice / need.juice : 1;
  return Math.max(0, Math.min(1, p, j));
}

export function strengthOf(state: GameState, crew: readonly Villager[], fed: number): number {
  const hunger = EXPEDITIONS.starvingStrength + (1 - EXPEDITIONS.starvingStrength) * fed;
  // Green blood makes the Kikiwiwis stronger (they bring their own juice along).
  const titan = techEffects(state).kikiwiwiPower;
  const total = crew.reduce((sum, v) => sum + kiwiStrength(v) * (v.kikiwiwi ? titan : 1), 0);
  const scouting = crew.some((v) => hasSkill(v, 'scouting')) ? 1 + SKILLS.scoutingStrength : 1;
  return total * EXPEDITIONS.strengthPerKiwi * hunger * scouting;
}

/** Chantier 18: loot multiplier of the colony's age. */
export function lootByAge(state: GameState): number {
  const f = EXPEDITIONS.lootByAge;
  return f[Math.min(ageOf(state), f.length - 1)] ?? 1;
}

/** Usual loot of a target for this colony (public numbers × age). */
export function potentialLoot(state: GameState, distance: number): Resources {
  const base = alienDefOf(distance).loot;
  const k = lootByAge(state);
  const out = emptyResources();
  for (const id of RESOURCE_IDS) out[id] = Math.round(base[id] * k);
  return out;
}

/** Everything the preparation screen shows; the same maths drive the simulation. */
export function forecastExpedition(
  state: GameState,
  plan: ExpeditionPlan,
): ExpeditionForecast | null {
  const pad = launchpadOf(state, plan.launchpadId);
  const target = state.targets.find((t) => t.id === plan.targetId);
  if (!pad || !target) return null;
  const crew = crewOf(state, plan.crew) ?? [];
  const mission = plan.mission ?? 'raid';
  const cargo = shipCargo(pad);
  const travelMs = travelTime(target, pad, crew, mission, travelFactor(state, plan));
  const need = rations(state, crew, travelMs);
  const fed = coverage(plan.provisions, need);
  const base = strengthOf(state, crew, fed);
  const final = mission === 'final' ? finalForecast(state, crew, fed, state.now) : null;
  const landing =
    mission === 'land' && plan.sector !== undefined
      ? landingForecast(
          state,
          target.id,
          plan.sector,
          crew,
          plan.orders ?? LANDING.defaultOrders,
          fed,
          state.now,
        )
      : null;
  const defense =
    mission === 'assault'
      ? plan.sector === undefined
        ? null
        : assaultEnemy(state, plan.sector, state.now)
      : mission === 'raid' || mission === 'recon'
        ? (intelView(state, target.id, state.now)?.defense ?? null)
        : null;
  const strength = { min: base * (1 - EXPEDITIONS.luck), max: base * (1 + EXPEDITIONS.luck) };
  const odds: Odds = landing
    ? landing.odds
    : mission === 'land'
      ? 'unknown'
      : final
        ? final.odds
        : mission === 'reinforce' || mission === 'found'
          ? 'likely'
          : !defense
            ? 'unknown'
            : strength.min >= defense.max
              ? 'likely'
              : strength.max >= defense.min
                ? 'uncertain'
                : 'unlikely';
  // Expected losses against the middle of the estimate (none can be told without a report).
  const mid = (r: IntelRange) => (r.min + r.max) / 2;
  const guess = final
    ? final.queen
      ? base *
        Math.max(
          mid(final.queen.ground) / Math.max(mid(final.strength.ground), 1e-6),
          mid(final.queen.air) / Math.max(mid(final.strength.air), 1e-6),
        )
      : null
    : defense
      ? mid(defense)
      : null;
  const fighters = final ? crew.length + allHolders(state).length : crew.length;
  const kiwisWeight = crewWeight(crew);
  const freight = RESOURCE_IDS.reduce((sum, id) => sum + (plan.freight?.[id] ?? 0), 0);
  const weight =
    kiwisWeight +
    (plan.provisions.pulp + plan.provisions.juice + freight) * EXPEDITIONS.resourceWeight;
  const ship = shipOf(state);
  const expectedLosses = landing
    ? landing.expectedDead
    : guess === null || mission === 'land'
      ? 0
      : Math.min(fighters, fighters * lossShare(base, guess) * (1 - ship.armor));
  const exposure = crew.map((v) => kiwiExposure(v));
  const totalExposure = exposure.reduce((a, b) => a + b, 0) || 1;
  const risk: Record<string, number> = {};
  crew.forEach((v, i) => {
    risk[v.id] = Math.min(1, (expectedLosses * exposure[i]!) / totalExposure);
  });
  const left = {
    pulp: plan.provisions.pulp - Math.min(plan.provisions.pulp, need.pulp),
    juice: plan.provisions.juice - Math.min(plan.provisions.juice, need.juice),
  };
  const returnCrew = returnCrewOf(state, plan, crew, mission);
  const returnNeed = rations(state, returnCrew, travelMs);
  const returnSurplus = {
    pulp: left.pulp - returnNeed.pulp,
    juice: left.juice - returnNeed.juice,
  };
  const returnWeight = crewWeight(returnCrew);
  const lootRoom = Math.max(
    0,
    cargo - returnWeight - (left.pulp + left.juice) * EXPEDITIONS.resourceWeight,
  );
  return {
    cargo,
    weight,
    travelMs,
    needOneWay: need,
    fed,
    returnSurplus,
    strength,
    defense: landing ? landing.power : defense,
    odds,
    lootRoom,
    crew,
    expectedLosses,
    woundsOnly: mission !== 'land' && guess !== null && base >= guess,
    risk,
    mission,
    recon: mission === 'recon' ? reconForecast(crew, ship) : null,
    ship,
    reliability: shipReliability(ship, crew, !!plan.fuel),
    returnCrew,
    returnWeight,
    final,
    launchCost: launchCost(state, crew, mission),
    landing,
  };
}

/**
 * Chantier 31: what launching costs on top of the provisions — fibre and juice per kiwi
 * aboard, by the ship of the age (the settlers' ship pays nothing more).
 */
export function launchCost(
  state: GameState,
  crew: readonly Villager[],
  mission: MissionKind = 'raid',
): Resources {
  const out = emptyResources();
  if (mission === 'found') return out;
  const L = EXPEDITIONS.launchCost;
  const seats = crew.reduce((sum, v) => sum + (v.kikiwiwi ? L.kikiwiwi : 1), 0);
  const k = seats * L.ship[shipIdForAge(ageOf(state))];
  out.fiber = Math.round(L.perKiwi.fiber * k);
  out.juice = Math.round(L.perKiwi.juice * k);
  return out;
}

/** Who flies back with the ship if nobody is lost (chantier 19 missions change it). */
function returnCrewOf(
  state: GameState,
  plan: ExpeditionPlan,
  crew: Villager[],
  mission: MissionKind,
): Villager[] {
  if (mission === 'assault') return crew.filter((v) => !(plan.holders ?? []).includes(v.id));
  if (mission === 'final') return [...crew, ...allHolders(state)];
  // Chantier 19: the settlers stay on the twin face, the ship flies back empty.
  if (mission === 'found') return [];
  if (mission === 'reinforce') {
    const b = plan.sector === undefined ? undefined : bridgeheadAt(state, plan.sector);
    return b
      ? crewMembers(
          state,
          (plan.bringBack ?? []).filter((id) => b.holders.includes(id)),
        )
      : [];
  }
  return crew;
}

/** Kiwis that can board: idle ones first, then workers from the most staffed workplaces. */
export function availableCrew(state: GameState): Villager[] {
  const idle = idleVillagers(state);
  const workers = state.buildings
    .map((b) => workersOf(state, b.id))
    .sort((a, b) => b.length - a.length)
    .flat();
  return [...idle, ...workers];
}

export function maxCrew(
  state: GameState,
  launchpad: Building,
  mission: MissionKind = 'raid',
): number {
  const byCargo = Math.floor(shipCargo(launchpad) / EXPEDITIONS.kiwiWeight);
  const byPeople = availableCrew(state).length - EXPEDITIONS.keepHome;
  const byMission = mission === 'recon' ? RECON.maxCrew : Infinity;
  return Math.max(0, Math.min(byCargo, byPeople, byMission));
}

export function minCrew(mission: MissionKind = 'raid'): number {
  // A reinforcement may fly empty to bring posted kiwis home (chantier 19).
  if (mission === 'found') return COLONY.minSettlers;
  return mission === 'recon' ? RECON.minCrew : mission === 'reinforce' ? 0 : EXPEDITIONS.minCrew;
}

export function isLaunchpadBusy(state: GameState, id: BuildingId): boolean {
  return (
    state.expeditions.some((e) => e.launchpadId === id && e.status !== 'done') ||
    state.shipments.some((x) => x.launchpadId === id)
  );
}

/** Whole, non-negative amounts of every resource (chantier 19: the settlers' freight). */
export function cleanFreight(f: Partial<Resources>): Resources {
  const out = emptyResources();
  for (const r of RESOURCE_IDS) out[r] = Math.max(0, Math.floor(f[r] ?? 0));
  return out;
}

/** Boards the crew and the provisions (validation is done by the command). */
export function launch(
  state: GameState,
  plan: ExpeditionPlan,
  now: TimeMs,
  id: string,
): Expedition {
  const pad = launchpadOf(state, plan.launchpadId)!;
  const target = state.targets.find((t) => t.id === plan.targetId)!;
  const crew = crewOf(state, plan.crew)!;
  const mission = plan.mission ?? 'raid';
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= plan.provisions.pulp;
  state.resources.juice -= plan.provisions.juice;
  const freight = mission === 'found' && plan.freight ? cleanFreight(plan.freight) : null;
  if (freight) for (const r of RESOURCE_IDS) state.resources[r] -= freight[r];
  const travelMs = travelTime(target, pad, crew, mission, travelFactor(state, plan));
  // A breakdown is drawn at take-off: the ship turns back half-way. Chantier 40: a landing goes
  // on, late and with less hold.
  const failed = withRng(
    state,
    (rng) => !rng.chance(shipReliability(shipOf(state), crew, !!plan.fuel)),
  );
  const delayed = failed && mission === 'land';
  const broken = failed && !delayed;
  const outMs = broken
    ? Math.round(travelMs / 2000) * 1000
    : delayed
      ? Math.round((travelMs * LANDING.breakdown.delay) / 1000) * 1000
      : travelMs;
  const cargo = delayed ? Math.floor(shipCargo(pad) * LANDING.breakdown.cargo) : shipCargo(pad);
  const returnMs = delayed ? travelMs : outMs;
  const expedition: Expedition = {
    id,
    mission,
    targetId: target.id,
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
    cargo,
    departedAt: now,
    arriveAt: now + outMs,
    returnAt: now + outMs + returnMs,
    status: 'outbound',
    result: null,
    ...(broken ? { broken: true } : {}),
    ...(plan.sector !== undefined &&
    (mission === 'assault' || mission === 'reinforce' || mission === 'land')
      ? { sector: plan.sector }
      : {}),
    ...(mission === 'land' ? { orders: { ...(plan.orders ?? LANDING.defaultOrders) } } : {}),
    ...(delayed ? { delayed: true } : {}),
    ...(mission === 'assault' && plan.holders ? { holders: [...plan.holders] } : {}),
    ...(mission === 'reinforce' && plan.bringBack ? { bringBack: [...plan.bringBack] } : {}),
    ...(freight ? { freight } : {}),
  };
  state.expeditions.push(expedition);
  return expedition;
}

/** Resolves the battle when the ship lands (no rounds: one outcome from the plan). */
export function resolveArrival(state: GameState, e: Expedition): void {
  const target = state.targets.find((t) => t.id === e.targetId);
  const travelMs = e.arriveAt - e.departedAt;
  const members = crewMembers(state, e.crew);
  const need = rations(state, members, travelMs);
  const fed = coverage(e.provisions, need);
  e.provisions.pulp -= Math.min(e.provisions.pulp, need.pulp);
  e.provisions.juice -= Math.min(e.provisions.juice, need.juice);

  if (e.broken) {
    // Broke down half-way: the crew limps home, the hold empty.
    e.status = 'returning';
    e.result = {
      victory: false,
      aborted: true,
      broken: true,
      strength: 0,
      defense: 0,
      fed: round2(fed),
      lostInBattle: [],
      lostOnReturn: [],
      loot: emptyResources(),
    };
    return;
  }
  if (!target) {
    // The face was claimed by a friend while the ship was flying: no battle, the ship turns back.
    e.status = 'returning';
    e.result = {
      victory: false,
      aborted: true,
      strength: 0,
      defense: 0,
      fed: round2(fed),
      lostInBattle: [],
      lostOnReturn: [],
      loot: emptyResources(),
    };
    return;
  }
  if (e.mission === 'found') return landSettlers(state, e, members, fed);
  if (e.mission === 'land') return resolveLanding(state, e, members, fed);
  // Chantier 40: the raids, the reconnaissance and the siege are gone (migrated saves turned
  // them back); anything else turns back without a fight.
  e.status = 'returning';
  e.result = {
    victory: false,
    aborted: true,
    strength: 0,
    defense: 0,
    fed: round2(fed),
    lostInBattle: [],
    lostOnReturn: [],
    loot: emptyResources(),
  };
}

/** The ship comes home: the crew eats on the way (provisions first, then edible loot). */
export function resolveReturn(state: GameState, e: Expedition, events: GameEvent[] = []): void {
  const result = e.result!;
  const members = crewMembers(state, e.crew);
  const need = rations(state, members, e.returnAt - e.arriveAt);
  const pantry = {
    pulp: e.provisions.pulp + result.loot.pulp,
    juice: e.provisions.juice + result.loot.juice,
  };
  const fed = coverage(pantry, need);
  const starving = Math.floor(e.crew.length * (1 - fed) * EXPEDITIONS.starvationLossRate);
  const lost = drawLosses(state, members, starving);
  removeVillagers(state, lost, 'starvation', e.returnAt);
  e.crew = e.crew.filter((id) => !lost.includes(id));
  result.lostOnReturn = lost.map((id) => nameOf(e, id));

  // Survivors come home wiser: a lump of experience, more after a victory.
  const xp =
    (KIWI.expeditionXp.base +
      (result.victory
        ? KIWI.expeditionXp.victory * (e.mission === 'land' ? LANDING.victoryXp : 1)
        : 0)) *
    (e.mission === 'recon' ? RECON.xp : 1);
  for (const v of crewMembers(state, e.crew)) {
    if (!result.aborted) {
      v.history.expeditions++;
      if (result.victory) v.history.victories++;
      // Chantier 40: the survivors of a landing won are veterans.
      if (result.victory && e.mission === 'land') v.veteran = (v.veteran ?? 0) + 1;
    }
    grantXp(state, v, result.aborted ? xp / 2 : xp, e.returnAt, events);
    // Chantier 37: class practice too.
    const drill = CAMP.expeditionHours.base + (result.victory ? CAMP.expeditionHours.victory : 0);
    grantClassXp(v, result.aborted ? drill / 2 : drill, e.returnAt, events);
  }

  // Everything left in the hold is unloaded (storage limits are not applied to a homecoming).
  const unloaded: Resources = {
    pulp: Math.max(0, pantry.pulp - need.pulp),
    juice: Math.max(0, pantry.juice - need.juice),
    fiber: e.provisions.fiber + result.loot.fiber,
    seeds: e.provisions.seeds + result.loot.seeds,
  };
  for (const id of RESOURCE_IDS) state.resources[id] += unloaded[id];
  const hurt = new Set(result.injured ?? []);
  for (const v of state.villagers) {
    if (v.job.kind !== 'expedition' || v.job.expeditionId !== e.id) continue;
    v.job = hurt.has(v.id)
      ? {
          kind: 'injured',
          until:
            e.returnAt + (e.mission === 'recon' ? RECON.injuryMs : EXPEDITIONS.victoryInjuryMs),
        }
      : { kind: 'idle' };
  }
  e.provisions = emptyResources();
  e.status = 'done';
  // A broken ship lands, but the launchpad needs mending before the next take-off.
  if (e.broken || e.delayed) {
    const pad = launchpadOf(state, e.launchpadId);
    if (pad) pad.damaged = true;
  }
  // Keep only the last few reports.
  const done = state.expeditions.filter((x) => x.status === 'done');
  if (done.length > 5) state.expeditions = state.expeditions.filter((x) => x !== done[0]);
}

/** Kiwis lost for good: they go to the memorial. */
export function removeVillagers(
  state: GameState,
  ids: VillagerId[],
  cause: Memorial['cause'],
  at: TimeMs,
  /** Chantier 40: their gear stays on the alien face (a landing lost or abandoned). */
  gearLost = false,
): void {
  for (const v of state.villagers) {
    if (!ids.includes(v.id)) continue;
    state.memorial.push({
      id: v.id,
      name: v.name,
      level: v.level,
      shiny: v.shiny,
      classId: v.classId,
      bornAt: v.bornAt,
      diedAt: at,
      cause,
    });
  }
  if (state.memorial.length > MEMORIAL_MAX)
    state.memorial.splice(0, state.memorial.length - MEMORIAL_MAX);
  // Chantier 38: their gear goes back to the armory, unless it was left on the alien face.
  if (!gearLost) for (const v of state.villagers) if (ids.includes(v.id)) returnGear(state, v);
  state.villagers = state.villagers.filter((v) => !ids.includes(v.id));
  forgetHolders(state, ids);
  // The colony mourns its lost kiwis (morale).
  if (ids.length > 0) state.mourningUntil = Math.max(state.mourningUntil, at + MORALE.mourningMs);
}

function nameOf(e: Expedition, id: VillagerId): string {
  return e.roster.find((r) => r.id === id)?.name ?? id;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
