import type { BuildingType } from './buildings';
import type { ResourceCost } from './resources';

export type ObjectiveCondition =
  | { kind: 'building'; building: BuildingType; count: number; minLevel: number }
  | { kind: 'population'; count: number }
  | { kind: 'workers'; count: number };

export interface ObjectiveDef {
  /** Translation key suffix: `objectives.<id>`. */
  id: string;
  condition: ObjectiveCondition;
  reward: ResourceCost;
}

/** Guided tutorial: a chain of objectives for the first minutes of play. */
export const OBJECTIVES: readonly ObjectiveDef[] = [
  {
    id: 'buildPulpery',
    condition: { kind: 'building', building: 'pulpery', count: 1, minLevel: 1 },
    reward: { fiber: 30 },
  },
  {
    id: 'buildFiber',
    condition: { kind: 'building', building: 'fiberWorkshop', count: 1, minLevel: 1 },
    reward: { pulp: 40 },
  },
  { id: 'hatchEgg', condition: { kind: 'population', count: 4 }, reward: { pulp: 30, juice: 20 } },
  {
    id: 'buildWell',
    condition: { kind: 'building', building: 'juiceWell', count: 1, minLevel: 1 },
    reward: { pulp: 50, fiber: 30 },
  },
  { id: 'staffWorkers', condition: { kind: 'workers', count: 4 }, reward: { fiber: 50 } },
  {
    id: 'buildHut',
    condition: { kind: 'building', building: 'hut', count: 1, minLevel: 1 },
    reward: { pulp: 60 },
  },
  {
    id: 'buildQuarry',
    condition: { kind: 'building', building: 'seedQuarry', count: 1, minLevel: 1 },
    reward: { seeds: 15 },
  },
  {
    id: 'upgradePulpery',
    condition: { kind: 'building', building: 'pulpery', count: 1, minLevel: 2 },
    reward: { seeds: 20, juice: 40 },
  },
  {
    id: 'buildWarehouse',
    condition: { kind: 'building', building: 'warehouse', count: 1, minLevel: 1 },
    reward: { pulp: 100, fiber: 100 },
  },
  {
    id: 'upgradeNest',
    condition: { kind: 'building', building: 'nest', count: 1, minLevel: 2 },
    reward: { seeds: 50, juice: 100 },
  },
];
