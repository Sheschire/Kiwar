import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { canCollect, currentObjective, isObjectiveComplete, reserveHolders } from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { actions } from '../actions';
import { chatActions } from '../chatActions';
import { forecastWave } from '../derived';
import {
  BookIcon,
  ChatIcon,
  GearIcon,
  GlobeIcon,
  HammerIcon,
  KiwiIcon,
  MenuIcon,
  PathIcon,
  PlanetsIcon,
  ScrollIcon,
  ShieldIcon,
  SpeakerIcon,
  TargetIcon,
} from '../icons';
import { Icon } from '../iconSet';
import { setPanelOpen, uiStore, useT, useUi } from '../store';
import { CompassNeedle } from './Compass';
import { EggButton } from './EggButton';
import { siegeVisible } from './SiegeModal';
import { useOtherColony } from './ColonySwitch';

const closeMenu = () => uiStore.setState({ menuOpen: false });

/** A finished objective waiting for its reward: worth a mark on the menu. */
function useObjectiveReady(): boolean {
  return useUi((s) => {
    const game = s.slowGame;
    if (!game) return false;
    const obj = currentObjective(game);
    return !!obj && isObjectiveComplete(game, obj);
  });
}

function Count({ n }: { n: number | string }) {
  return <span class="count">{typeof n === 'number' && n > 9 ? '9+' : n}</span>;
}

function BarItem({
  label,
  active,
  onClick,
  children,
  extra,
}: {
  label: string;
  active?: boolean;
  onClick(): void;
  children: ComponentChildren;
  extra?: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={`thumb-item ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span class="thumb-icon">{children}</span>
      <span class="thumb-label">{label}</span>
      {extra}
    </button>
  );
}

/** The Defense slot: the wave countdown (or the shelter) under its name. */
function DefenseItem() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const modal = useUi((s) => s.modal);
  const game = useUi((s) => s.slowGame);
  const now = useUi((s) => s.slowNow);
  const unread = useUi((s) => s.unreadWave !== null);
  const f = game ? forecastWave(game) : null;
  const shelter = !!game && game.threats.shelterUntil > now;
  const left = shelter ? game!.threats.shelterUntil - now : f ? f.wave.at - now : null;
  return (
    <BarItem
      label={t('nav.defense')}
      active={modal === 'defense'}
      onClick={() =>
        uiStore.setState({ modal: modal === 'defense' ? 'none' : 'defense', unreadWave: null })
      }
      extra={
        <>
          {left !== null && (
            <span class={`thumb-sub odds-${shelter ? 'shelter' : (f?.odds ?? 'likely')}`}>
              {formatDuration(lang, left)}
            </span>
          )}
          {unread && <Count n="!" />}
        </>
      }
    >
      <ShieldIcon size={26} />
    </BarItem>
  );
}

/** Chantier 21: the thumb bar of phones and touch screens. */
export function ThumbBar() {
  const t = useT();
  const modal = useUi((s) => s.modal);
  const menuOpen = useUi((s) => s.menuOpen);
  const points = useUi((s) => s.game?.villagers.reduce((n, v) => n + v.statPoints, 0) ?? 0);
  const chatUnread = useUi((s) => (s.universe !== null ? s.chatUnread : 0));
  const objectiveReady = useObjectiveReady();
  const buildOpen = modal === 'plans';
  return (
    <>
      <nav class="thumb-bar pe" aria-label={t('nav.bar')}>
        <BarItem
          label={t('nav.build')}
          active={buildOpen}
          onClick={() =>
            uiStore.setState(
              buildOpen ? { modal: 'none' } : { modal: 'plans', plansTab: 'buildings' },
            )
          }
        >
          <HammerIcon size={26} />
        </BarItem>
        <BarItem
          label={t('nav.village')}
          active={modal === 'village'}
          onClick={() => (modal === 'village' ? actions.closeVillage() : actions.openVillage())}
          extra={points > 0 && <Count n={points} />}
        >
          <KiwiIcon size={26} />
        </BarItem>
        <div class="thumb-egg-slot">
          <EggButton inBar />
        </div>
        <DefenseItem />
        <BarItem
          label={t('nav.menu')}
          active={menuOpen}
          onClick={() => uiStore.setState({ menuOpen: !menuOpen })}
          extra={
            chatUnread > 0 ? <Count n={chatUnread} /> : objectiveReady ? <Count n="!" /> : null
          }
        >
          <MenuIcon size={26} />
        </BarItem>
      </nav>
      {menuOpen && <NavMenu />}
    </>
  );
}

function Entry({
  label,
  state,
  on,
  badge,
  silent,
  onClick,
  children,
}: {
  label: string;
  state?: string;
  on?: boolean;
  badge?: number | string;
  /** No click sound (the sound switch itself). */
  silent?: boolean;
  onClick(): void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={`nav-entry ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      data-silent={silent || undefined}
      onClick={onClick}
    >
      {children}
      <span class="nav-entry-name">{label}</span>
      {state && <span class="nav-entry-state">{state}</span>}
      {badge !== undefined && <Count n={badge} />}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="nav-group">
      <h3>{title}</h3>
      <div class="nav-grid">{children}</div>
    </section>
  );
}

/** The named menu: a drawer from the bottom (a side panel in landscape). */
function NavMenu() {
  const t = useT();
  const objectivesOpen = useUi((s) => s.objectivesOpen);
  const showLogistics = useUi((s) => s.showLogistics);
  const showLevels = useUi((s) => s.showLevels);
  const inUniverse = useUi((s) => s.universe !== null);
  const chatUnread = useUi((s) => s.chatUnread);
  const muted = useUi((s) => s.audio.muted);
  const sync = useUi((s) => s.sync);
  const guest = useUi((s) => s.account?.isAnonymous ?? false);
  const objectiveReady = useObjectiveReady();
  const siege = useUi((s) => (s.slowGame ? siegeVisible(s.slowGame) : false));
  const counter = useUi((s) => !!s.slowGame?.siege.counter?.announced);
  const other = useOtherColony();
  // Chantier 30: bring every warehouse reserve back from the menu (phones).
  const collectable = useUi((s) =>
    s.slowGame ? reserveHolders(s.slowGame).some((b) => canCollect(s.slowGame!, b)) : false,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Run an entry, then fold the menu away so its effect shows. */
  const go = (fn: () => void) => () => {
    closeMenu();
    fn();
  };
  return (
    <>
      <div class="nav-veil pe" onClick={closeMenu} />
      <aside class="nav-menu parchment pe" role="dialog" aria-label={t('nav.menu')}>
        <div class="nav-head">
          <strong>{t('nav.menu')}</strong>
          <button
            type="button"
            class="btn btn-icon parchment-btn"
            aria-label={t('common.close')}
            onClick={closeMenu}
          >
            ✕
          </button>
        </div>
        <Group title={t('nav.groups.colony')}>
          <Entry
            label={t('hud.objectives')}
            on={objectivesOpen}
            badge={objectiveReady ? '!' : undefined}
            onClick={go(() => setPanelOpen('objectives', !objectivesOpen))}
          >
            <ScrollIcon size={28} />
          </Entry>
          {other && (
            <Entry
              label={t('colony.switchTo', { face: other.face })}
              onClick={go(() => void actions.switchColony(other.colony))}
            >
              <PlanetsIcon size={28} />
            </Entry>
          )}
          {siege && (
            <Entry
              label={t('siege.button')}
              badge={counter ? '!' : undefined}
              onClick={go(() => uiStore.setState({ modal: 'siege' }))}
            >
              <TargetIcon size={28} />
            </Entry>
          )}
          {collectable && (
            <Entry label={t('reserve.collectAll')} onClick={go(() => actions.collect(null))}>
              <Icon name="storage" size={28} />
            </Entry>
          )}
          <Entry
            label={t('plans.research')}
            onClick={go(() => uiStore.setState({ modal: 'plans', plansTab: 'research' }))}
          >
            <BookIcon size={28} />
          </Entry>
        </Group>
        <Group title={t('nav.groups.map')}>
          <Entry label={t('paths.button')} onClick={go(() => actions.setPathMode(true))}>
            <PathIcon size={28} />
          </Entry>
          <Entry
            label={t('nav.logistics')}
            on={showLogistics}
            state={showLogistics ? t('nav.shown') : undefined}
            onClick={go(() => actions.toggleLogistics())}
          >
            <Icon name="logistics" size={28} />
          </Entry>
          <Entry
            label={t('nav.levels')}
            on={showLevels}
            state={showLevels ? t('nav.shown') : undefined}
            onClick={go(() => actions.toggleLevels())}
          >
            <Icon name="levels" size={28} />
          </Entry>
          <Entry label={t('hud.centerCamera')} onClick={go(() => actions.focusNest())}>
            <CompassNeedle size={28} />
          </Entry>
          <Entry label={t('planets.title')} onClick={go(() => actions.togglePlanets(true))}>
            <PlanetsIcon size={28} />
          </Entry>
        </Group>
        <Group title={t('nav.groups.social')}>
          <Entry
            label={t('nav.universes')}
            onClick={go(() => uiStore.setState({ modal: 'universe' }))}
          >
            <GlobeIcon size={28} />
          </Entry>
          {inUniverse && (
            <Entry
              label={t('nav.chat')}
              badge={chatUnread > 0 ? chatUnread : undefined}
              onClick={go(() => chatActions.open(true))}
            >
              <ChatIcon size={28} />
            </Entry>
          )}
        </Group>
        <Group title={t('nav.groups.settings')}>
          <Entry
            label={t('nav.sound')}
            on={!muted}
            state={muted ? t('nav.off') : t('nav.on')}
            silent
            onClick={() => actions.setAudio({ muted: !muted })}
          >
            <SpeakerIcon size={28} muted={muted} />
          </Entry>
          <Entry
            label={t('hud.settings')}
            state={guest ? t('nav.guest') : t(`sync.${sync}`)}
            onClick={go(() => uiStore.setState({ modal: 'settings' }))}
          >
            <GearIcon size={28} />
          </Entry>
        </Group>
      </aside>
    </>
  );
}
