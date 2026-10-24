import { otherFace, type Expedition, type GameState } from '@kiwar/shared';
import { pushToast, uiStore } from '../ui/store';

/**
 * Chantier 41: a landing the player is there for (its news less than a minute old) is offered
 * to watch on the twin; its outcome (toast) waits for the end of the show, or for "Later".
 * Wider than the waves' 20 s: online, the server resolves the landing and the client learns it
 * at its next load.
 */
export const LIVE_LANDING_MS = 60_000;

const held = new Map<string, 'victory' | 'retreat' | 'defeat'>();

/**
 * A landing whose battle can be played on the twin drawn in our sky: the other face of our own
 * kiwi, still alien (no friend or sister there), with a journal.
 */
export function watchableTarget(state: GameState, e: Expedition): boolean {
  if (e.mission !== 'land' || e.sector === undefined) return false;
  const target = state.targets.find((t) => t.id === e.targetId);
  if (!target || target.distance !== 0 || target.face !== otherFace(state.face)) return false;
  return uiStore.getState().twinOwner === null;
}

export function watchable(state: GameState, e: Expedition): boolean {
  return watchableTarget(state, e) && !!e.result?.log;
}

/** Holds a landing's outcome until its show (or the "Later" answer). */
export function holdLanding(expeditionId: string, outcome: 'victory' | 'retreat' | 'defeat'): void {
  held.set(expeditionId, outcome);
}

/** Tells a held landing outcome (no-op for a replay or one already told). */
export function tellLanding(expeditionId: string | null): void {
  if (!expeditionId) return;
  const outcome = held.get(expeditionId);
  if (!outcome) return;
  held.delete(expeditionId);
  pushToast(outcome === 'victory' ? 'success' : 'error', `landing.toast.${outcome}`);
}
