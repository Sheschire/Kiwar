import { useEffect } from 'preact/hooks';
import { DebugPanel } from './components/DebugPanel';
import { EggButton } from './components/EggButton';
import { DemolishModal } from './components/DemolishModal';
import { ExpeditionModal } from './components/ExpeditionModal';
import { ExpeditionsPanel } from './components/ExpeditionsPanel';
import { ReportModal } from './components/ReportModal';
import { ChatPanel } from './components/ChatPanel';
import { JoinModal, UniverseModal } from './components/UniverseModal';
import { ObjectivesPanel } from './components/ObjectivesPanel';
import { QueuePanel } from './components/QueuePanel';
import { SaveNudge } from './components/SaveNudge';
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
import { ResearchModal } from './components/ResearchModal';
import { BootScreen, Guard } from './components/Guard';
import { VisitBanner } from './components/VisitBanner';
import { RecapBubble } from './components/RecapBubble';
import { actions } from './actions';
import { uiStore, useT, useUi } from './store';
import { consumption, foodLeftMs, hungerStage, NEEDS, netRates, SKILLS } from '@kiwar/shared';
import { ResourceIcon } from './icons';
import { formatDuration } from '../i18n/i18n';

/** The mayor's speech is running: a small badge under the top bar. */
function SpeechBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const left = useUi((s) => (s.game ? s.game.speechUntil - s.now : 0));
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
  const game = useUi((s) => s.game);
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

export function App() {
  const modal = useUi((s) => s.modal);
  const debugOpen = useUi((s) => s.debugOpen);
  const ready = useUi((s) => s.game !== null);
  const hasSheet = useUi((s) => s.selectedTile !== null);
  const pathMode = useUi((s) => s.pathMode);
  const intro = useUi((s) => s.intro !== null);
  const visiting = useUi((s) => s.visit !== null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '²') {
        uiStore.setState((s) => ({ debugOpen: !s.debugOpen }));
      } else if (e.key === 'Escape') {
        if (uiStore.getState().visit !== null) actions.visitAlly(null);
        else if (uiStore.getState().pathMode) actions.setPathMode(false);
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
        <Toasts />
      </div>
    );
  return (
    <div class={`hud ${hasSheet ? 'has-sheet' : ''} ${pathMode ? 'path-mode' : ''}`}>
      <TopBar />
      <ObjectivesPanel />
      <QueuePanel />
      <ExpeditionsPanel />
      <SaveNudge />
      <RecapBubble />
      <EggButton />
      <PathButton />
      <PathToolbar />
      <Guard>
        <TilePanel />
      </Guard>
      <FollowBadge />
      <div class="badge-stack">
        <ThreatBadge />
        <SpeechBadge />
        <HungerBadge />
      </div>
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
        {modal === 'research' && <ResearchModal />}
        <JoinModal />
        <ChatPanel />
        <OfflineModal />
        <WorldModal />
        <IntroOverlay />
      </Guard>
    </div>
  );
}
