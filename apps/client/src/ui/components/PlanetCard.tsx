import { actions } from '../actions';
import { CloseIcon, PlanetsIcon } from '../icons';
import { planetLabel } from '../planets';
import { useT, useUi } from '../store';
import type { PlanetRef } from '../../render/space';

/** Chantier 24: a tapped far planet: its name, what it is, and "Go there". */
export function PlanetCard() {
  const t = useT();
  const planet = useUi((s) => s.planetCard);
  const game = useUi((s) => s.slowGame);
  const allies = useUi((s) => s.allies);
  const twinOwner = useUi((s) => s.twinOwner);
  if (planet === null || !game) return null;
  const label = planetLabel(planet, t, game, allies, twinOwner);
  if (!label) return null;
  return (
    <aside class="planet-card parchment pe" role="dialog" aria-label={label.title}>
      <PlanetsIcon size={30} />
      <div class="visit-title">
        <strong>{label.title}</strong>
        <span class="small muted">{label.hint}</span>
      </div>
      <button class="btn btn-primary" onClick={() => actions.travelTo(planet)}>
        {t('planets.go')}
      </button>
      <button
        class="btn btn-icon btn-ghost"
        aria-label={t('common.close')}
        onClick={() => actions.showPlanetCard(null)}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}

/** Chantier 24: every planet one can go to (home, the twin, the members), one tap each. */
export function PlanetsPanel() {
  const t = useT();
  const open = useUi((s) => s.planetsOpen);
  const game = useUi((s) => s.slowGame);
  const allies = useUi((s) => s.allies);
  const twinOwner = useUi((s) => s.twinOwner);
  const visit = useUi((s) => s.visit);
  if (!open || !game) return null;
  const planets: PlanetRef[] = [
    'twin',
    ...[...allies].sort((a, b) => a.kiwiIndex - b.kiwiIndex).map((a) => a.kiwiIndex),
  ];
  return (
    <>
      <div class="nav-veil pe" onClick={() => actions.togglePlanets(false)} />
      <aside class="planets-panel parchment pe" role="dialog" aria-label={t('planets.title')}>
        <div class="nav-head">
          <strong>{t('planets.title')}</strong>
          <button
            type="button"
            class="btn btn-icon btn-ghost"
            aria-label={t('common.close')}
            onClick={() => actions.togglePlanets(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <ul class="planets-list">
          <li>
            <div class="visit-title">
              <strong>{t('planets.mine')}</strong>
              <span class="small muted">{t(`faces.${game.face}`)}</span>
            </div>
            <button
              class="btn btn-small"
              disabled={visit === null}
              onClick={() => actions.travelTo(null)}
            >
              {t('planets.go')}
            </button>
          </li>
          {planets.map((p) => {
            const label = planetLabel(p, t, game, allies, twinOwner);
            if (!label) return null;
            return (
              <li key={p}>
                <div class="visit-title">
                  <strong>{label.title}</strong>
                  <span class="small muted">{label.hint}</span>
                </div>
                <button
                  class="btn btn-small"
                  disabled={visit === p}
                  onClick={() => actions.travelTo(p)}
                >
                  {t('planets.go')}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}

/** Desktop: the round button that opens the Planets list (phones: the named menu). */
export function PlanetsButton() {
  const t = useT();
  const hidden = useUi((s) => s.pathMode || s.placing !== null);
  if (hidden) return null;
  return (
    <button
      class="round-fab planets-fab pe"
      aria-label={t('planets.title')}
      title={t('planets.title')}
      onClick={() => actions.togglePlanets()}
    >
      <PlanetsIcon size={28} />
    </button>
  );
}
