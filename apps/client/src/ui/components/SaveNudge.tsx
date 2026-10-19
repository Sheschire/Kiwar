import { useState } from 'preact/hooks';
import { CloseIcon } from '../icons';
import { uiStore, useT, useUi } from '../store';

const DISMISS_KEY = 'kiwar.nudge.dismissed';

/** Gentle reminder for guests with some progress to turn their guest account into a real one. */
export function SaveNudge() {
  const t = useT();
  const guest = useUi((s) => s.account?.isAnonymous === true && s.sync !== 'local');
  const progressed = useUi((s) => (s.game?.objectiveIndex ?? 0) >= 3);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!guest || !progressed || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };
  return (
    <aside class="nudge parchment pe" role="status">
      <p class="small">{t('account.nudge')}</p>
      <button class="btn btn-primary" onClick={() => uiStore.setState({ modal: 'settings' })}>
        {t('account.nudgeAction')}
      </button>
      <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={dismiss}>
        <CloseIcon size={14} />
      </button>
    </aside>
  );
}
