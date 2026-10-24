import { useState } from 'preact/hooks';
import {
  COLONY,
  faceViewOf,
  foundLock,
  INTEL,
  otherFace,
  twinTarget,
  type ExpeditionTarget,
  type GameState,
} from '@kiwar/shared';
import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';
import { AttackLine, BeaconReports, QueenPanel } from './BeaconParts';
import { LandingMap, ParcelPanel } from './LandingParts';
import { Modal } from './Modal';

/**
 * Chantier 42: the conquest of the twin face — our beacons and their defence, the next attack,
 * the queen and her final battle; once she falls, the settlers' ship and the second colony
 * (chantier 19). Shown once a beacon shines on the twin.
 */
export function siegeVisible(game: GameState): boolean {
  const twin = twinTarget(game);
  if (!twin) return false;
  return game.siege.conqueredAt > 0 || faceViewOf(game, twin.id).beacons.length > 0;
}

/** An attack is announced on one of the twin's beacons (the top bar's warning). */
export function attackAnnounced(game: GameState): boolean {
  const twin = twinTarget(game);
  const a = twin ? faceViewOf(game, twin.id).attack : null;
  return !!a?.announced && game.siege.conqueredAt === 0;
}

function ConquestSection({ game, target }: { game: GameState; target: ExpeditionTarget }) {
  const t = useT();
  const face = faceViewOf(game, target.id);
  const announced = face.attack?.announced ? face.attack.sector : null;
  const [sector, setSector] = useState<number>(
    () => announced ?? face.beacons[0]?.sector ?? INTEL.sectors / 2,
  );
  return (
    <>
      <p class="small">{t('conquest.intro')}</p>
      <section class="field">
        <div class="title-row">
          <h3>{t('conquest.beacons', { count: face.beacons.length, total: INTEL.sectors })}</h3>
        </div>
        <AttackLine game={game} target={target} />
        <div class="landing-layout">
          <LandingMap
            game={game}
            target={target}
            selected={sector}
            onSelect={setSector}
            size={230}
          />
          <ParcelPanel game={game} target={target} sector={sector} />
        </div>
        <div class="row">
          <button
            class="btn btn-small"
            onClick={() => actions.planSiege({ mission: 'land', targetId: target.id, sector })}
            disabled={face.beacons.some((b) => b.sector === sector)}
          >
            {t('conquest.land')}
          </button>
        </div>
      </section>
      <QueenPanel game={game} target={target} />
      <BeaconReports game={game} target={target} />
    </>
  );
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
  const twin = twinTarget(game);
  return (
    <Modal title={t('siege.title')} onClose={close} class="modal-wide siege-modal">
      {game.siege.conqueredAt > 0 ? (
        <FoundSection game={game} />
      ) : (
        twin && <ConquestSection game={game} target={twin} />
      )}
    </Modal>
  );
}
