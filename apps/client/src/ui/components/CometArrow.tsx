import { Icon } from '../iconSet';
import { actions } from '../actions';
import { useT } from '../store';
import { useView } from '../viewStore';

/**
 * Chantier 32: the comet is an object of the sky (it no longer follows the camera). While it
 * is up there but off screen, a small golden arrow on the edge of the screen points to it; a
 * tap turns the camera towards it.
 */
export function CometArrow() {
  const t = useT();
  const arrow = useView((s) => s.cometArrow);
  if (!arrow) return null;
  return (
    <button
      type="button"
      class="comet-arrow pe"
      style={{ left: `${arrow.x}px`, top: `${arrow.y}px` }}
      aria-label={t('comet.look')}
      title={t('comet.look')}
      onClick={() => actions.lookAtComet()}
    >
      <span class="comet-arrow-tip" style={{ transform: `rotate(${arrow.angle}rad)` }} />
      <Icon name="comet" size={18} />
    </button>
  );
}
