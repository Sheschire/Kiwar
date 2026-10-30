import { AGE_IDS, otherFace, RESOURCE_IDS, type GameEvent, type ResourceId } from '@kiwar/shared';
import type { GameRenderer } from '../render/GameRenderer';
import { pushToast, uiStore } from '../ui/store';
import { isLiveWave } from '../ui/battleStore';
import { holdOutcome } from './battleOutcome';
import {
  holdLanding,
  LIVE_LANDING_MS,
  tellLanding,
  tellOutcome,
  watchableTarget,
} from './landingWatch';
import { playGameEventSounds } from '../audio/sounds';
import { actions } from '../ui/actions';
import { friendName } from '../ui/components/DeliveryPlanner';
import { formatDuration, formatNumber, translate } from '../i18n/i18n';

const SLICE_KEYS = ['bark', 'dew', 'moss', 'twig', 'down', 'seeds'] as const;
/** The name of a parcel ("Edge of the Bark"), translated. */
function sectorKey(sector: number): string {
  const lang = uiStore.getState().lang;
  const name = translate(lang, `siege.slices.${SLICE_KEYS[sector % 6]!}`);
  return translate(lang, sector < 6 ? 'siege.inner' : 'siege.outer', { name });
}

/** An ally's name, or our other colony (chantier 19). */
function nameOf(owner: string): string {
  const lang = uiStore.getState().lang;
  return friendName((k, p) => translate(lang, k, p), owner);
}

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
      case 'classRankUp':
        pushToast('success', 'events.classRankUp', { name: e.name, rank: e.rank });
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
      case 'cabaret':
        pushToast('success', 'cabaret.opened', { count: e.guests });
        break;
      case 'cabaretShut':
        pushToast('info', 'cabaret.shut');
        break;
      case 'seasonChanged':
        pushToast('info', 'cycles.changed', { season: `@cycles.seasons.${e.season}` });
        break;
      case 'expeditionArrived':
        if (e.broken) pushToast('error', 'ship.brokeDown');
        // Chantier 48: a delve reached its room.
        else if (e.mission === 'delve')
          pushToast(
            e.outcome === 'victory' ? 'success' : 'error',
            `depths.toast.${e.outcome ?? 'defeat'}`,
          );
        else if (e.mission === 'found') {
          const game = uiStore.getState().game;
          const face = game ? `@faces.${otherFace(game.face)}` : '';
          pushToast('success', 'colony.founded', { face });
        } else if (e.outcome) {
          // Chantier 41: there for it — the landing is offered to watch, its outcome told after.
          const s = uiStore.getState();
          const exp = s.game?.expeditions.find((x) => x.id === e.expeditionId);
          const fresh = Math.abs(s.now - e.at) < LIVE_LANDING_MS;
          if (fresh && exp && s.game && watchableTarget(s.game, exp) && s.visit === null) {
            tellLanding(s.landingInvite);
            holdLanding(e.expeditionId, e.outcome, e.mission ?? 'land');
            uiStore.setState({ landingInvite: e.expeditionId });
          } else
            // Chantier 40: how the landing ended.
            tellOutcome(e.mission ?? 'land', e.outcome);
        } else
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
        pushToast('success', 'delivery.delivered', { name: nameOf(e.to) });
        break;
      case 'settlersArrived':
        pushToast('success', 'colony.settlersArrived', { names: e.names.join(', ') });
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
        if (list) pushToast('success', 'delivery.received', { name: nameOf(e.from), list });
        if (RESOURCE_IDS.some((r) => e.lost[r] >= 1)) pushToast('info', 'delivery.lostSome');
        break;
      }
      case 'repaired':
        pushToast('success', 'events.repaired', { name: `@buildings.${e.buildingType}.name` });
        break;
      case 'beaconAttackAnnounced':
        pushToast('error', 'beacons.toast.announced', {
          name: sectorKey(e.sector),
          duration: formatDuration(uiStore.getState().lang, e.strikeAt - e.at),
        });
        break;
      case 'beaconAttacked':
        if (e.held) pushToast('success', 'beacons.toast.held', { name: sectorKey(e.sector) });
        else if (e.fought)
          pushToast('error', 'beacons.toast.fell', { name: sectorKey(e.sector), dead: e.dead });
        else pushToast('error', 'beacons.toast.fellBare', { name: sectorKey(e.sector) });
        break;
      case 'queenEmerged':
        pushToast('error', 'queen.toast.out');
        // Chantier 42: the short scene of her rise on the twin (after the landing on show).
        if (Math.abs(uiStore.getState().now - e.at) < LIVE_LANDING_MS) {
          if (!uiStore.getState().landingInvite && uiStore.getState().visit === null)
            actions.travelTo('twin');
          renderer.playQueenRise();
        }
        break;
      case 'beaconFortified':
        pushToast('success', 'beacons.toast.fortified', { name: sectorKey(e.sector) });
        break;
      case 'doorFortified':
        pushToast('success', 'depths.toast.fortified');
        break;
      case 'waveAnnounced':
        pushToast('error', e.tunnel ? 'depths.toast.upwell' : 'threats.announced', {
          duration: formatDuration(uiStore.getState().lang, e.strikeAt - e.at),
        });
        break;
      case 'waveStruck':
        // Chantier 48: the closed door held an upwelling back (no battle to watch).
        if (e.held) pushToast('success', 'depths.toast.held');
        // Chantier 36: watched live, the outcome is told at the end of the battle show.
        else if (isLiveWave(e.at, uiStore.getState().now)) holdOutcome(e.waveId, e.victory);
        else {
          pushToast(e.victory ? 'success' : 'error', e.victory ? 'threats.won' : 'threats.lost');
          uiStore.setState({ unreadWave: e.waveId });
        }
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
          iron: e.iron,
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
      case 'ironFull':
        pushToast('info', 'iron.full');
        break;
      case 'itemForged':
        pushToast('success', 'forge.forged', { item: `@gear.items.${e.item}` });
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
        if (e.iron) pushToast('success', 'iron.wreck', { iron: e.iron });
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
