import {
  CALENDAR,
  calendarAt,
  BIOMES,
  CYCLES,
  RESOURCE_IDS,
  seasonEffects,
  type Season,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { DayDial, SeasonIcon } from '../icons';
import { useT, useUi } from '../store';
import type { ChipHandlers } from './TopBar';

/** Calendar at the UI clock, or null before the game loads. */
function useCalendar() {
  const start = useUi((s) => s.game?.calendarStart ?? null);
  // Once a second is plenty for a clock and a season countdown.
  const now = useUi((s) => s.slowNow);
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

/** Lines describing what a season changes (numbers from the shared tables). */
function useSeasonEffects(season: Season): string[] {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const biome = useUi((s) => s.game?.params.biome ?? 'classic');
  const fx = seasonEffects(season, biome);
  const v = (x: number) => formatNumber(lang, x);
  const lines: string[] = [];
  for (const id of RESOURCE_IDS) {
    const h = fx.harvest[id];
    if (h !== undefined && h !== 1)
      lines.push(t('cycles.effects.harvest', { resource: `@resources.${id}`, value: v(h) }));
  }
  if (fx.regen.all === 0) lines.push(t('cycles.effects.frozen'));
  else {
    if (fx.regen.all !== undefined && fx.regen.all !== 1)
      lines.push(t('cycles.effects.regen', { value: v(fx.regen.all) }));
    for (const id of RESOURCE_IDS) {
      const r = fx.regen[id];
      if (r !== undefined && r !== 1)
        lines.push(t('cycles.effects.regenOne', { resource: `@resources.${id}`, value: v(r) }));
    }
  }
  if (fx.walk !== 1)
    lines.push(
      t(season === 'winter' ? 'cycles.effects.walk' : 'cycles.effects.rugged', {
        value: v(fx.walk),
      }),
    );
  if (BIOMES[biome].floods === season) lines.push(t('cycles.effects.floods'));
  if (fx.hatching !== 1)
    lines.push(t('cycles.effects.hatching', { percent: Math.round((1 - fx.hatching) * 100) }));
  return lines;
}

export function ClockTip() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const cal = useCalendar();
  const effects = useSeasonEffects(cal?.c.season ?? 'spring');
  if (!cal) return null;
  const { c, now } = cal;
  return (
    <>
      <strong class="tip-title">
        <SeasonIcon season={c.season} size={18} /> {t(`cycles.seasons.${c.season}`)} ·{' '}
        {t('cycles.day', { day: c.day + 1, days: CALENDAR.seasonDays })}
      </strong>
      <p>{t(`cycles.desc.${c.season}`)}</p>
      <ul class="tip-list">
        {effects.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>{t('cycles.effects.night', { value: formatNumber(lang, CYCLES.nightWork) })}</li>
      </ul>
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
