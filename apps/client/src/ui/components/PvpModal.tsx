import { useState } from 'preact/hooks';
import {
  isLaunchpadBusy,
  LANDING,
  maxCrew,
  PVP,
  pvpForecast,
  pvpLock,
  SECTOR_IDS,
  type AllySnapshot,
  type GameState,
  type LandingOrders,
  type PvpPlan,
  type SectorId,
  type VillagerId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Cost } from './Cost';
import { Modal } from './Modal';
import { CrewPicker } from './ExpeditionModal';
import { OrdersPicker } from './LandingParts';

/** Why a member's colony cannot be attacked now (null: it can), from what we see of it. */
export function pvpBlock(
  t: Translate,
  lang: 'fr' | 'en',
  game: GameState,
  ally: AllySnapshot | undefined,
  targetId: string,
  now: number,
): string | null {
  const last = game.pvp.lastAttackOn[targetId];
  if (last !== undefined && now < last + PVP.cooldownMs)
    return t('pvp.planner.cooldown', {
      duration: formatDuration(lang, last + PVP.cooldownMs - now),
    });
  const guard = ally?.power?.pvpGuard;
  if (!guard) return null;
  const until = ally?.power?.pvpUntil;
  return t(`pvp.planner.guard.${guard}`, {
    duration: until ? formatDuration(lang, Math.max(0, until - now)) : '',
  });
}

/** Round trip of rations, with a margin, rounded up to 5. */
function provisionsFor(need: { pulp: number; juice: number }) {
  const up5 = (x: number) => Math.ceil((x * 2 * 1.1) / 5) * 5;
  return { pulp: up5(need.pulp), juice: up5(need.juice) };
}

/** Chantier 57: the planner of an attack on another player's colony. */
export function PvpModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const now = useUi((s) => s.now);
  const targetId = useUi((s) => s.pvpTarget);
  const allies = useUi((s) => s.allies);
  const [crew, setCrew] = useState<VillagerId[]>([]);
  const [sector, setSector] = useState<SectorId>('front');
  const [orders, setOrders] = useState<LandingOrders>({ ...LANDING.defaultOrders });
  const close = () => uiStore.setState({ modal: 'none', pvpTarget: null });
  if (!game || !targetId) return null;
  const target = game.pvp.targets.find((x) => x.id === targetId);
  const ally = allies.find((a) => a.friendId === targetId);
  const pad = game.buildings.find(
    (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(game, b.id),
  );
  if (!target || !pad)
    return (
      <Modal title={t('pvp.planner.title', { owner: target?.owner ?? '' })} onClose={close}>
        <p class="small warn">{t(target ? 'errors.launchpadBusy' : 'errors.unknownPvpTarget')}</p>
      </Modal>
    );
  const base: PvpPlan = {
    launchpadId: pad.id,
    targetId,
    crew,
    provisions: { pulp: 0, juice: 0 },
    sector,
    orders: { posture: orders.posture, retreatAt: orders.retreatAt },
  };
  const dry = pvpForecast(game, base);
  const plan: PvpPlan = {
    ...base,
    provisions: dry ? provisionsFor(dry.needOneWay) : base.provisions,
  };
  const f = pvpForecast(game, plan);
  const lock = pvpLock(game, plan, now);
  const block = pvpBlock(t, lang, game, ally, targetId, now);
  const max = maxCrew(game, pad, 'land');
  const turrets = (ally?.buildings ?? []).filter(
    (b) => b.type === 'seedTurret' || b.type === 'skyTurret',
  );
  const cost = f
    ? {
        pulp: plan.provisions.pulp,
        fiber: f.launchCost.fiber,
        seeds: 0,
        juice: plan.provisions.juice + f.launchCost.juice,
      }
    : null;
  const launch = () => {
    actions.dispatch({ type: 'raidPlayer', ...plan });
    close();
  };
  return (
    <Modal
      title={t('pvp.planner.title', { owner: target.owner })}
      onClose={close}
      class="modal-pvp"
    >
      {block && <p class="small warn">{block}</p>}
      <section class="field">
        <p class="small">
          <span class="pvp-tag">{t('pvp.tag')}</span>{' '}
          {t('pvp.planner.notice', { duration: formatDuration(lang, target.travelMs) })}
        </p>
        {ally?.power && (
          <p class="small muted">
            {t('pvp.planner.their', { defense: formatNumber(lang, ally.power.defense) })} ·{' '}
            {t('defense.turrets', { value: turrets.length })}
          </p>
        )}
        <p class="small muted">{t('pvp.safe')}</p>
      </section>
      <section class="field">
        <h3>{t('pvp.planner.side')}</h3>
        <div class="segmented" role="group" aria-label={t('pvp.planner.side')}>
          {SECTOR_IDS.map((s) => (
            <button
              key={s}
              class={`btn btn-small ${sector === s ? 'btn-active' : ''}`}
              aria-pressed={sector === s}
              onClick={() => setSector(s)}
            >
              {t(`defense.sectors.${s}`)}
            </button>
          ))}
        </div>
      </section>
      <OrdersPicker orders={orders} onChange={setOrders} pvp />
      <section class="field">
        <h3>{t('pvp.planner.crew')}</h3>
        <CrewPicker game={game} crew={crew} max={max} risk={{}} onChange={setCrew} />
      </section>
      {f && (
        <section class="field">
          <p class="small">
            {t('pvp.planner.power', { power: formatNumber(lang, Math.round(f.power)) })}
          </p>
          <p class="small muted">{t('pvp.planner.hold', { count: formatNumber(lang, f.hold) })}</p>
          <p class="small muted">{t('pvp.planner.rules')}</p>
          {f.endsProtection && <p class="small warn">{t('pvp.planner.endsProtection')}</p>}
          {cost && <Cost cost={cost} have={game.resources} />}
        </section>
      )}
      {lock && crew.length > 0 && <p class="small warn">{t(`errors.${lock}`)}</p>}
      <div class="row">
        <button class="btn btn-primary" disabled={!!lock || !!block} onClick={launch}>
          {t('pvp.planner.launch')}
        </button>
      </div>
    </Modal>
  );
}
