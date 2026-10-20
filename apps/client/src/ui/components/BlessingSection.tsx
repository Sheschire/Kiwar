import {
  BLESSINGS,
  KIWI,
  STAT_IDS,
  stardustOf,
  type GameState,
  type StatId,
  type Villager,
} from '@kiwar/shared';
import { actions } from '../actions';
import { StardustIcon } from '../icons';
import { useT } from '../store';

function Price({ dust, have }: { dust: number; have: number }) {
  return (
    <span class={`dust-price ${have < dust ? 'missing' : ''}`}>
      <StardustIcon size={14} />
      {dust}
    </span>
  );
}

/**
 * Chantier 13: what stardust buys for a kiwi — an instant heal, a redistribution of its stats
 * and up to three permanent points. Shown once the colony has seen stardust.
 */
export function BlessingSection({ game, v }: { game: GameState; v: Villager }) {
  const t = useT();
  const have = stardustOf(game);
  if (have <= 0 && game.comets.passes === 0) return null;
  const used = v.blessings ?? 0;
  const statFull = used >= BLESSINGS.statMax;
  const bless = (kind: 'heal' | 'respec' | 'stat', stat?: StatId) =>
    actions.dispatch({ type: 'bless', villagerId: v.id, kind, ...(stat ? { stat } : {}) });
  return (
    <section class="field blessings">
      <h3>
        <StardustIcon size={18} /> {t('bless.title')}
        <span class="small muted"> · {t('bless.have', { count: have })}</span>
      </h3>
      {v.job.kind === 'injured' && (
        <div class="bless-row">
          <button class="btn" disabled={have < BLESSINGS.heal} onClick={() => bless('heal')}>
            {t('bless.heal')} <Price dust={BLESSINGS.heal} have={have} />
          </button>
          <span class="small muted">{t('bless.healHint')}</span>
        </div>
      )}
      <div class="bless-row">
        <button class="btn" disabled={have < BLESSINGS.respec} onClick={() => bless('respec')}>
          {t('bless.respec')} <Price dust={BLESSINGS.respec} have={have} />
        </button>
        <span class="small muted">{t('bless.respecHint')}</span>
      </div>
      <div class="bless-row">
        <span class="small">
          <strong>{t('bless.stat')}</strong> <Price dust={BLESSINGS.stat} have={have} />
        </span>
        <span class="bless-stats">
          {STAT_IDS.map((id) => (
            <button
              key={id}
              class="btn btn-small"
              title={t(`stats.${id}`)}
              disabled={statFull || have < BLESSINGS.stat || v.stats[id] >= KIWI.stat.cap}
              onClick={() => bless('stat', id)}
            >
              +1 {t(`statsShort.${id}`)}
            </button>
          ))}
        </span>
        <span class="small muted">{t('bless.statHint', { used, max: BLESSINGS.statMax })}</span>
      </div>
    </section>
  );
}
