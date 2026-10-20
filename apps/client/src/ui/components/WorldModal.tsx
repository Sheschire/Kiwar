import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';
import { startIntro } from '../intro';

/** Confirmation before a shared link (or "New world") replaces the current colony. */
export function WorldModal() {
  const t = useT();
  const pending = useUi((s) => s.pendingWorld);
  if (!pending) return null;
  const keep = () => uiStore.setState({ pendingWorld: null });
  const replace = () => {
    uiStore.setState({ pendingWorld: null });
    // A new world from the settings: the intro shows its kiwi and the player picks a face.
    if (pending.pick)
      startIntro({
        mode: 'new',
        seed: pending.seed,
        onChoose: (face) => actions.newWorld(pending.seed, face),
      });
    else actions.newWorld(pending.seed, pending.face);
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
      <p>
        {pending.pick
          ? t('world.bodyPick')
          : t('world.body', { seed: pending.seed, face: t(`faces.${pending.face}`) })}
      </p>
    </Modal>
  );
}
