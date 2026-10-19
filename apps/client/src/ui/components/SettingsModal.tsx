import { LANGS } from '../../i18n/i18n';
import { QUALITY_PRESETS } from '../../render/quality';
import { randomSeed } from '../../game/urlParams';
import { actions } from '../actions';
import { setLang, uiStore, useT, useUi } from '../store';
import { AccountSection } from './AccountSection';
import { Modal } from './Modal';

export function SettingsModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const choice = useUi((s) => s.qualityChoice);
  const preset = useUi((s) => s.qualityPreset);
  const face = useUi((s) => s.game?.face ?? 'kiwisu');
  const close = () => uiStore.setState({ modal: 'none' });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  return (
    <Modal title={t('settings.title')} onClose={close}>
      <AccountSection />
      <div class="field">
        <h3>{t('settings.language')}</h3>
        <div class="segmented" role="group" aria-label={t('settings.language')}>
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
      </div>
      <div class="field">
        <h3>{t('settings.quality')}</h3>
        <div class="segmented" role="group" aria-label={t('settings.quality')}>
          <button
            class={`btn ${choice === 'auto' ? 'btn-active' : ''}`}
            aria-pressed={choice === 'auto'}
            onClick={() => actions.setQuality('auto')}
          >
            {choice === 'auto'
              ? t('settings.autoCurrent', { preset: t(`quality.${preset}`) })
              : t('settings.auto')}
          </button>
          {QUALITY_PRESETS.map((p) => (
            <button
              key={p}
              class={`btn ${choice === p ? 'btn-active' : ''}`}
              aria-pressed={choice === p}
              onClick={() => actions.setQuality(p)}
            >
              {t(`quality.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <h3>{t('settings.controls')}</h3>
        <p class="muted small">
          {touch ? t('settings.controlsTouch') : t('settings.controlsDesktop')}
        </p>
      </div>
      <div class="field row">
        <button class="btn" onClick={() => uiStore.setState({ debugOpen: true, modal: 'none' })}>
          {t('settings.debug')}
        </button>
        <button
          class="btn"
          onClick={() =>
            uiStore.setState({ modal: 'none', pendingWorld: { seed: randomSeed(), face } })
          }
        >
          {t('settings.newWorld')}
        </button>
      </div>
    </Modal>
  );
}
