import { audio } from '../audio/engine';
import { pushToast, uiStore } from '../ui/store';

/**
 * Chantier 36: a wave that strikes while the player watches is told at the end of its show
 * (toast, unread badge, sound), never before: the battle is the news.
 */
const held = new Map<string, boolean>();

export function holdOutcome(waveId: string, victory: boolean): void {
  held.set(waveId, victory);
}

/** Tells a held outcome (no-op for a replay or an outcome already told). */
export function tellOutcome(waveId: string): void {
  const victory = held.get(waveId);
  if (victory === undefined) return;
  held.delete(waveId);
  pushToast(victory ? 'success' : 'error', victory ? 'threats.won' : 'threats.lost');
  uiStore.setState({ unreadWave: waveId });
  audio.play(victory ? 'threat.victory' : 'threat.defeat');
}
