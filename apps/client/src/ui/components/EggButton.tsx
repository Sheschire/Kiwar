import {
  canHatch,
  eggCost,
  eggDuration,
  housing,
  population,
  validateCommand,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { EggIcon } from '../icons';
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
          class="egg-btn hatching"
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
  return (
    <div class="egg-wrap pe">
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
