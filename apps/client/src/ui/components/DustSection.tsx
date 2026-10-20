import {
  bestDustCrew,
  dustAt,
  dustPickers,
  pickRate,
  STARDUST,
  STARDUST_CAP,
  STARDUST_SCALE,
  type GameState,
  type Tile,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { StardustIcon } from '../icons';
import { useUi, type Translate } from '../store';
import { KiwiChips } from './VillageModal';

/**
 * Chantier 13: stardust lying on this tile — what is left, when it scatters, who picks it,
 * and the buttons to send the most dexterous kiwis or call them back.
 */
export function DustSection({
  game,
  tile,
  now,
  t,
}: {
  game: GameState;
  tile: Tile;
  now: number;
  t: Translate;
}) {
  const lang = useUi((s) => s.lang);
  const p = dustAt(game, tile.q, tile.r);
  if (!p) return null;
  const pickers = dustPickers(game, p.id);
  const full = game.stardust >= STARDUST_CAP;
  const rate = (pickers.reduce((sum, v) => sum + pickRate(v), 0) * 3_600_000) / STARDUST_SCALE;
  const best = bestDustCrew(game, p.id);
  const better = best.some((id) => !pickers.some((v) => v.id === id));
  return (
    <div class="section dust-section">
      <div class="title-row">
        <h3>
          <StardustIcon size={20} /> {t('comet.name')}
        </h3>
        {pickers.length > 0 && !full && (
          <span class="badge">
            {t('comet.rate', { rate: formatNumber(lang, Math.round(rate * 10) / 10) })}
          </span>
        )}
      </div>
      <p class="small bonus">
        {t('comet.patch', {
          stock: Math.ceil(p.stock / STARDUST_SCALE),
          max: Math.round(p.max / STARDUST_SCALE),
          duration: formatDuration(lang, p.expiresAt - now),
        })}
      </p>
      <p class="small">{t('comet.pickers', { count: pickers.length, slots: STARDUST.slots })}</p>
      {pickers.length > 0 && <KiwiChips kiwis={pickers} />}
      {full ? (
        <p class="small warn">{t('comet.stockFull', { cap: STARDUST.cap })}</p>
      ) : (
        <p class="small muted">{t('comet.hint')}</p>
      )}
      <div class="dust-actions">
        {!full && better && (
          <button
            class="btn btn-primary"
            onClick={() =>
              actions.dispatch({ type: 'collectStardust', patchId: p.id, villagerIds: best })
            }
          >
            <StardustIcon size={18} /> {t('comet.sendBest')}
          </button>
        )}
        {pickers.length > 0 && (
          <button
            class="btn"
            onClick={() =>
              actions.dispatch({ type: 'collectStardust', patchId: p.id, villagerIds: [] })
            }
          >
            {t('comet.callBack')}
          </button>
        )}
      </div>
    </div>
  );
}
