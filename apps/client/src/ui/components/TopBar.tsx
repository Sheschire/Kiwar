import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  capacity,
  housing,
  idleVillagers,
  population,
  productionRates,
  RESOURCE_IDS,
  type ResourceId,
} from '@kiwar/shared';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { GearIcon, KiwiIcon, ResourceIcon, ScrollIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';
import { SyncBadge } from './SyncBadge';

type TipId = ResourceId | 'population';

interface ChipHandlers {
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
  const rate = useUi((s) => (s.game ? Math.round(productionRates(s.game)[id]) : 0));
  const fill = cap > 0 ? Math.min(1, amount / cap) : 0;
  const full = fill >= 0.999;
  return (
    <button
      type="button"
      data-tip={id}
      class={`chip res-${id} ${full ? 'is-full' : ''} ${h.open ? 'is-open' : ''}`}
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
        <div class="chip-rate">+{formatNumber(lang, rate)}/h</div>
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
  if (id === 'population') {
    const idle = idleVillagers(game).length;
    return (
      <>
        <strong class="tip-title">
          <KiwiIcon size={18} /> {t('hud.population')} {population(game)}/{housing(game)}
        </strong>
        <p>{t('tips.population')}</p>
        {idle > 0 && <p class="tip-line bonus">{t('tips.idle', { count: idle })}</p>}
      </>
    );
  }
  const amount = game.resources[id];
  const cap = capacity(game)[id];
  const rate = productionRates(game)[id];
  const full = amount >= cap - 1e-6;
  return (
    <>
      <strong class="tip-title">
        <ResourceIcon id={id} size={18} /> {t(`resources.${id}`)}
      </strong>
      <p>{t(`tips.${id}`)}</p>
      <p class="tip-line">
        {t('tips.stock', { amount: Math.floor(amount), cap })} ·{' '}
        {t('tips.rate', { rate: Math.round(rate) })}
      </p>
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
            <div class="chip-rate">{t('hud.population')}</div>
          </div>
        </button>
        {tip && (
          <div class="tip parchment" role="tooltip" ref={tipRef} style={{ left: `${tipLeft}px` }}>
            <TipContent id={tip} />
          </div>
        )}
      </div>
      <div class="topbar-buttons">
        <SyncBadge />
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
