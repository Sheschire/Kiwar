import { hexToPixel, type Command, type GameEvent } from '@kiwar/shared';
import { audio, type SoundPosition } from './engine';
import { uiStore } from '../ui/store';

const at = (q: number, r: number): SoundPosition => {
  const p = hexToPixel({ q, r });
  return { x: p.x, z: p.y };
};

/**
 * A kiwi's own voice pitch (semitones): sturdy kiwis (Strength, Endurance) sound lower, agile
 * ones higher, plus a small offset of its own (from its id) so voices stay varied.
 */
export function kiwiVoicePitch(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const own = (((h >>> 0) % 1000) / 1000) * 3 - 1.5;
  const v = uiStore.getState().game?.villagers.find((x) => x.id === id);
  if (!v) return own * 2;
  const build = v.stats.agility - (v.stats.strength + v.stats.endurance) / 2;
  return Math.max(-5, Math.min(5, own + build * 0.6));
}

export function kiwiSpeaks(id: string, pos?: SoundPosition): void {
  audio.play('kiwi.voice', { pos, pitchOffset: kiwiVoicePitch(id) });
}

/** Simulation events → sounds. */
export function playGameEventSounds(events: GameEvent[]): void {
  for (const e of events) {
    switch (e.type) {
      case 'constructionComplete':
        audio.play(e.level === 1 ? 'build.complete' : 'build.upgrade', { pos: at(e.q, e.r) });
        break;
      case 'hatched':
        audio.play('egg.hatch');
        if (e.shiny) window.setTimeout(() => audio.play('kiwi.shiny'), 350);
        window.setTimeout(() => kiwiSpeaks(e.villagerId), 650);
        break;
      case 'levelUp':
        audio.play('kiwi.levelUp');
        break;
      case 'masteryUp':
        audio.play('kiwi.mastery');
        break;
      case 'trained':
        audio.play('kiwi.levelUp');
        break;
      case 'storageFull':
        audio.play('storage.full');
        break;
      case 'foodRanOut':
      case 'starved':
        audio.play('colony.hunger');
        break;
      case 'hungerChanged':
        if (e.stage !== 'fed') audio.play('colony.hunger');
        break;
      case 'expeditionArrived':
        audio.play('ship.arrive');
        break;
      case 'expeditionReturned':
        audio.play('ship.return');
        break;
      default:
        break;
    }
  }
}

/** Accepted player commands → sounds (the simulation has no event for these). */
export function playCommandSound(cmd: Command): void {
  switch (cmd.type) {
    case 'build':
      audio.play('build.start', { pos: at(cmd.q, cmd.r) });
      break;
    case 'upgrade':
      audio.play('build.start');
      break;
    case 'cancel':
    case 'demolish':
    case 'dismantle':
    case 'removePath':
      audio.play('build.remove');
      break;
    case 'gather':
      audio.play('harvest.gather', { pos: at(cmd.q, cmd.r) });
      break;
    case 'hatchEgg':
      audio.play('egg.lay');
      break;
    case 'launchExpedition':
      audio.play('ship.launch');
      break;
    case 'buildPath':
      audio.play('path.paint');
      break;
    case 'useSkill':
      audio.play('kiwi.levelUp');
      break;
    default:
      break;
  }
}
