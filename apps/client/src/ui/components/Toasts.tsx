import { applyUpdate } from '../update';
import { useT, useUi } from '../store';

export function Toasts() {
  const t = useT();
  const toasts = useUi((s) => s.toasts);
  const update = useUi((s) => s.updateReady);
  return (
    <div class="toasts" aria-live="polite">
      {update && (
        <div class="toast parchment toast-info update-toast pe">
          <span>{t('update.ready')}</span>
          <button class="btn btn-small btn-primary" onClick={applyUpdate}>
            {t('update.apply')}
          </button>
        </div>
      )}
      {toasts.map((toast) => (
        <div key={toast.id} class={`toast parchment toast-${toast.kind}`}>
          {t(toast.key, toast.params)}
        </div>
      ))}
    </div>
  );
}
