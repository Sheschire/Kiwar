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
  type Villager,
} from './state';

export interface ExpeditionPlan {
  launchpadId: BuildingId;
  targetId: string;
  crew: number;
  /** Food and drink loaded on the ship. */
  provisions: { pulp: number; juice: number };
}

export type Odds = 'likely' | 'uncertain' | 'unlikely';

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
  defense: number;
  odds: Odds;
  /** Cargo room free on the way back, for loot (if everyone survives). */
  lootRoom: number;
}

export function launchpadOf(state: GameState, id: BuildingId): Building | undefined {
  const b = getBuilding(state, id);
  return b?.type === 'launchpad' ? b : undefined;
}

export function shipCargo(launchpad: Building): number {
  return levelDef('launchpad', launchpad.level)?.cargo ?? 0;
}

export function targetDefense(state: GameState, target: ExpeditionTarget): number {
  return target.defense + target.reinforce * (state.victories[target.id] ?? 0);
}

export function travelTime(target: ExpeditionTarget, launchpad: Building): number {
  const factor = levelDef('launchpad', launchpad.level)?.travelTime ?? 1;
  return Math.round((target.travelMs * factor) / 1000) * 1000;
}

const rations = (crew: number, ms: number) => ({
  pulp: (crew * EXPEDITIONS.hourlyRations.pulp * ms) / HOUR_MS,
  juice: (crew * EXPEDITIONS.hourlyRations.juice * ms) / HOUR_MS,
});

/** Share of `need` covered by `have`, per resource, keeping the worst. */
function coverage(
  have: { pulp: number; juice: number },
  need: { pulp: number; juice: number },
): number {
  const p = need.pulp > 0 ? have.pulp / need.pulp : 1;
  const j = need.juice > 0 ? have.juice / need.juice : 1;
  return Math.max(0, Math.min(1, p, j));
}

function strengthOf(crew: number, fed: number): number {
  const hunger = EXPEDITIONS.starvingStrength + (1 - EXPEDITIONS.starvingStrength) * fed;
  return crew * EXPEDITIONS.strengthPerKiwi * hunger;
}

/** Everything the preparation screen shows; the same maths drive the simulation. */
export function forecastExpedition(
  state: GameState,
  plan: ExpeditionPlan,
): ExpeditionForecast | null {
  const pad = launchpadOf(state, plan.launchpadId);
  const target = state.targets.find((t) => t.id === plan.targetId);
  if (!pad || !target) return null;
  const cargo = shipCargo(pad);
  const travelMs = travelTime(target, pad);
  const need = rations(plan.crew, travelMs);
  const fed = coverage(plan.provisions, need);
  const base = strengthOf(plan.crew, fed);
  const defense = targetDefense(state, target);
  const strength = { min: base * (1 - EXPEDITIONS.luck), max: base * (1 + EXPEDITIONS.luck) };
  const odds: Odds =
    strength.min >= defense ? 'likely' : strength.max >= defense ? 'uncertain' : 'unlikely';
  const weight =
    plan.crew * EXPEDITIONS.kiwiWeight +
    (plan.provisions.pulp + plan.provisions.juice) * EXPEDITIONS.resourceWeight;
  const left = {
    pulp: plan.provisions.pulp - Math.min(plan.provisions.pulp, need.pulp),
    juice: plan.provisions.juice - Math.min(plan.provisions.juice, need.juice),
  };
  const returnSurplus = { pulp: left.pulp - need.pulp, juice: left.juice - need.juice };
  const lootRoom = Math.max(
    0,
    cargo -
      plan.crew * EXPEDITIONS.kiwiWeight -
      (left.pulp + left.juice) * EXPEDITIONS.resourceWeight,
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
  const crew = availableCrew(state).slice(0, plan.crew);
  for (const v of crew) v.job = { kind: 'expedition', expeditionId: id };
  state.resources.pulp -= plan.provisions.pulp;
  state.resources.juice -= plan.provisions.juice;
  const travelMs = travelTime(target, pad);
  const expedition: Expedition = {
    id,
    targetId: target.id,
    launchpadId: pad.id,
    crew: crew.map((v) => v.id),
    roster: crew.map((v) => ({ id: v.id, name: v.name })),
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
  const need = rations(e.crew.length, travelMs);
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
  const defense = targetDefense(state, target);
  const luck = withRng(state, (rng) => rng.range(1 - EXPEDITIONS.luck, 1 + EXPEDITIONS.luck));
  const strength = strengthOf(e.crew.length, fed) * luck;
  const victory = strength >= defense;
  const ratio = defense / Math.max(strength, 1e-6);
  const lossShare = victory
    ? Math.min(EXPEDITIONS.victoryLosses.max, EXPEDITIONS.victoryLosses.factor * ratio)
    : Math.min(
        EXPEDITIONS.defeatLosses.max,
        Math.max(EXPEDITIONS.defeatLosses.min, 0.5 + 0.3 * (ratio - 1)),
      );
  const losses = Math.min(e.crew.length, Math.round(e.crew.length * lossShare));
  const lost = withRng(state, (rng) => rng.shuffle(e.crew)).slice(0, losses);
  removeVillagers(state, lost);
  e.crew = e.crew.filter((id) => !lost.includes(id));

  const loot = emptyResources();
  if (victory && target) {
    state.victories[target.id] = (state.victories[target.id] ?? 0) + 1;
    // Richer loot for crushing victories, limited by the room left in the hold.
    const bonus = Math.min(2, 1 + 0.25 * (strength / Math.max(defense, 1) - 1));
    const w = EXPEDITIONS.resourceWeight;
    let room =
      e.cargo -
      e.crew.length * EXPEDITIONS.kiwiWeight -
      RESOURCE_IDS.reduce((sum, id) => sum + e.provisions[id], 0) * w;
    // Most precious first: seeds, juice, fibre, pulp.
    for (const id of ['seeds', 'juice', 'fiber', 'pulp'] as const) {
      const wanted = Math.floor(target.loot[id] * bonus);
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
export function resolveReturn(state: GameState, e: Expedition): void {
  const result = e.result!;
  const need = rations(e.crew.length, e.returnAt - e.arriveAt);
  const pantry = {
    pulp: e.provisions.pulp + result.loot.pulp,
    juice: e.provisions.juice + result.loot.juice,
  };
  const fed = coverage(pantry, need);
  const starving = Math.floor(e.crew.length * (1 - fed) * EXPEDITIONS.starvationLossRate);
  const lost = e.crew.slice(0, starving);
  removeVillagers(state, lost);
  e.crew = e.crew.filter((id) => !lost.includes(id));
  result.lostOnReturn = lost.map((id) => nameOf(e, id));

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

function removeVillagers(state: GameState, ids: VillagerId[]): void {
  state.villagers = state.villagers.filter((v) => !ids.includes(v.id));
}

function nameOf(e: Expedition, id: VillagerId): string {
  return e.roster.find((r) => r.id === id)?.name ?? id;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
