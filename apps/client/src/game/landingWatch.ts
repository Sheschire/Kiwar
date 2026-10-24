import { otherFace, type Expedition, type GameState, type MissionKind } from '@kiwar/shared';
import type { TKey } from '../i18n/i18n';
import { pushToast, uiStore } from '../ui/store';

/**
 * Chantier 41: a landing the player is there for (its news less than a minute old) is offered
 * to watch on the twin; its outcome (toast) waits for the end of the show, or for "Later".
 * Wider than the waves' 20 s: online, the server resolves the landing and the client learns it
 * at its next load.
 */
export const LIVE_LANDING_MS = 60_000;

type Outcome = 'victory' | 'retreat' | 'defeat';
const held = new Map<string, { outcome: Outcome; mission: MissionKind }>();

/** The toast of a landing's outcome (chantier 42: the queen's battle has its own). */
export function tellOutcome(mission: MissionKind, outcome: Outcome): void {
  const key: TKey =
    mission === 'final'
      ? outcome === 'victory'
        ? 'queen.toast.fell'
        : 'queen.toast.held'
      : `landing.toast.${outcome}`;
  pushToast(outcome === 'victory' ? 'success' : 'error', key);
  // The twin is ours: the conquest screen offers the settlers' ship.
  if (mission === 'final' && outcome === 'victory') uiStore.setState({ modal: 'siege' });
}

/**
 * A landing whose battle can be played on the twin drawn in our sky: the other face of our own
 * kiwi, still alien (no friend or sister there), with a journal.
 */
export function watchableTarget(state: GameState, e: Expedition): boolean {
  if ((e.mission !== 'land' && e.mission !== 'final') || e.sector === undefined) return false;
  const target = state.targets.find((t) => t.id === e.targetId);
  if (!target || target.distance !== 0 || target.face !== otherFace(state.face)) return false;
  return uiStore.getState().twinOwner === null;
}

export function watchable(state: GameState, e: Expedition): boolean {
  return watchableTarget(state, e) && !!e.result?.log;
}

/** Holds a landing's outcome until its show (or the "Later" answer). */
export function holdLanding(expeditionId: string, outcome: Outcome, mission: MissionKind): void {
  held.set(expeditionId, { outcome, mission });
}

/** Tells a held landing outcome (no-op for a replay or one already told). */
export function tellLanding(expeditionId: string | null): void {
  if (!expeditionId) return;
  const told = held.get(expeditionId);
  if (!told) return;
  held.delete(expeditionId);
  tellOutcome(told.mission, told.outcome);
}
