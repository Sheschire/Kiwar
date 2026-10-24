import { isLaunchpadBusy } from '@kiwar/shared';
import { actions } from '../actions';
import { ShipIcon, TargetIcon } from '../icons';
import { siegeVisible } from './SiegeModal';
import { planetLabel } from '../planets';
import { sectorName } from './LandingParts';
import { uiStore, useT, useUi } from '../store';

/**
 * Visiting a far planet (chantier 24: the twin under its fog, or a member's): whose it is,
 * and the way back home (the rest of the HUD hides).
 */
export function VisitBanner() {
  const t = useT();
  const visit = useUi((s) => s.visit);
  const allies = useUi((s) => s.allies);
  const game = useUi((s) => s.game);
  const twinOwner = useUi((s) => s.twinOwner);
  const sister = useUi((s) => s.sister);
  const colony = useUi((s) => s.colony);
  const watching = useUi((s) =>
    s.watchingLanding
      ? (s.game?.expeditions.find((e) => e.id === s.watchingLanding)?.sector ?? null)
      : null,
  );
  if (visit === null || !game) return null;
  if (watching !== null)
    // Chantier 41: a landing watched on the twin — its parcel, and the way back.
    return (
      <aside class="visit-banner parchment pe" role="status">
        <div class="visit-title">
          <strong>{t('landing.watch.landing', { sector: sectorName(t, watching) })}</strong>
          <span class="small muted">{t('landing.watch.landingHint')}</span>
        </div>
        <div class="row visit-actions">
          <button class="btn btn-primary" onClick={() => actions.travelTo(null)}>
            {t('planets.home')}
          </button>
        </div>
      </aside>
    );
  const label = planetLabel(visit, t, game, allies, twinOwner);
  if (!label) return null;
  const ally = allies.find((a) => a.kiwiIndex === visit);
  const others = allies.filter((a) => a.kiwiIndex !== visit);
  const next =
    typeof visit === 'number' ? (others.find((a) => a.kiwiIndex > visit) ?? others[0]) : null;
  const pads = game.buildings.filter((b) => b.type === 'launchpad');
  const padFree = pads.some((b) => !b.damaged && !isLaunchpadBusy(game, b.id));
  return (
    <aside class="visit-banner parchment pe" role="status">
      <div class="visit-title">
        <strong>{ally ? t('allies.visiting', { name: ally.owner }) : label.title}</strong>
        <span class="small muted">
          {label.hint}
          {ally && ` · ${t('allies.buildings', { count: ally.buildings.length })}`}
        </span>
      </div>
      <div class="row visit-actions">
        {visit === 'twin' && sister && (
          <button class="btn" onClick={() => void actions.switchColony(colony === 0 ? 1 : 0)}>
            {t('colony.play')}
          </button>
        )}
        {visit === 'twin' && !twinOwner && siegeVisible(game) && (
          <button
            class="btn"
            onClick={() => {
              actions.travelTo(null);
              uiStore.setState({ modal: 'siege' });
            }}
          >
            <TargetIcon size={16} /> {t('siege.button')}
          </button>
        )}
        {visit === 'twin' && !twinOwner && pads.length > 0 && (
          <button class="btn" disabled={!padFree} onClick={() => actions.prepareExpedition()}>
            <ShipIcon size={16} /> {t('planets.prepare')}
          </button>
        )}
        {ally?.friendId && pads.length > 0 && (
          <button
            class="btn"
            disabled={!padFree}
            onClick={() => actions.prepareDelivery(ally.friendId!)}
          >
            <ShipIcon size={16} /> {t('delivery.give')}
          </button>
        )}
        {next && (
          <button class="btn" onClick={() => actions.travelTo(next.kiwiIndex)}>
            {t('allies.next', { name: next.owner })}
          </button>
        )}
        <button class="btn btn-primary" onClick={() => actions.travelTo(null)}>
          {t('planets.home')}
        </button>
      </div>
    </aside>
  );
}
