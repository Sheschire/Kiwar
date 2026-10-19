import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';

/** Confirmation before a shared link (or "New world") replaces the current colony. */
export function WorldModal() {
  const t = useT();
  const pending = useUi((s) => s.pendingWorld);
  if (!pending) return null;
  const keep = () => uiStore.setState({ pendingWorld: null });
  const replace = () => {
    actions.newWorld(pending.seed, pending.face);
    uiStore.setState({ pendingWorld: null });
  };
  return (
    <Modal
      title={t('world.title')}
      onClose={keep}
      footer={
        <>
          <button class="btn" onClick={keep}>
            {t('world.keep')}
          </button>
          <button class="btn btn-primary" onClick={replace}>
            {t('world.replace')}
          </button>
        </>
      }
    >
      <p>{t('world.body', { seed: pending.seed, face: t(`faces.${pending.face}`) })}</p>
    </Modal>
  );
}
