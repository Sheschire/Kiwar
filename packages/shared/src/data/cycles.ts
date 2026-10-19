import { ms } from './curves';
import type { ResourceId } from './resources';
import type { TileType } from './tiles';

/**
 * Chantier 04: day/night and climatic seasons. The calendar is a pure function of time and of
 * the calendar start (game creation, or universe creation in a shared universe), so it is the
 * same online and offline. A day starts at dawn and ends with the night; every season is a
 * whole number of days, so seasons change at dawn.
 */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const CALENDAR = {
  dayMs: ms.h(2),
  seasonDays: 12,
  /** Night at the end of each day (longer days in summer). */
  nightMs: { spring: ms.min(30), summer: ms.min(20), autumn: ms.min(30), winter: ms.min(30) },
  /** A new calendar starts this long after dawn: a colony wakes up mid-morning in spring. */
  startOffsetMs: ms.min(20),
} as const satisfies {
  dayMs: number;
  seasonDays: number;
  nightMs: Record<Season, number>;
  startOffsetMs: number;
};

/** Calendar start (first spring dawn) of a game or universe created at `createdAt`. */
export function calendarStartFor(createdAt: number): number {
  return createdAt - CALENDAR.startOffsetMs;
}

export const SEASON_MS = CALENDAR.dayMs * CALENDAR.seasonDays;
export const YEAR_MS = SEASON_MS * SEASONS.length;

type PerResource = Partial<Record<ResourceId, number>>;

/** What the time of day and the season change (1 when absent). */
export interface SeasonEffects {
  /** Harvest multiplier per resource (autumn pulp, frozen juice wells in winter). */
  harvest: PerResource;
  /** Deposit regrowth multiplier per resource (`all` applies to every resource). */
  regen: PerResource & { all?: number };
  /** Walking cost multiplier off paths (snow). */
  walk: number;
  /** Tiles kiwis cannot walk on (snowed-in groves); paths are always cleared. */
  blocked: readonly TileType[];
  /** Hatching time multiplier. */
  hatching: number;
}

export const CYCLES = {
  /** Work done at night: most kiwis sleep. */
  nightWork: 0.4,
  seasons: {
    spring: { harvest: {}, regen: { all: 1.4 }, walk: 1, blocked: [], hatching: 0.8 },
    summer: { harvest: {}, regen: { juice: 0.7 }, walk: 1, blocked: [], hatching: 1 },
    autumn: { harvest: { pulp: 1.2 }, regen: { fiber: 1.3 }, walk: 1, blocked: [], hatching: 1 },
    winter: {
      harvest: { juice: 0.5 },
      regen: { all: 0 },
      walk: 1.5,
      blocked: ['grove'],
      hatching: 1,
    },
  } satisfies Record<Season, SeasonEffects>,
} as const;

export function seasonEffects(season: Season): SeasonEffects {
  return CYCLES.seasons[season];
}

export function seasonRegen(season: Season, resource: ResourceId): number {
  const r: SeasonEffects['regen'] = CYCLES.seasons[season].regen;
  return (r.all ?? 1) * (r[resource] ?? 1);
}

export function seasonHarvest(season: Season, resource: ResourceId): number {
  const h: PerResource = CYCLES.seasons[season].harvest;
  return h[resource] ?? 1;
}
