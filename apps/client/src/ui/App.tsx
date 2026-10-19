import { useEffect } from 'preact/hooks';
import { DebugPanel } from './components/DebugPanel';
import { EggButton } from './components/EggButton';
import { ObjectivesPanel } from './components/ObjectivesPanel';
import { QueuePanel } from './components/QueuePanel';
import { SaveNudge } from './components/SaveNudge';
import { TilePanel } from './components/TilePanel';
import { OfflineModal } from './components/OfflineModal';
import { SettingsModal } from './components/SettingsModal';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { WorldModal } from './components/WorldModal';
import { uiStore, useUi } from './store';

export function App() {
  const modal = useUi((s) => s.modal);
  const debugOpen = useUi((s) => s.debugOpen);
  const ready = useUi((s) => s.game !== null);
  const hasSheet = useUi((s) => s.selectedTile !== null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' || e.key === '`' || e.key === '²') {
        uiStore.setState((s) => ({ debugOpen: !s.debugOpen }));
      } else if (e.key === 'Escape') {
        uiStore.setState({ selectedTile: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;
  return (
    <div class={`hud ${hasSheet ? 'has-sheet' : ''}`}>
      <TopBar />
      <ObjectivesPanel />
      <QueuePanel />
      <SaveNudge />
      <EggButton />
      <TilePanel />
      <Toasts />
      {debugOpen && <DebugPanel />}
      {modal === 'settings' && <SettingsModal />}
      <OfflineModal />
      <WorldModal />
    </div>
  );
}
