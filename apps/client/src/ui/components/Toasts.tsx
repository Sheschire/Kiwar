import { useT, useUi } from '../store';

export function Toasts() {
  const t = useT();
  const toasts = useUi((s) => s.toasts);
  return (
    <div class="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} class={`toast parchment toast-${toast.kind}`}>
          {t(toast.key, toast.params)}
        </div>
      ))}
    </div>
  );
}
