import { MAX_AGE } from '../data/ages';
import {
  AGE_OBJECTIVES,
  OBJECTIVES,
  OBJECTIVES_SHOWN,
  type AgeObjectiveDef,
  type ObjectiveDef,
} from '../data/objectives';
import { PASSAGE_TECHS, RESEARCH_SCALE, TECHS } from '../data/research';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import type { BuildingId } from '../types/ids';
import { forecastWave } from './threats';
import { ageOf, hasTech, libraryLevel, techsOfAge, techStatus } from './research';
import {
  canAfford,
  canCollect,
  capacity,
  canHatch,
  eggCost,
  pendingUpgrade,
  population,
  reserveHolders,
  storageFullCheck,
  totalWorkers,
  workerSlots,
} from './selectors';
import type { GameState } from './state';

/**
 * Chantier 31: objectives in three horizons — the next step (computed), the notebook of the
 * age (claimed for a reward) and the passage to the next age. All pure reads of the state.
 */

/** The tutorial objective under way (the tutorial is the first part of the Eden notebook). */
export function currentObjective(state: GameState): ObjectiveDef | undefined {
  return OBJECTIVES[state.objectiveIndex];
}

export function objectiveProgress(
  state: GameState,
  def: ObjectiveDef,
): { current: number; target: number } {
  const c = def.condition;
  const of = (n: number, target: number) => ({ current: Math.min(n, target), target });
  switch (c.kind) {
    case 'building': {
      const types: readonly string[] = typeof c.building === 'string' ? [c.building] : c.building;
      const n = state.buildings.filter(
        (b) => types.includes(b.type) && b.level >= c.minLevel,
      ).length;
      return of(n, c.count);
    }
    case 'population':
      return of(population(state), c.count);
    case 'workers':
      return of(totalWorkers(state), c.count);
    case 'stat':
      return of(
        c.stat === 'raidsWon'
          ? Object.values(state.victories).reduce((a, b) => a + b, 0)
          : state.stats[c.stat],
        c.count,
      );
    case 'class':
      return of(
        state.villagers.filter((v) =>
          c.classId === 'kikiwiwi' ? v.kikiwiwi : v.classId === c.classId,
        ).length,
        c.count,
      );
    case 'kiwiLevel': {
      const best = state.villagers.reduce((m, v) => Math.max(m, v.level), 0);
      return of(best, c.level);
    }
    case 'techs':
      return of(
        techsOfAge(c.age).filter((id) => TECHS[id].branch !== 'passage' && hasTech(state, id))
          .length,
        c.count,
      );
    case 'paths':
      return of(state.paths.length, c.count);
    case 'intel':
      return of(Object.keys(state.intel).length, c.count);
    case 'bridgeheads':
      return of(state.siege.bridgeheads.length, c.count);
  }
}

export function isObjectiveComplete(state: GameState, def: ObjectiveDef): boolean {
  const p = objectiveProgress(state, def);
  return p.current >= p.target;
}

/** Whether the age notebook is open: after the tutorial, in the home colony only. */
export function notebookOpen(state: GameState): boolean {
  return state.objectiveIndex >= OBJECTIVES.length && state.colony.index === 0;
}

/**
 * Age objectives shown now: the first unclaimed ones of the ages reached, older ages first
 * (nothing is lost when the age changes), at most `OBJECTIVES_SHOWN`.
 */
export function ageObjectives(state: GameState): AgeObjectiveDef[] {
  if (!notebookOpen(state)) return [];
  const age = ageOf(state);
  const claimed = new Set(state.objectives.claimed);
  return AGE_OBJECTIVES.filter((o) => o.age <= age && !claimed.has(o.id)).slice(
    0,
    OBJECTIVES_SHOWN,
  );
}

/** Claimed and total objectives of an age's notebook. */
export function notebookCount(state: GameState, age: number): { claimed: number; total: number } {
  const all = AGE_OBJECTIVES.filter((o) => o.age === age);
  const claimed = new Set(state.objectives.claimed);
  return { claimed: all.filter((o) => claimed.has(o.id)).length, total: all.length };
}

/** An objective that can be claimed right now (tutorial first), or null. */
export function claimableObjective(state: GameState): ObjectiveDef | null {
  const tutorial = currentObjective(state);
  if (tutorial) return isObjectiveComplete(state, tutorial) ? tutorial : null;
  return ageObjectives(state).find((o) => isObjectiveComplete(state, o)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// The passage to the next age

export type AgeStepId = 'library' | 'research' | 'monument';

export interface AgeStep {
  id: AgeStepId;
  done: boolean;
  /** 0–1. */
  progress: number;
  /** Library level needed (library), monument level to reach (monument). */
  level: number;
}

export interface AgeProgress {
  /** The age to reach. */
  age: number;
  steps: AgeStep[];
  /** 0–1, the steps weighted by their usual length. */
  progress: number;
}

const STEP_WEIGHT: Record<AgeStepId, number> = { library: 0.2, research: 0.5, monument: 0.3 };

/** Steps towards the next age (null at the last age). */
export function ageProgress(state: GameState): AgeProgress | null {
  const age = ageOf(state) + 1;
  if (age > MAX_AGE) return null;
  const tech = PASSAGE_TECHS[age]!;
  const def = TECHS[tech];
  const researched = hasTech(state, tech);
  const lib = libraryLevel(state);
  const libDone = researched || lib >= def.libraryLevel;
  const points =
    state.research.current === tech ? state.research.points / RESEARCH_SCALE / def.cost : 0;
  const monument = state.buildings.find((b) => b.type === 'monument');
  const monumentDone = (monument?.level ?? 0) >= age;
  const site = state.queue.find(
    (i) => i.buildingType === 'monument' && i.targetLevel === age && i.startedAt !== null,
  );
  const built = site
    ? Math.min(1, (state.now - site.startedAt!) / Math.max(1, site.durationMs))
    : 0;
  const steps: AgeStep[] = [
    {
      id: 'library',
      done: libDone,
      progress: libDone ? 1 : lib / def.libraryLevel,
      level: def.libraryLevel,
    },
    { id: 'research', done: researched, progress: researched ? 1 : Math.min(1, points), level: 0 },
    { id: 'monument', done: monumentDone, progress: monumentDone ? 1 : built, level: age },
  ];
  const progress = steps.reduce((sum, s) => sum + STEP_WEIGHT[s.id] * s.progress, 0);
  return { age, steps, progress };
}

// ---------------------------------------------------------------------------------------------
// The next step

export type NextStepId =
  | 'prepareWave'
  | 'repair'
  | 'collect'
  | 'full'
  | 'claim'
  | 'monument'
  | 'research'
  | 'staff'
  | 'hatch'
  | 'upgrade'
  | 'wait';

export interface NextStep {
  id: NextStepId;
  /** The resource the colony lacks most (`upgrade`), or whose harvest stopped. */
  resource?: ResourceId;
  /** The building concerned (`repair`). */
  buildingId?: BuildingId;
  /** The objective to claim (`claim`). */
  objectiveId?: string;
}

/**
 * The most useful thing to do right now, in order: an announced wave that may break through,
 * a damaged building, a stopped harvest, a reward to claim, the passage of the age, the
 * research, idle kiwis, an egg, then the scarcest resource.
 */
export function nextStep(state: GameState): NextStep {
  const wave = forecastWave(state);
  if (wave && wave.odds !== 'likely') return { id: 'prepareWave' };
  const broken = state.buildings.find((b) => b.damaged && !pendingUpgrade(state, b.id));
  if (broken) return { id: 'repair', buildingId: broken.id };
  // A harvest stopped: bring the reserves back if there is room, else spend.
  const stopped = RESOURCE_IDS.find(storageFullCheck(state));
  if (stopped)
    return reserveHolders(state).some((b) => canCollect(state, b))
      ? { id: 'collect', resource: stopped }
      : { id: 'full', resource: stopped };
  const claim = claimableObjective(state);
  if (claim) return { id: 'claim', objectiveId: claim.id };
  const next = ageProgress(state);
  if (
    next &&
    next.steps[1]!.done &&
    !next.steps[2]!.done &&
    !state.queue.some((i) => i.buildingType === 'monument')
  )
    return { id: 'monument' };
  if (libraryLevel(state) > 0 && !state.research.current && anyResearchAvailable(state))
    return { id: 'research' };
  const idle = state.villagers.filter((v) => v.job.kind === 'idle' && !v.kikiwiwi).length;
  const slots = state.buildings.reduce((sum, b) => sum + workerSlots(b), 0);
  if (idle > 0 && totalWorkers(state) < slots) return { id: 'staff' };
  if (
    canHatch(state) &&
    (state.objectives.giftEggs > 0 || canAfford(state.resources, eggCost(state)))
  )
    return { id: 'hatch' };
  const cap = capacity(state);
  let scarce: ResourceId | null = null;
  let low = Infinity;
  for (const id of RESOURCE_IDS) {
    const r = state.resources[id] / Math.max(1, cap[id]);
    if (r < low) {
      low = r;
      scarce = id;
    }
  }
  return scarce && low < 0.5 ? { id: 'upgrade', resource: scarce } : { id: 'wait' };
}

function anyResearchAvailable(state: GameState): boolean {
  for (let age = 0; age <= ageOf(state); age++)
    if (techsOfAge(age).some((id) => techStatus(state, id) === 'available')) return true;
  return false;
}
