import { useEffect } from 'preact/hooks';
import { actions } from '../actions';
import { ShipIcon } from '../icons';
import { useT, useUi } from '../store';
import { sectorName } from './LandingParts';

/** Unanswered, the invitation goes away on its own (the outcome is then told). */
const INVITE_MS = 90_000;

/**
 * Chantier 41: our ship just set down on a parcel of the twin — fly over and watch the battle
 * as it happens, or later from the report.
 */
export function LandingInvite({ docked = false }: { docked?: boolean }) {
  const t = useT();
  const id = useUi((s) => s.landingInvite);
  const sector = useUi(
    (s) => s.game?.expeditions.find((e) => e.id === s.landingInvite)?.sector ?? null,
  );
  // Chantier 54: a pillage on the raspberry is offered the same way.
  const fruit = useUi(
    (s) => s.game?.expeditions.find((e) => e.id === s.landingInvite)?.mission === 'pillage',
  );
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => actions.declineLanding(), INVITE_MS);
    return () => clearTimeout(timer);
  }, [id]);
  if (!id || (sector === null && !fruit)) return null;
  return (
    <aside class={`landing-invite parchment pe ${docked ? 'is-docked' : ''}`} role="alert">
      <div class="landing-invite-text">
        <strong>
          <ShipIcon size={18} />{' '}
          {fruit
            ? t('orchard.watchTitle')
            : t('landing.watch.title', { sector: sectorName(t, sector ?? 0) })}
        </strong>
        <span class="small muted">{t(fruit ? 'orchard.watchHint' : 'landing.watch.hint')}</span>
      </div>
      <div class="row landing-invite-actions">
        <button class="btn" onClick={() => actions.declineLanding()}>
          {t('landing.watch.later')}
        </button>
        <button
          class="btn btn-primary"
          onClick={() => {
            const ok = fruit ? actions.watchFruit(id, true) : actions.watchLanding(id);
            if (!ok) actions.declineLanding();
          }}
        >
          {t('landing.watch.go')}
        </button>
      </div>
    </aside>
  );
}
