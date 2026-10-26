import { useEffect, useState } from 'preact/hooks';
import { actions } from '../actions';
import { CloseIcon } from '../icons';
import { uiStore, useT, useUi, type Translate } from '../store';
import { usePerf } from '../perfProbe';
import { isIntegratedGpu } from '../../render/quality';
import { bootSummary } from '../../game/bootTimes';

const SCALES = [1, 10, 100];

export function DebugPanel() {
  const t = useT();
  const fps = usePerf((s) => Math.round(s.frame?.fps ?? 0));
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
      <BootLine t={t} />
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
      <p class="small muted">
        {t('debug.seed', { seed })} · {t(`faces.${face}`)}
      </p>
      <p class="small muted">{t('debug.shortcut')}</p>
    </aside>
  );
}

/** Chantier 32: the load milestones (they keep coming in while the panel is open). */
function BootLine({ t }: { t: Translate }) {
  const [steps, setSteps] = useState(bootSummary);
  useEffect(() => {
    const id = window.setInterval(() => setSteps(bootSummary()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <p class="small muted debug-boot">{t('debug.boot', { steps })}</p>;
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
  const tick = usePerf((s) => s.tick);
  const long = usePerf((s) => `${round(s.longTasks, 1)}|${round(s.longTaskMs)}`);
  const [ms, updates, worst] = ui.split('|');
  return (
    <div class="field perf-lines small">
      {frame && (
        <>
          <span>
            {t('debug.perf', {
              fps: round(frame.fps),
              median: round(frame.median, 1),
              p95: round(frame.p95, 1),
              worst: round(frame.worst),
              hitches: frame.hitches,
            })}
          </span>
          <span>
            {t('debug.cpu', {
              cpu: round(frame.cpu, 1),
              gpu: frame.gpuMs === null ? '?' : round(frame.gpuMs, 1),
              calls: frame.drawCalls,
              tris: round(frame.triangles / 1000),
            })}
          </span>
          <span class="muted">
            {t('debug.pixels', {
              w: frame.width,
              h: frame.height,
              dpr: round(frame.dpr, 2),
              gpu: gpu ? (isIntegratedGpu(gpu) ? `${gpu} (${t('debug.integrated')})` : gpu) : '?',
            })}
          </span>
          <span class="muted">
            {t(frame.targetFps === 0 ? 'debug.paceUnlimited' : 'debug.pace', {
              target: frame.targetFps,
              idle: frame.idle ? t('debug.paceIdle') : '',
              drawn: round(frame.drawnShare * 100),
            })}
          </span>
        </>
      )}
      <span>{t('debug.ui', { ms: ms!, updates: updates!, worst: worst! })}</span>
      {tick && (
        <span>
          {t('debug.tick', {
            advance: round(tick.advance, 1),
            scene: round(tick.scene, 1),
            ui: round(tick.ui, 1),
            worst: round(tick.worst, 1),
          })}
        </span>
      )}
      <span class="muted">
        {t('debug.longTasks', { count: long.split('|')[0]!, ms: long.split('|')[1]! })}
      </span>
      {menu && (
        <span>
          {t('debug.menu', { name: menu.name, ms: round(menu.ms), render: round(menu.render, 1) })}
        </span>
      )}
    </div>
  );
}
