import {
  BLESSINGS,
  canHatch,
  eggCost,
  eggDuration,
  stardustOf,
  validateCommand,
} from '@kiwar/shared';
import { housing, population } from '../derived';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { EggIcon, StardustIcon } from '../icons';
import { useT, useUi } from '../store';
import { Cost } from './Cost';

/** Floating egg button: hatch a new kiwi (cost + incubation), capped by housing. */
export function EggButton() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const map = useUi((s) => s.map);
  const now = useUi((s) => s.now);
  if (!game || !map) return null;

  const egg = game.egg;
  if (egg) {
    const progress = Math.min(1, (now - egg.startedAt) / (egg.readyAt - egg.startedAt));
    return (
      <div class="egg-wrap pe">
        <div
          class={`egg-btn hatching ${egg.star ? 'is-star' : ''}`}
          style={{ '--p': `${progress * 360}deg` }}
          aria-label={t('egg.hatching')}
          role="status"
        >
          <EggIcon size={34} class="wobble" />
        </div>
        <span class="egg-label parchment">
          {t('egg.hatching')} {formatDuration(lang, egg.readyAt - now)}
        </span>
      </div>
    );
  }

  const full = !canHatch(game);
  const error = full ? 'housingFull' : validateCommand(game, { type: 'hatchEgg' }, { now, map });
  // Chantier 13: the star egg, once the colony has seen stardust.
  const showStar = game.stardust > 0 || game.comets.passes > 0;
  const starError = full
    ? 'housingFull'
    : validateCommand(game, { type: 'hatchEgg', star: true }, { now, map });
  return (
    <div class="egg-wrap pe">
      {showStar && (
        <button
          class={`egg-star parchment-btn ${starError ? '' : 'ready'}`}
          disabled={starError !== null}
          aria-label={t('egg.star')}
          title={t('egg.starTitle', {
            dust: BLESSINGS.starEgg,
            odds: Math.round(1 / BLESSINGS.starShiny),
          })}
          onClick={() => actions.dispatch({ type: 'hatchEgg', star: true })}
        >
          <StardustIcon size={18} />
          <span class={stardustOf(game) < BLESSINGS.starEgg ? 'missing' : ''}>
            {BLESSINGS.starEgg}
          </span>
        </button>
      )}
      <button
        class={`egg-btn ${error ? '' : 'ready'}`}
        disabled={error !== null}
        aria-label={`${t('egg.title')} (${population(game)}/${housing(game)})`}
        title={full ? t('egg.housingFull') : t('egg.title')}
        onClick={() => actions.dispatch({ type: 'hatchEgg' })}
      >
        <EggIcon size={34} />
      </button>
      <span class="egg-label parchment">
        {full ? (
          <span class="small">{t('egg.housingFull')}</span>
        ) : (
          <Cost cost={eggCost(game)} have={game.resources} durationMs={eggDuration(game)} />
        )}
      </span>
    </div>
  );
}
