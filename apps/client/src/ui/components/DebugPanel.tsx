import { otherFace } from '@kiwar/shared';
import { randomSeed } from '../../game/urlParams';
import { actions } from '../actions';
import { CloseIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';

const SCALES = [1, 10, 100];

export function DebugPanel() {
  const t = useT();
  const fps = useUi((s) => Math.round(s.fps));
  const scale = useUi((s) => s.timeScale);
  const online = useUi((s) => s.sync !== 'local');
  const seed = useUi((s) => s.game?.seed ?? '');
  const face = useUi((s) => s.game?.face ?? 'kiwisu');
  const preset = useUi((s) => s.qualityPreset);
  return (
    <aside class="debug parchment pe" aria-label={t('debug.title')}>
      <header class="debug-header">
        <h3>{t('debug.title')}</h3>
        <span class="fps">
          {t('debug.fps', { fps })} · {t(`quality.${preset}`)}
        </span>
        <button
          class="btn btn-icon btn-ghost"
          aria-label={t('common.close')}
          onClick={() => uiStore.setState({ debugOpen: false })}
        >
          <CloseIcon />
        </button>
      </header>
      <div class="field">
        <span class="small muted">{t('debug.timeScale')}</span>
        {online ? (
          <span class="small muted">{t('debug.serverClock')}</span>
        ) : (
          <div class="segmented">
            {SCALES.map((s) => (
              <button
                key={s}
                class={`btn ${scale === s ? 'btn-active' : ''}`}
                aria-pressed={scale === s}
                onClick={() => actions.setTimeScale(s)}
              >
                ×{s}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        class="btn"
        onClick={() =>
          actions.dispatch({
            type: 'debugGrant',
            resources: { pulp: 500, fiber: 500, seeds: 500, juice: 500 },
          })
        }
      >
        {t('debug.grant')}
      </button>
      <button class="btn" onClick={() => actions.newWorld(randomSeed(), face)}>
        {t('debug.regenerate')}
      </button>
      <button class="btn" onClick={() => actions.newWorld(seed, otherFace(face))}>
        {t('debug.switchFace', { face: t(`faces.${otherFace(face)}`) })}
      </button>
      <p class="small muted">
        {t('debug.seed', { seed })} · {t(`faces.${face}`)}
      </p>
      <p class="small muted">{t('debug.shortcut')}</p>
    </aside>
  );
}
