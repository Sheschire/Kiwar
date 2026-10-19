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
import { FollowBadge, VillageModal } from './components/VillageModal';
import { actions } from './actions';
import { uiStore, useT, useUi } from './store';
import { SKILLS } from '@kiwar/shared';
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

export function App() {
  const modal = useUi((s) => s.modal);
  const debugOpen = useUi((s) => s.debugOpen);
  const ready = useUi((s) => s.game !== null);
  const hasSheet = useUi((s) => s.selectedTile !== null);
  const pathMode = useUi((s) => s.pathMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '²') {
        uiStore.setState((s) => ({ debugOpen: !s.debugOpen }));
      } else if (e.key === 'Escape') {
        if (uiStore.getState().pathMode) actions.setPathMode(false);
        else uiStore.setState({ selectedTile: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;
  return (
    <div class={`hud ${hasSheet ? 'has-sheet' : ''} ${pathMode ? 'path-mode' : ''}`}>
      <TopBar />
      <ObjectivesPanel />
      <QueuePanel />
      <ExpeditionsPanel />
      <SaveNudge />
      <EggButton />
      <PathButton />
      <PathToolbar />
      <TilePanel />
      <FollowBadge />
      <SpeechBadge />
      <Toasts />
      {debugOpen && <DebugPanel />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'expedition' && <ExpeditionModal />}
      {modal === 'report' && <ReportModal />}
      {modal === 'universe' && <UniverseModal />}
      {modal === 'demolish' && <DemolishModal />}
      {modal === 'village' && <VillageModal />}
      <JoinModal />
      <ChatPanel />
      <OfflineModal />
      <WorldModal />
    </div>
  );
}
