import { describe, expect, it } from 'vitest';
import {
  advance,
  CALENDAR,
  calendarAt,
  HOUR_MS,
  migrateState,
  nextCalendarChange,
  SEASON_MS,
  YEAR_MS,
} from '../src';
import { setup, T0 } from './helpers';

describe('calendar', () => {
  it('starts at dawn of spring and alternates day and night', () => {
    const c = calendarAt(T0, T0);
    expect(c).toMatchObject({ season: 'spring', year: 0, day: 0, sinceDawn: 0, night: false });
    const nightAt = T0 + CALENDAR.dayMs - CALENDAR.nightMs.spring;
    expect(c.nightAt).toBe(nightAt);
    expect(calendarAt(T0, nightAt - 1).night).toBe(false);
    expect(calendarAt(T0, nightAt).night).toBe(true);
    expect(calendarAt(T0, T0 + CALENDAR.dayMs)).toMatchObject({ day: 1, night: false });
    expect(nextCalendarChange(T0, T0)).toBe(nightAt);
    expect(nextCalendarChange(T0, nightAt)).toBe(T0 + CALENDAR.dayMs);
  });

  it('cycles through the four seasons, with shorter summer nights', () => {
    expect(calendarAt(T0, T0 + SEASON_MS).season).toBe('summer');
    expect(calendarAt(T0, T0 + 2 * SEASON_MS).season).toBe('autumn');
    const winter = calendarAt(T0, T0 + 3 * SEASON_MS + 5);
    expect(winter).toMatchObject({ season: 'winter', next: 'spring' });
    expect(winter.seasonEndsAt).toBe(T0 + YEAR_MS);
    expect(calendarAt(T0, T0 + YEAR_MS)).toMatchObject({ season: 'spring', year: 1 });
    const summer = calendarAt(T0, T0 + SEASON_MS);
    expect(summer.nightAt - T0 - SEASON_MS).toBe(CALENDAR.dayMs - CALENDAR.nightMs.summer);
    // Before the calendar start (universe joined later is never earlier, but stay total).
    expect(calendarAt(T0, T0 - 1)).toMatchObject({ season: 'winter', night: true, year: -1 });
  });

  it('reports season changes while advancing', () => {
    const { state } = setup();
    // A new colony wakes up on a spring morning.
    expect(calendarAt(state.calendarStart, T0)).toMatchObject({ season: 'spring', day: 0 });
    expect(state.calendarStart).toBe(T0 - CALENDAR.startOffsetMs);
    const summer = state.calendarStart + SEASON_MS;
    const { events, state: after } = advance(state, summer + HOUR_MS);
    const seasons = events.filter((e) => e.type === 'seasonChanged');
    expect(seasons).toEqual([{ type: 'seasonChanged', at: summer, season: 'summer' }]);
    expect(after.now).toBe(summer + HOUR_MS);
  });

  it('migrates v5 saves: the calendar starts with the game', () => {
    const { state } = setup();
    const v5 = JSON.parse(JSON.stringify({ ...state, schemaVersion: 5 })) as Record<
      string,
      unknown
    >;
    delete v5.calendarStart;
    const m = migrateState(v5);
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.calendarStart).toBe(state.calendarStart);
  });
});
