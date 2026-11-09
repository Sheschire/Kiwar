import { GILD, validateCommand, type Building, type GameState } from '@kiwar/shared';
import { actions } from '../actions';
import { Icon } from '../iconSet';
import { useT, useUi } from '../store';

/**
 * Chantier 55: gilding a decoration with the orchard's nectar and golden fibre (it adds to the
 * village's beauty past the decorations' own cap).
 */
export function GildLine({ game, b }: { game: GameState; b: Building }) {
  const t = useT();
  const now = useUi((s) => s.now);
  const map = useUi((s) => s.map);
  if (b.gilded) return <p class="small bonus">✦ {t('gild.done', { beauty: GILD.beauty })}</p>;
  const cmd = { type: 'gildDecor' as const, buildingId: b.id };
  const error = map ? validateCommand(game, cmd, { now, map }) : null;
  return (
    <div class="field gild-line">
      <p class="small">{t('gild.hint', { beauty: GILD.beauty, cap: GILD.cap })}</p>
      <button class="btn btn-small" disabled={error !== null} onClick={() => actions.dispatch(cmd)}>
        ✦ {t('gild.action')} · <Icon name="nectar" size={14} /> {GILD.nectar} ·{' '}
        <Icon name="goldFiber" size={14} /> {GILD.goldFiber}
      </button>
      {error && <p class="small warn">{t(`errors.${error}`)}</p>}
    </div>
  );
}
