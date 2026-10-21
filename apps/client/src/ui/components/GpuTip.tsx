import { CloseIcon } from '../icons';
import { actions } from '../actions';
import { uiStore, useT, useUi } from '../store';

const DISMISS_KEY = 'kiwar.gpuTip.';

export function gpuTipDismissed(kind: 'gpu' | 'auto'): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY + kind) === '1';
  } catch {
    return false;
  }
}

/** Lasting slow frames: the wrong graphics chip (a Windows setting) or a preset too heavy. */
export function GpuTip() {
  const t = useT();
  const tip = useUi((s) => s.gpuTip);
  const manual = useUi((s) => s.qualityChoice !== 'auto');
  if (!tip) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY + tip, '1');
    } catch {
      // ignore
    }
    uiStore.setState({ gpuTip: null });
  };
  return (
    <aside class="nudge parchment pe" role="status">
      <p class="small">{t(`gpuTip.${tip}`)}</p>
      {manual && (
        <button
          class="btn btn-primary"
          onClick={() => {
            actions.setQuality('auto');
            dismiss();
          }}
        >
          {t('gpuTip.useAuto')}
        </button>
      )}
      <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={dismiss}>
        <CloseIcon size={14} />
      </button>
    </aside>
  );
}
