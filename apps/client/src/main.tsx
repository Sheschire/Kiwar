import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import './ui/styles.css';
import { render } from 'preact';
import { generateFace } from '@kiwar/shared';
import { App } from './ui/App';
import { GameRenderer } from './render/GameRenderer';
import { persistLang } from './i18n/i18n';
import { uiStore } from './ui/store';
import { randomSeed, readUrlParams } from './game/urlParams';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new GameRenderer(canvas, {
  onTileTap: (tile) => uiStore.setState({ selectedTile: tile }),
});
uiStore.subscribe((s, prev) => {
  if (s.selectedTile !== prev.selectedTile) renderer.setSelectedTile(s.selectedTile);
});
persistLang(uiStore.getState().lang);

const url = readUrlParams();
const map = generateFace(url.seed ?? randomSeed(), url.face ?? 'kiwisu');
renderer.setFace(map);
uiStore.setState({ map });

render(<App />, document.getElementById('ui')!);

if (import.meta.hot) {
  import.meta.hot.dispose(() => renderer.dispose());
}
