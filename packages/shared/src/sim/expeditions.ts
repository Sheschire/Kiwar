import { levelDef } from '../data/buildings';
import { EXPEDITIONS } from '../data/expeditions';
import { emptyResources, RESOURCE_IDS, type Resources } from '../data/resources';
import type { BuildingId, TimeMs, VillagerId } from '../types/ids';
import { getBuilding, HOUR_MS, idleVillagers, workersOf } from './selectors';
import {
  withRng,
  type Building,
  type Expedition,
  type ExpeditionTarget,
  type GameState,
  type IntelRange,
  type Memorial,
  type Villager,
} from './state';
import { KIWI, MEMORIAL_MAX } from '../data/kiwis';
import { MORALE } from '../data/needs';
import type { GameEvent } from './advance';
import { grantXp, hasSkill, kiwiExposure, kiwiStrength, modifiers } from './kiwis';
import { SKILLS } from '../data/classes';
import { alienDefense, alienEnemies, intelView, recordIntel } from './aliens';

export interface ExpeditionPlan {
  launchpadId: BuildingId;
  targetId: string;
  /** The kiwis chosen to board, or a head count (picked like `availableCrew`). */
  crew: number | readonly VillagerId[];
  /** Food and drink loaded on the ship. */
  provisions: { pulp: number; juice: number };
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
}

export function launchpadOf(state: GameState, id: BuildingId): Building | undefined {
  const b = getBuilding(state, id);
  return b?.type === 'launchpad' ? b : undefined;
}

export function shipCargo(launchpad: Building): number {
  return levelDef('launchpad', launchpad.level)?.cargo ?? 0;
}

/** One-way travel time; a scout with Tailwind aboard shortens it. */
export function travelTime(
  target: ExpeditionTarget,
  launchpad: Building,
  crew: readonly Villager[] = [],
): number {
  const pad = levelDef('launchpad', launchpad.level)?.travelTime ?? 1;
  const wind = crew.some((v) => hasSkill(v, 'tailwind')) ? SKILLS.tailwindTravel : 1;
  return Math.round((target.travelMs * pad * wind) / 1000) * 1000;
}

/** What a crew eats over `ms` (gluttons eat more). */
function rations(crew: readonly Villager[], ms: number): { pulp: number; juice: number } {
  const eaters = crew.reduce((sum, v) => sum + modifiers(v).rations, 0);
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
  const cargo = shipCargo(pad);
  const travelMs = travelTime(target, pad, crew);
  const need = rations(crew, travelMs);
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
  const expectedLosses =
    guess === null ? 0 : Math.min(crew.length, crew.length * lossShare(base, guess));
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

export function maxCrew(state: GameState, launchpad: Building): number {
  const byCargo = Math.floor(shipCargo(launchpad) / EXPEDITIONS.kiwiWeight);
  const byPeople = availableCrew(state).length - EXPEDITIONS.keepHome;
  return Math.max(0, Math.min(byCargo, byPeople));
}

export function isLaunchpadBusy(state: GameState, id: BuildingId): boolean {
  return state.expeditions.some((e) => e.launchpadId === id && e.status !== 'done');
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
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= plan.provisions.pulp;
  state.resources.juice -= plan.provisions.juice;
  const travelMs = travelTime(target, pad, crew);
  const expedition: Expedition = {
    id,
    mission: 'raid',
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
    arriveAt: now + travelMs,
    returnAt: now + 2 * travelMs,
    status: 'outbound',
    result: null,
  };
  state.expeditions.push(expedition);
  return expedition;
}

/** Resolves the battle when the ship lands (no rounds: one outcome from the plan). */
export function resolveArrival(state: GameState, e: Expedition): void {
  const target = state.targets.find((t) => t.id === e.targetId);
  const travelMs = e.arriveAt - e.departedAt;
  const members = crewMembers(state, e.crew);
  const need = rations(members, travelMs);
  const fed = coverage(e.provisions, need);
  e.provisions.pulp -= Math.min(e.provisions.pulp, need.pulp);
  e.provisions.juice -= Math.min(e.provisions.juice, need.juice);

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
  const luck = withRng(state, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
  const strength = strengthOf(members, fed) * luck;
  const victory = strength >= defense;
  const losses = Math.min(e.crew.length, Math.round(e.crew.length * lossShare(strength, defense)));
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

/** The ship comes home: the crew eats on the way (provisions first, then edible loot). */
export function resolveReturn(state: GameState, e: Expedition, events: GameEvent[] = []): void {
  const result = e.result!;
  const members = crewMembers(state, e.crew);
  const need = rations(members, e.returnAt - e.arriveAt);
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
  const xp = KIWI.expeditionXp.base + (result.victory ? KIWI.expeditionXp.victory : 0);
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
  for (const v of state.villagers) {
    if (v.job.kind === 'expedition' && v.job.expeditionId === e.id) v.job = { kind: 'idle' };
  }
  e.provisions = emptyResources();
  e.status = 'done';
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
