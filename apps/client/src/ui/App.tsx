import { LANGS } from '../i18n/i18n';
import { setLang, useT, useUi } from './store';

export function App() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  return (
    <div class="hud">
      <header class="title-card parchment">
        <h1>{t('app.title')}</h1>
        <p>{t('app.tagline')}</p>
        <div class="lang-switch" role="group" aria-label={t('settings.language')}>
          {LANGS.map((l) => (
            <button
              key={l}
              class={`btn ${l === lang ? 'btn-active' : ''}`}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {t(`langs.${l}`)}
            </button>
          ))}
        </div>
      </header>
    </div>
  );
}
