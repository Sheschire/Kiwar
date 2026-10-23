import {
  canCollect,
  reserveCapOf,
  reserveHolders,
  reserveOf,
  reserveTarget,
  RESOURCE_IDS,
  type Building,
  type GameState,
  type ResourceId,
} from '@kiwar/shared';
import { formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { capacity, reserves, storageFull } from '../derived';
import { ResourceIcon } from '../icons';
import { useT, useUi, type Translate } from '../store';

/**
 * Chantier 30: warehouse reserves. Once the stock of a resource is full the harvest goes on
 * into the warehouses (one after another); only the player brings it back, with a tap on the
 * warehouse, its sheet, or "Bring back every reserve" on the Nest.
 */

/** Resources whose stock and reserves are all full: their harvest stops. */
export function fullReserves(game: GameState): ResourceId[] {
  if (reserveHolders(game).length === 0) return [];
  const full = storageFull(game);
  return RESOURCE_IDS.filter((id) => full(id));
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span class="reserve-bar">
      <span style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </span>
  );
}

/** Why "Bring back" does nothing right now (null: it would work). */
function collectBlock(game: GameState, list: Building[], t: Translate): string | null {
  if (list.some((b) => canCollect(game, b))) return null;
  const empty = list.every((b) => RESOURCE_IDS.every((id) => reserveOf(b)[id] < 1));
  return t(empty ? 'reserve.empty' : 'reserve.stockFull');
}

/** The warehouse sheet: its reserve, resource by resource, and "Bring back". */
export function ReserveSection({ game, b, t }: { game: GameState; b: Building; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const cap = reserveCapOf(game, b);
  if (cap <= 0) return null;
  const reserve = reserveOf(b);
  const block = collectBlock(game, [b], t);
  const filling = RESOURCE_IDS.filter((id) => reserveTarget(game, id)?.b.id === b.id);
  return (
    <div class="reserve-box">
      <strong>{t('reserve.title')}</strong>
      {RESOURCE_IDS.map((id) => (
        <div class="reserve-row" key={id}>
          <ResourceIcon id={id} size={16} />
          <Bar value={reserve[id]} max={cap} />
          <span class="reserve-amount">
            {formatNumber(lang, Math.floor(reserve[id]))}/{formatNumber(lang, Math.round(cap))}
          </span>
        </div>
      ))}
      {filling.length > 0 && game.resources[filling[0]!] >= capacity(game)[filling[0]!] - 1e-6 && (
        <p class="small muted">{t('reserve.filling')}</p>
      )}
      <p class="small muted">{t('reserve.hint')}</p>
      <button class="btn btn-small" disabled={!!block} onClick={() => actions.collect(b.id)}>
        {t('reserve.collect')}
      </button>
      {block && <p class="small muted">{block}</p>}
    </div>
  );
}

/** The Nest sheet: every reserve together, "Bring back every reserve". */
export function NestReserves({ game, t }: { game: GameState; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const holders = reserveHolders(game);
  if (holders.length === 0) return null;
  const { stock, cap } = reserves(game);
  const total = RESOURCE_IDS.reduce((sum, id) => sum + stock[id], 0);
  const max = RESOURCE_IDS.reduce((sum, id) => sum + cap[id], 0);
  const block = collectBlock(game, holders, t);
  return (
    <div class="reserve-box">
      <div class="reserve-row">
        <strong>{t('reserve.title')}</strong>
        <Bar value={total} max={max} />
        <span class="reserve-amount">
          {formatNumber(lang, Math.floor(total))}/{formatNumber(lang, Math.round(max))}
        </span>
      </div>
      <button class="btn btn-small" disabled={!!block} onClick={() => actions.collect(null)}>
        {t('reserve.collectAll')}
      </button>
      {block && <p class="small muted">{block}</p>}
    </div>
  );
}

/** HUD alert: every reserve of a resource is full, its harvest stops. */
export function ReserveBadge() {
  const t = useT();
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  const full = fullReserves(game);
  if (full.length === 0) return null;
  const can = reserveHolders(game).some((b) => canCollect(game, b));
  return (
    <div class="reserve-badge parchment pe" role="status">
      <span class="row">
        {full.map((id) => (
          <ResourceIcon key={id} id={id} size={14} />
        ))}
        {t('reserve.full')}
      </span>
      {can && (
        <button class="btn btn-small" onClick={() => actions.collect(null)}>
          {t('reserve.collectAll')}
        </button>
      )}
    </div>
  );
}
