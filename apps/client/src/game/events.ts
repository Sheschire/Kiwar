import {
  AGE_IDS,
  RESOURCE_IDS,
  type GameEvent,
  type MissionKind,
  type ResourceId,
} from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import { pushToast, uiStore } from '../ui/store';
import { playGameEventSounds } from '../audio/sounds';
import { formatDuration, formatNumber, translate, type TKey } from '../i18n/i18n';

const SLICE_KEYS = ['bark', 'dew', 'moss', 'twig', 'down', 'seeds'] as const;
/** The name of a sector's slice, as a translated parameter. */
const sliceKey = (sector: number) => `@siege.slices.${SLICE_KEYS[sector % 6]!}`;

/** Chantier 19: toasts of the siege missions (won, lost). */
const SIEGE_TOASTS: Partial<Record<MissionKind, readonly [TKey, TKey]>> = {
  assault: ['siege.toast.taken', 'siege.toast.repelled'],
  reinforce: ['siege.toast.reinforced', 'siege.toast.reinforced'],
  final: ['siege.toast.queenFell', 'siege.toast.queenHeld'],
};

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
      case 'ageReached':
        pushToast('success', 'events.ageReached', { age: `@ages.${AGE_IDS[e.age]!}` });
        break;
      case 'kikiwiwiBorn':
        pushToast('success', 'events.kikiwiwiBorn', { name: e.name });
        break;
      case 'titanDone':
        pushToast('success', 'events.titanDone', {
          name: e.name,
          work: `@titan.works.${e.work}.name`,
        });
        break;
      case 'infusionFailed':
        pushToast('error', 'events.infusionFailed', { name: e.name });
        break;
      case 'researchDone':
        pushToast('success', 'events.researchDone', { tech: `@techs.${e.tech}.name` });
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
      case 'kiwisRedirected':
        pushToast('info', 'events.kiwisRedirected', {
          count: e.count,
          resource: `@resources.${e.resource}`,
        });
        break;
      case 'kiwisReturned':
        pushToast('info', 'events.kiwisReturned', {
          count: e.count,
          resource: `@resources.${e.resource}`,
        });
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
        if (e.broken) pushToast('error', 'ship.brokeDown');
        else if (e.mission && SIEGE_TOASTS[e.mission])
          pushToast(
            e.victory || e.mission === 'reinforce' ? 'success' : 'error',
            SIEGE_TOASTS[e.mission]![e.victory || e.mission === 'reinforce' ? 0 : 1],
          );
        else if (e.mission === 'recon')
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
      case 'cargoDelivered':
        pushToast('success', 'delivery.delivered', { name: e.to });
        break;
      case 'shipmentReturned':
        pushToast('info', 'delivery.back');
        break;
      case 'cargoReceived': {
        const lang = uiStore.getState().lang;
        const list = RESOURCE_IDS.filter((r) => e.received[r] >= 1)
          .map(
            (r) =>
              `${formatNumber(lang, Math.floor(e.received[r]))} ${translate(lang, `resources.${r}`)}`,
          )
          .join(', ');
        pushToast('success', 'delivery.received', { name: e.from, list });
        if (RESOURCE_IDS.some((r) => e.lost[r] >= 1)) pushToast('info', 'delivery.lostSome');
        break;
      }
      case 'repaired':
        pushToast('success', 'events.repaired', { name: `@buildings.${e.buildingType}.name` });
        break;
      case 'counterAnnounced':
        pushToast('error', 'siege.toast.counterAnnounced', {
          name: sliceKey(e.sector),
          duration: formatDuration(uiStore.getState().lang, e.strikeAt - e.at),
        });
        break;
      case 'counterStruck':
        if (e.victory)
          pushToast('success', 'siege.toast.counterHeld', { name: sliceKey(e.sector) });
        else
          pushToast('error', 'siege.toast.counterFell', { name: sliceKey(e.sector), dead: e.dead });
        break;
      case 'bridgeheadFortified':
        pushToast('success', 'siege.toast.fortified', { name: sliceKey(e.sector) });
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
      case 'cometAnnounced':
        pushToast('info', 'comet.announced', {
          duration: formatDuration(uiStore.getState().lang, e.passAt - e.at),
        });
        break;
      case 'cometPassed':
        if (e.patches.length === 0) pushToast('info', 'comet.passedNone');
        else
          pushToast('success', 'comet.passed', {
            stock: e.patches.reduce((sum, p) => sum + p.stock, 0),
            count: e.patches.length,
          });
        break;
      case 'dustPicked':
        pushToast('success', 'comet.picked');
        break;
      case 'dustFaded':
        if (e.left > 0) pushToast('info', 'comet.faded', { left: e.left });
        break;
      case 'stardustFull':
        pushToast('info', 'comet.full');
        break;
      case 'obstacleCleared': {
        // The main part of the loot (what did not fit in the storage is lost).
        const best = RESOURCE_IDS.reduce<ResourceId | null>(
          (a, r) => ((e.loot[r] ?? 0) > (a ? (e.loot[a] ?? 0) : 0) ? r : a),
          null,
        );
        if (best)
          pushToast('success', 'obstacles.cleared', {
            name: `@obstacles.${e.kind}.name`,
            amount: e.loot[best]!,
            resource: `@resources.${best}`,
          });
        else pushToast('info', 'obstacles.clearedEmpty', { name: `@obstacles.${e.kind}.name` });
        break;
      }
      case 'wreckLeft':
        pushToast('info', 'obstacles.wreckLeft');
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
