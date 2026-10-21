import {
  AGE_IDS,
  BUILDABLE_TYPES,
  BUILDINGS,
  buildCost,
  buildingAt,
  buildingCount,
  buildingRates,
  CAMPS,
  catchmentPreview,
  constructionDuration,
  depotDistance,
  describeLevel,
  describeUpgrade,
  BIOMES,
  climateOf,
  HARVESTS,
  isLaunchpadBusy,
  hexKey,
  isMaxLevel,
  levelDef,
  logisticsEfficiency,
  nearestDepotOf,
  nearRay,
  type Hex,
  nestDef,
  pendingUpgrade,
  isRampart,
  isTurret,
  SECTOR_IDS,
  turretCoverage,
  turretRange,
  turretCount,
  turretLimit,
  repairCost,
  repairDuration,
  queuedBuildAt,
  RESOURCE_IDS,
  OBSTACLES,
  OBSTACLE_RULES,
  clearDuration,
  obstacleAt,
  type Obstacle,
  tileDepositState,
  TILES,
  timeToDepletion,
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
  calendarOf,
  CYCLES,
  seasonHarvest,
  seasonRegen,
  type ResourceId,
  kindPower,
  postKind,
  type Villager,
  stardustOf,
  waitingForBuilder,
  meteorAt,
} from '@kiwar/shared';
import { bedsOf, harvestOf, idleVillagers } from '../derived';
import { MissingBedsLine } from './NeedsWidgets';
import { formatDuration, formatNumber, type Lang } from '../../i18n/i18n';
import { actions } from '../actions';
import { useThumbLayout } from '../layout';
import {
  BookIcon,
  CloseIcon,
  HammerIcon,
  KiwiIcon,
  ResourceIcon,
  SeasonIcon,
  ShipIcon,
  TargetIcon,
} from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { LevelStats, UpgradePreview } from './StatChanges';
import { buildingIcon, Icon, type IconName } from '../iconSet';
import { LabInfo } from './LabInfo';
import { siegeVisible } from './SiegeModal';
import { TitanWorks } from './TitanWorks';
import { DustSection } from './DustSection';
import { MeteorSection } from './MeteorSection';
import { AgeInfo, ResearchSummary } from './ResearchModal';
import { KiwiPortrait } from './KiwiPortrait';
import { TrainingBar } from './TrainingBar';
import { useJobLabel } from './VillageModal';
import { useState } from 'preact/hooks';

function Progress({ item, now }: { item: QueueItem; now: number }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  if (item.startedAt === null) {
    const waiting = game && waitingForBuilder(game).some((i) => i.id === item.id);
    if (waiting)
      return (
        <p class="small queue-nobuilder">
          {game.automation.build ? t('queue.noBuilder') : t('queue.manualBuilder')}
        </p>
      );
    return <p class="muted small">{t('tile.queued')}</p>;
  }
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

/** A stat name with its little icon (chantier 11). */
function StatLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span class="stat-label">
      <Icon name={icon} size={15} /> {label}
    </span>
  );
}

function pct(v: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}

/** What the hour and the season change for this producer right now. */
function CycleNotes({
  game,
  resource,
  t,
}: {
  game: GameState;
  resource: ResourceId;
  t: Translate;
}) {
  const lang = useUi((s) => s.lang);
  const c = calendarOf(game);
  const season = t(`cycles.seasons.${c.season}`);
  const harvest = seasonHarvest(c.season, resource, game.params.biome);
  const regen = seasonRegen(c.season, resource, game.params.biome);
  const value = (v: number) => formatNumber(lang, v);
  const notes: string[] = [];
  if (c.night) notes.push(t('cycles.building.night', { value: value(CYCLES.nightWork) }));
  if (harvest !== 1) notes.push(t('cycles.building.harvest', { season, value: value(harvest) }));
  if (regen === 0) notes.push(t('cycles.building.frozen', { season }));
  else if (regen !== 1) notes.push(t('cycles.building.regen', { season, value: value(regen) }));
  if (notes.length === 0) return null;
  return (
    <div class="cycle-notes">
      {notes.map((n) => (
        <p key={n} class="small cycle-note">
          <SeasonIcon season={c.season} size={13} /> {n}
        </p>
      ))}
    </div>
  );
}

/** Efficiency, walk and depot of a site, for the logistics lines (chantier 12). */
function logisticsParams(game: GameState, h: Hex, lang: Lang) {
  const map = uiStore.getState().map!;
  const depot = nearestDepotOf(game, map, h);
  const distance = depot?.distance ?? Infinity;
  return {
    percent: Math.round(logisticsEfficiency(distance) * 100),
    distance: Number.isFinite(distance) ? formatNumber(lang, Math.round(distance * 10) / 10) : '∞',
    depot: depot ? `@buildings.${depot.building.type}.name` : '—',
  };
}

/** Chantier 12: a turret's range and the sectors of the rampart it defends. */
function TurretReach({
  type,
  level,
  h,
  t,
}: {
  type: BuildingType;
  level: number;
  h: Hex;
  t: Translate;
}) {
  const map = useUi((s) => s.map);
  if (!map) return null;
  const cover = turretCoverage(map, type, level, h);
  const sectors = SECTOR_IDS.filter((s) => cover[s] > 0.005)
    .map((s) => `${t(`defense.sectors.${s}`)} ${Math.round(cover[s] * 100)} %`)
    .join(', ');
  return (
    <p class={`small ${cover.front > 0.005 ? 'muted' : 'warn'}`}>
      {t('building.turretRange', { range: turretRange(type, level), sectors })}
    </p>
  );
}

/** "Logistics here: 92 % · 4 steps to the depot (Nest)" for a build option. */
function LogisticsLine({ game, tile, t }: { game: GameState; tile: Tile; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const params = logisticsParams(game, tile, lang);
  return (
    <p class={`small ${params.percent < 80 ? 'warn' : 'muted'}`}>{t('tile.logistics', params)}</p>
  );
}

/** Deposit, regrowth and logistics of a producer. */
function HarvestInfo({ game, b, t }: { game: GameState; b: Building; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const h = harvestOf(game, b.id);
  if (!h) return null;
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  const dry = timeToDepletion(h);
  return (
    <div class="harvest">
      <div class="stat-row">
        <span class="stat-label">{t('building.deposit')}</span>
        <div class={`deposit-bar ${h.stock < h.cap * 0.25 ? 'low' : ''}`} aria-hidden="true">
          <span style={{ width: pct(h.cap > 0 ? h.stock / h.cap : 0) }} />
        </div>
        <span class="small">
          <ResourceIcon id={h.resource} size={14} /> {fmt(h.stock)}/{fmt(h.cap)}
        </span>
      </div>
      <p class="small muted">
        {t('building.depositTiles', { count: b.pool?.tiles.length ?? 0 })} ·{' '}
        {t('building.regen', { rate: fmt(h.regen) })}
      </p>
      <CycleNotes game={game} resource={h.resource} t={t} />
      {h.status === 'depleted' && <p class="small warn">⚠ {t('building.depleted')}</p>}
      {h.status === 'storageFull' && <p class="small muted">{t('building.storagePaused')}</p>}
      {h.status === 'flooded' && <p class="small warn">≈ {t('building.flooded')}</p>}
      {h.status === 'ok' &&
        (dry < Infinity ? (
          <p class="small">{t('building.depletesIn', { duration: formatDuration(lang, dry) })}</p>
        ) : (
          <p class="small bonus">✔ {t('building.sustainable')}</p>
        ))}
      <div class="stat-row">
        <span class="stat-label">{t('building.logistics')}</span>
        <span class={`small ${h.efficiency < 0.8 ? 'warn' : ''}`}>
          {t('building.logisticsValue', logisticsParams(game, b, lang))}
        </span>
      </div>
      {h.efficiency < 0.8 && <p class="small muted">{t('building.logisticsHint')}</p>}
    </div>
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
  // Chantier 21: on phones the upgrade button lives in the sheet footer, always in view.
  const thumb = useThumbLayout();
  return (
    <div class="section">
      <div class="title-row">
        <h3>
          <Icon name={buildingIcon(b.type)} size={22} /> {t(`buildings.${b.type}.name`)}
        </h3>
        <span class="badge">{t('common.levelShort', { level: b.level })}</span>
      </div>
      <p class="muted small">{t(`buildings.${b.type}.desc`)}</p>
      {b.damaged && <RepairBox game={game} map={map} b={b} now={now} t={t} />}

      {slots > 0 && (
        <div class="stat-row">
          <StatLabel icon="workers" label={t('building.workers')} />
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
      {slots > 0 && workers > 0 && <WorkerList game={game} b={b} t={t} />}
      {(def.production || def.passiveProduction || b.type === 'camp') && (
        <div class="stat-row">
          <StatLabel icon="harvest" label={t('building.production')} />
          <Rates rates={buildingRates(game, b)} />
        </div>
      )}
      <HarvestInfo game={game} b={b} t={t} />
      {def.housing !== undefined && (
        <div class="stat-row">
          <StatLabel icon="housing" label={t('building.housing')} />
          <span>
            <KiwiIcon size={16} /> {def.housing}
          </span>
        </div>
      )}
      {def.housing !== undefined && (
        <p class="small muted">
          {t('needs.beds', {
            used: [...bedsOf(game).values()].filter((x) => x.buildingId === b.id).length,
            total: def.housing,
          })}
        </p>
      )}
      {def.housing !== undefined && <MissingBedsLine />}
      {def.cargo !== undefined && (
        <>
          <div class="stat-row">
            <StatLabel icon="cargo" label={t('building.cargo')} />
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
          {siegeVisible(game) && (
            <button class="btn" onClick={() => uiStore.setState({ modal: 'siege' })}>
              <TargetIcon size={18} /> {t('siege.button')}
            </button>
          )}
        </>
      )}
      {b.type === 'school' && <SchoolInfo game={game} b={b} now={now} t={t} />}
      {b.type === 'lab' && <LabInfo game={game} map={map} b={b} now={now} />}
      {b.type === 'monument' && <AgeInfo game={game} t={t} />}
      {b.type === 'library' && (
        <>
          <p class="small muted">
            {game.automation.research
              ? t('research.researcherHint')
              : t('research.researcherManual')}
          </p>
          <ResearchSummary game={game} t={t} />
          <button
            class="btn"
            onClick={() => uiStore.setState({ modal: 'plans', plansTab: 'research' })}
          >
            <BookIcon size={18} /> {t('research.openTree')}
          </button>
        </>
      )}
      {def.defense && (
        <>
          <div class="stat-row">
            <StatLabel
              icon={def.defense.ground ? 'defenseGround' : 'defenseAir'}
              label={t('building.defense')}
            />
            <span>
              {def.defense.ground
                ? t('building.defenseGround', { value: def.defense.ground })
                : t('building.defenseAir', { value: def.defense.air ?? 0 })}
            </span>
          </div>
          <p class="small muted">
            {t('building.ammo', { count: def.ammo ?? 0 })} ·{' '}
            {t('building.turrets', { count: turretCount(game), max: turretLimit(game) })}
          </p>
          <TurretReach type={b.type} level={b.level} h={b} t={t} />
        </>
      )}
      {def.storage !== undefined && (
        <div class="stat-row">
          <StatLabel icon="storage" label={t('building.storage')} />
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

      {b.type === 'camp' || upgrading?.kind === 'repair' ? null : upgrading ? (
        <div class="upgrade-box">
          <span>
            <HammerIcon size={18} /> {t('building.upgrading', { level: upgrading.targetLevel })}
          </span>
          <Progress item={upgrading} now={now} />
        </div>
      ) : isMaxLevel(b) ? (
        <p class="small muted">{t('building.maxLevel')}</p>
      ) : (
        <div class="upgrade-box">
          <UpgradePreview
            rows={describeUpgrade(b.type, b.level, target, game)}
            from={b.level}
            to={target}
            foldable={thumb}
          />
          {!thumb && <UpgradeAction game={game} map={map} b={b} now={now} t={t} />}
        </div>
      )}
      {b.type !== 'nest' && b.type !== 'monument' && (
        <button
          class={`btn ${b.type === 'camp' ? '' : 'btn-ghost btn-small demolish-btn'}`}
          onClick={() => uiStore.setState({ modal: 'demolish', demolishId: b.id })}
        >
          {b.type === 'camp' ? t('building.dismantle') : t('building.demolish')}
        </button>
      )}
    </div>
  );
}

/** True when the building sheet offers an upgrade (not a camp, not busy, not at the top). */
function canOfferUpgrade(game: GameState, b: Building): boolean {
  return b.type !== 'camp' && !pendingUpgrade(game, b.id) && !isMaxLevel(b);
}

/** The upgrade cost, its button and why it is refused. */
function UpgradeAction({
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
  const target = b.level + 1;
  const upgradeError = validateCommand(game, { type: 'upgrade', buildingId: b.id }, { now, map });
  const nextDef = levelDef(b.type, target);
  return (
    <>
      <Cost
        cost={upgradeCost(b.type, target)}
        have={game.resources}
        stardust={levelDef(b.type, target)?.stardust}
        haveDust={stardustOf(game)}
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
      {upgradeError === 'ageTooLow' && nextDef?.requiresAge !== undefined && (
        <span class="small warn">
          {t('building.needsAge', { age: `@ages.${AGE_IDS[nextDef.requiresAge]!}` })}
        </span>
      )}
      {upgradeError &&
        upgradeError !== 'nestLevelTooLow' &&
        upgradeError !== 'ageTooLow' &&
        upgradeError !== 'notEnoughResources' && (
          <span class="small warn">{t(`errors.${upgradeError}`)}</span>
        )}
    </>
  );
}

/** School: who is in class, and a shortcut to pick a kiwi to train. */
function SchoolInfo(props: { game: GameState; b: Building; now: number; t: Translate }) {
  const { game, b, now, t } = props;
  const lang = useUi((s) => s.lang);
  const trainees = game.villagers.filter((v) => v.job.kind === 'train' && v.job.schoolId === b.id);
  const slots = levelDef('school', b.level)?.trainingSlots ?? 0;
  return (
    <>
      <div class="stat-row">
        <StatLabel icon="training" label={t('building.trainees')} />
        <span>
          <KiwiIcon size={16} /> {trainees.length}/{slots}
        </span>
      </div>
      {trainees.length === 0 ? (
        <p class="small muted">{t('building.noTrainee')}</p>
      ) : (
        trainees.map((v) =>
          v.job.kind === 'train' ? (
            <p class="small" key={v.id}>
              {t('kiwi.training', {
                class: `${v.name} → ${t(`classes.${v.job.classId}.name`)}`,
                duration: formatDuration(lang, Math.max(0, v.job.until - now)),
              })}
              <TrainingBar game={game} v={v} now={now} />
            </p>
          ) : null,
        )
      )}
      <button class="btn" onClick={() => actions.openVillage()}>
        {t('building.chooseKiwi')}
      </button>
    </>
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
  const climate = climateOf(game.face, game.params.biome);
  const lang = useUi((s) => s.lang);
  const efficiency = logisticsEfficiency(depotDistance(game, map, tile));
  const reach = HARVESTS[type] ? catchmentPreview(game, map, type, tile) : null;
  // A site whose regrowth cannot even feed the level-1 building is flagged.
  const sustainableNeed = Object.values(lvl1.production ?? {})[0] ?? 0;
  const preview: Record<string, number> = {};
  for (const id of RESOURCE_IDS)
    preview[id] = (lvl1.production?.[id] ?? 0) * efficiency * climate[id];
  const error = validateCommand(
    game,
    { type: 'build', buildingType: type, q: tile.q, r: tile.r },
    { now, map },
  );
  return (
    <div class="build-option">
      <div class="build-option-head">
        <strong>
          <Icon name={buildingIcon(type)} size={22} /> {t(`buildings.${type}.name`)}
        </strong>
        <Rates rates={preview} />
        <LevelStats stats={describeLevel(type, 1, game).filter((x) => x.stat !== 'production')} />
      </div>
      <p class="small muted">{t(`buildings.${type}.desc`)}</p>
      {reach && (
        <p class={`small ${reach.regen < sustainableNeed ? 'warn' : 'muted'}`}>
          {t('tile.reach', {
            count: reach.tiles,
            regen: formatNumber(lang, Math.round(reach.regen)),
          })}
        </p>
      )}
      {reach && <LogisticsLine game={game} tile={tile} t={t} />}
      {isTurret(type) && <TurretReach type={type} level={1} h={tile} t={t} />}
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

function GatherOption({
  game,
  map,
  tile,
  now,
  t,
}: {
  game: GameState;
  map: FaceMap;
  tile: Tile;
  now: number;
  t: Translate;
}) {
  const resource = TILES[tile.type].resource;
  if (!resource || !CAMPS.tiles.includes(tile.type)) return null;
  const efficiency = logisticsEfficiency(depotDistance(game, map, tile));
  const rate =
    CAMPS.rates[resource] * efficiency * climateOf(game.face, game.params.biome)[resource];
  const error = validateCommand(game, { type: 'gather', q: tile.q, r: tile.r }, { now, map });
  const camps = game.buildings.filter((b) => b.type === 'camp').length;
  return (
    <div class="build-option">
      <div class="build-option-head">
        <strong>{t('tile.gather')}</strong>
        <Rates rates={{ [resource]: rate }} />
        <span class="cost-item">
          <KiwiIcon size={16} />×{CAMPS.workerSlots}
        </span>
      </div>
      <p class="small muted">{t('tile.gatherDesc')}</p>
      <LogisticsLine game={game} tile={tile} t={t} />
      <div class="build-option-foot">
        <span class="small muted">
          {t('tile.free')} · {t('tile.camps', { count: camps, max: CAMPS.max })}
        </span>
        <button
          class="btn btn-primary"
          disabled={error !== null}
          title={error ? t(`errors.${error}`) : undefined}
          onClick={() => actions.dispatch({ type: 'gather', q: tile.q, r: tile.r })}
        >
          {t('tile.gatherButton')}
        </button>
      </div>
      {error && <span class="small warn">{t(`errors.${error}`)}</span>}
    </div>
  );
}

function DepositLine({
  game,
  map,
  tile,
  t,
}: {
  game: GameState;
  map: FaceMap;
  tile: Tile;
  t: Translate;
}) {
  const lang = useUi((s) => s.lang);
  const d = tileDepositState(game, map, tile);
  if (!d) return null;
  const fmt = (v: number) => formatNumber(lang, Math.round(v));
  return (
    <div class="section deposit-line">
      <div class="stat-row">
        <span class="stat-label">{t('tile.deposit')}</span>
        <div class={`deposit-bar ${d.stock < d.cap * 0.25 ? 'low' : ''}`} aria-hidden="true">
          <span style={{ width: pct(d.stock / d.cap) }} />
        </div>
      </div>
      <p class="small muted">
        {t('tile.depositValue', { stock: fmt(d.stock), cap: fmt(d.cap), regen: fmt(d.regen) })}
        {d.owner && ` · ${t('tile.harvestedBy')}`}
      </p>
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
  const thumb = useThumbLayout();
  if (!tile || !game || !map) return null;

  const building = buildingAt(game, tile.q, tile.r);
  const site = queuedBuildAt(game, tile.q, tile.r);
  const obstacle = obstacleAt(game, tile.q, tile.r);
  // Chantier 15: nothing is built on a meteorite crater (a post of its own).
  const free = !building && !site && !obstacle && !meteorAt(game, tile.q, tile.r);
  const options = BUILDABLE_TYPES.filter(
    (type) =>
      BUILDINGS[type].allowedTiles.includes(tile.type) &&
      (!isTurret(type) || isRampart(map, tile.q, tile.r)),
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
        {free && <p class="small muted">{t(`tiles.${tile.type}.desc`)}</p>}
        <DustSection game={game} tile={tile} now={now} t={t} />
        {obstacle && <ObstacleSection game={game} map={map} o={obstacle} now={now} t={t} />}
        {!building && !site && game.paths.includes(hexKey(tile)) && (
          <p class="small bonus">{t('tile.path')}</p>
        )}
        {tile.flood && BIOMES[game.params.biome].floods && (
          <p class="small warn">
            ≈{' '}
            {t('tile.floodable', {
              season: t(`cycles.seasons.${BIOMES[game.params.biome].floods!}`).toLowerCase(),
            })}
          </p>
        )}
        {!building && !site && <DepositLine game={game} map={map} tile={tile} t={t} />}
        <MeteorSection game={game} tile={tile} now={now} t={t} />
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
        {free && options.length > 0 && (
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
        {free && <GatherOption game={game} map={map} tile={tile} now={now} t={t} />}
        {!building && !site && <TitanWorks game={game} map={map} tile={tile} now={now} />}
        {free && options.length === 0 && <p class="small">{t('tile.nothing')}</p>}
      </div>
      {thumb && building && canOfferUpgrade(game, building) && (
        <footer class="sheet-foot">
          <UpgradeAction game={game} map={map} b={building} now={now} t={t} />
        </footer>
      )}
    </aside>
  );
}

/** A rock, a stump or a wreck on the tile (chantier 08): its loot and how to remove it. */
function ObstacleSection({
  game,
  map,
  o,
  now,
  t,
}: {
  game: GameState;
  map: FaceMap;
  o: Obstacle;
  now: number;
  t: Translate;
}) {
  const clearing = game.queue.find((i) => i.kind === 'clear' && i.q === o.q && i.r === o.r);
  const byKiwis = OBSTACLES[o.kind].clearedBy === 'kiwis';
  const cmd = { type: 'clearObstacle', q: o.q, r: o.r } as const;
  const error = byKiwis && !clearing ? validateCommand(game, cmd, { now, map }) : null;
  return (
    <div class="section obstacle-section">
      <div class="title-row">
        <h3>{t(`obstacles.${o.kind}.name`)}</h3>
        <span class="badge">{t('obstacles.blocks')}</span>
      </div>
      <p class="small muted">{t(`obstacles.${o.kind}.desc`)}</p>
      <div class="stat-row">
        <span class="stat-label">{t('obstacles.loot')}</span>
        <Cost cost={o.loot} />
      </div>
      {clearing ? (
        <div class="upgrade-box">
          <span>
            <HammerIcon size={18} /> {t('obstacles.clearing')}
          </span>
          <Progress item={clearing} now={now} />
        </div>
      ) : byKiwis ? (
        <div class="upgrade-box">
          <Cost
            cost={OBSTACLE_RULES.clearCost}
            have={game.resources}
            durationMs={clearDuration(game)}
          />
          <button
            class="btn btn-primary"
            disabled={error !== null}
            title={error ? t(`errors.${error}`) : undefined}
            onClick={() => actions.dispatch(cmd)}
          >
            <HammerIcon size={18} /> {t('obstacles.clear')}
          </button>
          {error && <span class="small warn">{t(`errors.${error}`)}</span>}
        </div>
      ) : game.villagers.some((v) => v.kikiwiwi) ? null : (
        <p class="small warn">{t('obstacles.needsTitan')}</p>
      )}
    </div>
  );
}

/** A building hit by predators: half pace until repaired. */
function RepairBox({
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
  const pending = pendingUpgrade(game, b.id);
  if (pending?.kind === 'repair')
    return (
      <div class="upgrade-box damaged-box">
        <span>
          <HammerIcon size={18} /> {t('building.repairing')}
        </span>
        <Progress item={pending} now={now} />
      </div>
    );
  const error = validateCommand(game, { type: 'repair', buildingId: b.id }, { now, map });
  return (
    <div class="upgrade-box damaged-box">
      <span class="small warn">{t('building.damaged')}</span>
      {game.automation.repair && <span class="small muted">{t('building.autoRepair')}</span>}
      <Cost cost={repairCost(b)} have={game.resources} durationMs={repairDuration(b)} />
      <button
        class="btn btn-primary"
        disabled={error !== null}
        title={error ? t(`errors.${error}`) : undefined}
        onClick={() => actions.dispatch({ type: 'repair', buildingId: b.id })}
      >
        <HammerIcon size={18} /> {t('building.repair')}
      </button>
    </div>
  );
}

/** Chantier 09: the workers of a building, each one replaceable by a chosen kiwi. */
function WorkerList({ game, b, t }: { game: GameState; b: Building; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const [replacing, setReplacing] = useState<string | null>(null);
  const jobLabel = useJobLabel();
  const kind = postKind(game, b);
  const power = (v: Villager) => (kind ? kindPower(v, kind) : 1);
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 100) / 100);
  const workers = workersOf(game, b.id);
  const target = workers.find((v) => v.id === replacing);
  // Free kiwis first, then the others, the best here first.
  const candidates = target
    ? game.villagers
        .filter(
          (v) =>
            !v.kikiwiwi &&
            ['idle', 'work', 'guard'].includes(v.job.kind) &&
            !(v.job.kind === 'work' && v.job.buildingId === b.id),
        )
        .sort((x, y) => +(y.job.kind === 'idle') - +(x.job.kind === 'idle') || power(y) - power(x))
    : [];
  return (
    <div class="worker-list">
      <ul>
        {workers.map((v) => (
          <li key={v.id} class="worker-row">
            <button class="worker-main" onClick={() => actions.openVillage(v.id)}>
              <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={30} />
              <span class="small">{v.name}</span>
              <span class="small muted">×{fmt(power(v))}</span>
            </button>
            <button
              class={`btn btn-small ${replacing === v.id ? 'btn-active' : ''}`}
              aria-expanded={replacing === v.id}
              onClick={() => setReplacing(replacing === v.id ? null : v.id)}
            >
              {t('posts.replace')}
            </button>
          </li>
        ))}
      </ul>
      {target && (
        <div class="replace-box">
          <p class="small">{t('posts.replaceWith', { name: target.name })}</p>
          {candidates.length === 0 && <p class="small muted">{t('posts.noReplacement')}</p>}
          <ul>
            {candidates.map((v) => (
              <li key={v.id}>
                <button
                  class="worker-main"
                  onClick={() => {
                    if (
                      actions.dispatch({
                        type: 'assignKiwi',
                        villagerId: v.id,
                        buildingId: b.id,
                        replace: target.id,
                      })
                    )
                      setReplacing(null);
                  }}
                >
                  <KiwiPortrait shiny={v.shiny} classId={v.classId} seed={v.id} size={30} />
                  <span class="small">{v.name}</span>
                  <span class="small muted">{jobLabel(game, v)}</span>
                  <span class={`small ${power(v) > power(target) ? 'bonus' : 'muted'}`}>
                    ×{fmt(power(v))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
