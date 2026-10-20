import { levelDef } from '../data/buildings';
import {
  EXPEDITIONS,
  INTEL,
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
  type AlienGarrison,
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
import { grantXp, hasSkill, kiwiExposure, kiwiStrength, modifiers } from './kiwis';
import { SKILLS } from '../data/classes';
import { alienDefense, alienEnemies, intelView, recordIntel, sectorOf } from './aliens';

export interface ExpeditionPlan {
  launchpadId: BuildingId;
  targetId: string;
  /** The kiwis chosen to board, or a head count (picked like `availableCrew`). */
  crew: number | readonly VillagerId[];
  /** Food and drink loaded on the ship. */
  provisions: { pulp: number; juice: number };
  /** Raid (default) or reconnaissance. */
  mission?: MissionKind;
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
  /** Losses to expect in battle at average luck. */
  expectedLosses: number;
  /** Chance of each kiwi to be lost in battle at average luck (0–1). */
  risk: Record<string, number>;
  mission: MissionKind;
  /** Reconnaissance only. */
  recon: ReconForecast | null;
  ship: ShipDef;
  /** Chance to make the trip without breaking down (ship and crew Dexterity). */
  reliability: number;
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
export function shipReliability(ship: ShipDef, crew: readonly Villager[]): number {
  const dex = Math.max(KIWI.stat.average, ...crew.map((v) => v.stats.dexterity));
  const mend = Math.min(SHIP_REPAIR.max, SHIP_REPAIR.perDexterity * (dex - KIWI.stat.average));
  return round2(Math.min(1, ship.reliability + mend));
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
  const light = mission === 'recon' ? RECON.travel : 1;
  return Math.round((target.travelMs * pad * wind * light * tech) / 1000) * 1000;
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
function rations(
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
  if (typeof crew === 'number') return available.slice(0, Math.max(0, crew));
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
function lossShare(strength: number, defense: number): number {
  const ratio = defense / Math.max(strength, 1e-6);
  return strength >= defense
    ? Math.min(EXPEDITIONS.victoryLosses.max, EXPEDITIONS.victoryLosses.factor * ratio)
    : Math.min(
        EXPEDITIONS.defeatLosses.max,
        Math.max(EXPEDITIONS.defeatLosses.min, 0.5 + 0.3 * (ratio - 1)),
      );
}

/** Weighted draw without replacement: exposed kiwis fall first, more often. */
function drawLosses(state: GameState, crew: readonly Villager[], count: number): VillagerId[] {
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

function crewMembers(state: GameState, ids: readonly VillagerId[]): Villager[] {
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

function strengthOf(crew: readonly Villager[], fed: number): number {
  const hunger = EXPEDITIONS.starvingStrength + (1 - EXPEDITIONS.starvingStrength) * fed;
  const total = crew.reduce((sum, v) => sum + kiwiStrength(v), 0);
  const scouting = crew.some((v) => hasSkill(v, 'scouting')) ? 1 + SKILLS.scoutingStrength : 1;
  return total * EXPEDITIONS.strengthPerKiwi * hunger * scouting;
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
  const travelMs = travelTime(target, pad, crew, mission, techEffects(state).travel);
  const need = rations(state, crew, travelMs);
  const fed = coverage(plan.provisions, need);
  const base = strengthOf(crew, fed);
  const defense = intelView(state, target.id, state.now)?.defense ?? null;
  const strength = { min: base * (1 - EXPEDITIONS.luck), max: base * (1 + EXPEDITIONS.luck) };
  const odds: Odds = !defense
    ? 'unknown'
    : strength.min >= defense.max
      ? 'likely'
      : strength.max >= defense.min
        ? 'uncertain'
        : 'unlikely';
  // Expected losses against the middle of the estimate (none can be told without a report).
  const guess = defense ? (defense.min + defense.max) / 2 : null;
  const kiwisWeight = crewWeight(crew);
  const weight =
    kiwisWeight + (plan.provisions.pulp + plan.provisions.juice) * EXPEDITIONS.resourceWeight;
  const ship = shipOf(state);
  const expectedLosses =
    guess === null
      ? 0
      : Math.min(crew.length, crew.length * lossShare(base, guess) * (1 - ship.armor));
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
  const returnSurplus = { pulp: left.pulp - need.pulp, juice: left.juice - need.juice };
  const lootRoom = Math.max(
    0,
    cargo - kiwisWeight - (left.pulp + left.juice) * EXPEDITIONS.resourceWeight,
  );
  return {
    cargo,
    weight,
    travelMs,
    needOneWay: need,
    fed,
    returnSurplus,
    strength,
    defense,
    odds,
    lootRoom,
    crew,
    expectedLosses,
    risk,
    mission,
    recon: mission === 'recon' ? reconForecast(crew, ship) : null,
    ship,
    reliability: shipReliability(ship, crew),
  };
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
  return mission === 'recon' ? RECON.minCrew : EXPEDITIONS.minCrew;
}

export function isLaunchpadBusy(state: GameState, id: BuildingId): boolean {
  return (
    state.expeditions.some((e) => e.launchpadId === id && e.status !== 'done') ||
    state.shipments.some((x) => x.launchpadId === id)
  );
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
  const travelMs = travelTime(target, pad, crew, mission, techEffects(state).travel);
  // A breakdown is drawn at take-off: the ship turns back half-way.
  const broken = withRng(state, (rng) => !rng.chance(shipReliability(shipOf(state), crew)));
  const outMs = broken ? Math.round(travelMs / 2000) * 1000 : travelMs;
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
    cargo: shipCargo(pad),
    departedAt: now,
    arriveAt: now + outMs,
    returnAt: now + 2 * outMs,
    status: 'outbound',
    result: null,
    ...(broken ? { broken: true } : {}),
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
  const garrison = state.aliens?.[target.id];
  const defense = alienDefense(state, target.id, e.arriveAt);
  if (!garrison || defense === null) throw new Error('resolveArrival: hidden garrison');
  if (e.mission === 'recon') return resolveRecon(state, e, garrison, defense, members, fed);
  const luck = withRng(state, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
  const strength = strengthOf(members, fed) * luck;
  const victory = strength >= defense;
  const pad = launchpadOf(state, e.launchpadId);
  const armor = pad ? shipOf(state).armor : 0;
  const losses = Math.min(
    e.crew.length,
    Math.round(e.crew.length * lossShare(strength, defense) * (1 - armor)),
  );
  const lost = drawLosses(state, members, losses);
  removeVillagers(state, lost, 'battle', e.arriveAt);
  e.crew = e.crew.filter((id) => !lost.includes(id));

  // The crew saw the whole garrison: the battle is the most precise report there is.
  const seen = alienEnemies(garrison, defense);
  recordIntel(state, target.id, {
    at: e.arriveAt,
    source: 'raid',
    defense: { min: defense, max: defense },
    ferrets: { min: seen.ferrets, max: seen.ferrets },
    bats: { min: seen.bats, max: seen.bats },
    victoriesAt: state.victories[target.id] ?? 0,
  });
  const loot = emptyResources();
  if (victory) {
    state.victories[target.id] = (state.victories[target.id] ?? 0) + 1;
    // Richer loot for crushing victories, limited by the room left in the hold.
    const bonus = Math.min(2, 1 + 0.25 * (strength / Math.max(defense, 1) - 1));
    const w = EXPEDITIONS.resourceWeight;
    let room =
      e.cargo -
      crewWeight(crewMembers(state, e.crew)) -
      RESOURCE_IDS.reduce((sum, id) => sum + e.provisions[id], 0) * w;
    // Most precious first: seeds, juice, fibre, pulp.
    for (const id of ['seeds', 'juice', 'fiber', 'pulp'] as const) {
      const wanted = Math.floor(garrison.loot[id] * bonus);
      const take = Math.max(0, Math.min(wanted, Math.floor(room / w + 1e-9)));
      loot[id] = take;
      room -= take * w;
    }
  }
  e.status = 'returning';
  e.result = {
    victory,
    strength: round2(strength),
    defense,
    fed: round2(fed),
    lostInBattle: lost.map((id) => nameOf(e, id)),
    lostOnReturn: [],
    loot,
  };
}

/** Scouts look around: a partial map and ranges; spotted, they skirmish and see less. */
function resolveRecon(
  state: GameState,
  e: Expedition,
  garrison: AlienGarrison,
  defense: number,
  members: Villager[],
  fed: number,
): void {
  const f = reconForecast(members, shipOf(state));
  const spotted = withRng(state, (rng) => rng.chance(f.spotChance));
  let strength = 0;
  let lost: VillagerId[] = [];
  const injured: VillagerId[] = [];
  if (spotted) {
    // A skirmish with the sentries: outmatched scouts lose one of theirs, the others get away
    // with a wound.
    const luck = withRng(state, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
    strength = strengthOf(members, fed) * luck;
    if (strength < defense * RECON.skirmishShare) {
      lost = drawLosses(state, members, 1);
      removeVillagers(state, lost, 'battle', e.arriveAt);
      e.crew = e.crew.filter((id) => !lost.includes(id));
    } else {
      injured.push(drawLosses(state, members, 1)[0]!);
    }
  }
  const quality = spotted ? f.quality * RECON.spottedQuality : f.quality;
  const spread = RECON.spread.worst - (RECON.spread.worst - RECON.spread.best) * quality;
  const count = RECON.sectors.base + Math.round(RECON.sectors.perQuality * quality);
  const known = new Set(state.intel[e.targetId]?.sectors ?? []);
  const { sectors, ranges } = withRng(state, (rng) => {
    // Unseen sectors first, so that every mission adds to the map.
    const order = [
      ...rng.shuffle(
        Array.from({ length: INTEL.sectors }, (_, i) => i).filter((i) => !known.has(i)),
      ),
      ...rng.shuffle([...known]),
    ];
    // Ranges always hold the truth, at a random place inside.
    const around = (value: number, digits: number): IntelRange => {
      const width = 2 * spread * value;
      const min = Math.max(0, value - width * rng.next());
      const k = 10 ** digits;
      return { min: Math.floor(min * k) / k, max: Math.ceil((min + width) * k) / k };
    };
    const seen = alienEnemies(garrison, defense);
    return {
      sectors: order.slice(0, count).sort((a, b) => a - b),
      ranges: {
        defense: around(defense, 1),
        ferrets: around(seen.ferrets, 0),
        bats: around(seen.bats, 0),
      },
    };
  });
  const visible = new Set(sectors);
  recordIntel(state, e.targetId, {
    at: e.arriveAt,
    source: 'recon',
    ...ranges,
    victoriesAt: state.victories[e.targetId] ?? 0,
    sectors,
    structures: garrison.structures.filter((x) => visible.has(sectorOf(x.q, x.r))),
    ...(spotted ? { spotted: true } : {}),
  });
  e.status = 'returning';
  e.result = {
    victory: false,
    strength: round2(strength),
    defense: 0,
    fed: round2(fed),
    lostInBattle: lost.map((id) => nameOf(e, id)),
    lostOnReturn: [],
    loot: emptyResources(),
    spotted,
    sectors: sectors.filter((i) => !known.has(i)),
    injured,
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
    (KIWI.expeditionXp.base + (result.victory ? KIWI.expeditionXp.victory : 0)) *
    (e.mission === 'recon' ? RECON.xp : 1);
  for (const v of crewMembers(state, e.crew)) {
    if (!result.aborted) {
      v.history.expeditions++;
      if (result.victory) v.history.victories++;
    }
    grantXp(state, v, result.aborted ? xp / 2 : xp, e.returnAt, events);
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
      ? { kind: 'injured', until: e.returnAt + RECON.injuryMs }
      : { kind: 'idle' };
  }
  e.provisions = emptyResources();
  e.status = 'done';
  // A broken ship lands, but the launchpad needs mending before the next take-off.
  if (e.broken) {
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
  state.villagers = state.villagers.filter((v) => !ids.includes(v.id));
  // The colony mourns its lost kiwis (morale).
  if (ids.length > 0) state.mourningUntil = Math.max(state.mourningUntil, at + MORALE.mourningMs);
}

function nameOf(e: Expedition, id: VillagerId): string {
  return e.roster.find((r) => r.id === id)?.name ?? id;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
