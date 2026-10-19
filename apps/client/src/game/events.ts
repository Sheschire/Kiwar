import type { GameEvent } from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import { pushToast, uiStore } from '../ui/store';
import { playGameEventSounds } from '../audio/sounds';

/** Turns simulation events into toasts and visual effects. */
export function handleGameEvents(events: GameEvent[], renderer: GameRenderer): void {
  renderer.onGameEvents(events);
  playGameEventSounds(events);
  for (const e of events) {
    switch (e.type) {
      case 'constructionComplete':
        if (e.level === 1)
          pushToast('success', 'events.built', { name: `@buildings.${e.buildingType}.name` });
        else
          pushToast('success', 'events.upgraded', {
            name: `@buildings.${e.buildingType}.name`,
            level: e.level,
          });
        break;
      case 'hatched':
        pushToast('success', 'egg.hatched', { name: e.name });
        break;
      case 'storageFull':
        pushToast('info', 'events.storageFull', { resource: `@resources.${e.resource}` });
        break;
      case 'expeditionArrived':
        pushToast(
          e.victory ? 'success' : 'error',
          e.victory ? 'expedition.victory' : 'expedition.defeat',
        );
        break;
      case 'expeditionReturned':
        pushToast('success', 'expedition.returned');
        uiStore.setState((s) => ({
          unreadReports: [...new Set([...s.unreadReports, e.expeditionId])],
        }));
        break;
      default:
        break;
    }
  }
}
