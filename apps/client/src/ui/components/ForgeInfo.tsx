import {
  FORGE,
  forgeLock,
  forgeQueueSize,
  GEAR_KINDS,
  GEAR_TIERS,
  ITEMS,
  meteorIronOf,
  orderWork,
  smithsOf,
  workerSlots,
  type Building,
  type GameState,
  type ItemDef,
  type ItemId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { forgeEta } from '../derived';
import { Icon } from '../iconSet';
import { useT, useUi } from '../store';
import { Cost } from './Cost';

/** Chantier 38: what a piece does, in short chips. */
export function ItemEffects({ def }: { def: ItemDef }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const f = (x: number) => formatNumber(lang, Math.round(x * 100) / 100);
  return (
    <span class="item-effects small muted">
      {def.damage && <span>{t('forge.damage', { value: f(def.damage) })}</span>}
      {def.hp && <span>{t('forge.hp', { value: f(def.hp) })}</span>}
      {!!def.armor && <span>{t('forge.armor', { value: Math.round(def.armor * 100) })}</span>}
      {def.speed && def.speed !== 1 && <span>{t('forge.speed', { value: f(def.speed) })}</span>}
    </span>
  );
}

/**
 * Chantier 38: the Forge's sheet — the queue (the first order under way, its time left, cancel
 * refunds), what can be ordered (by family and tier, with its price and what it does) and the
 * armory. The smiths are the building's workers (the sheet's workers row above).
 */
export function ForgeInfo({ game, b }: { game: GameState; b: Building }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const orders = game.forge.orders;
  const eta = forgeEta(game);
  const max = forgeQueueSize(game);
  const smiths = smithsOf(game).length;
  const armory = Object.entries(game.forge.armory) as [ItemId, number][];
  return (
    <div class="section forge-section">
      <p class="small">
        {t('forge.smiths', { count: smiths, slots: workerSlots(b) })} ·{' '}
        <span class="muted">{t('forge.smithsHint')}</span>
      </p>
      <p class="small muted">{game.automation.forge ? t('forge.auto') : t('forge.manual')}</p>
      <h3>{t('forge.queue', { count: orders.length, max })}</h3>
      {orders.length === 0 && <p class="small muted">{t('forge.empty')}</p>}
      <ul class="forge-queue">
        {orders.map((o, i) => {
          const share = Math.min(1, o.progress / orderWork(o.item));
          return (
            <li key={o.id}>
              <span class="forge-item-name">
                <Icon name={ITEMS[o.item].slot === 'armor' ? 'armor' : 'forge'} size={18} />
                {t(`gear.items.${o.item}`)}
              </span>
              <span class="small muted">
                {i > 0
                  ? t('forge.queued')
                  : eta !== null
                    ? t('forge.working', { duration: formatDuration(lang, eta) })
                    : t('forge.waiting')}
              </span>
              {i === 0 && (
                <span class="forge-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
              )}
              <button
                class="btn btn-small"
                title={t('forge.cancel')}
                aria-label={t('forge.cancel')}
                onClick={() => actions.dispatch({ type: 'cancelForge', orderId: o.id })}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div class="forge-catalog">
        {GEAR_KINDS.map((kind) => (
          <div class="forge-family" key={kind}>
            <h4 class="small">{t(`forge.families.${kind}`)}</h4>
            {GEAR_TIERS.map((tier) => {
              const id = `${kind}-${tier}` as ItemId;
              const def = ITEMS[id];
              const lock = forgeLock(game, id);
              const techMissing = lock === 'techMissing';
              return (
                <div class={`forge-row ${techMissing ? 'is-locked' : ''}`} key={id}>
                  <div class="forge-row-main">
                    <strong class="small">{t(`gear.items.${id}`)}</strong>
                    <span class="small muted">{t(`forge.tiers.${tier}`)}</span>
                    <ItemEffects def={def} />
                  </div>
                  {techMissing ? (
                    <span class="small muted">
                      {t('forge.locked', { tech: `@techs.${def.tech}.name` })}
                    </span>
                  ) : (
                    <div class="forge-row-buy">
                      <Cost
                        cost={def.cost}
                        have={game.resources}
                        iron={def.iron}
                        haveIron={meteorIronOf(game)}
                        durationMs={def.workH * 3_600_000}
                      />
                      <button
                        class="btn btn-small btn-primary"
                        disabled={lock !== null}
                        title={lock ? t(`errors.${lock}`) : undefined}
                        onClick={() => actions.dispatch({ type: 'forgeItem', item: id })}
                      >
                        {t('forge.order')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <h3>{t('forge.armory')}</h3>
      {armory.length === 0 ? (
        <p class="small muted">{t('forge.armoryEmpty')}</p>
      ) : (
        <ul class="forge-armory">
          {armory.map(([id, n]) => (
            <li key={id} class="small">
              <Icon name={ITEMS[id].slot === 'armor' ? 'armor' : 'forge'} size={16} />
              {t(`gear.items.${id}`)} ×{Math.min(n, FORGE.armoryMax)}
            </li>
          ))}
        </ul>
      )}
      <p class="small muted">{t('forge.armoryHint')}</p>
    </div>
  );
}
