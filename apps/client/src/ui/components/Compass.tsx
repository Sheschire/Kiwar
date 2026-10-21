import { frontScreenAngle } from '../../render/front';
import { actions } from '../actions';
import { useT } from '../store';
import { useView } from '../viewStore';

/** The needle towards the alien planet (the front of the colony), turning with the camera. */
export function CompassNeedle({ size = 34 }: { size?: number }) {
  const deg = useView((s) => Math.round((frontScreenAngle(s.azimuth) * 180) / Math.PI));
  return (
    <svg class="compass" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#c9a77a" stroke-width="1.5" />
      <g transform={`rotate(${deg} 16 16)`}>
        <path d="M16 4 L19.5 16 L12.5 16 Z" fill="#8f4f9e" />
        <path d="M16 28 L19.5 16 L12.5 16 Z" fill="#c9b08a" />
        <circle cx="16" cy="4.5" r="3" fill="#b9e05a" stroke="#5d3a6b" stroke-width="1.2" />
      </g>
      <circle cx="16" cy="16" r="2.6" fill="#7a4e2e" />
    </svg>
  );
}

/** Needle towards the alien planet; a tap flies back to the Nest. */
export function Compass() {
  const t = useT();
  return (
    <button
      type="button"
      class="round-fab compass-fab pe"
      title={t('compass.label')}
      aria-label={t('compass.label')}
      onClick={() => actions.focusNest()}
    >
      <CompassNeedle />
    </button>
  );
}
