import {
  buildingAt,
  obstacleAt,
  hexKey,
  isLaunchpadBusy,
  pathLimit,
  PATHS,
  queuedBuildAt,
  TILES,
  type Command,
  otherFace,
  type Face,
  type Tile,
} from '@kiwar/shared';
import type { GameController } from '../game/GameController';
import type { GameRenderer } from '../render/GameRenderer';
import { saveQualityChoice, type QualityChoice } from '../render/quality';
import { pushToast, uiStore } from './store';
import { startIntro } from './intro';
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

/**
 * A new colony in a shared universe: the intro shows our kiwi; the player keeps the face they
 * were given or moves to the other one if nobody lives there (chantier 05).
 */
function joinIntro(c: GameController): void {
  const s = c.state;
  const info = uiStore.getState().universe;
  const kiwi = Number(s.kiwiId.replace(/^k/, ''));
  const twin = otherFace(s.face);
  const holder = info?.members.find((m) => m.kiwiIndex === kiwi && m.face === twin);
  startIntro({
    mode: 'join',
    seed: s.seed,
    focus: s.face,
    taken: holder ? { [twin]: holder.displayName } : {},
    onChoose: (face) => {
      if (face === s.face) return;
      void c.pickFace(face).then((err) => {
        if (err) pushToast('error', `errors.${err}`);
      });
    },
  });
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
            !queuedBuildAt(game, t.q, t.r) &&
            !obstacleAt(game, t.q, t.r),
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
  /** Opens the village screen, on a kiwi's sheet if given. */
  openVillage(kiwiId: string | null = null): void {
    uiStore.setState({ modal: 'village', kiwiId, villageTab: 'kiwis', selectedTile: null });
    renderer?.highlightKiwi(kiwiId);
  },
  showKiwi(kiwiId: string | null): void {
    uiStore.setState({ kiwiId });
    renderer?.highlightKiwi(kiwiId);
  },
  closeVillage(): void {
    uiStore.setState({ modal: 'none', kiwiId: null });
    renderer?.highlightKiwi(uiStore.getState().followId);
  },
  /** The camera follows a kiwi until the player moves it (or stops following). */
  followKiwi(id: string | null): void {
    uiStore.setState(id ? { followId: id, modal: 'none', selectedTile: null } : { followId: null });
    renderer?.followKiwi(id);
    renderer?.highlightKiwi(id);
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
  async enterUniverse(
    how: { create: string; fromSolo?: boolean } | { code: string; fromSolo?: boolean },
    displayName: string,
  ) {
    saveDisplayName(displayName);
    const error = controller ? await controller.enterUniverse(how, displayName) : 'forbidden';
    if (!error) {
      uiStore.setState({ modal: 'none', pendingJoin: null, selectedTile: null });
      if (controller && !controller.hasProgress()) joinIntro(controller);
    }
    return error;
  },
  /** Back home, then the launchpad's delivery screen pointed at this ally. */
  prepareDelivery(friendId: string): boolean {
    const game = uiStore.getState().game;
    const pad = game?.buildings.find(
      (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(game, b.id),
    );
    if (!pad) return false;
    actions.visitAlly(null);
    uiStore.setState({ modal: 'expedition', expeditionPad: pad.id, deliverTo: friendId });
    return true;
  },
  /** Flies the camera to an ally's planet (read-only), or back home with null. */
  visitAlly(kiwiIndex: number | null): void {
    if (!renderer?.visitAlly(kiwiIndex)) return;
    uiStore.setState({ visit: kiwiIndex, modal: 'none', selectedTile: null });
    audio.play('ui.click');
  },
  async setAllowImports(allow: boolean) {
    return controller ? await controller.setAllowImports(allow) : 'forbidden';
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
