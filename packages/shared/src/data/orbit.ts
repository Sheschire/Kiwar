import { ms } from './curves';
import type { ResourceCost } from './resources';

/**
 * Chantier 53: the kiwais, small artificial planets launched in orbit at the Age of the stars
 * from the orbital yard. Each is a small map of its own (a hexagonal disc of radius 2: 19
 * tiles) inside the colony's state, with a type chosen at the launch, a few modules and the
 * kiwis the shuttle took up. Every number here is a hypothesis, checked with the balance bot.
 */

export const KIWAI_TYPES = ['harvest', 'greenhouse', 'observatory', 'dock'] as const;
/** Star harvest (stardust), greenhouse (juice and fibre), observatory (research), dock (travel). */
export type KiwaiType = (typeof KIWAI_TYPES)[number];

export const MODULE_TYPES = ['habitat', 'panel', 'sensor', 'dome', 'berth'] as const;
/**
 * Habitat (room for the kiwis up there), solar panel (lifts the work modules next to it), and
 * the work modules: the sensor (star harvest, observatory), the greenhouse dome, the berth (dock).
 */
export type ModuleType = (typeof MODULE_TYPES)[number];

export interface ModuleDef {
  cost: ResourceCost;
  /** Whole units of crystal and meteoric iron paid on top. */
  crystal: number;
  iron: number;
  /** Assembled at the yard, then set in place by the shuttle crew. */
  durationMs: number;
  /** Kiwis housed (habitat). */
  housing?: number;
  /** Kiwis at work (a work module). */
  workSlots?: number;
  /** The kiwai types where it can be set (absent: every type). */
  types?: readonly KiwaiType[];
  /** Breaks down now and then (the habitat never: life support comes first). */
  wears: boolean;
}

export const ORBIT = {
  /** Radius of a kiwai's disc (19 tiles); the shuttle's pad is its centre. */
  radius: 2,
  /** Rocks drawn on the ring (no module there). */
  rocks: [2, 3] as readonly [number, number],
  /** Kiwais in orbit by level of the orbital yard (index = level: the age's 13, 14, 15). */
  kiwais: [0, 1, 2, 3] as readonly number[],
  /** Module places on a kiwai, by level of the yard. */
  moduleSlots: [0, 3, 4, 5] as readonly number[],
  /** The launch of the n-th kiwai (index = kiwais already launched, capped at the last). */
  launch: [
    { giantSeeds: 2, crystal: 60, iron: 30, stardust: 10, durationMs: ms.h(12) },
    { giantSeeds: 3, crystal: 90, iron: 45, stardust: 15, durationMs: ms.h(18) },
    { giantSeeds: 4, crystal: 120, iron: 60, stardust: 20, durationMs: ms.h(24) },
  ] as const,
  /** The shuttle: up in half the trip, back at the end; how many kiwis it carries each way. */
  shuttle: { tripMs: ms.min(30), seats: 4 },
  /** A panel lifts each work module next to it (up to two panels). */
  panel: { bonus: 0.25, max: 2 },
  /** Star harvest: stardust points per hour of an average kiwi; the kiwai's own tank (points). */
  dust: { perHour: 0.1, tank: 20 },
  /**
   * Greenhouse: an average kiwi yields this share of what one worker of the juice well and of
   * the fibre workshop at `level` yield, of each — day and night, in every season.
   */
  greenhouse: { level: 13, share: 0.5 },
  /**
   * Observatory: an average kiwi gives this share of a researcher's points at the Library of
   * `level`; while a sensor watches, comets and upwellings are announced `noticeMs` earlier.
   */
  observatory: { level: 13, share: 1, noticeMs: ms.h(4) },
  /** Dock: travel times of the ships while a berth is staffed (× per staffed berth, floor). */
  dock: { travel: 0.85, floor: 0.7 },
  /**
   * Breakdowns: a kiwai's next one comes after `gapMs` (its own stream, public), announced
   * `noticeMs` before; a service (iron) puts it off. A kiwi up there repairs a broken module in
   * `repairMs` (scaled by the best Dexterity aboard: 5 is the average).
   */
  wear: {
    gapMs: [ms.h(20), ms.h(40)] as readonly [number, number],
    noticeMs: ms.h(6),
    serviceIron: 2,
    repairMs: ms.h(3),
  },
  /**
   * Comet swarms: each comet passage sweeps the orbit. A raised shield (stardust) stops it;
   * otherwise up to `hits` modules break and the kiwis aboard come down wounded by the pods.
   */
  swarm: { shieldDust: 4, hits: 2, injuryMs: ms.h(6) },
} as const;

export const MODULES: Record<ModuleType, ModuleDef> = {
  habitat: {
    cost: { pulp: 32000, fiber: 40000, seeds: 2000, juice: 8000 },
    crystal: 10,
    iron: 6,
    durationMs: ms.h(2),
    housing: 2,
    wears: false,
  },
  panel: {
    cost: { pulp: 28000, fiber: 36000, seeds: 3000, juice: 6000 },
    crystal: 15,
    iron: 4,
    durationMs: ms.h(2),
    wears: true,
  },
  sensor: {
    cost: { pulp: 40000, fiber: 48000, seeds: 2000, juice: 8000 },
    crystal: 20,
    iron: 8,
    durationMs: ms.h(3),
    workSlots: 2,
    types: ['harvest', 'observatory'],
    wears: true,
  },
  dome: {
    cost: { pulp: 44000, fiber: 36000, seeds: 2000, juice: 14000 },
    crystal: 12,
    iron: 6,
    durationMs: ms.h(3),
    workSlots: 2,
    types: ['greenhouse'],
    wears: true,
  },
  berth: {
    cost: { pulp: 40000, fiber: 52000, seeds: 2000, juice: 8000 },
    crystal: 15,
    iron: 10,
    durationMs: ms.h(3),
    workSlots: 2,
    types: ['dock'],
    wears: true,
  },
};

/** The work module of a kiwai type. */
export const WORK_MODULE: Record<KiwaiType, ModuleType> = {
  harvest: 'sensor',
  greenhouse: 'dome',
  observatory: 'sensor',
  dock: 'berth',
};

/** Whether a module can be set on a kiwai of that type. */
export function moduleFits(type: ModuleType, kiwai: KiwaiType): boolean {
  const only = MODULES[type].types;
  return !only || only.includes(kiwai);
}
