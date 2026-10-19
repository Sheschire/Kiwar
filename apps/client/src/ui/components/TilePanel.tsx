import {
  BUILDABLE_TYPES,
  BUILDINGS,
  buildCost,
  buildingAt,
  buildingCount,
  buildingRates,
  constructionDuration,
  FACE_PROFILES,
  idleVillagers,
  isLaunchpadBusy,
  levelDef,
  MAX_LEVEL,
  nearRay,
  nestDef,
  pendingUpgrade,
  queuedBuildAt,
  RESOURCE_IDS,
  TILES,
  upgradeCost,
  validateCommand,
  workersOf,
  workerSlots,
  type Building,
  type BuildingType,
  type FaceMap,
  type GameState,
  type QueueItem,
  type Tile,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { CloseIcon, HammerIcon, KiwiIcon, ResourceIcon, ShipIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';

function Progress({ item, now }: { item: QueueItem; now: number }) {
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
        {formatDuration(lang, item.startedAt + item.durationMs - now)}
      </span>
    </div>
  );
}

function Rates({ rates }: { rates: Record<string, number> }) {
  const lang = useUi((s) => s.lang);
  const ids = RESOURCE_IDS.filter((id) => rates[id]! > 0.001);
  if (ids.length === 0) return null;
  return (
    <span class="rates">
      {ids.map((id) => (
        <span key={id} class="cost-item">
          <ResourceIcon id={id} size={16} />+{formatNumber(lang, rates[id]!)}/h
        </span>
      ))}
    </span>
  );
}

function BuildingSection({
  game,
  map,
  b,
  now,
  t,
}: {
  game: GameState;
  map: FaceMap;
  b: Building;
  now: number;
  t: Translate;
}) {
  const def = levelDef(b.type, b.level)!;
  const slots = workerSlots(b);
  const workers = workersOf(game, b.id).length;
  const idle = idleVillagers(game).length;
  const upgrading = pendingUpgrade(game, b.id);
  const target = b.level + 1;
  const ctx = { now, map };
  const upgradeError =
    b.level < MAX_LEVEL ? validateCommand(game, { type: 'upgrade', buildingId: b.id }, ctx) : null;
  const nextDef = levelDef(b.type, target);
  return (
    <div class="section">
      <div class="title-row">
        <h3>{t(`buildings.${b.type}.name`)}</h3>
        <span class="badge">{t('common.levelShort', { level: b.level })}</span>
      </div>
      <p class="muted small">{t(`buildings.${b.type}.desc`)}</p>

      {slots > 0 && (
        <div class="stat-row">
          <span class="stat-label">{t('building.workers')}</span>
          <div class="stepper">
            <button
              class="btn btn-icon"
              aria-label={t('building.removeWorker')}
              disabled={workers === 0}
              onClick={() =>
                actions.dispatch({ type: 'assignWorkers', buildingId: b.id, count: workers - 1 })
              }
            >
              −
            </button>
            <span class="stepper-value" aria-live="polite">
              <KiwiIcon size={18} /> {workers}/{slots}
            </span>
            <button
              class="btn btn-icon"
              aria-label={t('building.addWorker')}
              disabled={workers >= slots || idle === 0}
              onClick={() =>
                actions.dispatch({ type: 'assignWorkers', buildingId: b.id, count: workers + 1 })
              }
            >
              +
            </button>
          </div>
          <span class="small muted">{t('building.idleKiwis', { count: idle })}</span>
        </div>
      )}
      {(def.production || def.passiveProduction) && (
        <div class="stat-row">
          <span class="stat-label">{t('building.production')}</span>
          <Rates rates={buildingRates(game, b)} />
        </div>
      )}
      {def.housing !== undefined && (
        <div class="stat-row">
          <span class="stat-label">{t('building.housing')}</span>
          <span>
            <KiwiIcon size={16} /> {def.housing}
          </span>
        </div>
      )}
      {def.cargo !== undefined && (
        <>
          <div class="stat-row">
            <span class="stat-label">{t('building.cargo')}</span>
            <span>{def.cargo}</span>
          </div>
          <button
            class="btn btn-primary"
            disabled={isLaunchpadBusy(game, b.id)}
            onClick={() => uiStore.setState({ modal: 'expedition', expeditionPad: b.id })}
          >
            <ShipIcon size={18} />{' '}
            {isLaunchpadBusy(game, b.id) ? t('building.shipAway') : t('building.prepare')}
          </button>
        </>
      )}
      {def.storage !== undefined && (
        <div class="stat-row">
          <span class="stat-label">{t('building.storage')}</span>
          <span>{def.storage}</span>
        </div>
      )}
      {b.type === 'nest' && (
        <p class="small muted">
          {t('building.limits', {
            count: buildingCount(game),
            max: nestDef(game).maxBuildings ?? 0,
            queue: nestDef(game).queueSize ?? 0,
          })}
        </p>
      )}

      {upgrading ? (
        <div class="upgrade-box">
          <span>
            <HammerIcon size={18} /> {t('building.upgrading', { level: upgrading.targetLevel })}
          </span>
          <Progress item={upgrading} now={now} />
        </div>
      ) : b.level >= MAX_LEVEL ? (
        <p class="small muted">{t('building.maxLevel')}</p>
      ) : (
        <div class="upgrade-box">
          <Cost
            cost={upgradeCost(b.type, target)}
            have={game.resources}
            durationMs={constructionDuration(game, b.type, target, false, nearRay(map, b.q, b.r))}
          />
          <button
            class="btn btn-primary"
            disabled={upgradeError !== null}
            title={upgradeError ? t(`errors.${upgradeError}`) : undefined}
            onClick={() => actions.dispatch({ type: 'upgrade', buildingId: b.id })}
          >
            <HammerIcon size={18} /> {t('building.upgrade', { level: target })}
          </button>
          {upgradeError === 'nestLevelTooLow' && nextDef && (
            <span class="small warn">
              {t('building.needsNest', { level: nextDef.requiresNestLevel })}
            </span>
          )}
          {upgradeError &&
            upgradeError !== 'nestLevelTooLow' &&
            upgradeError !== 'notEnoughResources' && (
              <span class="small warn">{t(`errors.${upgradeError}`)}</span>
            )}
        </div>
      )}
    </div>
  );
}

function BuildOption({
  game,
  map,
  tile,
  type,
  now,
  t,
}: {
  game: GameState;
  map: FaceMap;
  tile: Tile;
  type: BuildingType;
  now: number;
  t: Translate;
}) {
  const lvl1 = BUILDINGS[type].levels[0]!;
  const climate = FACE_PROFILES[game.face].yieldMultiplier;
  const preview: Record<string, number> = {};
  for (const id of RESOURCE_IDS)
    preview[id] = (lvl1.production?.[id] ?? 0) * tile.richness * climate[id];
  const error = validateCommand(
    game,
    { type: 'build', buildingType: type, q: tile.q, r: tile.r },
    { now, map },
  );
  return (
    <div class="build-option">
      <div class="build-option-head">
        <strong>{t(`buildings.${type}.name`)}</strong>
        <Rates rates={preview} />
        {lvl1.housing && (
          <span class="cost-item">
            <KiwiIcon size={16} />+{lvl1.housing}
          </span>
        )}
        {lvl1.storage && <span class="cost-item">+{lvl1.storage}</span>}
      </div>
      <p class="small muted">{t(`buildings.${type}.desc`)}</p>
      <div class="build-option-foot">
        <Cost
          cost={buildCost(game, type)}
          have={game.resources}
          durationMs={constructionDuration(game, type, 1, true, nearRay(map, tile.q, tile.r))}
        />
        <button
          class="btn btn-primary"
          disabled={error !== null}
          title={error ? t(`errors.${error}`) : undefined}
          onClick={() =>
            actions.dispatch({ type: 'build', buildingType: type, q: tile.q, r: tile.r })
          }
        >
          <HammerIcon size={18} /> {t('tile.build')}
        </button>
      </div>
      {error && error !== 'notEnoughResources' && (
        <span class="small warn">{t(`errors.${error}`)}</span>
      )}
    </div>
  );
}

/** Contextual card for the selected tile: info, building management or build menu. */
export function TilePanel() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const tile = useUi((s) => s.selectedTile);
  const game = useUi((s) => s.game);
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  if (!tile || !game || !map) return null;

  const building = buildingAt(game, tile.q, tile.r);
  const site = queuedBuildAt(game, tile.q, tile.r);
  const options = BUILDABLE_TYPES.filter((type) =>
    BUILDINGS[type].allowedTiles.includes(tile.type),
  );
  const resource = TILES[tile.type].resource;
  const ray = nearRay(map, tile.q, tile.r);

  return (
    <aside class="sheet parchment pe" aria-label={t(`tiles.${tile.type}.name`)}>
      <header class="sheet-header">
        <div>
          <h2>{t(`tiles.${tile.type}.name`)}</h2>
          {resource && (
            <span class="small muted tile-meta">
              {t('tile.goodFor')} <ResourceIcon id={resource} size={14} />{' '}
              {t(`resources.${resource}`)} · {t('tile.richness')} ×
              {formatNumber(lang, tile.richness)}
            </span>
          )}
        </div>
        <button
          class="btn btn-icon btn-ghost"
          aria-label={t('common.close')}
          onClick={() => actions.selectTile(null)}
        >
          <CloseIcon />
        </button>
      </header>
      <div class="sheet-body">
        {!building && !site && <p class="small muted">{t(`tiles.${tile.type}.desc`)}</p>}
        {building && <BuildingSection game={game} map={map} b={building} now={now} t={t} />}
        {site && (
          <div class="section">
            <div class="title-row">
              <h3>{t(`buildings.${site.buildingType}.name`)}</h3>
              <span class="badge">{t('tile.underConstruction')}</span>
            </div>
            <Progress item={site} now={now} />
          </div>
        )}
        {!building && !site && options.length > 0 && (
          <div class="build-list">
            {ray && <p class="small bonus">{t('tile.rayBonus')}</p>}
            {options.map((type) => (
              <BuildOption
                key={type}
                game={game}
                map={map}
                tile={tile}
                type={type}
                now={now}
                t={t}
              />
            ))}
          </div>
        )}
        {!building && !site && options.length === 0 && <p class="small">{t('tile.nothing')}</p>}
      </div>
    </aside>
  );
}
