import {
  buildingAt,
  hexKey,
  pathLimit,
  PATHS,
  queuedBuildAt,
  TILES,
  type Command,
  type Face,
  type Tile,
} from '@kiwar/shared';
import type { GameController } from '../game/GameController';
import type { GameRenderer } from '../render/GameRenderer';
import { saveQualityChoice, type QualityChoice } from '../render/quality';
import { uiStore } from './store';
import { audio } from '../audio/engine';
import { playCommandSound } from '../audio/sounds';
import type { AudioSettings } from '../audio/settings';

const NAME_KEY = 'kiwar.displayName';

export function savedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // ignore
  }
}

let controller: GameController | null = null;
let renderer: GameRenderer | null = null;

/** Wires the UI to the controller and renderer (called once at startup). */
export function bindActions(c: GameController, r: GameRenderer): void {
  controller = c;
  renderer = r;
}

export const actions = {
  dispatch(cmd: Command): boolean {
    const ok = controller?.dispatch(cmd) ?? false;
    if (ok) playCommandSound(cmd);
    return ok;
  },
  setAudio(patch: Partial<AudioSettings>): void {
    audio.setSettings(patch);
  },
  selectTile(tile: Tile | null): void {
    uiStore.setState({ selectedTile: tile });
  },
  setPathMode(on: boolean): void {
    renderer?.setPaintMode(on);
    uiStore.setState(on ? { pathMode: true, selectedTile: null } : { pathMode: false });
  },
  /** Sends a painted stroke as path commands (only the tiles that would change). */
  paintPaths(tiles: Tile[], erase: boolean): void {
    const game = uiStore.getState().game;
    if (!game) return;
    const existing = new Set(game.paths);
    let todo = erase
      ? tiles.filter((t) => existing.has(hexKey(t)))
      : tiles.filter(
          (t) =>
            !existing.has(hexKey(t)) &&
            TILES[t.type].walkable &&
            !buildingAt(game, t.q, t.r) &&
            !queuedBuildAt(game, t.q, t.r),
        );
    if (!erase) todo = todo.slice(0, Math.max(0, pathLimit(game) - game.paths.length) || 1);
    for (let i = 0; i < todo.length; i += PATHS.maxPerCommand) {
      const batch = todo.slice(i, i + PATHS.maxPerCommand).map((t) => ({ q: t.q, r: t.r }));
      const cmd: Command = { type: erase ? 'removePath' : 'buildPath', tiles: batch };
      const ok = controller?.dispatch(cmd);
      if (!ok) break;
      if (i === 0) playCommandSound(cmd);
    }
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
  async listUniverses() {
    return (await controller?.listUniverses()) ?? [];
  },
  async enterUniverse(how: { create: string } | { code: string }, displayName: string) {
    saveDisplayName(displayName);
    const error = controller ? await controller.enterUniverse(how, displayName) : 'forbidden';
    if (!error) uiStore.setState({ modal: 'none', pendingJoin: null, selectedTile: null });
    return error;
  },
  refreshUniverse(): void {
    void controller?.refreshUniverse();
  },
  async switchUniverse(id: string): Promise<boolean> {
    const ok = (await controller?.switchUniverse(id)) ?? false;
    if (ok) uiStore.setState({ modal: 'none', selectedTile: null });
    return ok;
  },
  newWorld(seed: string, face: Face): void {
    controller?.newWorld(seed, face);
    uiStore.setState({ selectedTile: null, timeScale: 1, offlineSummary: null });
  },
};
