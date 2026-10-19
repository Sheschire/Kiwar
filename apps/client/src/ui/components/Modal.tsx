import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { CloseIcon } from '../icons';
import { useT } from '../store';

export function Modal(props: {
  title: string;
  onClose?: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  class?: string;
}) {
  const t = useT();
  const { onClose } = props;
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      class="modal-backdrop pe"
      onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <section
        class={`modal parchment ${props.class ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <header class="modal-header">
          <h2>{props.title}</h2>
          {onClose && (
            <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </header>
        <div class="modal-body">{props.children}</div>
        {props.footer && <footer class="modal-footer">{props.footer}</footer>}
      </section>
    </div>
  );
}
