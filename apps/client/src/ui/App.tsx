import { TILES } from '@kiwar/shared';
import { LANGS } from '../i18n/i18n';
import { setLang, useT, useUi } from './store';

export function App() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const map = useUi((s) => s.map);
  const tile = useUi((s) => s.selectedTile);
  return (
    <div class="hud">
      <header class="topbar parchment">
        <strong>{t('app.title')}</strong>
        {map && (
          <span class="muted small">
            {t(`faces.${map.face}`)} · {map.seed}
          </span>
        )}
        <div class="lang-switch" role="group" aria-label={t('settings.language')}>
          {LANGS.map((l) => (
            <button
              key={l}
              class={`btn ${l === lang ? 'btn-active' : ''}`}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      {tile && (
        <aside class="tile-card parchment">
          <h2>{t(`tiles.${tile.type}.name`)}</h2>
          <p class="muted">{t(`tiles.${tile.type}.desc`)}</p>
          {TILES[tile.type].resource && (
            <p>
              {t('tile.good_for')} : {t(`resources.${TILES[tile.type].resource!}`)} ·{' '}
              {t('tile.richness')} ×{tile.richness.toFixed(2)}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
