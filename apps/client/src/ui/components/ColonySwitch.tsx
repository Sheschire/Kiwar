import { otherFace } from '@kiwar/shared';
import { actions } from '../actions';
import { PlanetsIcon } from '../icons';
import { useT, useUi } from '../store';

/** Chantier 19: the face of our other colony, once founded (null: no sister). */
export function useOtherColony(): { colony: 0 | 1; face: string } | null {
  const t = useT();
  const sister = useUi((s) => s.sister);
  const colony = useUi((s) => s.colony);
  const face = useUi((s) => (s.game ? otherFace(s.game.face) : null));
  if (!sister || !face) return null;
  return { colony: colony === 0 ? 1 : 0, face: t(`faces.${face}`) };
}

/** Top bar (desktop): one tap to the other colony. */
export function ColonySwitch() {
  const t = useT();
  const other = useOtherColony();
  if (!other) return null;
  const label = t('colony.switchHint', { face: other.face });
  return (
    <button
      class="btn btn-icon parchment-btn colony-switch"
      aria-label={label}
      title={label}
      onClick={() => void actions.switchColony(other.colony)}
    >
      <PlanetsIcon />
    </button>
  );
}
