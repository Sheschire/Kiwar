import {
  demolitionPreview,
  getBuilding,
  housing,
  population,
  validateCommand,
  type BuildingId,
} from '@kiwar/shared';
import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';
import { Cost } from './Cost';
import { Modal } from './Modal';

/** Confirmation before tearing a building down: refund and consequences. */
export function DemolishModal() {
  const t = useT();
  const game = useUi((s) => s.game);
  const map = useUi((s) => s.map);
  const id = useUi((s) => s.demolishId);
  const close = () => uiStore.setState({ modal: 'none', demolishId: null });
  const b = game && id ? getBuilding(game, id) : undefined;
  if (!game || !map || !b) return null;
  const preview = demolitionPreview(game, b);
  const error = validateCommand(
    game,
    { type: 'demolish', buildingId: b.id as BuildingId },
    { now: game.now, map },
  );
  const name = t(`buildings.${b.type}.name`);
  const camp = b.type === 'camp';
  return (
    <Modal
      title={camp ? t('building.dismantle') : t('demolish.title', { name })}
      onClose={close}
      class="modal-confirm"
      footer={
        <>
          <button class="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            class="btn btn-danger"
            disabled={error !== null}
            onClick={() => {
              if (actions.dispatch({ type: 'demolish', buildingId: b.id })) {
                close();
                actions.selectTile(null);
              }
            }}
          >
            {camp ? t('demolish.confirmCamp') : t('demolish.confirm')}
          </button>
        </>
      }
    >
      {!camp && (
        <div class="stat-row">
          <span class="stat-label">{t('demolish.refund')}</span>
          <Cost cost={preview.refund} />
        </div>
      )}
      <ul class="small">
        {preview.workers > 0 && <li>{t('demolish.workers', { count: preview.workers })}</li>}
        {preview.storageLost > 0 && (
          <li>{t('demolish.storage', { amount: preview.storageLost })}</li>
        )}
        {preview.housingLost > 0 && (
          <li>
            {t('demolish.housing', {
              amount: preview.housingLost,
              left: housing(game) - preview.housingLost,
              population: population(game),
            })}
          </li>
        )}
        {b.pool && <li>{t('demolish.deposit')}</li>}
        {!camp && <li class="muted">{t('demolish.final')}</li>}
      </ul>
      {error && <p class="small warn">{t(`errors.${error}`)}</p>}
    </Modal>
  );
}
