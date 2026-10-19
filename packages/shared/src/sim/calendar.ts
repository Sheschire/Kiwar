import { CALENDAR, SEASON_MS, SEASONS, YEAR_MS, type Season } from '../data/cycles';
import type { TimeMs } from '../types/ids';
import type { GameState } from './state';

export interface CalendarView {
  season: Season;
  /** 0-based year since the calendar start. */
  year: number;
  /** 0-based day within the season. */
  day: number;
  /** Time since dawn (ms) and share of the day elapsed (0–1). */
  sinceDawn: number;
  dayProgress: number;
  night: boolean;
  /** When the night starts / the next dawn / the next season begins. */
  nightAt: TimeMs;
  dawnAt: TimeMs;
  seasonEndsAt: TimeMs;
  next: Season;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Calendar at time `t` for a calendar started at `start` (dawn of the first spring day). */
export function calendarAt(start: TimeMs, t: TimeMs): CalendarView {
  const elapsed = t - start;
  const inYear = mod(elapsed, YEAR_MS);
  const seasonIndex = Math.floor(inYear / SEASON_MS);
  const season = SEASONS[seasonIndex]!;
  const inSeason = inYear - seasonIndex * SEASON_MS;
  const day = Math.floor(inSeason / CALENDAR.dayMs);
  const sinceDawn = inSeason - day * CALENDAR.dayMs;
  const dawn = t - sinceDawn;
  const nightStart = CALENDAR.dayMs - CALENDAR.nightMs[season];
  return {
    season,
    year: Math.floor((elapsed - inYear) / YEAR_MS),
    day,
    sinceDawn,
    dayProgress: sinceDawn / CALENDAR.dayMs,
    night: sinceDawn >= nightStart,
    nightAt: dawn + nightStart,
    dawnAt: dawn + CALENDAR.dayMs,
    seasonEndsAt: t - inSeason + SEASON_MS,
    next: SEASONS[(seasonIndex + 1) % SEASONS.length]!,
  };
}

export function calendarOf(state: Pick<GameState, 'calendarStart' | 'now'>, t = state.now) {
  return calendarAt(state.calendarStart, t);
}

/** Next nightfall or dawn strictly after `t` (seasons change at dawn). */
export function nextCalendarChange(start: TimeMs, t: TimeMs): TimeMs {
  const c = calendarAt(start, t);
  return c.night ? c.dawnAt : c.nightAt;
}

export function seasonOf(state: Pick<GameState, 'calendarStart' | 'now'>): Season {
  return calendarAt(state.calendarStart, state.now).season;
}

export function isNight(state: Pick<GameState, 'calendarStart' | 'now'>): boolean {
  return calendarAt(state.calendarStart, state.now).night;
}
