import { useEffect, useState } from 'preact/hooks';
import { RESOURCE_IDS } from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { CloseIcon, ResourceIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';

/** Absences shorter than this get a small bubble in a corner instead of the full summary. */
export const RECAP_MODAL_MS = 8 * 3_600_000;
const AUTO_CLOSE_MS = 12_000;

/** Back after a short break: what changed, in a corner, without stopping the game. */
export function RecapBubble() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const summary = useUi((s) => s.offlineSummary);
  const open = useUi((s) => s.recapOpen);
  const [hover, setHover] = useState(false);
  const short = !!summary && summary.awayMs < RECAP_MODAL_MS && !open;
  const alarming =
    !!summary &&
    (summary.waves.lost > 0 ||
      summary.counters.fell > 0 ||
      summary.starved.length > 0 ||
      summary.foodRanOut.length > 0);
  useEffect(() => {
    if (!short || hover || alarming) return;
    const timer = window.setTimeout(
      () => uiStore.setState({ offlineSummary: null }),
      AUTO_CLOSE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [summary, short, hover, alarming]);
  if (!summary || !short) return null;
  const gained = RESOURCE_IDS.filter((id) => summary.gained[id] >= 1);
  const close = () => uiStore.setState({ offlineSummary: null });
  return (
    <aside
      class={`recap-bubble parchment pe ${alarming ? 'is-alarming' : ''}`}
      role="status"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div class="recap-head">
        <strong class="small">
          {t('offline.short', { duration: formatDuration(lang, summary.awayMs) })}
        </strong>
        <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={close}>
          <CloseIcon size={12} />
        </button>
      </div>
      {gained.length > 0 && (
        <p class="recap-gains small">
          {gained.map((id) => (
            <span key={id}>
              <ResourceIcon id={id} size={14} />+
              {formatNumber(lang, Math.floor(summary.gained[id]))}
            </span>
          ))}
        </p>
      )}
      {summary.completed.length > 0 && (
        <p class="small">{t('offline.shortCompleted', { count: summary.completed.length })}</p>
      )}
      {summary.counters.held + summary.counters.fell > 0 && (
        <p class={`small ${summary.counters.fell > 0 ? 'warn' : ''}`}>
          {t('offline.counters', summary.counters)}
        </p>
      )}
      {summary.waves.won + summary.waves.lost > 0 && (
        <p class={`small ${summary.waves.lost > 0 ? 'warn' : ''}`}>
          {t('offline.waves', summary.waves)}
        </p>
      )}
      {summary.gifts.length > 0 && (
        <p class="small bonus">
          {t('offline.gifts', { names: [...new Set(summary.gifts)].join(', ') })}
        </p>
      )}
      {(summary.starved.length > 0 || summary.foodRanOut.length > 0) && (
        <p class="small warn">{t('offline.shortHunger')}</p>
      )}
      <button class="btn btn-small" onClick={() => uiStore.setState({ recapOpen: true })}>
        {t('offline.details')}
      </button>
    </aside>
  );
}
