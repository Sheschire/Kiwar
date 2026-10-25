import {
  buildSlots,
  builderSpeed,
  canBorrow,
  getTile,
  obstacleAt,
  waitingForBuilder,
  type GameState,
  type QueueItem,
} from '@kiwar/shared';
import { useState } from 'preact/hooks';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { CloseIcon, HammerIcon } from '../icons';
import { BuildingThumb } from './BuildingThumb';
import { Icon } from '../iconSet';
import { setPanelOpen, useT, useUi } from '../store';

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
  const canal = item.kind === 'canal' || item.kind === 'fill';
  const label =
    item.kind === 'canal'
      ? t('canals.queueDig')
      : item.kind === 'fill'
        ? t('canals.queueFill')
        : item.kind === 'clear'
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
        <span class="queue-label">
          {canal && <Icon name="canal" size={26} />}
          {item.kind !== 'clear' && !canal && (
            <BuildingThumb
              type={item.buildingType}
              level={Math.max(1, item.targetLevel)}
              size={26}
            />
          )}
          {label}
        </span>
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
      {waiting === 'manual' && game && <BuilderPick game={game} item={item} />}
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

/**
 * Chantier 15, manual constructions: the strongest kiwis that may build, one tap starts the
 * site with that kiwi.
 */
function BuilderPick({ game, item }: { game: GameState; item: QueueItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const candidates = game.villagers
    .filter(
      (v) =>
        !v.kikiwiwi &&
        (v.job.kind === 'idle' || canBorrow(game, { ...v, locked: undefined }, 'build')),
    )
    .sort((a, b) => builderSpeed(b) - builderSpeed(a))
    .slice(0, 4);
  return (
    <span class="builder-pick">
      <button
        class="btn btn-small"
        aria-expanded={open}
        disabled={candidates.length === 0}
        onClick={() => setOpen(!open)}
      >
        {t('queue.choose')}
      </button>
      {open && (
        <span class="builder-pick-list parchment">
          {candidates.map((v) => (
            <button
              key={v.id}
              class="btn btn-small"
              onClick={() => {
                setOpen(false);
                actions.dispatch({ type: 'assignBuilder', queueItemId: item.id, villagerId: v.id });
              }}
            >
              {v.name} · {t('queue.speed', { speed: Math.round(builderSpeed(v) * 100) })}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function QueuePanel() {
  const t = useT();
  const queue = useUi((s) => s.game?.queue ?? []);
  const villagers = useUi((s) => s.game?.villagers ?? []);
  const now = useUi((s) => s.now);
  const game = useUi((s) => s.game);
  const open = useUi((s) => s.queueOpen);
  const lang = useUi((s) => s.lang);
  if (queue.length === 0 || !game) return null;
  if (!open) {
    // Folded: a pill with the count and the time left on the first running site.
    const first = queue.find((i) => i.startedAt !== null);
    return (
      <button
        class="queue queue-pill parchment pe"
        aria-label={t('queue.unfold')}
        aria-expanded={false}
        onClick={() => setPanelOpen('queue', true)}
      >
        <HammerIcon size={16} />
        <strong>{queue.length}</strong>
        {first?.startedAt != null && (
          <span class="small muted">
            {formatDuration(lang, first.startedAt + first.durationMs - now)}
          </span>
        )}
        <span class="fold-chevron" aria-hidden="true">
          ▴
        </span>
      </button>
    );
  }
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
        <button
          class="btn btn-icon btn-small btn-ghost fold-btn"
          aria-label={t('queue.fold')}
          aria-expanded={true}
          onClick={() => setPanelOpen('queue', false)}
        >
          ▾
        </button>
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
