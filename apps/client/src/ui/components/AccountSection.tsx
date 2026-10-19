import { useState } from 'preact/hooks';
import { actions } from '../actions';
import { useT, useUi } from '../store';

type Op = 'linkGoogle' | 'linkEmail' | 'signInGoogle' | 'signInEmail' | 'signOut';

/** Guest → account conversion (Google or magic link), sign-in on another device, sign-out. */
export function AccountSection() {
  const t = useT();
  const sync = useUi((s) => s.sync);
  const account = useUi((s) => s.account);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (sync === 'local') {
    return (
      <div class="field">
        <h3>{t('account.title')}</h3>
        <p class="small muted">{t('account.localMode')}</p>
      </div>
    );
  }

  const run = async (op: Op, sentKey?: 'account.linkSent') => {
    setBusy(true);
    setMessage(null);
    const error = await actions.account(op, email.trim());
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: t('account.error', { message: error }) });
    else if (sentKey) setMessage({ kind: 'ok', text: t(sentKey) });
  };
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div class="field account">
      <h3>{t('account.title')}</h3>
      {account && !account.isAnonymous ? (
        <>
          <p class="small">
            {t('account.linkedAs', { name: account.email ?? account.providers.join(', ') })}
          </p>
          <button class="btn" disabled={busy} onClick={() => run('signOut')}>
            {t('account.signOut')}
          </button>
        </>
      ) : (
        <>
          <p class="small">
            <strong>{t('account.guest')}</strong> {t('account.guestHint')}
          </p>
          <button class="btn btn-primary" disabled={busy} onClick={() => run('linkGoogle')}>
            {t('account.linkGoogle')}
          </button>
          <label class="small muted" for="kiwar-email">
            {t('account.emailLabel')}
          </label>
          <div class="row">
            <input
              id="kiwar-email"
              class="input"
              type="email"
              autocomplete="email"
              inputMode="email"
              placeholder={t('account.emailPlaceholder')}
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            />
            <button
              class="btn"
              disabled={busy || !validEmail}
              onClick={() => run('linkEmail', 'account.linkSent')}
            >
              {t('account.linkEmail')}
            </button>
          </div>
          <details class="small">
            <summary>{t('account.existing')}</summary>
            <p class="muted">{t('account.existingHint')}</p>
            <div class="row">
              <button class="btn" disabled={busy} onClick={() => run('signInGoogle')}>
                {t('account.signInGoogle')}
              </button>
              <button
                class="btn"
                disabled={busy || !validEmail}
                onClick={() => run('signInEmail', 'account.linkSent')}
              >
                {t('account.signInEmail')}
              </button>
            </div>
          </details>
        </>
      )}
      {message && (
        <p class={`small ${message.kind === 'error' ? 'warn' : 'bonus'}`}>{message.text}</p>
      )}
    </div>
  );
}
