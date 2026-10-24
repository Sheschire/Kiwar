import { Compass } from './components/Compass';
import { useEffect } from 'preact/hooks';
import { DebugPanel } from './components/DebugPanel';
import { EggButton } from './components/EggButton';
import { DemolishModal } from './components/DemolishModal';
import { ExpeditionModal } from './components/ExpeditionModal';
import { CometArrow } from './components/CometArrow';
import { ExpeditionsPanel } from './components/ExpeditionsPanel';
import { ReportModal } from './components/ReportModal';
import { ChatPanel } from './components/ChatPanel';
import { JoinModal, UniverseModal } from './components/UniverseModal';
import { ObjectivesPanel, ObjectiveWatcher } from './components/ObjectivesPanel';
import { QueuePanel } from './components/QueuePanel';
import { SaveNudge } from './components/SaveNudge';
import { AuthErrorBanner, GuestTransferModal } from './components/AccountNotices';
import { GpuTip } from './components/GpuTip';
import { TilePanel } from './components/TilePanel';
import { OfflineModal } from './components/OfflineModal';
import { PathButton, PathToolbar } from './components/PathTools';
import { SettingsModal } from './components/SettingsModal';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { WorldModal } from './components/WorldModal';
import { IntroOverlay } from './components/IntroOverlay';
import { FollowBadge, VillageModal } from './components/VillageModal';
import { DefenseModal, ThreatBadge } from './components/DefenseModal';
import { ReserveBadge } from './components/ReserveInfo';
import { PlansModal } from './components/ResearchModal';
import { SiegeModal } from './components/SiegeModal';
import { BestiaryModal } from './components/BestiaryModal';
import { LevelsButton, LogisticsButton, PlacingBanner } from './components/BuildingTree';
import { BootScreen, Guard } from './components/Guard';
import { VisitBanner } from './components/VisitBanner';
import { BattleBar } from './components/BattleBar';
import { LandingInvite } from './components/LandingInvite';
import { useBattle } from './battleStore';
import { PlanetTag } from './components/PlanetTag';
import { PlanetCard, PlanetsButton, PlanetsPanel } from './components/PlanetCard';
import { RecapBubble } from './components/RecapBubble';
import { actions } from './actions';
import { uiStore, useT, useUi } from './store';
import { CometBadge } from './components/CometBadge';
import { foodLeftMs, NEEDS, SKILLS } from '@kiwar/shared';
import { consumption, hungerStage, netRates } from './derived';
import { ResourceIcon } from './icons';
import { formatDuration } from '../i18n/i18n';
import { useThumbLayout } from './layout';
import { ThumbBar } from './components/MobileNav';

/** The mayor's speech is running: a small badge under the top bar. */
function SpeechBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const left = useUi((s) => (s.slowGame ? s.slowGame.speechUntil - s.slowNow : 0));
  // Chantier 43: the colony gathered at the Town Hall.
  const gathering = useUi((s) => (s.slowGame ? s.slowGame.speech.until - s.slowNow : 0));
  if (gathering > 0)
    return (
      <div class="buff-badge parchment pe">
        {t('townHall.gathering', { duration: formatDuration(lang, gathering) })}
      </div>
    );
  if (left <= 0) return null;
  return (
    <div class="buff-badge parchment pe">
      {t('skills.speech.name')} · +{Math.round(SKILLS.speechBonus * 100)} % ·{' '}
      {formatDuration(lang, left)}
    </div>
  );
}

/** Hunger alert: a stage worse than fed, or a food stock about to run out. */
function HungerBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  const stage = hungerStage(game);
  const net = netRates(game);
  const eaten = consumption(game);
  const low = (['pulp', 'juice'] as const)
    .map((id) => ({ id, left: foodLeftMs(game.resources[id], net[id]) }))
    .filter((x) => eaten[x.id] > 0 && x.left !== null && x.left < NEEDS.warnMs);
  if (stage === 'fed' && low.length === 0) return null;
  return (
    <div class={`hunger-badge parchment pe stage-${stage}`} role="status">
      {stage !== 'fed' && (
        <strong>
          {t('needs.stageWork', {
            stage: t(`needs.stages.${stage}`),
            value: NEEDS.work[stage],
          })}
        </strong>
      )}
      {low.map((x) => (
        <span key={x.id} class="row">
          <ResourceIcon id={x.id} size={14} />
          {t('needs.lowFood', {
            resource: `@resources.${x.id}`,
            duration: formatDuration(lang, x.left!),
          })}
        </span>
      ))}
    </div>
  );
}

/** Alerts of the HUD: the wave, the comet, the speech, hunger. */
function Badges() {
  return (
    <div class="badge-stack">
      <ThreatBadge />
      <CometBadge />
      <SpeechBadge />
      <HungerBadge />
      <ReserveBadge />
    </div>
  );
}

/** Keys typed in a text field are not shortcuts. */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function App() {
  const modal = useUi((s) => s.modal);
  const bestiaryOpen = useUi((s) => s.bestiaryOpen);
  const debugOpen = useUi((s) => s.debugOpen);
  const ready = useUi((s) => s.game !== null);
  const hasSheet = useUi((s) => s.selectedTile !== null);
  const battle = useBattle((s) => s.reportId !== null);
  const pathMode = useUi((s) => s.pathMode);
  const placing = useUi((s) => s.placing !== null);
  const intro = useUi((s) => s.intro !== null);
  const visiting = useUi((s) => s.visit !== null);
  const thumb = useThumbLayout();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '²') {
        uiStore.setState((s) => ({ debugOpen: !s.debugOpen }));
      } else if ((e.key === 'l' || e.key === 'L') && !isTyping(e)) {
        actions.toggleLevels();
      } else if ((e.key === 'o' || e.key === 'O') && !isTyping(e)) {
        actions.toggleLogistics();
      } else if ((e.key === 'r' || e.key === 'R') && !isTyping(e)) {
        // Chantier 35: turns the big building being placed.
        actions.rotatePlacement();
      } else if (e.key === 'Escape') {
        const ui = uiStore.getState();
        if (ui.planetCard !== null) actions.showPlanetCard(null);
        else if (ui.planetsOpen) actions.togglePlanets(false);
        else if (ui.visit !== null) actions.travelTo(null);
        else if (uiStore.getState().pathMode) actions.setPathMode(false);
        else if (uiStore.getState().placing) actions.stopPlacing();
        else uiStore.setState({ selectedTile: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready)
    return (
      <div class="hud">
        <BootScreen />
        <Toasts />
      </div>
    );
  // The intro takes the whole screen: no HUD while the kiwi is sliced and a face chosen.
  if (intro)
    return (
      <div class="hud">
        <IntroOverlay />
        <Toasts />
      </div>
    );
  // Visiting an ally's planet: look only, with the way back home.
  if (visiting)
    return (
      <div class="hud">
        <VisitBanner />
        <BattleBar />
        <PlanetCard />
        <PlanetsPanel />
        <PlanetTag />
        <Toasts />
      </div>
    );
  return (
    <div
      class={`hud ${hasSheet ? 'has-sheet' : ''} ${pathMode || placing ? 'path-mode' : ''} ${thumb ? 'thumb' : ''} ${battle ? 'in-battle' : ''}`}
    >
      <TopBar buttons={!thumb} />
      <ObjectivesPanel compact={thumb} />
      <ObjectiveWatcher />
      {!thumb && (
        <>
          {/* Chantier 32: one column, so a tall queue pushes the expeditions up. */}
          <div class="left-stack">
            <ExpeditionsPanel />
            <QueuePanel />
          </div>
          <SaveNudge />
          <AuthErrorBanner />
          <GpuTip />
          <LandingInvite />
        </>
      )}
      <RecapBubble />
      {thumb ? (
        <ThumbBar />
      ) : (
        <>
          <EggButton />
          <PathButton />
          <Compass />
          <LevelsButton />
          <LogisticsButton />
          <PlanetsButton />
        </>
      )}
      <PathToolbar />
      <PlacingBanner />
      <BattleBar />
      <Guard>
        <TilePanel />
      </Guard>
      <FollowBadge />
      {thumb ? (
        // Chantier 21: everything that floats above the thumb bar, stacked from the bottom.
        <div class="thumb-stack">
          <LandingInvite docked />
          <SaveNudge />
          <AuthErrorBanner />
          <ExpeditionsPanel />
          <Badges />
          <QueuePanel />
        </div>
      ) : (
        <Badges />
      )}
      <CometArrow />
      <PlanetCard />
      <PlanetsPanel />
      <PlanetTag />
      <Toasts />
      <Guard>
        {debugOpen && <DebugPanel />}
        {modal === 'settings' && <SettingsModal />}
        {modal === 'expedition' && <ExpeditionModal />}
        {modal === 'report' && <ReportModal />}
        {modal === 'universe' && <UniverseModal />}
        {modal === 'demolish' && <DemolishModal />}
        {modal === 'village' && <VillageModal />}
        {modal === 'defense' && <DefenseModal />}
        {modal === 'plans' && <PlansModal />}
        {modal === 'siege' && <SiegeModal />}
        {bestiaryOpen && <BestiaryModal />}
        <JoinModal />
        <ChatPanel />
        <OfflineModal />
        <GuestTransferModal />
        <WorldModal />
        <IntroOverlay />
      </Guard>
    </div>
  );
}
