import { climateOf } from '../data/biomes';
import { BUILDINGS, isTurret, levelDef, type BuildingType } from '../data/buildings';
import { PASSAGE_TECHS, type TechId } from '../data/research';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import type { CommandError } from './commands';
import { ageOf, hasTech, techEffects } from './research';
import { buildingCount, copiesOf, nest, nestDef, turretCount, turretLimit } from './selectors';
import type { GameState } from './state';

/**
 * Chantier 11: what a building level or a technology brings, in numbers. One source of truth for
 * the upgrade preview, the building tree and the tests.
 */

export const LEVEL_STATS = [
  'production',
  'passive',
  'workers',
  'housing',
  'storage',
  'defenseGround',
  'defenseAir',
  'ammo',
  'cargo',
  'travelTime',
  'trainingSlots',
  'trainingTime',
  'research',
  'maxBuildings',
  'queueSize',
] as const;
export type LevelStatId = (typeof LEVEL_STATS)[number];

export interface LevelStat {
  stat: LevelStatId;
  /** Production stats: one line per resource. */
  resource?: ResourceId;
  value: number;
}

export interface StatChange {
  stat: LevelStatId;
  resource?: ResourceId;
  before: number;
  after: number;
}

/**
 * The numbers of a building level. Without a state: the raw table. With one: production at full
 * staffing with the face climate and the researched bonuses, storage and defense with theirs.
 */
export function describeLevel(type: BuildingType, level: number, state?: GameState): LevelStat[] {
  const def = levelDef(type, level);
  if (!def) return [];
  const climate = state ? climateOf(state.face, state.params.biome) : null;
  const tech = state ? techEffects(state) : null;
  const out: LevelStat[] = [];
  const push = (stat: LevelStatId, value: number | undefined, resource?: ResourceId) => {
    if (value === undefined) return;
    out.push(resource ? { stat, resource, value } : { stat, value });
  };
  for (const r of RESOURCE_IDS) {
    const v = def.production?.[r];
    if (v) push('production', v * (climate?.[r] ?? 1) * (tech?.harvest[r] ?? 1), r);
  }
  for (const r of RESOURCE_IDS) {
    const v = def.passiveProduction?.[r];
    if (v) push('passive', v * (climate?.[r] ?? 1), r);
  }
  push('workers', def.workerSlots || undefined);
  push('housing', def.housing);
  push('storage', def.storage === undefined ? undefined : def.storage * (tech?.storage ?? 1));
  const k = tech?.turretDefense ?? 1;
  push('defenseGround', def.defense?.ground === undefined ? undefined : def.defense.ground * k);
  push('defenseAir', def.defense?.air === undefined ? undefined : def.defense.air * k);
  push('ammo', def.ammo);
  push('cargo', def.cargo);
  push('travelTime', def.travelTime);
  push('trainingSlots', def.trainingSlots);
  push('trainingTime', def.trainingTime);
  push('research', def.research);
  push('maxBuildings', def.maxBuildings);
  push('queueSize', def.queueSize);
  return out;
}

const statKey = (s: { stat: LevelStatId; resource?: ResourceId }) =>
  `${s.stat}:${s.resource ?? ''}`;

/** Level `from` → level `to`, stat by stat (a stat new at `to` starts from 0). */
export function describeUpgrade(
  type: BuildingType,
  from: number,
  to: number,
  state?: GameState,
): StatChange[] {
  const before = new Map(describeLevel(type, from, state).map((s) => [statKey(s), s.value]));
  return describeLevel(type, to, state).map((s) => ({
    stat: s.stat,
    ...(s.resource ? { resource: s.resource } : {}),
    before: before.get(statKey(s)) ?? 0,
    after: s.value,
  }));
}

export const TECH_STATS = [
  'harvest',
  'storage',
  'turretDefense',
  'guard',
  'travel',
  'rations',
  'build',
  'injuries',
  'armor',
  'recon',
  'firearms',
  'laboratory',
  'terraform',
  'kikiwiwiPower',
  'kikiwiwiUpkeep',
  'infusionRisk',
] as const;
export type TechStatId = (typeof TECH_STATS)[number];

export interface TechChange {
  stat: TechStatId;
  resource?: ResourceId;
  /** Multipliers (1 = none), bonuses (0 = none), or 0/1 for what the tech opens. */
  before: number;
  after: number;
  kind: 'multiplier' | 'bonus' | 'unlock';
}

const MULTIPLIERS = [
  'storage',
  'turretDefense',
  'guard',
  'travel',
  'rations',
  'build',
  'injuries',
  'kikiwiwiPower',
  'kikiwiwiUpkeep',
] as const;
const BONUSES = ['armor', 'recon', 'infusionRisk'] as const;
const UNLOCKS = ['firearms', 'laboratory', 'terraform'] as const;

/** What researching `id` changes for this colony: its current effects, then with the tech. */
export function describeTech(id: TechId, state: GameState): TechChange[] {
  const now = techEffects(state);
  const done = state.research.done.includes(id)
    ? state.research.done
    : [...state.research.done, id];
  const next = techEffects({ ...state, research: { ...state.research, done } });
  const out: TechChange[] = [];
  for (const r of RESOURCE_IDS)
    if (now.harvest[r] !== next.harvest[r])
      out.push({
        stat: 'harvest',
        resource: r,
        before: now.harvest[r],
        after: next.harvest[r],
        kind: 'multiplier',
      });
  for (const s of MULTIPLIERS)
    if (now[s] !== next[s])
      out.push({ stat: s, before: now[s], after: next[s], kind: 'multiplier' });
  for (const s of BONUSES)
    if (now[s] !== next[s]) out.push({ stat: s, before: now[s], after: next[s], kind: 'bonus' });
  for (const s of UNLOCKS)
    if (now[s] !== next[s])
      out.push({ stat: s, before: now[s] ? 1 : 0, after: next[s] ? 1 : 0, kind: 'unlock' });
  return out;
}

/**
 * Why this type cannot be built anywhere right now (Nest level, age, technology, one per colony,
 * caps), or null. The tile, the resources and the queue are checked by the `build` command.
 */
export function buildLock(state: GameState, type: BuildingType): CommandError | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'notBuildable';
  const first = def.levels[0]!;
  if (nest(state).level < first.requiresNestLevel) return 'nestLevelTooLow';
  if ((first.requiresAge ?? 0) > ageOf(state)) return 'ageTooLow';
  if (type === 'lab') {
    if (copiesOf(state, 'lab') > 0) return 'labExists';
    if (!techEffects(state).laboratory) return 'techMissing';
  } else if (type === 'monument') {
    if (copiesOf(state, 'monument') > 0) return 'monumentExists';
    if (!hasTech(state, PASSAGE_TECHS[1]!)) return 'passageMissing';
  } else if (isTurret(type)) {
    if (turretCount(state) >= turretLimit(state)) return 'turretLimit';
  } else if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return 'buildingLimit';
  return null;
}
