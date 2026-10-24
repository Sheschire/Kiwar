import type { GameRenderer } from '../render/GameRenderer';
import { uiStore } from '../ui/store';
import { atCabaretTonight, calendarAt, type GameState } from '@kiwar/shared';
import { kiwiVoicePitch } from './sounds';
import { onlineConfig } from '../game/onlineConfig';
import { audio } from './engine';
import { loadAudioManifest } from './manifest';
import { sandboxOverride } from './sandbox';

/** Hooks the audio engine to the page and the UI (called once at startup). */
export function installGameAudio(renderer: GameRenderer): void {
  audio.installUnlock();
  // Custom sounds from the admin space (never blocks: defaults play meanwhile).
  void loadAudioManifest(onlineConfig(), sandboxOverride);
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

  audio.setLoop('music.main', 1);
  audio.spatializer = (pos) => renderer.spatialize(pos);
  renderer.onTurretShot = (x, z) => audio.play('turret.fire', { pos: { x, z } });

  // Ambience follows the camera: more nature close up, more wind from afar; kiwis chirp
  // around when zoomed in (the binding's zoom condition, probability and cooldown decide).
  let lastChirp = 0;
  window.setInterval(() => {
    const zoom = renderer.audioZoom();
    audio.context.zoom = zoom;
    // Day and night ambiences follow the calendar (birds rest at night).
    const { game, now: simNow } = uiStore.getState();
    const c = game ? calendarAt(game.calendarStart, simNow) : null;
    audio.context.timeOfDay = c?.night ? 'night' : 'day';
    audio.context.season = c?.season ?? 'spring';
    const birds = c?.night ? 0.3 : 1;
    audio.setLoop('ambience.night', c?.night ? nightChorus(c.nightAt, c.dawnAt, simNow) : 0);
    audio.setLoop('cabaret.music', game && c ? cabaretEvening(game, c, simNow) * (1 - zoom) : 0);
    audio.setLoop('ambience.nature', (0.25 + 0.75 * (1 - zoom)) * birds);
    audio.setLoop('ambience.wind', 0.1 + 0.9 * zoom);
    const now = performance.now();
    if (now - lastChirp > 2500) {
      lastChirp = now;
      const kiwi = renderer.randomVisibleKiwi();
      if (kiwi) audio.play('kiwi.chirp', { pos: kiwi.pos, pitchOffset: kiwiVoicePitch(kiwi.id) });
    }
  }, 250);
}

/** Chantier 44: 1 while the cabaret has guests in the first half of the night, else 0. */
export function cabaretEvening(
  game: GameState,
  c: { night: boolean; nightAt: number; dawnAt: number },
  now: number,
): number {
  if (!c.night || now > c.nightAt + (c.dawnAt - c.nightAt) / 2) return 0;
  if (!game.buildings.some((b) => b.type === 'cabaret')) return 0;
  return game.villagers.some((v) => atCabaretTonight(game, v)) ? 1 : 0;
}

/**
 * Chantier 20: the crickets sing in the first third of the night, then fade out by its middle
 * (a whole night of them was tiring).
 */
export function nightChorus(nightAt: number, dawnAt: number, now: number): number {
  const share = (now - nightAt) / Math.max(1, dawnAt - nightAt);
  return Math.max(0, Math.min(1, (0.5 - share) / (0.5 - 1 / 3)));
}
