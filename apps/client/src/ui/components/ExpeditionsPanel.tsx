import { formatDuration } from '../../i18n/i18n';
import { ShipIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { targetLabel } from './ExpeditionModal';

/** Ships in flight, with timers; finished expeditions with an unread report can be opened. */
export function ExpeditionsPanel() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const now = useUi((s) => s.now);
  const unread = useUi((s) => s.unreadReports);
  if (!game) return null;
  const active = game.expeditions.filter((e) => e.status !== 'done' || unread.includes(e.id));
  if (active.length === 0) return null;
  return (
    <section class="expeditions parchment pe" aria-label={t('expedition.inFlight')}>
      <h3>
        <ShipIcon size={18} /> {t('expedition.inFlight')}
      </h3>
      <ul>
        {active.map((e) => {
          const target = game.targets.find((x) => x.id === e.targetId);
          const name = target ? targetLabel(t, target) : e.targetId;
          const total = e.returnAt - e.departedAt;
          const progress = Math.min(1, Math.max(0, (now - e.departedAt) / total));
          return (
            <li key={e.id}>
              {e.status === 'done' ? (
                <button
                  class="btn btn-small report-btn"
                  onClick={() =>
                    uiStore.setState((s) => ({
                      modal: 'report',
                      reportId: e.id,
                      unreadReports: s.unreadReports.filter((id) => id !== e.id),
                    }))
                  }
                >
                  {e.result?.victory ? t('expedition.victory') : t('expedition.defeat')} ·{' '}
                  {t('expedition.report')}
                </button>
              ) : (
                <>
                  <span class="small">
                    {e.status === 'outbound'
                      ? t('expedition.outbound', {
                          target: name,
                          duration: formatDuration(lang, e.arriveAt - now),
                        })
                      : t('expedition.returning', {
                          duration: formatDuration(lang, e.returnAt - now),
                        })}
                  </span>
                  <span class="progress">
                    <span style={{ width: `${progress * 100}%` }} />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
