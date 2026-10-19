import { hexToPixel, type Command, type GameEvent } from '@kiwar/shared';
import { audio, type SoundPosition } from './engine';

const at = (q: number, r: number): SoundPosition => {
  const p = hexToPixel({ q, r });
  return { x: p.x, z: p.y };
};

/**
 * A kiwi's own voice pitch (semitones), stable for a given id. Chantier 03 (individual kiwis)
 * can derive it from real traits instead.
 */
export function kiwiVoicePitch(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 1000) / 1000) * 8 - 4;
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
        window.setTimeout(() => kiwiSpeaks(e.villagerId), 650);
        break;
      case 'storageFull':
        audio.play('storage.full');
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
    default:
      break;
  }
}
