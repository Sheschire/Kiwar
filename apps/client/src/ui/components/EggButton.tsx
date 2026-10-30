import {
  BLESSINGS,
  GIANT_SEEDS,
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
import { Icon } from '../iconSet';

/**
 * Floating egg button: hatch a new kiwi (cost + incubation), capped by housing. Chantier 21:
 * `inBar` draws it raised in the middle of the thumb bar, with a short label under it.
 */
export function EggButton({ inBar = false }: { inBar?: boolean }) {
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
      <div class={inBar ? 'thumb-egg' : 'egg-wrap pe'}>
        <div
          class={`egg-btn hatching ${egg.star ? 'is-star' : ''}`}
          style={{ '--p': `${progress * 360}deg` }}
          aria-label={t('egg.hatching')}
          role="status"
        >
          <EggIcon size={34} class="wobble" />
        </div>
        <span class={inBar ? 'thumb-egg-label' : 'egg-label parchment'}>
          {inBar ? '' : `${t('egg.hatching')} `}
          {formatDuration(lang, egg.readyAt - now)}
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
  // Chantier 50: the locule egg, once the colony holds giant seeds.
  const showLocule = game.giantSeeds > 0;
  const loculeError = full
    ? 'housingFull'
    : validateCommand(game, { type: 'hatchEgg', locule: true }, { now, map });
  return (
    <div class={inBar ? 'thumb-egg' : 'egg-wrap pe'}>
      {showLocule && (
        <button
          class={`egg-star egg-locule parchment-btn ${loculeError ? '' : 'ready'}`}
          disabled={loculeError !== null}
          aria-label={t('locules.egg')}
          title={t('locules.eggTitle', { stat: GIANT_SEEDS.egg.stat })}
          onClick={() => actions.dispatch({ type: 'hatchEgg', locule: true })}
        >
          <Icon name="giantSeed" size={18} />
          <span>{GIANT_SEEDS.egg.seeds}</span>
        </button>
      )}
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
      <span class={inBar ? 'thumb-egg-label' : 'egg-label parchment'}>
        {full ? (
          <span class="small">{inBar ? t('nav.eggFull') : t('egg.housingFull')}</span>
        ) : (
          <Cost
            cost={eggCost(game)}
            have={game.resources}
            durationMs={inBar ? undefined : eggDuration(game)}
          />
        )}
      </span>
    </div>
  );
}
