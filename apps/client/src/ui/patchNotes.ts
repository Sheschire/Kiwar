import { PATCH_NOTES, type PatchNote } from '../i18n/patchNotes';
import { uiStore, type UiState } from './store';

const SEEN_KEY = 'kiwar.patchSeen';

function seenId(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** The notes the player has not seen yet (newest first); all of them if nothing is stored. */
export function unseenNotes(seen: string | null = seenId()): readonly PatchNote[] {
  const at = seen ? PATCH_NOTES.findIndex((n) => n.id === seen) : -1;
  return at < 0 ? PATCH_NOTES : PATCH_NOTES.slice(0, at);
}

export function markNotesSeen(): void {
  try {
    if (PATCH_NOTES[0]) localStorage.setItem(SEEN_KEY, PATCH_NOTES[0].id);
  } catch {
    // ignore
  }
}

/** Nothing else on screen asks for the player's attention. */
function calm(s: UiState): boolean {
  return (
    s.modal === 'none' &&
    !s.intro &&
    !s.offlineSummary &&
    !s.pendingJoin &&
    !s.pendingWorld &&
    !s.bootError &&
    !!s.game
  );
}

/**
 * At start: a returning player who has not read the newest note gets the window once, as soon
 * as nothing else is open (offline summary, intro, invite…). A first visit just marks
 * everything as read: the game itself is the news. A player from before the log (nothing
 * stored) sees every note once.
 */
export function offerPatchNotes(firstVisit: boolean): void {
  if (firstVisit) {
    markNotesSeen();
    return;
  }
  if (unseenNotes().length === 0) return;
  const open = (s: UiState): boolean => {
    if (!calm(s)) return false;
    uiStore.setState({ modal: 'patchNotes', patchNotesFresh: unseenNotes().length });
    return true;
  };
  if (open(uiStore.getState())) return;
  const stop = uiStore.subscribe((s) => {
    if (open(s)) stop();
  });
}
