import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { foodLeftMs, nest, NEEDS, RESOURCE_IDS, type ResourceId } from '@kiwar/shared';
import {
  capacity,
  consumption,
  homeKiwis,
  housing,
  hungerStage,
  idleVillagers,
  netRates,
  population,
  staffing,
} from '../derived';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import {
  ChatIcon,
  GearIcon,
  GlobeIcon,
  KiwiIcon,
  ResourceIcon,
  ScrollIcon,
  ShieldIcon,
  BookIcon,
  SpeakerIcon,
} from '../icons';
import { actions } from '../actions';
import { chatActions } from '../chatActions';
import { uiStore, useT, useUi } from '../store';
import { SyncBadge } from './SyncBadge';
import { ClockChip, ClockTip } from './ClockChip';
import { MoraleLine } from './NeedsWidgets';

type TipId = ResourceId | 'population' | 'clock';

export interface ChipHandlers {
  open: boolean;
  onEnter(e: PointerEvent): void;
  onLeave(e: PointerEvent): void;
  onToggle(): void;
}

function ResourceChip({ id, h }: { id: ResourceId; h: ChipHandlers }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const amount = useUi((s) => Math.floor(s.game?.resources[id] ?? 0));
  const cap = useUi((s) => (s.game ? capacity(s.game)[id] : 0));
  const rate = useUi((s) => (s.game ? Math.round(netRates(s.game)[id]) : 0));
  // Food lasting less than a few hours (or gone) is shown in alarm colours.
  const low = useUi((s) => {
    if (!s.game || (id !== 'pulp' && id !== 'juice')) return false;
    const left = foodLeftMs(s.game.resources[id], netRates(s.game)[id]);
    const eaten = consumption(s.game)[id] > 0;
    return eaten && (s.game.resources[id] <= 0 || (left !== null && left < NEEDS.warnMs));
  });
  const staff = useUi((s) => (s.game ? (staffing(s.game).byKind[id]?.workers ?? 0) : 0));
  const fill = cap > 0 ? Math.min(1, amount / cap) : 0;
  const full = fill >= 0.999;
  return (
    <button
      type="button"
      data-tip={id}
      class={`chip res-${id} ${full ? 'is-full' : ''} ${low ? 'is-low' : ''} ${h.open ? 'is-open' : ''}`}
      aria-label={`${t(`resources.${id}`)} ${formatNumber(lang, amount)} / ${formatNumber(lang, cap)}`}
      aria-expanded={h.open}
      onPointerEnter={h.onEnter}
      onPointerLeave={h.onLeave}
      onClick={h.onToggle}
    >
      <ResourceIcon id={id} size={24} />
      <div class="chip-body">
        <div class="chip-line">
          <span class="chip-amount">{formatNumber(lang, amount)}</span>
          <span class="chip-cap">/{formatNumber(lang, cap)}</span>
        </div>
        <div class="chip-bar">
          <span style={{ width: `${fill * 100}%` }} />
        </div>
        <div class={`chip-rate ${rate < 0 ? 'is-negative' : ''}`}>
          {rate < 0 ? '−' : '+'}
          {formatNumber(lang, Math.abs(rate))}/h
          <span class="chip-staff" title={t('posts.workersOn', { count: staff })}>
            {' · '}
            <KiwiIcon size={11} />
            {staff}
          </span>
        </div>
      </div>
    </button>
  );
}

/** Concise explanation of a resource (or of the population) with live numbers. */
function TipContent({ id }: { id: TipId }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  if (!game) return null;
  if (id === 'clock') return <ClockTip />;
  if (id === 'population') {
    const idle = idleVillagers(game).length;
    return (
      <>
        <strong class="tip-title">
          <KiwiIcon size={18} /> {t('hud.population')} {population(game)}/{housing(game)}
        </strong>
        <p>{t('tips.population')}</p>
        {idle > 0 && <p class="tip-line bonus">{t('tips.idle', { count: idle })}</p>}
        <MoraleLine />
        <p class="tip-line muted">
          {t('needs.tip', { pulp: NEEDS.eat.pulp, juice: NEEDS.eat.juice })}
        </p>
        {hungerStage(game) !== 'fed' && (
          <p class="tip-line warn">
            {t('needs.stageWork', {
              stage: t(`needs.stages.${hungerStage(game)}`),
              value: NEEDS.work[hungerStage(game)],
            })}
          </p>
        )}
        {nest(game).level < NEEDS.protectedBelowNest && (
          <p class="tip-line bonus">{t('needs.protected', { level: NEEDS.protectedBelowNest })}</p>
        )}
      </>
    );
  }
  const amount = game.resources[id];
  const cap = capacity(game)[id];
  const rate = netRates(game)[id];
  const eaten = consumption(game)[id];
  const full = amount >= cap - 1e-6;
  const left = foodLeftMs(amount, rate);
  return (
    <>
      <strong class="tip-title">
        <ResourceIcon id={id} size={18} /> {t(`resources.${id}`)}
      </strong>
      <p>{t(`tips.${id}`)}</p>
      <p class="tip-line">
        {t('tips.stock', { amount: Math.floor(amount), cap })} ·{' '}
        {t('tips.rate', {
          rate: `${rate >= 0 ? '+' : '−'}${formatNumber(lang, Math.abs(Math.round(rate)))}`,
        })}
      </p>
      {eaten > 0 && (
        <p class="tip-line muted">
          {t('needs.eaten', { rate: Math.round(eaten), count: homeKiwis(game).length })}
        </p>
      )}
      {eaten > 0 && amount <= 0 && rate <= 0 && <p class="tip-line warn">{t('needs.empty')}</p>}
      {left !== null && amount > 0 && (
        <p class={`tip-line ${left < NEEDS.warnMs ? 'warn' : 'muted'}`}>
          {t('needs.emptyIn', { duration: formatDuration(lang, left) })}
        </p>
      )}
      {full ? (
        <p class="tip-line warn">{t('tips.full')}</p>
      ) : (
        rate > 0 && (
          <p class="tip-line muted">
            {t('tips.fullIn', {
              duration: formatDuration(lang, ((cap - amount) / rate) * 3_600_000),
            })}
          </p>
        )
      )}
    </>
  );
}

export function TopBar() {
  const t = useT();
  const pop = useUi((s) => (s.game ? population(s.game) : 0));
  const house = useUi((s) => (s.game ? housing(s.game) : 0));
  const objectivesOpen = useUi((s) => s.objectivesOpen);
  const inUniverse = useUi((s) => s.universe !== null);
  const chatOpen = useUi((s) => s.chatOpen);
  const chatUnread = useUi((s) => s.chatUnread);
  const muted = useUi((s) => s.audio.muted);
  const villageOpen = useUi((s) => s.modal === 'village');
  const modal = useUi((s) => s.modal);
  const points = useUi((s) => s.game?.villagers.reduce((n, v) => n + v.statPoints, 0) ?? 0);
  const unassigned = useUi((s) => (s.game ? staffing(s.game).unassigned : 0));
  const freeSlots = useUi((s) => (s.game ? staffing(s.game).freeSlots : 0));
  const idleAlert = unassigned > 0 && freeSlots > 0;
  const [tip, setTip] = useState<TipId | null>(null);
  const [tipLeft, setTipLeft] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  /** Opened by a tap/click (stays open) rather than by hovering. */
  const pinned = useRef(false);

  // Close a pinned tooltip when tapping anywhere else, or with Escape.
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        pinned.current = false;
        setTip(null);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [tip]);

  // Centre the bubble under its chip, kept inside the bar.
  useLayoutEffect(() => {
    if (!tip || !barRef.current || !tipRef.current) return;
    const chip = barRef.current.querySelector<HTMLElement>(`[data-tip="${tip}"]`);
    if (!chip) return;
    const bar = barRef.current.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const w = tipRef.current.offsetWidth;
    const centre = c.left + c.width / 2 - bar.left;
    const margin = 8 - bar.left;
    const max = window.innerWidth - bar.left - w - 8;
    setTipLeft(Math.max(margin, Math.min(max, centre - w / 2)));
  }, [tip]);

  const handlers = (id: TipId): ChipHandlers => ({
    open: tip === id,
    onEnter: (e) => {
      if (e.pointerType === 'mouse' && !pinned.current) setTip(id);
    },
    onLeave: (e) => {
      if (e.pointerType === 'mouse' && !pinned.current) setTip(null);
    },
    onToggle: () => {
      const closing = tip === id && pinned.current;
      pinned.current = !closing;
      setTip(closing ? null : id);
    },
  });

  const popHandlers = handlers('population');
  return (
    <header class="topbar pe">
      <div class="resources parchment" ref={barRef}>
        {RESOURCE_IDS.map((id) => (
          <ResourceChip key={id} id={id} h={handlers(id)} />
        ))}
        <span class="chip-pop-wrap">
          <button
            type="button"
            data-tip="population"
            class={`chip chip-pop ${popHandlers.open ? 'is-open' : ''}`}
            aria-label={`${t('hud.population')} ${pop}/${house}`}
            aria-expanded={popHandlers.open}
            onPointerEnter={popHandlers.onEnter}
            onPointerLeave={popHandlers.onLeave}
            onClick={popHandlers.onToggle}
          >
            <KiwiIcon size={24} />
            <div class="chip-body">
              <div class="chip-line">
                <span class="chip-amount">{pop}</span>
                <span class="chip-cap">/{house}</span>
              </div>
              <div class={`chip-rate ${idleAlert ? 'warn' : ''}`}>
                {unassigned > 0
                  ? t('posts.unassigned', { count: unassigned })
                  : t('hud.population')}
              </div>
            </div>
          </button>
          {unassigned > 0 && (
            <button
              type="button"
              class={`chip-idle ${idleAlert ? 'is-alert' : ''}`}
              aria-label={t('posts.unassigned', { count: unassigned })}
              title={
                idleAlert ? t('posts.unassignedHint') : t('posts.unassigned', { count: unassigned })
              }
              onClick={() => actions.openPosts()}
            >
              {unassigned}
            </button>
          )}
        </span>
        <ClockChip h={handlers('clock')} />
        {tip && (
          <div class="tip parchment" role="tooltip" ref={tipRef} style={{ left: `${tipLeft}px` }}>
            <TipContent id={tip} />
          </div>
        )}
      </div>
      <div class="topbar-buttons">
        <SyncBadge />
        <button
          class={`btn btn-icon parchment-btn village-btn ${villageOpen ? 'btn-active' : ''}`}
          aria-label={t('village.button')}
          title={t('village.button')}
          onClick={() => (villageOpen ? actions.closeVillage() : actions.openVillage())}
        >
          <KiwiIcon />
          {points > 0 && <span class="count">{points > 9 ? '9+' : points}</span>}
        </button>
        <button
          class={`btn btn-icon parchment-btn ${modal === 'defense' ? 'btn-active' : ''}`}
          aria-label={t('defense.button')}
          title={t('defense.button')}
          onClick={() =>
            uiStore.setState({ modal: modal === 'defense' ? 'none' : 'defense', unreadWave: null })
          }
        >
          <ShieldIcon />
        </button>
        <button
          class={`btn btn-icon parchment-btn ${modal === 'research' ? 'btn-active' : ''}`}
          aria-label={t('research.button')}
          title={t('research.button')}
          onClick={() => uiStore.setState({ modal: modal === 'research' ? 'none' : 'research' })}
        >
          <BookIcon />
        </button>
        <button
          class="btn btn-icon parchment-btn"
          aria-label={t('universe.button')}
          title={t('universe.button')}
          onClick={() => uiStore.setState({ modal: 'universe' })}
        >
          <GlobeIcon />
        </button>
        {inUniverse && (
          <button
            class={`btn btn-icon parchment-btn chat-btn ${chatOpen ? 'btn-active' : ''}`}
            aria-label={t('chat.button')}
            title={t('chat.button')}
            onClick={() => chatActions.open(!chatOpen)}
          >
            <ChatIcon />
            {chatUnread > 0 && <span class="count">{chatUnread > 9 ? '9+' : chatUnread}</span>}
          </button>
        )}
        <button
          class={`btn btn-icon parchment-btn ${objectivesOpen ? 'btn-active' : ''}`}
          aria-label={t('hud.objectives')}
          aria-pressed={objectivesOpen}
          title={t('hud.objectives')}
          onClick={() => uiStore.setState((s) => ({ objectivesOpen: !s.objectivesOpen }))}
        >
          <ScrollIcon />
        </button>
        <button
          class={`btn btn-icon parchment-btn sound-btn ${muted ? 'is-muted' : ''}`}
          aria-label={muted ? t('audio.unmute') : t('audio.mute')}
          aria-pressed={muted}
          title={muted ? t('audio.unmute') : t('audio.mute')}
          data-silent
          onClick={() => actions.setAudio({ muted: !muted })}
        >
          <SpeakerIcon muted={muted} />
        </button>
        <button
          class="btn btn-icon parchment-btn"
          aria-label={t('hud.settings')}
          title={t('hud.settings')}
          onClick={() => uiStore.setState({ modal: 'settings' })}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
