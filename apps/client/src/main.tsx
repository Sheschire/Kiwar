// Latin subsets only (latin-ext is needed for French "œ").
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-ext-400.css';
import '@fontsource/alegreya/latin-500.css';
import '@fontsource/alegreya/latin-ext-500.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya/latin-ext-700.css';
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
if (linkWorld && controller.hasSave()) {
  // Never silently overwrite a colony: ask first.
  controller.start(null, randomSeed);
  uiStore.setState({ pendingWorld: linkWorld });
} else {
  controller.start(linkWorld, randomSeed);
}
clearUrlParams();

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
  (window as unknown as { __kiwar: unknown }).__kiwar = { controller, renderer, uiStore, actions };
}
