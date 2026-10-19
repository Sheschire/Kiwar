import type { GameEvent } from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import { pushToast } from '../ui/store';

/** Turns simulation events into toasts and visual effects. */
export function handleGameEvents(events: GameEvent[], _renderer: GameRenderer): void {
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
      default:
        break;
    }
  }
}
