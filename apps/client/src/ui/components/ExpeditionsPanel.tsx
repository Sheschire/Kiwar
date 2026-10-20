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
  const shipments = game.shipments;
  const incoming = game.incoming.filter((d) => d.arriveAt > now);
  if (active.length === 0 && shipments.length === 0 && incoming.length === 0) return null;
  const bar = (from: number, to: number) => (
    <span class="progress">
      <span
        style={{ width: `${Math.min(1, Math.max(0, (now - from) / (to - from || 1))) * 100}%` }}
      />
    </span>
  );
  return (
    <section class="expeditions parchment pe" aria-label={t('expedition.inFlight')}>
      <h3>
        <ShipIcon size={18} /> {t('expedition.inFlight')}
      </h3>
      <ul>
        {active.map((e) => {
          const target = game.targets.find((x) => x.id === e.targetId);
          const name = target ? targetLabel(t, target) : e.targetId;
          // A breakdown shows only once the ship turns back (half-way).
          const hidden = !!e.broken && e.status === 'outbound';
          const arrive = hidden ? e.departedAt + 2 * (e.arriveAt - e.departedAt) : e.arriveAt;
          const total = (hidden ? 2 * (arrive - e.departedAt) : e.returnAt - e.departedAt) || 1;
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
                  {e.mission === 'recon'
                    ? t('recon.done')
                    : e.result?.victory
                      ? t('expedition.victory')
                      : t('expedition.defeat')}{' '}
                  · {t('expedition.report')}
                </button>
              ) : (
                <>
                  <span class="small">
                    {e.status === 'outbound' && e.arriveAt <= now
                      ? t('expedition.awaiting', { target: name })
                      : e.status === 'outbound'
                        ? t('expedition.outbound', {
                            target: name,
                            duration: formatDuration(lang, arrive - now),
                          })
                        : t(e.broken ? 'expedition.returningBroken' : 'expedition.returning', {
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
        {shipments.map((x) => (
          <li key={x.id}>
            <span class="small">
              {x.status === 'outbound'
                ? t('delivery.outbound', {
                    name: x.owner,
                    duration: formatDuration(lang, Math.max(0, x.arriveAt - now)),
                  })
                : t('expedition.returning', {
                    duration: formatDuration(lang, Math.max(0, x.returnAt - now)),
                  })}
            </span>
            {bar(x.departedAt, x.returnAt)}
          </li>
        ))}
        {incoming.map((d) => (
          <li key={d.id}>
            <span class="small">
              {t('delivery.incoming', { name: d.from })} · {formatDuration(lang, d.arriveAt - now)}
            </span>
            {bar(d.departedAt, d.arriveAt)}
          </li>
        ))}
      </ul>
    </section>
  );
}
