import type { GameEvent } from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import { pushToast, uiStore } from '../ui/store';
import { playGameEventSounds } from '../audio/sounds';
import { formatDuration } from '../i18n/i18n';

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
        if (e.shiny)
          pushToast('success', 'events.shinyHatched', { name: e.name, color: `@shiny.${e.shiny}` });
        else pushToast('success', 'egg.hatched', { name: e.name });
        break;
      case 'levelUp':
        if (e.stat)
          pushToast('success', 'events.levelUpStat', {
            name: e.name,
            level: e.level,
            stat: `@stats.${e.stat}`,
          });
        else pushToast('success', 'events.levelUp', { name: e.name, level: e.level });
        break;
      case 'trained':
        pushToast('success', 'events.trained', {
          name: e.name,
          class: `@classes.${e.classId}.name`,
        });
        break;
      case 'speechOver':
        pushToast('info', 'events.speechOver');
        break;
      case 'masteryUp':
        pushToast('info', 'events.masteryUp', {
          name: e.name,
          mastery: `@masteries.${e.mastery}`,
          rank: e.rank,
        });
        break;
      case 'storageFull':
        pushToast('info', 'events.storageFull', { resource: `@resources.${e.resource}` });
        break;
      case 'foodRanOut':
        pushToast('error', 'events.foodRanOut', { resource: `@resources.${e.resource}` });
        break;
      case 'hungerChanged':
        pushToast(e.stage === 'fed' ? 'success' : 'error', `needs.hungerChanged.${e.stage}`);
        break;
      case 'starved':
        pushToast('error', 'events.starved', { name: e.name });
        break;
      case 'seasonChanged':
        pushToast('info', 'cycles.changed', { season: `@cycles.seasons.${e.season}` });
        break;
      case 'expeditionArrived':
        if (e.mission === 'recon')
          pushToast(
            e.spotted ? 'error' : 'info',
            e.spotted ? 'recon.toastSpotted' : 'recon.toastLanded',
          );
        else
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
      case 'repaired':
        pushToast('success', 'events.repaired', { name: `@buildings.${e.buildingType}.name` });
        break;
      case 'waveAnnounced':
        pushToast('error', 'threats.announced', {
          duration: formatDuration(uiStore.getState().lang, e.strikeAt - e.at),
        });
        break;
      case 'waveStruck':
        pushToast(e.victory ? 'success' : 'error', e.victory ? 'threats.won' : 'threats.lost');
        uiStore.setState({ unreadWave: e.waveId });
        break;
      case 'shelterOver':
        pushToast('info', 'threats.shelterOver');
        break;
      case 'injuryHealed':
        pushToast('info', 'threats.healed', { name: e.name });
        break;
      case 'meteorAnnounced':
        pushToast('info', 'sky.announced', {
          resource: `@resources.${e.resource}`,
          duration: formatDuration(uiStore.getState().lang, e.strikeAt - e.at),
        });
        break;
      case 'meteorLanded':
        pushToast('success', 'sky.landed', {
          stock: e.stock,
          resource: `@resources.${e.resource}`,
        });
        break;
      case 'meteorFaded':
        pushToast('info', 'sky.faded');
        break;
      case 'incident':
        if (e.kind === 'storm') pushToast('info', 'threats.incident.storm', { amount: e.amount });
        else if (e.blocked) pushToast('success', `threats.incident.${e.kind}Blocked`);
        else
          pushToast('error', `threats.incident.${e.kind}`, {
            amount: e.amount,
            resource: `@resources.${e.resource ?? 'pulp'}`,
          });
        break;
      default:
        break;
    }
  }
}
