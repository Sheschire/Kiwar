import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import './ui/styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { GameRenderer } from './render/GameRenderer';
import { persistLang } from './i18n/i18n';
import { uiStore } from './ui/store';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new GameRenderer(canvas);
persistLang(uiStore.getState().lang);

render(<App />, document.getElementById('ui')!);

if (import.meta.hot) {
  import.meta.hot.dispose(() => renderer.dispose());
}
