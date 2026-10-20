import { dustPickers, getTile, STARDUST, STARDUST_SCALE } from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { StardustIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';

/**
 * Chantier 13: the HUD pill of a comet — its countdown once announced, then the stardust left
 * to pick (a tap selects the tile with the most dust and nobody picking it).
 */
export function CometBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.slowGame);
  const now = useUi((s) => s.slowNow);
  if (!game) return null;
  const next = game.comets.next?.announced ? game.comets.next : null;
  const patches = game.comets.patches;
  if (!next && patches.length === 0) return null;
  const left = patches.reduce((sum, p) => sum + Math.ceil(p.stock / STARDUST_SCALE), 0);
  const idle = patches
    .filter((p) => dustPickers(game, p.id).length < STARDUST.slots)
    .sort((a, b) => b.stock - a.stock)[0];
  const open = () => {
    const p = idle ?? patches[0];
    const map = uiStore.getState().map;
    const tile = p && map ? getTile(map, p) : undefined;
    if (!tile) return;
    actions.selectTile(tile);
    actions.focusTile(tile);
  };
  return (
    <button
      class={`threat-badge comet-badge parchment pe ${idle ? 'has-dust' : ''}`}
      title={t('comet.badgeTitle')}
      onClick={open}
    >
      <StardustIcon size={18} />
      {patches.length > 0 ? (
        <span>
          {t('comet.name')} · {left}
        </span>
      ) : next ? (
        <span>{t('comet.badge', { duration: formatDuration(lang, next.at - now) })}</span>
      ) : null}
    </button>
  );
}
