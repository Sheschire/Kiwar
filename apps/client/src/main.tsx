import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/500.css';
import '@fontsource/alegreya/700.css';
import './ui/styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { GameRenderer } from './render/GameRenderer';
import { GameController } from './game/GameController';
import { persistLang } from './i18n/i18n';
import { pushToast, uiStore } from './ui/store';
import { actions, bindActions } from './ui/actions';
import { clearUrlParams, randomSeed, readUrlParams } from './game/urlParams';
import { loadQualityChoice } from './render/quality';
import { handleGameEvents } from './game/events';

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
    onFps: (fps) => uiStore.setState({ fps }),
    onQualityChange: (preset) => uiStore.setState({ qualityPreset: preset }),
  },
  qualityChoice,
);

controller = new GameController({
  onWorld: (map, state) => {
    renderer.setFace(map);
    renderer.setGameState(state);
    uiStore.setState({ map, game: state, selectedTile: null });
  },
  onState: (state, now) => {
    renderer.setGameState(state);
    uiStore.setState({ game: state, now });
  },
  onEvents: (events) => handleGameEvents(events, renderer),
  onError: (error) => pushToast('error', `errors.${error}`),
  onOfflineSummary: (summary) => uiStore.setState({ offlineSummary: summary }),
});
bindActions(controller, renderer);

// Keep the 3D selection marker in sync with the UI selection.
uiStore.subscribe((s, prev) => {
  if (s.selectedTile !== prev.selectedTile) renderer.setSelectedTile(s.selectedTile);
});

const url = readUrlParams();
const linkWorld =
  url.seed || url.face ? { seed: url.seed ?? randomSeed(), face: url.face ?? 'kiwisu' } : null;
if (linkWorld && controller.hasSave()) {
  // Never silently overwrite a colony: ask first.
  controller.start(null, randomSeed);
  uiStore.setState({ pendingWorld: linkWorld });
} else {
  controller.start(linkWorld, randomSeed);
}
clearUrlParams();

render(<App />, document.getElementById('ui')!);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controller.dispose();
    renderer.dispose();
  });
}

// Dev-only handle for debugging and automated browser checks.
if (import.meta.env.DEV) {
  (window as unknown as { __kiwar: unknown }).__kiwar = { controller, renderer, uiStore, actions };
}
