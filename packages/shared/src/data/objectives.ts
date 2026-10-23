import type { BuildingType } from './buildings';
import type { ClassId } from './classes';
import type { ResourceCost } from './resources';

/** Counters kept in `GameStats` that objectives can read (chantier 31). */
export type ObjectiveStat = 'collects' | 'wavesHeld' | 'raidsWon';

export type ObjectiveCondition =
  /** `count` buildings of these types at `minLevel` or more (any of the types counts). */
  | {
      kind: 'building';
      building: BuildingType | readonly BuildingType[];
      count: number;
      minLevel: number;
    }
  | { kind: 'population'; count: number }
  | { kind: 'workers'; count: number }
  /** Chantier 31: a counter of the colony's history. */
  | { kind: 'stat'; stat: ObjectiveStat; count: number }
  /** Kiwis of a class (or Kikiwiwis). */
  | { kind: 'class'; classId: ClassId | 'kikiwiwi'; count: number }
  /** A kiwi at this level or more. */
  | { kind: 'kiwiLevel'; level: number }
  /** Technologies of an age researched (its passage aside). */
  | { kind: 'techs'; age: number; count: number }
  /** Path tiles laid. */
  | { kind: 'paths'; count: number }
  /** Targets the colony has a report on. */
  | { kind: 'intel'; count: number }
  /** Bridgeheads held on the twin (chantier 19). */
  | { kind: 'bridgeheads'; count: number };

export interface ObjectiveDef {
  /** Translation key suffix: `objectives.<id>`. */
  id: string;
  condition: ObjectiveCondition;
  reward: ResourceCost;
  /** Chantier 31: stardust points given with the reward. */
  stardust?: number;
  /** Chantier 31: the next egg costs nothing. */
  egg?: boolean;
}

/** Chantier 31: an objective of an age's notebook. */
export interface AgeObjectiveDef extends ObjectiveDef {
  /** Age (0 = Eden) whose notebook holds it. */
  age: number;
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

/** Producers (a "producer at level N" objective accepts any of them). */
export const PRODUCERS = ['pulpery', 'fiberWorkshop', 'seedQuarry', 'juiceWell'] as const;
const TURRETS = ['seedTurret', 'skyTurret'] as const;

/** How many age objectives the notebook shows at once. */
export const OBJECTIVES_SHOWN = 3;

/**
 * Chantier 31: the notebook of each age. They teach the systems of the age; at most
 * `OBJECTIVES_SHOWN` are shown at once (data order, older ages first: nothing unclaimed is ever
 * lost when the age changes). The Eden notebook opens once the tutorial is done.
 */
export const AGE_OBJECTIVES: readonly AgeObjectiveDef[] = [
  // Eden: the evening of the first day.
  {
    id: 'edenTurrets',
    age: 0,
    condition: { kind: 'building', building: TURRETS, count: 2, minLevel: 1 },
    reward: { seeds: 120, fiber: 150 },
  },
  {
    id: 'edenLibrary',
    age: 0,
    condition: { kind: 'building', building: 'library', count: 1, minLevel: 1 },
    reward: { pulp: 250, fiber: 250 },
  },
  {
    id: 'edenCollect',
    age: 0,
    condition: { kind: 'stat', stat: 'collects', count: 1 },
    reward: { juice: 150 },
  },
  {
    id: 'edenSchool',
    age: 0,
    condition: { kind: 'building', building: 'school', count: 1, minLevel: 1 },
    reward: { pulp: 200, juice: 120 },
  },
  {
    id: 'edenProducer3',
    age: 0,
    condition: { kind: 'building', building: PRODUCERS, count: 1, minLevel: 3 },
    reward: { pulp: 400, fiber: 400 },
  },
  {
    id: 'edenWave',
    age: 0,
    condition: { kind: 'stat', stat: 'wavesHeld', count: 1 },
    reward: { seeds: 150 },
    stardust: 3,
  },
  {
    id: 'edenMayor',
    age: 0,
    condition: { kind: 'class', classId: 'mayor', count: 1 },
    reward: {},
    egg: true,
  },
  {
    id: 'edenNest3',
    age: 0,
    condition: { kind: 'building', building: 'nest', count: 1, minLevel: 3 },
    reward: { seeds: 200, juice: 300 },
  },
  {
    id: 'edenRecon',
    age: 0,
    condition: { kind: 'intel', count: 1 },
    reward: { pulp: 300, juice: 200 },
  },
  // Stone: levels 4–6, the first raids. Fibre is the scarce resource of the first Stone
  // levels: the first rewards bring it.
  {
    id: 'stoneTechs',
    age: 1,
    condition: { kind: 'techs', age: 1, count: 2 },
    reward: { fiber: 1500, seeds: 300 },
  },
  {
    id: 'stoneWarriors',
    age: 1,
    condition: { kind: 'class', classId: 'warrior', count: 2 },
    reward: { fiber: 1200, juice: 400 },
  },
  {
    id: 'stoneWarehouse',
    age: 1,
    condition: { kind: 'building', building: 'warehouse', count: 1, minLevel: 4 },
    reward: { pulp: 1200, fiber: 1200 },
  },
  {
    id: 'stoneRaid',
    age: 1,
    condition: { kind: 'stat', stat: 'raidsWon', count: 1 },
    reward: { fiber: 1500 },
    egg: true,
  },
  {
    id: 'stoneWaves',
    age: 1,
    condition: { kind: 'stat', stat: 'wavesHeld', count: 3 },
    reward: { seeds: 600 },
    stardust: 5,
  },
  {
    id: 'stoneTurret4',
    age: 1,
    condition: { kind: 'building', building: TURRETS, count: 1, minLevel: 4 },
    reward: { pulp: 1500, seeds: 500 },
  },
  {
    id: 'stoneProducer6',
    age: 1,
    condition: { kind: 'building', building: PRODUCERS, count: 1, minLevel: 6 },
    reward: { pulp: 2500, fiber: 2500 },
  },
  {
    id: 'stoneKiwi10',
    age: 1,
    condition: { kind: 'kiwiLevel', level: 10 },
    reward: { juice: 1500 },
    stardust: 5,
  },
  // Iron: the laboratory and the Kikiwiwis, the first siege steps.
  {
    id: 'ironTechs',
    age: 2,
    condition: { kind: 'techs', age: 2, count: 2 },
    reward: { seeds: 1500, juice: 2000 },
  },
  {
    id: 'ironPaths',
    age: 2,
    condition: { kind: 'paths', count: 30 },
    reward: { fiber: 4000 },
  },
  {
    id: 'ironLab',
    age: 2,
    condition: { kind: 'building', building: 'lab', count: 1, minLevel: 1 },
    reward: { pulp: 4000, juice: 2000 },
  },
  {
    id: 'ironMage',
    age: 2,
    condition: { kind: 'class', classId: 'mage', count: 1 },
    reward: { juice: 3000 },
    egg: true,
  },
  {
    id: 'ironWaves',
    age: 2,
    condition: { kind: 'stat', stat: 'wavesHeld', count: 6 },
    reward: { seeds: 2500 },
    stardust: 8,
  },
  {
    id: 'ironKikiwiwi',
    age: 2,
    condition: { kind: 'class', classId: 'kikiwiwi', count: 1 },
    reward: { pulp: 6000, fiber: 6000 },
  },
  {
    id: 'ironRaids',
    age: 2,
    condition: { kind: 'stat', stat: 'raidsWon', count: 5 },
    reward: { seeds: 3000, juice: 3000 },
  },
  {
    id: 'ironProducer9',
    age: 2,
    condition: { kind: 'building', building: PRODUCERS, count: 1, minLevel: 9 },
    reward: { pulp: 12000, fiber: 12000 },
  },
  // Industry: machines, firearms, the siege.
  {
    id: 'industryTechs',
    age: 3,
    condition: { kind: 'techs', age: 3, count: 2 },
    reward: { seeds: 6000, juice: 8000 },
  },
  {
    id: 'industryKiwi20',
    age: 3,
    condition: { kind: 'kiwiLevel', level: 20 },
    reward: { juice: 10000 },
    stardust: 10,
  },
  {
    id: 'industryWaves',
    age: 3,
    condition: { kind: 'stat', stat: 'wavesHeld', count: 10 },
    reward: { seeds: 10000 },
    egg: true,
  },
  {
    id: 'industryRaids',
    age: 3,
    condition: { kind: 'stat', stat: 'raidsWon', count: 12 },
    reward: { seeds: 8000, juice: 8000 },
  },
  {
    id: 'industryBridgehead',
    age: 3,
    condition: { kind: 'bridgeheads', count: 1 },
    reward: { pulp: 20000, fiber: 20000 },
  },
  {
    id: 'industryProducer12',
    age: 3,
    condition: { kind: 'building', building: PRODUCERS, count: 1, minLevel: 12 },
    reward: { pulp: 40000, fiber: 40000, seeds: 8000, juice: 15000 },
  },
];
