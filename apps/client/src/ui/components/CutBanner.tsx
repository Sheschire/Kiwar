import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';

/**
 * Chantier 49: the depths seen in a cut — what it is, the Depths screen, and the way back to
 * the surface (the rest of the HUD hides meanwhile, like a visit).
 */
export function CutBanner() {
  const t = useT();
  const open = useUi((s) => s.cutOpen);
  if (!open) return null;
  return (
    <aside class="visit-banner cut-banner parchment pe" role="status">
      <div class="visit-title">
        <strong>{t('slice.title')}</strong>
        <span class="small muted">{t('slice.hint')}</span>
      </div>
      <div class="row visit-actions">
        <button class="btn" onClick={() => uiStore.setState({ modal: 'depths', depthsRoom: null })}>
          {t('slice.screen')}
        </button>
        <button class="btn btn-primary" onClick={() => actions.closeCut()}>
          {t('slice.back')}
        </button>
      </div>
    </aside>
  );
}

/** Chantier 49: "Watch it in the cut" under a delve's report (its battle in its room). */
export function WatchDelveButton({ id }: { id: string }) {
  const t = useT();
  return (
    <button class="btn" onClick={() => actions.watchDelve(id)}>
      {t('slice.watch')}
    </button>
  );
}
