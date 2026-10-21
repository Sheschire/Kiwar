import { AGE_IDS } from '@kiwar/shared';
import { useState } from 'preact/hooks';
import type { ColonySummary } from '@kiwar/shared';
import { formatDuration, type Lang } from '../../i18n/i18n';
import { CloseIcon } from '../icons';
import { actions } from '../actions';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Modal } from './Modal';

const KNOWN_ERRORS = ['identity_already_exists', 'access_denied'] as const;

/** An error Google or Supabase sent back after a redirect, until dismissed. */
export function AuthErrorBanner() {
  const t = useT();
  const error = useUi((s) => s.authError);
  const guest = useUi((s) => s.account?.isAnonymous === true);
  const [busy, setBusy] = useState(false);
  if (!error) return null;
  const known = KNOWN_ERRORS.find((code) => code === error.code) ?? null;
  const dismiss = () => uiStore.setState({ authError: null });
  const signIn = async () => {
    setBusy(true);
    const failed = await actions.account('signInGoogle');
    setBusy(false);
    if (failed) uiStore.setState({ authError: { code: 'unknown', description: failed.message } });
  };
  return (
    <aside class="nudge parchment pe" role="alert">
      <p class="small">
        {known
          ? t(`account.authErrors.${known}`)
          : t('account.authErrors.other', { message: error.description || error.code })}
      </p>
      {known === 'identity_already_exists' && guest && (
        <button class="btn btn-primary" disabled={busy} onClick={() => void signIn()}>
          {t('account.signInGoogle')}
        </button>
      )}
      <button class="btn btn-icon btn-ghost" aria-label={t('common.close')} onClick={dismiss}>
        <CloseIcon size={14} />
      </button>
    </aside>
  );
}

function colonyLine(t: Translate, lang: Lang, c: ColonySummary, now: number): string {
  return t('account.colonyLine', {
    age: `@ages.${AGE_IDS[c.age] ?? AGE_IDS[0]}`,
    nest: c.nest,
    kiwis: c.kiwis,
    ago: formatDuration(lang, Math.max(0, now - c.playedAt)),
  });
}

/** After signing in from a guest whose colony was played: which one does the account keep? */
export function GuestTransferModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const preview = useUi((s) => s.guestTransfer);
  const [busy, setBusy] = useState(false);
  if (!preview?.guest) return null;
  const now = Date.now();
  const keep = async (which: 'guest' | 'account') => {
    setBusy(true);
    await actions.keepColony(which);
    setBusy(false);
  };
  return (
    <Modal title={t('account.transferTitle')}>
      <p class="small">{t('account.transferHint')}</p>
      <div class="field">
        <h3>{t('account.transferGuest')}</h3>
        <p class="small">{colonyLine(t, lang, preview.guest, now)}</p>
        <button class="btn btn-primary" disabled={busy} onClick={() => void keep('guest')}>
          {t('account.keepGuest')}
        </button>
      </div>
      {preview.account && (
        <div class="field">
          <h3>{t('account.transferAccount')}</h3>
          <p class="small">{colonyLine(t, lang, preview.account, now)}</p>
          <button class="btn" disabled={busy} onClick={() => void keep('account')}>
            {t('account.keepAccount')}
          </button>
        </div>
      )}
      <p class="small muted">{t('account.transferSafe')}</p>
    </Modal>
  );
}
