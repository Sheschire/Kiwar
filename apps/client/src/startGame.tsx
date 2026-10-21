// Game entry (loaded by main.tsx unless the admin space is requested).
import { render } from 'preact';
import {
  generateFace,
  buildableTiles,
  depotDistance,
  HARVESTS,
  isTurret,
  logisticsEfficiency,
  getTile,
  terraformKey,
  otherFace,
  twinParams,
  ageOf,
  hexKey,
  type GameState,
  type TwinSnapshot,
} from '@kiwar/shared';
import { placementError, placementPlan } from './game/placement';
import { App } from './ui/App';
import { Guard } from './ui/components/Guard';
import { GameRenderer } from './render/GameRenderer';
import { GameController } from './game/GameController';
import { persistLang, translate } from './i18n/i18n';
import { pushToast, uiStore } from './ui/store';
import { actions, bindActions } from './ui/actions';
import { bindIntro, introSeen, startIntro } from './ui/intro';
import { clearUrlParams, randomSeed, readUrlParams } from './game/urlParams';
import { gpuRendererName, loadQualityChoice } from './render/quality';
import { loadFpsCap } from './render/frameLimiter';
import { installPerfProbe, perfStore, recordTick } from './ui/perfProbe';
import { viewStore } from './ui/viewStore';
import { handleGameEvents } from './game/events';
import { ChatChannel, mutedUsers } from './game/chat';
import { setChannel } from './ui/chatActions';
import { audio } from './audio/engine';
import { installGameAudio } from './audio/gameAudio';
import { kiwiSpeaks } from './audio/sounds';

persistLang(uiStore.getState().lang);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const qualityChoice = loadQualityChoice();
const fpsCap = loadFpsCap();
uiStore.setState({ qualityChoice, fpsCap });
installPerfProbe(gpuRendererName());
// `?debug` opens the debug panel (frame timing to share when the game feels slow).
if (new URLSearchParams(window.location.search).has('debug')) uiStore.setState({ debugOpen: true });

// eslint-disable-next-line prefer-const -- assigned right after the renderer (circular wiring)
let controller: GameController;
const renderer = new GameRenderer(
  canvas,
  {
    now: () => controller?.now() ?? 0,
    afterFrame: () => afterFrame(),
    // Chantier 16: placing with a finger takes two steps (tap moves the ghost, then confirm).
    onTileTap: (tile, touch) => {
      if (!uiStore.getState().placing || !tile) actions.selectTile(tile);
      else if (touch) actions.pinPlacement(tile);
      else actions.placeAt(tile);
    },
    onPlacementHover: (tile) => actions.pointPlacement(tile),
    onPaint: (tiles, erase) => actions.paintPaths(tiles, erase),
    onPaintPreview: (tiles, erase) => actions.previewPaths(tiles, erase),
    onStats: (frame) => perfStore.setState({ frame }),
    onAzimuth: (azimuth) => viewStore.setState({ azimuth }),
    onQualityChange: (preset) => uiStore.setState({ qualityPreset: preset }),
    onAllyTap: (kiwiIndex) => actions.visitAlly(kiwiIndex),
    onKiwiTap: (id, pos) => {
      kiwiSpeaks(id, pos);
      actions.openVillage(id);
    },
    onFollowEnd: () => {
      uiStore.setState({ followId: null });
      renderer.highlightKiwi(null);
    },
  },
  qualityChoice,
);
renderer.setFpsCap(fpsCap);

/** Friend on the twin face, as last reported by the server (shared universes). */
let friend: TwinSnapshot | null = null;
let twinKey = '';

/** The other half of our kiwi above us: a friend's colony, or aliens under fog. */
function showTwin(state: GameState): void {
  const twinFace = otherFace(state.face);
  const f = friend?.face === twinFace ? friend : null;
  const params = f?.params ?? twinParams(state.seed, state.face, state.params);
  // Alien twin: the clouds part where our scouts went (chantier 07).
  const target = state.targets.find((t) => t.distance === 0 && t.face === twinFace);
  const intel = (!f && target && state.intel[target.id]) || null;
  const seen = intel ? `${intel.sectors.join('.')}/${intel.structures.length}` : '';
  const lang = uiStore.getState().lang;
  const key = `${state.seed}|${twinFace}|${params.biome}|${f ? `${f.owner}@${f.at}` : 'fog'}|${seen}|${lang}`;
  if (key === twinKey) return;
  twinKey = key;
  try {
    renderer.setTwin(generateFace(state.seed, twinFace, params), {
      fog: !f,
      friend: f,
      intel,
      caption: translate(lang, 'compass.twin'),
    });
  } catch (e) {
    // The twin is scenery: a broken snapshot must never block the colony.
    console.error(e);
    renderer.setTwin(null);
  }
}

/** The other players' planets, far away around ours. */
function showAllies(): void {
  const { allies, visit } = uiStore.getState();
  const mine = Number(controller.state?.kiwiId.replace(/^k/, ''));
  try {
    renderer.setAllies(allies, Number.isFinite(mine) ? mine : 0);
  } catch (e) {
    console.error(e);
  }
  if (visit !== null && renderer.visitedAlly === null) uiStore.setState({ visit: null });
}

/** The face on screen: reloading the same one (back from a break) keeps the view as it is. */
let worldKey = '';
/** Tiles reshaped by the Kikiwiwis on screen (chantier 08): redrawn in place. */
let shapeKey = '';

/** A tick's state waiting for the next frame to reach the interface. */
let pendingUi: { state: GameState; now: number; advance: number; scene: number } | null = null;

/** Hands a state to the interface (slow widgets once a second, or at once after an action). */
function publishState(state: GameState, now: number, fromTick: boolean): void {
  const ui = uiStore.getState();
  const slow =
    !fromTick || !ui.slowGame || Math.floor(now / 1000) !== Math.floor(ui.slowNow / 1000);
  uiStore.setState(
    slow ? { game: state, now, slowGame: state, slowNow: now } : { game: state, now },
  );
}

/** After each animation frame: the interface half of a tick, or the next tick when due. */
function afterFrame(): void {
  if (!controller) return;
  const p = pendingUi;
  if (p) {
    pendingUi = null;
    const t = performance.now();
    publishState(p.state, p.now, true);
    recordTick(p.advance, p.scene, performance.now() - t);
    return;
  }
  controller.tickIfDue();
}

controller = new GameController({
  onWorld: (map, state) => {
    const key = `${map.seed}|${map.face}|${JSON.stringify(map.params)}`;
    const shape = terraformKey(state);
    if (key !== worldKey) {
      worldKey = key;
      shapeKey = shape;
      renderer.setFace(map);
      twinKey = '';
      uiStore.setState({ selectedTile: null, visit: null });
    } else if (shape !== shapeKey) {
      shapeKey = shape;
      renderer.reshape(map);
      // The twin half is rebuilt with the scene.
      twinKey = '';
      // The selected tile is the new one (its type may have changed).
      const sel = uiStore.getState().selectedTile;
      if (sel) {
        const tile = getTile(map, sel) ?? null;
        uiStore.setState({ selectedTile: tile });
        renderer.setSelectedTile(tile);
      }
    }
    showTwin(state);
    renderer.setGameState(state);
    uiStore.setState({ map, game: state, slowGame: state, slowNow: controller.now() });
    showAllies();
  },
  onState: (state, now) => {
    const t0 = performance.now();
    renderer.setGameState(state);
    showTwin(state);
    const scene = performance.now() - t0;
    const advance = controller.lastAdvanceMs;
    controller.lastAdvanceMs = 0;
    if (controller.ticking) {
      // A tick: the interface follows one frame later, so the two halves of the work land
      // in two frames instead of one.
      pendingUi = { state, now, advance, scene };
      return;
    }
    pendingUi = null;
    publishState(state, now, false);
  },
  onEvents: (events) => handleGameEvents(events, renderer),
  onError: (error) => {
    pushToast('error', `errors.${error}`);
    audio.play('ui.error');
  },
  onOfflineSummary: (summary) => uiStore.setState({ offlineSummary: summary, recapOpen: false }),
  onSync: (sync) => uiStore.setState({ sync }),
  onAccount: (account) => uiStore.setState({ account }),
  onAuthError: (authError) => uiStore.setState({ authError }),
  onGuestTransfer: (guestTransfer) => uiStore.setState({ guestTransfer }),
  onUniverse: (universe) => {
    if (!universe) {
      friend = null;
      uiStore.setState({ allies: [] });
      showAllies();
    }
    uiStore.setState({ universe });
  },
  onAllies: (allies) => {
    uiStore.setState({ allies });
    showAllies();
  },
  onTwin: (twin) => {
    friend = twin;
    if (controller.state) showTwin(controller.state);
  },
});
bindActions(controller, renderer);
bindIntro(renderer);
// Shared universes: refresh friends (and the friend on the twin face) every few minutes.
window.setInterval(() => {
  if (uiStore.getState().universe && !document.hidden) void controller.refreshUniverse();
}, 5 * 60_000);
installGameAudio(renderer);

// Keep the 3D selection marker in sync with the UI selection.
uiStore.subscribe((s, prev) => {
  if (s.selectedTile === prev.selectedTile) return;
  renderer.setSelectedTile(s.selectedTile);
  // On phones in portrait the tile sheet covers the bottom half: bring the tile into view above it.
  const portraitPhone = window.innerWidth < 760 && window.innerHeight > window.innerWidth;
  if (portraitPhone) {
    if (s.selectedTile) renderer.focusTile(s.selectedTile);
    renderer.setBottomInset(s.selectedTile ? 0.5 : 0);
  }
});

// A menu over the scene: the 3D slows down to leave the main thread to the interface.
uiStore.subscribe((s, prev) => {
  if (s.modal !== prev.modal) renderer.setBackground(s.modal !== 'none');
  // Chantier 20: another screen ends placing and path painting (no Escape key on a phone,
  // and a forgotten mode would turn every later tap into a build or a stroke).
  if (s.modal !== 'none' && prev.modal === 'none') {
    if (s.placing) actions.stopPlacing();
    if (s.pathMode) actions.setPathMode(false);
  }
});

// Chantier 11: level badges everywhere, or only at medium zoom.
renderer.setLevelBadges(uiStore.getState().showLevels);
uiStore.subscribe((s, prev) => {
  if (s.showLevels !== prev.showLevels) renderer.setLevelBadges(s.showLevels);
});

// Chantier 12: the logistics overlay, on demand and always while painting paths.
uiStore.subscribe((s, prev) => {
  const on = s.showLogistics || s.pathMode;
  if (on !== (prev.showLogistics || prev.pathMode)) renderer.setLogisticsOverlay(on);
});

// Chantier 11: placing a building from the tree lights the valid tiles (kept up to date).
let placementKey = '';
uiStore.subscribe((s, prev) => {
  if (!s.placing && !prev.placing) return;
  const tiles = s.placing && s.game && s.map ? buildableTiles(s.game, s.map, s.placing) : [];
  const key = `${s.placing}:${tiles.map((t) => `${t.q},${t.r}`).join(';')}`;
  if (key === placementKey) return;
  placementKey = key;
  // Chantier 12: a producer shows the logistics it would have on each tile.
  const producer = s.placing && s.game && s.map && HARVESTS[s.placing];
  renderer.setPlacement(
    tiles,
    producer ? tiles.map((t) => logisticsEfficiency(depotDistance(s.game!, s.map!, t))) : undefined,
    s.placing && isTurret(s.placing) ? s.placing : null,
  );
});

// Chantier 16: the translucent building above the pointed (or tapped) tile.
let ghostKey = '';
uiStore.subscribe((s, prev) => {
  if (!s.placing && !prev.placing) return;
  // The slow state (once a second) is enough: the ground changes slowly.
  if (
    s.placing === prev.placing &&
    s.placingTile === prev.placingTile &&
    s.slowGame === prev.slowGame &&
    s.map === prev.map &&
    ghostKey !== ''
  )
    return;
  const game = s.slowGame ?? s.game;
  const map = s.map;
  const age = game ? ageOf(game) : 0;
  const tile = s.placing ? s.placingTile : null;
  const valid =
    !!tile && !!game && !!map && !!s.placing && placementError(game, map, s.placing, tile) === null;
  const key = `${s.placing}:${age}:${tile ? hexKey(tile) : ''}:${valid}`;
  const fresh = s.slowGame !== prev.slowGame;
  if (key === ghostKey && !fresh) return;
  ghostKey = s.placing ? key : '';
  renderer.setGhostModel(s.placing, age);
  renderer.setGhostTile(tile, valid);
  // Chantier 16: the tiles a producer would harvest there, and the ones already taken.
  const plan = valid ? placementPlan(game!, map!, s.placing!, tile!) : null;
  renderer.setPlannedCatchment(plan?.free ?? [], plan?.taken.map((x) => x.tile) ?? []);
});

const url = readUrlParams();
const linkWorld =
  url.seed || url.face ? { seed: url.seed ?? randomSeed(), face: url.face ?? 'kiwisu' } : null;
clearUrlParams();

async function boot(): Promise<void> {
  // Local mode: an existing colony is loaded first, the link is offered afterwards.
  // Online mode: the link world is only used if the player has no colony yet.
  const hadLocalColony = !controller.isOnline && controller.hasProgress();
  await controller.start(hadLocalColony ? null : linkWorld, randomSeed);
  const s = controller.state;
  if (url.join) {
    // Invite link: ask for confirmation (and a name) before joining.
    if (controller.isOnline) uiStore.setState({ pendingJoin: url.join });
    else pushToast('info', 'universe.onlineOnly');
  } else if (linkWorld && (s.seed !== linkWorld.seed || s.face !== linkWorld.face)) {
    // Never silently overwrite a colony: ask first.
    if (controller.hasProgress()) uiStore.setState({ pendingWorld: linkWorld });
    else controller.newWorld(linkWorld.seed, linkWorld.face);
  } else if (
    !linkWorld &&
    !introSeen() &&
    !controller.hasProgress() &&
    // A pristine colony in a shared universe keeps its kiwi: never swap it for a solo world.
    controller.universe === 'solo'
  ) {
    // First visit: the kiwi of the fresh world is sliced, and the player picks a face.
    startIntro({
      mode: 'new',
      seed: s.seed,
      onChoose: (face) => {
        if (face !== controller.state.face) controller.newWorld(s.seed, face);
      },
    });
  }
}
boot().catch((e: unknown) => {
  console.error(e);
  uiStore.setState({ bootError: e instanceof Error ? e.message : String(e) });
});

// Team chat follows the universe being played.
let chat: ChatChannel | null = null;
uiStore.subscribe((s, prev) => {
  if (s.universe?.id === prev.universe?.id) return;
  chat?.stop();
  chat = null;
  uiStore.setState({ chat: [], chatUnread: 0, chatOpen: false });
  const client = controller.online?.client;
  if (!s.universe || !client) return;
  const me = s.account?.userId;
  chat = new ChatChannel(client, s.universe.id, (messages, fresh) => {
    const muted = mutedUsers();
    const unseen = fresh.filter((m) => m.user_id !== me && !muted.includes(m.user_id)).length;
    uiStore.setState((st) => ({
      chat: messages,
      chatUnread: st.chatOpen ? 0 : st.chatUnread + unseen,
    }));
  });
  setChannel(chat);
  void chat.start();
});

render(
  <Guard>
    <App />
  </Guard>,
  document.getElementById('ui')!,
);
// Chantier 22: the animated loading screen stays until the colony (or the intro, or a boot
// error) is ready, then fades out once its first frames are on screen.
const loaderDone = (s: ReturnType<typeof uiStore.getState>) =>
  s.game !== null || s.intro !== null || s.bootError !== null;
function fadeLoader(): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const loader = document.getElementById('loader');
      loader?.classList.add('done');
      window.setTimeout(() => loader?.remove(), 700);
    }),
  );
}
if (loaderDone(uiStore.getState())) fadeLoader();
else {
  const stop = uiStore.subscribe((s) => {
    if (!loaderDone(s)) return;
    stop();
    fadeLoader();
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controller.dispose();
    renderer.dispose();
  });
}

// Dev-only handle for debugging and automated browser checks.
if (import.meta.env.DEV) {
  (window as unknown as { __kiwar: unknown }).__kiwar = {
    controller,
    renderer,
    uiStore,
    actions,
    audio,
    perfStore,
  };
}
