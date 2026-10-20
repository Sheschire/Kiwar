// Game entry (loaded by main.tsx unless the admin space is requested).
import { render } from 'preact';
import { generateFace, otherFace, twinParams } from '@kiwar/shared';
import { App } from './ui/App';
import { GameRenderer } from './render/GameRenderer';
import { GameController } from './game/GameController';
import { persistLang } from './i18n/i18n';
import { pushToast, uiStore } from './ui/store';
import { actions, bindActions } from './ui/actions';
import { clearUrlParams, randomSeed, readUrlParams } from './game/urlParams';
import { loadQualityChoice } from './render/quality';
import { handleGameEvents } from './game/events';
import { ChatChannel, mutedUsers } from './game/chat';
import { setChannel } from './ui/chatActions';
import { audio } from './audio/engine';
import { installGameAudio } from './audio/gameAudio';
import { kiwiSpeaks } from './audio/sounds';

persistLang(uiStore.getState().lang);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const qualityChoice = loadQualityChoice();
uiStore.setState({ qualityChoice });

// eslint-disable-next-line prefer-const -- assigned right after the renderer (circular wiring)
let controller: GameController;
const renderer = new GameRenderer(
  canvas,
  {
    now: () => controller?.now() ?? 0,
    onTileTap: (tile) => actions.selectTile(tile),
    onPaint: (tiles, erase) => actions.paintPaths(tiles, erase),
    onFps: (fps) => uiStore.setState({ fps }),
    onQualityChange: (preset) => uiStore.setState({ qualityPreset: preset }),
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

controller = new GameController({
  onWorld: (map, state) => {
    renderer.setFace(map);
    renderer.setTwin(
      generateFace(
        state.seed,
        otherFace(state.face),
        twinParams(state.seed, state.face, state.params),
      ),
    );
    renderer.setGameState(state);
    uiStore.setState({ map, game: state, selectedTile: null });
  },
  onState: (state, now) => {
    renderer.setGameState(state);
    uiStore.setState({ game: state, now });
  },
  onEvents: (events) => handleGameEvents(events, renderer),
  onError: (error) => {
    pushToast('error', `errors.${error}`);
    audio.play('ui.error');
  },
  onOfflineSummary: (summary) => uiStore.setState({ offlineSummary: summary }),
  onSync: (sync) => uiStore.setState({ sync }),
  onAccount: (account) => uiStore.setState({ account }),
  onUniverse: (universe) => uiStore.setState({ universe }),
});
bindActions(controller, renderer);
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
  }
}
void boot();

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

render(<App />, document.getElementById('ui')!);
// Fade out the loading screen once the first frames are on screen.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const loader = document.getElementById('loader');
    loader?.classList.add('done');
    window.setTimeout(() => loader?.remove(), 700);
  }),
);

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
  };
}
