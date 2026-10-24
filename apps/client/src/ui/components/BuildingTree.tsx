import {
  climateOf,
  DEPOSITS,
  HARVESTS,
  isTurret,
  AGE_IDS,
  ageOf,
  buildCost,
  buildLock,
  BUILDINGS,
  canAfford,
  constructionDuration,
  copiesOf,
  describeLevel,
  maxLevelOf,
  nestDef,
  type BuildingType,
  type GameState,
  footprintOf,
} from '@kiwar/shared';
import { actions } from '../actions';
import { Icon } from '../iconSet';
import { BuildingThumb } from './BuildingThumb';
import { useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { LevelStats } from './StatChanges';
import {
  placementCover,
  placementError,
  placementPlan,
  type PlacementPlan,
} from '../../game/placement';
import { formatNumber } from '../../i18n/i18n';

/** Chantier 11: every building by family, its levels, what unlocks it, and "Place". */

type FamilyId = 'production' | 'housing' | 'storage' | 'defense' | 'knowledge' | 'ship' | 'village';

const FAMILIES: readonly { id: FamilyId; types: readonly BuildingType[] }[] = [
  { id: 'production', types: ['pulpery', 'fiberWorkshop', 'juiceWell', 'seedQuarry', 'forge'] },
  { id: 'housing', types: ['nest', 'hut'] },
  { id: 'storage', types: ['warehouse'] },
  { id: 'defense', types: ['seedTurret', 'skyTurret', 'trainingCamp'] },
  { id: 'knowledge', types: ['school', 'library', 'monument', 'lab'] },
  { id: 'ship', types: ['launchpad'] },
  // Chantier 44: the village's life (outside the building cap but the Town Hall).
  {
    id: 'village',
    types: [
      'townHall',
      'campfire',
      'swing',
      'skittles',
      'skipPond',
      'slide',
      'lanterns',
      'flowerBed',
      'vineArch',
      'fountain',
      'mayorStatue',
    ],
  },
];

/** The age a level waits for, when it is not reached yet (shown as "???"). */
function laterAge(game: GameState, type: BuildingType, level: number): number | null {
  const age = BUILDINGS[type].levels[level - 1]?.requiresAge ?? 0;
  return age > ageOf(game) ? age : null;
}

/** Why "Place" is off: the shared lock, then the queue and the resources. */
function lockReason(game: GameState, type: BuildingType, t: Translate): string | null {
  const lock = buildLock(game, type);
  const first = BUILDINGS[type].levels[0]!;
  if (lock === 'nestLevelTooLow')
    return t('building.needsNest', { level: first.requiresNestLevel });
  if (lock === 'ageTooLow')
    return t('building.needsAge', { age: `@ages.${AGE_IDS[first.requiresAge ?? 0]!}` });
  if (lock) return t(`errors.${lock}`);
  if (game.queue.length >= (nestDef(game).queueSize ?? 1)) return t('plans.queueFull');
  if (!canAfford(game.resources, buildCost(game, type))) return t('errors.notEnoughResources');
  return null;
}

function Levels({ game, type, t }: { game: GameState; type: BuildingType; t: Translate }) {
  const all = Array.from({ length: maxLevelOf(type) }, (_, i) => i + 1);
  // Chantier 30: three levels per age; a later age shows one "???" line for all of its levels.
  const levels = all.filter((level) => {
    const later = laterAge(game, type, level);
    return later === null || laterAge(game, type, level - 1) !== later;
  });
  return (
    <ul class="tree-levels">
      {levels.map((level) => {
        const def = BUILDINGS[type].levels[level - 1]!;
        const later = laterAge(game, type, level);
        if (later !== null) {
          const last = all.filter((l) => laterAge(game, type, l) === later).pop() ?? level;
          return (
            <li key={level} class="tree-level is-hidden">
              <BuildingThumb type={type} level={level} locked size={34} />
              <span class="badge">
                {last > level
                  ? t('plans.levelRange', { from: level, to: last })
                  : t('plans.level', { level })}
              </span>
              <span class="small muted">
                {t('plans.unknown')} · {t('plans.later', { age: `@ages.${AGE_IDS[later]!}` })}
              </span>
            </li>
          );
        }
        return (
          <li key={level} class="tree-level">
            <BuildingThumb type={type} level={level} size={34} />
            <span class="badge">{t('plans.level', { level })}</span>
            <LevelStats stats={describeLevel(type, level, game)} />
            {def.requiresNestLevel > 1 && (
              <span class="small muted">{t('plans.nest', { level: def.requiresNestLevel })}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeCard({ game, type, t }: { game: GameState; type: BuildingType; t: Translate }) {
  const later = laterAge(game, type, 1);
  if (later !== null)
    return (
      <li class="tree-card is-hidden">
        <div class="tree-head">
          <BuildingThumb type={type} locked size={52} />
          <strong>{t('plans.unknown')}</strong>
        </div>
        <p class="small muted">{t('plans.later', { age: `@ages.${AGE_IDS[later]!}` })}</p>
      </li>
    );
  const count = copiesOf(game, type);
  const placeable = BUILDINGS[type].buildable;
  const reason = placeable ? lockReason(game, type, t) : null;
  const locked = placeable && buildLock(game, type) !== null;
  // Chantier 33: the real building, at the highest level the colony has (black while locked).
  const shown = Math.max(1, ...game.buildings.filter((b) => b.type === type).map((b) => b.level));
  return (
    <li class={`tree-card ${locked ? 'is-locked' : ''}`}>
      <div class="tree-head">
        <BuildingThumb type={type} level={shown} locked={locked && count === 0} size={52} />
        <div class="tree-title">
          <strong>{t(`buildings.${type}.name`)}</strong>
          <span class="small muted">
            {type === 'nest'
              ? t('plans.alreadyHere')
              : count > 0
                ? t('plans.built', { count })
                : t('plans.notBuilt')}
          </span>
        </div>
      </div>
      <p class="small">{t(`buildings.${type}.desc`)}</p>
      <LevelStats stats={describeLevel(type, 1, game)} />
      <details class="tree-details">
        <summary class="small">{t('plans.levels')}</summary>
        <Levels game={game} type={type} t={t} />
      </details>
      {placeable && (
        <div class="tree-foot">
          <Cost
            cost={buildCost(game, type)}
            have={game.resources}
            durationMs={constructionDuration(game, type, 1, true, false)}
          />
          <button
            class="btn btn-small btn-primary"
            disabled={reason !== null}
            title={reason ?? undefined}
            onClick={() => actions.startPlacing(type)}
          >
            {t('plans.place')}
          </button>
          {reason && <span class="small warn tree-reason">{reason}</span>}
        </div>
      )}
    </li>
  );
}

export function BuildingTree({ game }: { game: GameState }) {
  const t = useT();
  return (
    <div class="building-tree">
      {FAMILIES.map((f) => (
        <section key={f.id} class="tree-family">
          <h3 class="age-title">{t(`plans.families.${f.id}`)}</h3>
          <ul class="tech-grid">
            {f.types.map((type) => (
              <TreeCard key={type} game={game} type={type} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Bottom bar while placing a building chosen in the tree. */
export function PlacingBanner() {
  const t = useT();
  const placing = useUi((s) => s.placing);
  const tile = useUi((s) => s.placingTile);
  const pinned = useUi((s) => s.placingPinned);
  const game = useUi((s) => (s.placing && s.placingTile ? s.slowGame : null));
  const map = useUi((s) => s.map);
  const rot = useUi((s) => s.placingRot);
  if (!placing) return null;
  // Chantier 16: what the ghost's tile would give, or why it cannot go there.
  const error = tile && game && map ? placementError(game, map, placing, tile, rot) : null;
  const plan = tile && game && map && !error ? placementPlan(game, map, placing, tile) : null;
  // Chantier 35: a big building turns, and says what it covers.
  const turns = footprintOf(placing) === 3;
  const cover = tile && game && !error ? placementCover(game, placing, tile, rot) : null;
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return (
    <div
      class="path-toolbar placing-banner parchment pe"
      role="dialog"
      aria-label={t('plans.placingHint')}
    >
      <BuildingThumb type={placing} size={44} />
      <div class="path-toolbar-text">
        <strong>{t('plans.placing', { name: `@buildings.${placing}.name` })}</strong>
        {error === 'tileNotAllowed' ? (
          <span class="small warn">
            {t('plans.goesOn', {
              tiles: BUILDINGS[placing].allowedTiles
                .map((k) => t(`tiles.${k}.name`).toLowerCase())
                .join(', '),
            })}
          </span>
        ) : error ? (
          <span class="small warn">{t(`errors.${error}`)}</span>
        ) : plan ? (
          <PlanSummary plan={plan} type={placing} game={game!} />
        ) : cover && (cover.harvested > 0 || cover.paths > 0) ? (
          <>
            {cover.harvested > 0 && (
              <span class="small warn">{t('plans.coversHarvest', { count: cover.harvested })}</span>
            )}
            {cover.paths > 0 && (
              <span class="small muted">{t('plans.coversPaths', { count: cover.paths })}</span>
            )}
          </>
        ) : (
          <>
            <span class="small muted">
              {t(touch ? 'plans.placingHintTouch' : 'plans.placingHint')}
            </span>
            {HARVESTS[placing] && <span class="small muted">{t('plans.placingLogistics')}</span>}
            {isTurret(placing) && <span class="small muted">{t('plans.placingTurret')}</span>}
            {footprintOf(placing) > 1 && (
              <span class="small muted">
                {t(turns ? 'plans.placingBig' : 'plans.placingHuge', {
                  count: footprintOf(placing),
                })}
              </span>
            )}
          </>
        )}
      </div>
      <div class="placing-actions">
        {turns && (
          <button
            class="btn"
            title={t('plans.turnHint')}
            aria-label={t('plans.turnHint')}
            onClick={() => actions.rotatePlacement()}
          >
            {t('plans.turn')}
          </button>
        )}
        {pinned && tile && !error && (
          <button class="btn btn-primary" onClick={() => actions.confirmPlacement()}>
            {t('plans.buildHere')}
          </button>
        )}
        <button class="btn" onClick={() => actions.stopPlacing()}>
          {t('plans.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Chantier 16: what a producer under the ghost would harvest, and what others keep. */
function PlanSummary({
  plan,
  type,
  game,
}: {
  plan: PlacementPlan;
  type: BuildingType;
  game: GameState;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const ground = HARVESTS[type]!;
  const tileName = t(`tiles.${ground}.name`).toLowerCase();
  const resource = DEPOSITS[ground]!.resource;
  const climate = climateOf(game.face, game.params.biome);
  const owners = [...new Set(plan.taken.map((x) => x.owner))].flatMap((id) => {
    const owner = game.buildings.find((b) => b.id === id);
    return owner ? [t(`buildings.${owner.type}.name`)] : [];
  });
  return (
    <>
      {plan.free.length > 0 ? (
        <span class="small">
          {t('plans.plannedReach', {
            count: plan.free.length,
            tile: tileName,
            cap: formatNumber(lang, Math.round(plan.cap * climate[resource])),
            resource: t(`resources.${resource}`).toLowerCase(),
          })}
        </span>
      ) : (
        <span class="small warn">{t('plans.plannedNone', { tile: tileName })}</span>
      )}
      {plan.taken.length > 0 && (
        <span class="small warn">
          {t('plans.plannedTaken', {
            count: plan.taken.length,
            names: [...new Set(owners)].join(', '),
          })}
        </span>
      )}
      <span class="small muted">{t('plans.placingZone')}</span>
    </>
  );
}

/** Round button: the logistics overlay, efficiency above every producer (key O). */
export function LogisticsButton() {
  const t = useT();
  const on = useUi((s) => s.showLogistics);
  const hidden = useUi((s) => s.pathMode || s.placing !== null);
  if (hidden) return null;
  return (
    <button
      class={`round-fab logistics-fab pe ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={t('plans.showLogistics')}
      title={`${t('plans.showLogistics')} (O)`}
      onClick={() => actions.toggleLogistics()}
    >
      <Icon name="logistics" size={28} />
    </button>
  );
}

/** Round button: level badges above every building, whatever the zoom (key L). */
export function LevelsButton() {
  const t = useT();
  const on = useUi((s) => s.showLevels);
  const hidden = useUi((s) => s.pathMode || s.placing !== null);
  if (hidden) return null;
  return (
    <button
      class={`round-fab levels-fab pe ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={t('plans.showLevels')}
      title={`${t('plans.showLevels')} (L)`}
      onClick={() => actions.toggleLevels()}
    >
      <Icon name="levels" size={28} />
    </button>
  );
}
