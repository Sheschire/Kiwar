import {
  buildingAt,
  buildingRates,
  faceMapOf,
  getTile,
  levelDef,
  meteorAt,
  queuedBuildAt,
  RESOURCE_IDS,
  tileDepositState,
  workersOf,
  workerSlots,
  type GameState,
  type QueueItem,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { CloseIcon, ResourceIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { BuildingThumb } from './BuildingThumb';

/** Time and bar of a construction of the visited colony (their game time runs on). */
function AllyProgress({ item, now }: { item: QueueItem; now: number }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  if (item.startedAt === null) return <p class="muted small">{t('tile.queued')}</p>;
  const done = Math.min(1, (now - item.startedAt) / item.durationMs);
  return (
    <div class="progress-block">
      <div class="progress">
        <span style={{ width: `${done * 100}%` }} />
      </div>
      <span class="small muted">
        {formatDuration(lang, Math.max(0, item.startedAt + item.durationMs - now))}
      </span>
    </div>
  );
}

/**
 * Chantier 59: the sheet of a tile of the ally's village we visit — its building with its
 * level, workers and harvest, the site under way, or the ground and its deposit. Read only,
 * from the colony the server sent (no stocks).
 */
export function AllyTilePanel() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const at = useUi((s) => s.allyTile);
  const village = useUi((s) => s.allyVillage);
  // Their clock runs on from the snapshot like the 3D village does.
  const now = useUi((s) => s.now);
  if (!at || !village) return null;
  const game: GameState = village;
  const theirNow = Math.max(game.now, now);
  const map = faceMapOf(game);
  const tile = getTile(map, at);
  if (!tile) return null;
  const b = buildingAt(game, at.q, at.r);
  const site = queuedBuildAt(game, at.q, at.r);
  const upgrade = b && game.queue.find((i) => i.buildingId === b.id);
  const deposit = !b && !site ? tileDepositState(game, map, tile) : null;
  const crater = meteorAt(game, at.q, at.r);
  const close = () => uiStore.setState({ allyTile: null });
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const title = b
    ? t(`buildings.${b.type}.name`)
    : site
      ? t(`buildings.${site.buildingType}.name`)
      : t(`tiles.${tile.type}.name`);
  const workers = b ? workersOf(game, b.id) : [];
  const slots = b ? workerSlots(b) : 0;
  const def = b ? levelDef(b.type, b.level) : undefined;
  const rates = b && (def?.production || def?.passiveProduction) ? buildingRates(game, b) : null;
  return (
    <aside class="sheet parchment pe" aria-label={title}>
      <header class="sheet-header">
        <div>
          <h2>
            {b && <BuildingThumb type={b.type} level={b.level} size={30} />} {title}
          </h2>
          <span class="small muted tile-meta">{t('planets.allyLook')}</span>
        </div>
        <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={close}>
          <CloseIcon />
        </button>
      </header>
      <div class="sheet-body">
        {b && (
          <div class="section">
            <div class="title-row">
              <span class="badge">{t('common.levelShort', { level: b.level })}</span>
            </div>
            <p class="muted small">{t(`buildings.${b.type}.desc`)}</p>
            {upgrade && (
              <>
                <p class="small">
                  {upgrade.kind === 'repair'
                    ? t('building.repairing')
                    : t('building.upgrading', { level: upgrade.targetLevel })}
                </p>
                <AllyProgress item={upgrade} now={theirNow} />
              </>
            )}
            {slots > 0 && (
              <p class="small">
                {workers.length > 0
                  ? t('planets.allyWorkers', { names: workers.map((v) => v.name).join(', ') })
                  : t('planets.allyNobody')}{' '}
                <span class="muted">
                  ({workers.length}/{slots})
                </span>
              </p>
            )}
            {rates && (
              <p class="small rates">
                {RESOURCE_IDS.filter((id) => (rates[id] ?? 0) > 0.001).map((id) => (
                  <span key={id} class="cost-item">
                    <ResourceIcon id={id} size={16} />+{formatNumber(lang, rates[id]!)}/h
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
        {site && (
          <div class="section">
            <span class="badge">{t('tile.underConstruction')}</span>
            <AllyProgress item={site} now={theirNow} />
          </div>
        )}
        {!b && !site && <p class="small muted">{t(`tiles.${tile.type}.desc`)}</p>}
        {deposit && (
          <p class="small muted">
            {t('tile.depositValue', {
              stock: fmt(deposit.stock),
              cap: fmt(deposit.cap),
              regen: fmt(deposit.regen),
            })}
          </p>
        )}
        {crater && <p class="small bonus">✦ {t('sky.post')}</p>}
      </div>
    </aside>
  );
}
