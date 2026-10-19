import { CALENDAR, calendarAt } from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { DayDial, SeasonIcon } from '../icons';
import { useT, useUi } from '../store';
import type { ChipHandlers } from './TopBar';

/** Calendar at the UI clock, or null before the game loads. */
function useCalendar() {
  const start = useUi((s) => s.game?.calendarStart ?? null);
  const now = useUi((s) => s.now);
  if (start === null) return null;
  return { c: calendarAt(start, now), now };
}

/** Day/night dial, season and countdown to the next season, at the end of the resource bar. */
export function ClockChip({ h }: { h: ChipHandlers }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const cal = useCalendar();
  if (!cal) return null;
  const { c, now } = cal;
  const season = t(`cycles.seasons.${c.season}`);
  return (
    <button
      type="button"
      data-tip="clock"
      class={`chip chip-clock ${c.night ? 'is-night' : ''} ${h.open ? 'is-open' : ''}`}
      aria-label={`${season} · ${t('cycles.nextSeason', {
        season: t(`cycles.seasons.${c.next}`),
        duration: formatDuration(lang, c.seasonEndsAt - now),
      })}`}
      aria-expanded={h.open}
      onPointerEnter={h.onEnter}
      onPointerLeave={h.onLeave}
      onClick={h.onToggle}
    >
      <span class="clock-icons">
        <DayDial
          progress={c.dayProgress}
          nightShare={CALENDAR.nightMs[c.season] / CALENDAR.dayMs}
        />
        <SeasonIcon season={c.season} size={15} class="clock-season" />
      </span>
      <div class="chip-body">
        <div class="chip-line">
          <span class="chip-season">{season}</span>
        </div>
        <div class="chip-rate">
          <SeasonIcon season={c.next} size={11} /> {formatDuration(lang, c.seasonEndsAt - now)}
        </div>
      </div>
    </button>
  );
}

export function ClockTip() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const cal = useCalendar();
  if (!cal) return null;
  const { c, now } = cal;
  return (
    <>
      <strong class="tip-title">
        <SeasonIcon season={c.season} size={18} /> {t(`cycles.seasons.${c.season}`)} ·{' '}
        {t('cycles.day', { day: c.day + 1, days: CALENDAR.seasonDays })}
      </strong>
      <p>{t(`cycles.desc.${c.season}`)}</p>
      <p class="tip-line">
        {c.night
          ? t('cycles.isNight', { duration: formatDuration(lang, c.dawnAt - now) })
          : t('cycles.isDay', { duration: formatDuration(lang, c.nightAt - now) })}
      </p>
      <p class="tip-line muted">
        {t('cycles.nextSeason', {
          season: t(`cycles.seasons.${c.next}`),
          duration: formatDuration(lang, c.seasonEndsAt - now),
        })}
      </p>
    </>
  );
}
