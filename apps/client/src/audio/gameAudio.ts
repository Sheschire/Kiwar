import { uiStore } from '../ui/store';
import { audio } from './engine';

/** Hooks the audio engine to the page and the UI (called once at startup). */
export function installGameAudio(): void {
  audio.installUnlock();
  uiStore.setState({ audio: audio.getSettings() });
  audio.onSettings((s) => uiStore.setState({ audio: s }));

  // Every enabled button clicks (capture, so it plays even if the button closes itself).
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.('button, [role="button"]');
      if (button && !(button as HTMLButtonElement).disabled && !button.hasAttribute('data-silent'))
        audio.play('ui.click');
    },
    true,
  );

  uiStore.subscribe((s, prev) => {
    if (s.modal !== prev.modal) audio.play(s.modal === 'none' ? 'ui.close' : 'ui.open');
    if (s.selectedTile && s.selectedTile !== prev.selectedTile) audio.play('ui.select');
    if (s.chatUnread > prev.chatUnread) audio.play('ui.notify');
  });

  // Ambience beds (levels follow the camera zoom once the renderer reports it).
  audio.setLoop('ambience.nature', 0.7);
  audio.setLoop('ambience.wind', 0.25);
  audio.setLoop('music.main', 1);
}
