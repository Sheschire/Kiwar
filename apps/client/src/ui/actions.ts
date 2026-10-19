import type { Command, Face, Tile } from '@kiwar/shared';
import type { GameController } from '../game/GameController';
import type { GameRenderer } from '../render/GameRenderer';
import { saveQualityChoice, type QualityChoice } from '../render/quality';
import { uiStore } from './store';

let controller: GameController | null = null;
let renderer: GameRenderer | null = null;

/** Wires the UI to the controller and renderer (called once at startup). */
export function bindActions(c: GameController, r: GameRenderer): void {
  controller = c;
  renderer = r;
}

export const actions = {
  dispatch(cmd: Command): boolean {
    return controller?.dispatch(cmd) ?? false;
  },
  selectTile(tile: Tile | null): void {
    uiStore.setState({ selectedTile: tile });
  },
  focusTile(tile: Tile): void {
    renderer?.focusTile(tile);
  },
  recenter(): void {
    renderer?.recenter();
  },
  setQuality(choice: QualityChoice): void {
    saveQualityChoice(choice);
    renderer?.setQuality(choice);
    uiStore.setState({ qualityChoice: choice });
  },
  setTimeScale(scale: number): void {
    controller?.setTimeScale(scale);
    uiStore.setState({ timeScale: scale });
  },
  /** Account actions (online mode only). Errors are returned for display. */
  async account(
    op: 'linkGoogle' | 'linkEmail' | 'signInGoogle' | 'signInEmail' | 'signOut',
    email?: string,
  ): Promise<string | null> {
    const backend = controller?.online;
    if (!backend) return null;
    try {
      if (op === 'linkGoogle') await backend.linkGoogle();
      else if (op === 'linkEmail') await backend.linkEmail(email ?? '');
      else if (op === 'signInGoogle') await backend.signInWithGoogle();
      else if (op === 'signInEmail') await backend.signInWithEmail(email ?? '');
      else {
        await backend.signOut();
        window.location.reload();
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },
  newWorld(seed: string, face: Face): void {
    controller?.newWorld(seed, face);
    uiStore.setState({ selectedTile: null, timeScale: 1, offlineSummary: null });
  },
};
