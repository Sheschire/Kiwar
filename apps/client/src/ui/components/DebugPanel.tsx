import { otherFace } from '@kiwar/shared';
import { randomSeed } from '../../game/urlParams';
import { actions } from '../actions';
import { CloseIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { usePerf } from '../perfProbe';

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
      <PerfLines t={t} />
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

const round = (n: number, digits = 0) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/** Frame and interface timing (also opened by `?debug`, to share when the game feels slow). */
function PerfLines({ t }: { t: Translate }) {
  const frame = usePerf((s) => s.frame);
  const gpu = usePerf((s) => s.gpu);
  const ui = usePerf(
    (s) => `${round(s.uiMsPerSecond)}|${round(s.updatesPerSecond)}|${round(s.worstUpdate, 1)}`,
  );
  const menu = usePerf((s) => s.lastMenu);
  const [ms, updates, worst] = ui.split('|');
  return (
    <div class="field perf-lines small">
      {frame && (
        <>
          <span>
            {t('debug.perf', {
              fps: round(frame.fps),
              p95: round(frame.p95, 1),
              worst: round(frame.worst),
              hitches: frame.hitches,
            })}
          </span>
          <span>
            {t('debug.cpu', {
              cpu: round(frame.cpu, 1),
              calls: frame.drawCalls,
              tris: round(frame.triangles / 1000),
            })}
          </span>
          <span class="muted">
            {t('debug.pixels', {
              w: frame.width,
              h: frame.height,
              dpr: round(frame.dpr, 2),
              gpu: gpu || '?',
            })}
          </span>
        </>
      )}
      <span>{t('debug.ui', { ms: ms!, updates: updates!, worst: worst! })}</span>
      {menu && (
        <span>
          {t('debug.menu', { name: menu.name, ms: round(menu.ms), render: round(menu.render, 1) })}
        </span>
      )}
    </div>
  );
}
