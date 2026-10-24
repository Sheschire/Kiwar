import {
  hexDistance,
  LEISURE,
  MORALE,
  levelDef,
  mayorOf,
  SPEECH,
  speechCooldownMs,
  speechEffectMs,
  speechLock,
  speechValue,
  type Building,
  type GameState,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { bedsOf, moraleOf } from '../derived';
import { useT, useUi } from '../store';
import { KiwiPortrait } from './KiwiPortrait';
import { MoraleGauge } from './NeedsWidgets';

/**
 * Chantier 43: the Town Hall's sheet — the mayor, the colony's morale, the Speech (what it
 * costs, what it gives, when it can be given again) and the gathering under way.
 */
export function TownHallInfo({ game, b, now }: { game: GameState; b: Building; now: number }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const mayor = mayorOf(game);
  const morale = moraleOf(game);
  const lock = speechLock(game);
  const gathering = game.speech.until > now;
  const memory = speechEffectMs(b.level);
  return (
    <div class="section town-hall-section">
      {mayor ? (
        <button class="worker-main" onClick={() => actions.openVillage(mayor.id)}>
          <KiwiPortrait shiny={mayor.shiny} classId={mayor.classId} seed={mayor.id} size={28} />
          <span class="small">{t('townHall.mayor', { name: mayor.name })}</span>
        </button>
      ) : (
        <p class="small warn">{t('townHall.noMayor')}</p>
      )}
      <div class="stat-row">
        <span class="stat-label">
          {t('townHall.morale', { value: Math.round(morale.average) })}
        </span>
        <MoraleGauge points={morale.average} />
      </div>
      {gathering ? (
        <p class="small bonus">
          {t('townHall.gathering', { duration: formatDuration(lang, game.speech.until - now) })}
        </p>
      ) : (
        mayor && (
          <p class="small">
            {t('townHall.preview', {
              value: Math.round(speechValue(mayor)),
              hours: Math.round((memory / 3_600_000) * 10) / 10,
              minutes: Math.round(SPEECH.gatherMs / 60_000),
            })}
          </p>
        )
      )}
      <button
        class="btn primary"
        disabled={lock !== null}
        onClick={() => actions.dispatch({ type: 'giveSpeech' })}
      >
        {t('townHall.speak')}
      </button>
      {lock === 'speechCooling' ? (
        <p class="small muted">
          {t('townHall.ready', { duration: formatDuration(lang, game.speech.readyAt - now) })}
        </p>
      ) : (
        lock && lock !== 'noMayor' && !gathering && <p class="small muted">{t(`errors.${lock}`)}</p>
      )}
      <p class="small muted">
        {t('townHall.hint', { hours: Math.round(speechCooldownMs(b.level) / 3_600_000) })}
      </p>
    </div>
  );
}

/**
 * Chantier 43: the campfire's sheet — who sleeps within its reach and sups here at dusk; also
 * the games' sheet (chantier 44).
 */
export function CampfireInfo({ game, b }: { game: GameState; b: Building }) {
  const t = useT();
  const radius = LEISURE[b.type]?.radius ?? 0;
  const beds = bedsOf(game);
  const homes = new Set(
    game.buildings
      .filter((h) => (levelDef(h.type, h.level)?.housing ?? 0) > 0 && hexDistance(h, b) <= radius)
      .map((h) => h.id),
  );
  let sleepers = 0;
  for (const v of game.villagers) {
    const hut = beds.get(v.id)?.buildingId;
    if (hut && homes.has(hut)) sleepers++;
  }
  return (
    <div class="section campfire-section">
      <p class="small">
        <strong>{t('campfire.sleepers', { count: sleepers, radius })}</strong>
      </p>
      <p class="small muted">
        {b.type === 'campfire'
          ? t('campfire.hint')
          : t('games.hint', {
              first: MORALE.leisure,
              more: MORALE.leisureMore,
              max: MORALE.leisureMax,
            })}
      </p>
    </div>
  );
}
