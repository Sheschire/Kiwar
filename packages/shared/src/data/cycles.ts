import { ms } from './curves';

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
