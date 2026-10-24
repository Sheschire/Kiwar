import { COLONY, foundLock, otherFace, twinTarget, type GameState } from '@kiwar/shared';
import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';

/**
 * Chantier 19, after chantier 40: the siege screen keeps only the conquered face and the
 * settlers' ship (the landing replaced the siege; the conquest returns with chantier 42).
 */
export function siegeVisible(game: GameState): boolean {
  return !!twinTarget(game) && game.siege.conqueredAt > 0;
}

/** Chantier 19: after the queen's fall, the settlers' ship and then the sister colony. */
function FoundSection({ game }: { game: GameState }) {
  const t = useT();
  const sister = useUi((s) => s.sister);
  const face = t(`faces.${otherFace(game.face)}`);
  const flying = game.expeditions.some((e) => e.mission === 'found' && !e.result);
  const lock = foundLock(game);
  if (game.colony.foundedAt > 0 || game.colony.founding)
    return (
      <section class="siege-won">
        <h2 class="bonus">{t('colony.founded', { face })}</h2>
        <p class="small">{t('colony.foundedBody', { face })}</p>
        {sister && (
          <button class="btn btn-primary" onClick={() => void actions.switchColony(1)}>
            {t('colony.switchTo', { face })}
          </button>
        )}
      </section>
    );
  return (
    <section class="siege-won">
      <h2 class="bonus">{t('siege.conquered')}</h2>
      <p class="small">{t('siege.conqueredBody')}</p>
      <button
        class="btn btn-primary"
        disabled={lock !== null}
        onClick={() => actions.planSiege({ mission: 'found' })}
      >
        {t('siege.found')}
      </button>
      <p class="small muted">
        {flying ? t('colony.foundFlying') : t('colony.foundHint', { min: COLONY.minSettlers })}
      </p>
    </section>
  );
}

export function SiegeModal() {
  const t = useT();
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none' });
  return (
    <Modal title={t('siege.title')} onClose={close} class="modal-wide siege-modal">
      {game.siege.conqueredAt > 0 && <FoundSection game={game} />}
    </Modal>
  );
}
