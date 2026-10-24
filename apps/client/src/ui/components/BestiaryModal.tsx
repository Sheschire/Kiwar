import { uiStore, useT, useUi } from '../store';
import { BestiaryList } from './LandingParts';
import { Modal } from './Modal';

/** Chantier 40: the enemies met in landings (over any screen). */
export function BestiaryModal() {
  const t = useT();
  const game = useUi((s) => s.slowGame);
  if (!game) return null;
  return (
    <Modal
      title={t('landing.bestiary.title')}
      onClose={() => uiStore.setState({ bestiaryOpen: false })}
    >
      <BestiaryList game={game} />
    </Modal>
  );
}
