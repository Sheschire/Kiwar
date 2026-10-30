import { battleStore } from './battleStore';
import {
  canalError,
  footprintOf,
  buildingAt,
  canCollect,
  hexToPixel,
  reserveHolders,
  RESOURCE_IDS,
  type BuildingId,
  obstacleAt,
  pathBlockedAt,
  titanAt,
  hexKey,
  isLaunchpadBusy,
  pathLimit,
  pathLogisticsChanges,
  PATHS,
  TILES,
  tunnelOf,
  type BuildingType,
  type Command,
  otherFace,
  type Face,
  type GameState,
  type Tile,
} from '@kiwar/shared';
import type { ClientError, GameController } from '../game/GameController';
import { firstRotation, placementError } from '../game/placement';
import { tellLanding, watchable } from '../game/landingWatch';
import type { GameRenderer } from '../render/GameRenderer';
import { saveQualityChoice, type QualityChoice } from '../render/quality';
import { formatNumber } from '../i18n/i18n';
import { saveFpsCap, type FpsCap } from '../render/frameLimiter';
import type { PlanetRef } from '../render/space';
import { pushToast, saveShowLevels, uiStore, type SiegePlan } from './store';
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

/** Tiles of a painted stroke that would change (paths to add, or to erase). */
function strokeTiles(game: GameState, tiles: Tile[], erase: boolean): Tile[] {
  const existing = new Set(game.paths);
  if (erase) return tiles.filter((t) => existing.has(hexKey(t)));
  const todo = tiles.filter(
    (t) =>
      !existing.has(hexKey(t)) &&
      TILES[t.type].walkable &&
      !pathBlockedAt(game, t.q, t.r) &&
      !obstacleAt(game, t.q, t.r) &&
      !titanAt(game, t.q, t.r),
  );
  return todo.slice(0, Math.max(0, pathLimit(game) - game.paths.length) || 1);
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

/** Ctrl / Cmd held on a keyboard: placing a building keeps it in hand (decorations…). */
let repeatHeld = false;
if (typeof window !== 'undefined') {
  const track = (e: KeyboardEvent) => {
    repeatHeld = e.ctrlKey || e.metaKey;
  };
  window.addEventListener('keydown', track);
  window.addEventListener('keyup', track);
  window.addEventListener('blur', () => {
    repeatHeld = false;
  });
}

export const actions = {
  dispatch(cmd: Command): boolean {
    const ok = controller?.dispatch(cmd) ?? false;
    if (ok) playCommandSound(cmd);
    return ok;
  },
  /**
   * Chantier 30: brings a warehouse's reserve back (null: every warehouse), with "+1 250"
   * labels over each warehouse and a little cascade of notes.
   */
  collect(buildingId: BuildingId | null): boolean {
    const before = controller?.state;
    if (!before) return false;
    const ok = controller!.dispatch(
      buildingId ? { type: 'collect', buildingId } : { type: 'collectAll' },
    );
    const after = controller!.state;
    if (!ok) return false;
    const lang = uiStore.getState().lang;
    for (const b of reserveHolders(before)) {
      const now = after.buildings.find((x) => x.id === b.id);
      if (!now) continue;
      const labels = RESOURCE_IDS.flatMap((id) => {
        const moved = Math.floor((b.reserve?.[id] ?? 0) - (now.reserve?.[id] ?? 0));
        return moved >= 1 ? [{ resource: id, text: `+${formatNumber(lang, moved)}` }] : [];
      });
      if (labels.length === 0) continue;
      renderer?.showCollected(b.id, labels);
      const p = hexToPixel(b);
      audio.play('warehouse.collect', { pos: { x: p.x, z: p.y } });
    }
    return true;
  },
  /** Chantier 30: a tap on a warehouse with something to bring back collects it at once. */
  collectAt(tile: Tile): void {
    const game = controller?.state;
    const b = game ? buildingAt(game, tile.q, tile.r) : undefined;
    if (game && b && canCollect(game, b)) actions.collect(b.id);
  },
  setAudio(patch: Partial<AudioSettings>): void {
    audio.setSettings(patch);
  },
  selectTile(tile: Tile | null): void {
    uiStore.setState({ selectedTile: tile });
  },
  /** Chantier 11: the building tree's "Place" — the valid tiles light up, a tap builds. */
  startPlacing(type: BuildingType): void {
    const { game, map } = uiStore.getState();
    if (!game || !map) return;
    // Chantier 35: a big building starts with an orientation that fits somewhere.
    const rot = firstRotation(game, map, type);
    if (rot === null) {
      pushToast('info', 'plans.noTile');
      return;
    }
    if (uiStore.getState().pathMode) actions.setPathMode(false);
    uiStore.setState({
      placing: type,
      placingTile: null,
      placingPinned: false,
      placingRot: rot,
      modal: 'none',
      selectedTile: null,
    });
  },
  toggleLevels(): void {
    const on = !uiStore.getState().showLevels;
    saveShowLevels(on);
    uiStore.setState({ showLevels: on });
  },
  toggleLogistics(): void {
    uiStore.setState((s) => ({ showLogistics: !s.showLogistics }));
  },
  /** Chantier 35: a big building chosen in a tile's sheet — the ghost waits there to turn. */
  placeFrom(type: BuildingType, tile: Tile, rot: number): void {
    if (uiStore.getState().pathMode) actions.setPathMode(false);
    uiStore.setState({
      placing: type,
      placingTile: tile,
      placingPinned: true,
      placingRot: rot,
      modal: 'none',
      selectedTile: null,
    });
  },
  /** Chantier 35: turns the triangle being placed (key R, "Turn" button). */
  rotatePlacement(): void {
    const s = uiStore.getState();
    if (!s.placing || footprintOf(s.placing) !== 3) return;
    uiStore.setState({ placingRot: (s.placingRot + 1) % 6 });
  },
  stopPlacing(): void {
    uiStore.setState({ placing: null, placingTile: null, placingPinned: false });
  },
  /** Chantier 16: the mouse points at another tile while placing (the ghost follows). */
  pointPlacement(tile: Tile | null): void {
    const s = uiStore.getState();
    if (s.digMode) uiStore.setState({ digTile: tile });
    if (s.placing && !s.placingPinned) uiStore.setState({ placingTile: tile });
  },
  /** Chantier 16, on a phone: a tap moves the ghost there; "Build here" confirms. */
  pinPlacement(tile: Tile): void {
    if (uiStore.getState().placing) uiStore.setState({ placingTile: tile, placingPinned: true });
  },
  confirmPlacement(): void {
    const tile = uiStore.getState().placingTile;
    if (tile) actions.placeAt(tile);
  },
  /** A tap while placing: builds on a valid tile (then shows its site), ignores the others. */
  placeAt(tile: Tile): void {
    const { game, map, placing, placingRot: rot } = uiStore.getState();
    if (!game || !map || !placing) return;
    if (placementError(game, map, placing, tile, rot) !== null) return;
    const ok = actions.dispatch({
      type: 'build',
      buildingType: placing,
      q: tile.q,
      r: tile.r,
      ...(footprintOf(placing) === 3 ? { rot } : {}),
    });
    // Ctrl (or Cmd) held: the same building stays in hand to place it again.
    if (ok && repeatHeld) return;
    const done = { placing: null, placingTile: null, placingPinned: false };
    uiStore.setState(ok ? { ...done, selectedTile: tile } : done);
  },
  /** Chantier 45: the dig mode (taps dig a canal; ends placing and path painting). */
  setDigMode(on: boolean): void {
    if (on && uiStore.getState().pathMode) actions.setPathMode(false);
    renderer?.setDigMode(on);
    uiStore.setState(
      on
        ? {
            digMode: true,
            digTile: null,
            selectedTile: null,
            placing: null,
            placingTile: null,
            placingPinned: false,
          }
        : { digMode: false, digTile: null },
    );
  },
  /** A tap in dig mode: digs the tile if it can, otherwise says why. */
  digAt(tile: Tile): void {
    const { game, map } = uiStore.getState();
    if (!game || !map) return;
    uiStore.setState({ digTile: tile });
    const error = canalError(game, map, tile.q, tile.r);
    if (error) {
      if (error !== 'notFlesh') pushToast('error', `errors.${error}`);
      return;
    }
    actions.dispatch({ type: 'digCanal', q: tile.q, r: tile.r });
  },
  setPathMode(on: boolean): void {
    if (on && uiStore.getState().digMode) actions.setDigMode(false);
    renderer?.setPaintMode(on);
    uiStore.setState(
      on
        ? {
            pathMode: true,
            selectedTile: null,
            placing: null,
            placingTile: null,
            placingPinned: false,
            pathGains: null,
          }
        : { pathMode: false, pathGains: null },
    );
  },
  /** Sends a painted stroke as path commands (only the tiles that would change). */
  paintPaths(tiles: Tile[], erase: boolean): void {
    const game = uiStore.getState().game;
    if (!game) return;
    const todo = strokeTiles(game, tiles, erase);
    for (let i = 0; i < todo.length; i += PATHS.maxPerCommand) {
      const batch = todo.slice(i, i + PATHS.maxPerCommand).map((t) => ({ q: t.q, r: t.r }));
      const cmd: Command = { type: erase ? 'removePath' : 'buildPath', tiles: batch };
      const ok = controller?.dispatch(cmd);
      if (!ok) break;
      if (i === 0) playCommandSound(cmd);
    }
  },
  /**
   * Chantier 12: what the stroke being painted does to the producers' logistics (kept after
   * the stroke ends, until the next one or the end of path mode).
   */
  previewPaths(tiles: Tile[], erase: boolean): void {
    const { game, map } = uiStore.getState();
    if (!game || !map || tiles.length === 0) return;
    const keys = strokeTiles(game, tiles, erase).map((t) => hexKey(t));
    uiStore.setState({ pathGains: pathLogisticsChanges(game, map, keys, erase) });
  },
  /** Opens the village screen, on a kiwi's sheet if given. */
  /** Chantier 36: replays the battle of a wave from its report (the window closes). */
  replayBattle(reportId: string): void {
    if (!renderer?.playBattle(reportId, 0)) return;
    uiStore.setState({ modal: 'none' });
  },
  battleRewind(): void {
    renderer?.battleSeek(0);
  },
  battleSpeed(speed: 1 | 2 | 4): void {
    renderer?.battleSpeed(speed);
    battleStore.setState({ speed });
  },
  /** Ends the show now (a live wave's outcome is told). */
  battleSkip(): void {
    renderer?.battleSkip();
  },
  /** Chantier 41: a preset framing of a landing on show. */
  battleFrame(kind: 'field' | 'melee' | 'ship'): void {
    renderer?.battleFrame(kind);
  },
  battleUnit(index: number | null): void {
    renderer?.battleSelect(index);
  },
  openVillage(kiwiId: string | null = null): void {
    uiStore.setState({ modal: 'village', kiwiId, villageTab: 'kiwis', selectedTile: null });
    renderer?.highlightKiwi(kiwiId);
  },
  /** Opens the village screen on the job board (who works where). */
  openPosts(): void {
    uiStore.setState({ modal: 'village', kiwiId: null, villageTab: 'posts', selectedTile: null });
    renderer?.highlightKiwi(null);
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
  focusNest(): void {
    renderer?.focusNest();
  },
  /** Chantier 32: turns the camera towards the comet in the sky. */
  lookAtComet(): void {
    renderer?.lookAtComet();
  },
  setQuality(choice: QualityChoice): void {
    saveQualityChoice(choice);
    renderer?.setQuality(choice);
    uiStore.setState({ qualityChoice: choice });
  },
  setFpsCap(cap: FpsCap): void {
    saveFpsCap(cap);
    renderer?.setFpsCap(cap);
    uiStore.setState({ fpsCap: cap });
  },
  setTimeScale(scale: number): void {
    controller?.setTimeScale(scale);
    uiStore.setState({ timeScale: scale });
  },
  /** Account actions (online mode only). Errors are returned for display. */
  async account(
    op: 'linkGoogle' | 'linkEmail' | 'signInGoogle' | 'signInEmail' | 'signOut',
    email?: string,
  ): Promise<{ message: string; code?: string } | null> {
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
      const code = (e as { code?: unknown } | null)?.code;
      return {
        message: e instanceof Error ? e.message : String(e),
        ...(typeof code === 'string' ? { code } : {}),
      };
    }
  },
  /** After signing in from a guest: which solo colony the account keeps. */
  async keepColony(keep: 'guest' | 'account'): Promise<void> {
    await controller?.keepColony(keep);
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
    actions.travelTo(null);
    uiStore.setState({ modal: 'expedition', expeditionPad: pad.id, deliverTo: friendId });
    return true;
  },
  /** Chantier 19: the planner of a free launchpad, set to a siege mission. */
  planSiege(plan: SiegePlan): boolean {
    const game = uiStore.getState().game;
    const pad = game?.buildings.find(
      (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(game, b.id),
    );
    if (!pad) {
      pushToast('error', 'siege.noShip');
      return false;
    }
    uiStore.setState({
      modal: 'expedition',
      expeditionPad: pad.id,
      deliverTo: null,
      siegePlan: plan,
    });
    return true;
  },
  /**
   * Chantier 24: back home, then the launchpad's expedition planner (the twin is its first
   * target). False without a free launchpad.
   */
  prepareExpedition(): boolean {
    const game = uiStore.getState().game;
    const pad = game?.buildings.find(
      (b) => b.type === 'launchpad' && !b.damaged && !isLaunchpadBusy(game, b.id),
    );
    if (!pad) return false;
    actions.travelTo(null);
    uiStore.setState({ modal: 'expedition', expeditionPad: pad.id, deliverTo: null });
    return true;
  },
  /**
   * Chantier 24: flies the camera to a far planet (the twin, or a member's by kiwi index; read
   * only), or back home with null.
   */
  travelTo(planet: PlanetRef | null): void {
    if (!renderer?.travelTo(planet)) return;
    const watched = uiStore.getState().watchingLanding;
    if (watched) tellLanding(watched);
    uiStore.setState({
      visit: planet,
      watchingLanding: null,
      planetCard: null,
      planetsOpen: false,
      modal: 'none',
      selectedTile: null,
    });
    audio.play('ui.click');
  },
  /**
   * Chantier 41: flies to the twin and frames the parcel of a landing (its battle plays there).
   * False when it cannot be watched (a face not drawn, no journal).
   */
  watchLanding(expeditionId: string, live = true): boolean {
    const game = uiStore.getState().game;
    const e = game?.expeditions.find((x) => x.id === expeditionId);
    if (!game || !e || !watchable(game, e) || !renderer?.travelTo('twin', e.sector)) return false;
    if (!renderer.playLanding(e.id, live)) {
      renderer.travelTo(null);
      return false;
    }
    uiStore.setState({
      visit: 'twin',
      landingInvite: null,
      watchingLanding: e.id,
      planetCard: null,
      planetsOpen: false,
      modal: 'none',
      selectedTile: null,
    });
    audio.play('ui.click');
    return true;
  },
  /** Chantier 41: "Later": the landing's outcome is told now (its report keeps the replay). */
  declineLanding(): void {
    const id = uiStore.getState().landingInvite;
    uiStore.setState({ landingInvite: null });
    tellLanding(id);
  },
  /**
   * Chantier 49: the depths in a cut — a quarter of the dome opens and the camera goes down
   * along it. Only with the tunnel standing.
   */
  openCut(): boolean {
    const game = uiStore.getState().game;
    if (!game || !tunnelOf(game) || game.colony.index !== 0) return false;
    if (uiStore.getState().visit !== null) actions.travelTo(null);
    if (!renderer?.openCut()) return false;
    uiStore.setState({ modal: 'none', selectedTile: null, planetCard: null, planetsOpen: false });
    audio.play('ui.click');
    return true;
  },
  closeCut(): void {
    renderer?.closeCut();
  },
  /** Chantier 24: the small card of a tapped planet ("Go there"), or none. */
  showPlanetCard(planet: PlanetRef | null): void {
    uiStore.setState({ planetCard: planet, planetsOpen: false });
  },
  togglePlanets(open?: boolean): void {
    uiStore.setState((s) => ({ planetsOpen: open ?? !s.planetsOpen, planetCard: null }));
  },
  async setAllowImports(allow: boolean) {
    return controller ? await controller.setAllowImports(allow) : 'forbidden';
  },
  refreshUniverse(): void {
    void controller?.refreshUniverse();
  },
  /** Chantier 19: plays the other colony (home or the sister on the twin face). */
  async switchColony(colony: 0 | 1): Promise<boolean> {
    actions.travelTo(null);
    const ok = (await controller?.switchColony(colony)) ?? false;
    if (ok) uiStore.setState({ modal: 'none', selectedTile: null, visit: null });
    return ok;
  },
  async switchUniverse(id: string): Promise<ClientError | null> {
    const error = controller ? await controller.switchUniverse(id) : 'forbidden';
    if (!error) uiStore.setState({ modal: 'none', selectedTile: null });
    return error;
  },
  newWorld(seed: string, face: Face): void {
    controller?.newWorld(seed, face);
    uiStore.setState({ selectedTile: null, timeScale: 1, offlineSummary: null });
  },
};
