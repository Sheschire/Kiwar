import { useEffect } from 'preact/hooks';
import { uiStore, useT, useUi } from '../store';

const SHOW_MS = 4200;
/** The 3D show from home lasts longer (`SIEGE_FX_SECONDS`): the caption stays with it. */
const SHOW_3D_MS = 6500;

/**
 * Chantier 19: a short show when a siege fight is seen live — a flag planted or torn down on
 * the twin, the queen's crown falling and the fog lifting. From home it plays in 3D
 * (`GameRenderer.playSiege`) and this card shrinks to a caption at the top; while visiting a
 * planet it is the whole show.
 */
export function SiegeShow() {
  const t = useT();
  const show = useUi((s) => s.siegeShow);
  useEffect(() => {
    if (!show) return;
    const id = show.id;
    const timer = window.setTimeout(
      () => {
        if (uiStore.getState().siegeShow?.id === id) uiStore.setState({ siegeShow: null });
      },
      show.in3d ? SHOW_3D_MS : SHOW_MS,
    );
    return () => window.clearTimeout(timer);
  }, [show?.id]);
  if (!show) return null;
  const k = show.kind;
  const good = k === 'taken' || k === 'held' || k === 'queen';
  const queen = k === 'queen' || k === 'queenHeld';
  return (
    <div
      class={`siege-show pe is-${k} ${good ? 'is-good' : 'is-bad'} ${show.in3d ? 'is-3d' : ''}`}
      role="status"
      onClick={() => uiStore.setState({ siegeShow: null })}
    >
      <div class="siege-show-card parchment">
        <svg viewBox="-60 -60 120 120" width="180" height="180" aria-hidden="true">
          <defs>
            <radialGradient id="siege-planet" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#b9d36a" />
              <stop offset="100%" stop-color="#5b7d2a" />
            </radialGradient>
          </defs>
          {k === 'queen' && (
            <g class="siege-show-rays">
              {Array.from({ length: 12 }, (_, i) => (
                <path key={i} d="M0,-36L4,-56L-4,-56Z" transform={`rotate(${i * 30})`} />
              ))}
            </g>
          )}
          <circle r="34" fill="url(#siege-planet)" stroke="#4a3324" stroke-width="2" />
          <circle r="12" fill="#e9dca8" opacity="0.55" />
          {/* The fog over the twin: it slides away when the queen falls. */}
          <g class="siege-show-fog">
            <circle cx="-16" cy="-10" r="16" />
            <circle cx="14" cy="-14" r="14" />
            <circle cx="6" cy="12" r="17" />
            <circle cx="-14" cy="16" r="12" />
          </g>
          {queen ? (
            <g class="siege-show-crown">
              <path d="M-16,8L-16,-8L-8,0L0,-12L8,0L16,-8L16,8Z" />
            </g>
          ) : (
            <g class="siege-show-flag">
              <path d="M0,18L0,-22" class="siege-show-pole" />
              <path d="M0,-22L18,-15L0,-8Z" class="siege-show-cloth" />
            </g>
          )}
          {(k === 'repelled' || k === 'queenHeld') && (
            <g class="siege-show-ship">
              <path d="M-10,0Q0,-8 10,0Q0,6 -10,0Z" />
              <path d="M-4,-2L-14,-10M4,-2L14,-10" />
            </g>
          )}
          {(k === 'fell' || k === 'held') && (
            <g class="siege-show-claws">
              <path d="M-40,30L-28,18M-34,34L-22,22M40,30L28,18M34,34L22,22" />
            </g>
          )}
        </svg>
        <strong>{t(`siege.show.${k}`)}</strong>
      </div>
    </div>
  );
}
