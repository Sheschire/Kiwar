import { pathLimit, PATHS } from '@kiwar/shared';
import { actions } from '../actions';
import { PathIcon } from '../icons';
import { useT, useUi } from '../store';

/** Round button opening the path painting mode. */
export function PathButton() {
  const t = useT();
  const on = useUi((s) => s.pathMode);
  if (on) return null;
  return (
    <button
      class="round-fab paths-fab pe"
      aria-label={t('paths.button')}
      title={t('paths.button')}
      onClick={() => actions.setPathMode(true)}
    >
      <PathIcon size={30} />
    </button>
  );
}

/** Bottom bar shown while painting paths. */
export function PathToolbar() {
  const t = useT();
  const on = useUi((s) => s.pathMode);
  const game = useUi((s) => s.game);
  if (!on || !game) return null;
  return (
    <div class="path-toolbar parchment pe" role="dialog" aria-label={t('paths.title')}>
      <PathIcon size={30} />
      <div class="path-toolbar-text">
        <strong>{t('paths.title')}</strong>
        <span class="small muted">{t('paths.hint')}</span>
        <span class="small">
          {t('paths.count', { count: game.paths.length, max: pathLimit(game) })} ·{' '}
          {t('paths.cost', { cost: PATHS.cost.fiber })}
        </span>
      </div>
      <button class="btn btn-primary" onClick={() => actions.setPathMode(false)}>
        {t('paths.done')}
      </button>
    </div>
  );
}
