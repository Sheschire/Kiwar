import { planetLabel } from '../planets';
import { useT, useUi } from '../store';
import { useView } from '../viewStore';

/** Chantier 24: the name of the far planet under the mouse, next to the pointer. */
export function PlanetTag() {
  const t = useT();
  const hover = useView((s) => s.planetHover);
  const game = useUi((s) => s.slowGame);
  const allies = useUi((s) => s.allies);
  const twinOwner = useUi((s) => s.twinOwner);
  if (!hover || !game) return null;
  const label = planetLabel(hover.planet, t, game, allies, twinOwner);
  if (!label) return null;
  return (
    <div
      class="planet-tag parchment"
      style={{ left: `${hover.x + 16}px`, top: `${hover.y + 14}px` }}
    >
      <strong>{label.title}</strong>
      <span class="small muted">{label.hint}</span>
    </div>
  );
}
