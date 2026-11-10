import type { GameState } from '@kiwar/shared';
import { formatDuration } from '../i18n/i18n';
import { pushToast, uiStore } from '../ui/store';

/**
 * Chantier 57: an attack of another player reaches us with a server state (no event): the
 * first time a raid shows up, the player is told who comes and when. Raids already known when
 * the colony is first shown are told too (the notice may have started while we were away).
 */
const told = new Set<string>();
let colonyKey = '';

export function watchRaids(game: GameState | null, now: number): void {
  if (!game) return;
  const key = `${game.universeId}/${game.colony.index}`;
  if (key !== colonyKey) {
    colonyKey = key;
    told.clear();
  }
  for (const r of game.pvp.incoming) {
    if (told.has(r.id)) continue;
    told.add(r.id);
    if (r.at <= now) continue;
    pushToast('error', 'pvp.toast.announced', {
      owner: r.owner,
      duration: formatDuration(uiStore.getState().lang, r.at - now),
    });
  }
}
