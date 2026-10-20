import { buildSlots, getTile, obstacleAt, waitingForBuilder, type QueueItem } from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { CloseIcon, HammerIcon } from '../icons';
import { useT, useUi } from '../store';

function QueueRow({
  item,
  now,
  builder,
  waiting,
}: {
  item: QueueItem;
  now: number;
  builder: string | null;
  /** Chantier 15: it has a place but no builder yet ('manual': the player picks one). */
  waiting: 'auto' | 'manual' | null;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const map = useUi((s) => s.map);
  const game = useUi((s) => s.game);
  const obstacle = item.kind === 'clear' && game ? obstacleAt(game, item.q, item.r) : undefined;
  const name = t(`buildings.${item.buildingType}.name`);
  const label =
    item.kind === 'clear'
      ? t('queue.clear', { name: t(`obstacles.${obstacle?.kind ?? 'stump'}.name`) })
      : item.kind === 'build'
        ? t('queue.build', { name })
        : item.kind === 'repair'
          ? t('queue.repair', { name })
          : t('queue.upgrade', { name, level: item.targetLevel });
  const progress =
    item.startedAt !== null ? Math.min(1, (now - item.startedAt) / item.durationMs) : 0;
  const focus = () => {
    const tile = map ? getTile(map, item) : undefined;
    if (tile) {
      actions.selectTile(tile);
      actions.focusTile(tile);
    }
  };
  return (
    <li class={`queue-row ${item.startedAt !== null ? 'active' : ''}`}>
      <button class="queue-main" onClick={focus}>
        <span class="queue-label">{label}</span>
        {item.startedAt !== null ? (
          <>
            <span class="progress">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
            <span class="small muted">
              {formatDuration(lang, item.startedAt + item.durationMs - now)}
              {builder ? ` · ${t('queue.builder', { name: builder })}` : ''}
            </span>
          </>
        ) : waiting ? (
          <span
            class="small queue-nobuilder"
            title={waiting === 'auto' ? t('queue.noBuilderHint') : undefined}
          >
            {waiting === 'auto' ? t('queue.noBuilder') : t('queue.manualBuilder')} ·{' '}
            {formatDuration(lang, item.durationMs)}
          </span>
        ) : (
          <span class="small muted">
            {t('queue.waiting')} · {formatDuration(lang, item.durationMs)}
          </span>
        )}
      </button>
      <button
        class="btn btn-icon btn-ghost"
        aria-label={t('queue.cancel')}
        title={t('queue.cancel')}
        onClick={() => actions.dispatch({ type: 'cancel', queueItemId: item.id })}
      >
        <CloseIcon size={14} />
      </button>
    </li>
  );
}

export function QueuePanel() {
  const t = useT();
  const queue = useUi((s) => s.game?.queue ?? []);
  const villagers = useUi((s) => s.game?.villagers ?? []);
  const now = useUi((s) => s.now);
  const game = useUi((s) => s.game);
  if (queue.length === 0 || !game) return null;
  const slots = buildSlots(game);
  const started = queue.filter((i) => i.startedAt !== null).length;
  const waiting = new Set(waitingForBuilder(game).map((i) => i.id));
  const mode = game.automation.build ? 'auto' : 'manual';
  return (
    <section class="queue parchment pe" aria-label={t('queue.title')}>
      <h3>
        <HammerIcon size={18} /> {t('queue.title')}
        {slots > 1 && (
          <span class="small muted queue-slots">
            {t('queue.slots', { count: started, max: slots })}
          </span>
        )}
      </h3>
      <ul>
        {queue.map((item) => {
          const builder = villagers.find(
            (v) => v.job.kind === 'build' && v.job.queueItemId === item.id,
          );
          return (
            <QueueRow
              key={item.id}
              item={item}
              now={now}
              builder={builder?.name ?? null}
              waiting={waiting.has(item.id) ? mode : null}
            />
          );
        })}
      </ul>
    </section>
  );
}
