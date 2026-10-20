import {
  bestMeteorCrew,
  drillFactor,
  meteorAt,
  meteorRate,
  METEORS,
  minersOf,
  storageFullCheck,
  techEffects,
  type GameState,
  type Tile,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { ResourceIcon } from '../icons';
import { useUi, type Translate } from '../store';
import { KiwiChips } from './VillageModal';

/**
 * Chantier 15: a meteorite crater is a temporary post — what is left, when it fades, who
 * harvests it and how fast (drill included), and in manual mode the buttons to send the most
 * dexterous kiwis or call them back.
 */
export function MeteorSection({
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
  const m = meteorAt(game, tile.q, tile.r);
  const next = game.sky.next;
  if (!m) {
    if (!next?.announced || next.q !== tile.q || next.r !== tile.r) return null;
    return (
      <p class="small bonus meteor-line">
        ✦{' '}
        {t('sky.incoming', {
          duration: formatDuration(lang, next.at - now),
          resource: `@resources.${next.resource}`,
        })}
      </p>
    );
  }
  if (m.stock <= 0) return <p class="small muted meteor-line">{t('sky.empty')}</p>;
  const miners = minersOf(game, m.id);
  const full = storageFullCheck(game)(m.resource);
  const rate = full ? 0 : meteorRate(game, m);
  const auto = game.automation.meteor;
  const best = bestMeteorCrew(game, m.id);
  const better = best.some((id) => !miners.some((v) => v.id === id));
  const drill = techEffects(game).meteorDrill ? drillFactor(game) : null;
  const fmt = (x: number) => formatNumber(lang, Math.round(x * 10) / 10);
  return (
    <div class="section meteor-section">
      <div class="title-row">
        <h3>
          <ResourceIcon id={m.resource} size={20} /> {t('sky.post')}
        </h3>
        {rate > 0 && <span class="badge">{t('sky.rate', { rate: fmt(rate) })}</span>}
      </div>
      <p class="small bonus">
        ✦{' '}
        {t('sky.meteor', {
          stock: Math.floor(m.stock),
          max: m.max,
          resource: `@resources.${m.resource}`,
          duration: formatDuration(lang, m.expiresAt - now),
        })}
      </p>
      {rate > 0 && (
        <p class="small muted">
          {t('sky.emptyIn', { duration: formatDuration(lang, (m.stock / rate) * 3_600_000) })}
        </p>
      )}
      <p class="small">{t('sky.miners', { count: miners.length, slots: METEORS.slots })}</p>
      {miners.length > 0 && <KiwiChips kiwis={miners} />}
      {full && <p class="small warn">{t('sky.full', { resource: `@resources.${m.resource}` })}</p>}
      <p class="small muted">{drill ? t('sky.drill', { factor: fmt(drill) }) : t('sky.noDrill')}</p>
      <p class="small muted">{auto ? t('sky.auto') : t('sky.manual')}</p>
      {!auto && (
        <div class="dust-actions">
          {!full && better && (
            <button
              class="btn btn-primary"
              onClick={() =>
                actions.dispatch({ type: 'collectMeteor', meteorId: m.id, villagerIds: best })
              }
            >
              <ResourceIcon id={m.resource} size={18} /> {t('comet.sendBest')}
            </button>
          )}
          {miners.length > 0 && (
            <button
              class="btn"
              onClick={() =>
                actions.dispatch({ type: 'collectMeteor', meteorId: m.id, villagerIds: [] })
              }
            >
              {t('comet.callBack')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
