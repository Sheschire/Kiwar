import { useEffect, useState } from 'preact/hooks';
import { FACES, isPristine, kiwiCount, type UniverseSummary } from '@kiwar/shared';
import { inviteLink } from '../../game/urlParams';
import { actions, savedDisplayName } from '../actions';
import { pushToast, uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';

function InvitePanel() {
  const t = useT();
  const universe = useUi((s) => s.universe);
  const me = useUi((s) => s.account?.userId);
  if (!universe) return null;
  const link = inviteLink(universe.code);
  const taken = new Set(universe.members.map((m) => `${m.kiwiIndex}:${m.face}`));
  const alienFaces: string[] = [];
  for (let k = 0; k < kiwiCount(universe.members); k++) {
    for (const f of FACES)
      if (!taken.has(`${k}:${f}`))
        alienFaces.push(t('universe.memberFace', { face: t(`faces.${f}`), index: k + 1 }));
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      pushToast('success', 'universe.copied');
    } catch {
      window.prompt(t('universe.copy'), link);
    }
  };
  const nav = navigator as Navigator & {
    share?: (d: { title: string; url: string }) => Promise<void>;
  };
  return (
    <section class="field">
      <h3>
        {universe.name}{' '}
        <span class="badge">
          {t('universe.players', { count: universe.players, max: universe.maxPlayers })}
        </span>
      </h3>
      <p class="small muted">{t('universe.inviteHint')}</p>
      <div class="row">
        <input
          class="input"
          readOnly
          value={link}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
        />
        <button class="btn btn-primary" onClick={copy}>
          {t('universe.copy')}
        </button>
        {nav.share && (
          <button
            class="btn"
            onClick={() => void nav.share!({ title: 'Kiwar', url: link }).catch(() => undefined)}
          >
            {t('universe.share')}
          </button>
        )}
      </div>
      <p class="small muted">{t('universe.code', { code: universe.code })}</p>
      <h3>{t('universe.members')}</h3>
      <ul class="members">
        {universe.members.map((m) => (
          <li key={m.userId}>
            <strong>{m.displayName}</strong>
            {m.userId === me && <span class="badge">{t('universe.you')}</span>}
            <span class="small muted">
              {t('universe.memberFace', { face: t(`faces.${m.face}`), index: m.kiwiIndex + 1 })}
            </span>
          </li>
        ))}
        {alienFaces.map((f) => (
          <li key={f} class="aliens">
            <strong>{t('universe.aliensHold')}</strong>
            <span class="small muted">{f}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UniverseModal() {
  const t = useT();
  const sync = useUi((s) => s.sync);
  const current = useUi((s) => s.universe?.id ?? 'solo');
  const [list, setList] = useState<UniverseSummary[] | null>(null);
  const [name, setName] = useState('');
  const soloProgress = useUi((s) => !s.universe && !!s.game && !isPristine(s.game));
  const [bring, setBring] = useState(true);
  const [displayName, setDisplayName] = useState(savedDisplayName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => uiStore.setState({ modal: 'none' });

  useEffect(() => {
    void actions.listUniverses().then(setList);
    actions.refreshUniverse();
  }, [current]);

  if (sync === 'local') {
    return (
      <Modal title={t('universe.title')} onClose={close}>
        <p>{t('universe.onlineOnly')}</p>
      </Modal>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (typeof result === 'string') setError(t(`errors.${result}` as never));
    else if (result === false) setError(t('errors.network'));
  };
  const nameOk = displayName.trim().length > 0;

  return (
    <Modal title={t('universe.title')} onClose={close} class="modal-wide">
      <InvitePanel />
      <section class="field">
        <ul class="universes">
          <li class={current === 'solo' ? 'is-current' : ''}>
            <div>
              <strong>{t('universe.solo')}</strong>
              <p class="small muted">{t('universe.soloHint')}</p>
            </div>
            {current === 'solo' ? (
              <span class="badge">{t('universe.current')}</span>
            ) : (
              <button
                class="btn"
                disabled={busy}
                onClick={() => run(() => actions.switchUniverse('solo'))}
              >
                {t('universe.play')}
              </button>
            )}
          </li>
          {(list ?? []).map((u) => (
            <li key={u.id} class={current === u.id ? 'is-current' : ''}>
              <div>
                <strong>{u.name}</strong>
                <p class="small muted">
                  {t('universe.players', { count: u.players, max: u.maxPlayers })}
                </p>
              </div>
              {current === u.id ? (
                <span class="badge">{t('universe.current')}</span>
              ) : (
                <button
                  class="btn"
                  disabled={busy}
                  onClick={() => run(() => actions.switchUniverse(u.id))}
                >
                  {t('universe.play')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section class="field">
        <label class="small muted" for="kiwar-display-name">
          {t('universe.yourName')}
        </label>
        <input
          id="kiwar-display-name"
          class="input"
          maxLength={24}
          placeholder={t('universe.yourNamePlaceholder')}
          value={displayName}
          onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
        />
      </section>
      <section class="field">
        <h3>{t('universe.create')}</h3>
        <p class="small muted">{t('universe.createHint')}</p>
        {soloProgress && (
          <label class="check">
            <input
              type="checkbox"
              checked={bring}
              onChange={(e) => setBring(e.currentTarget.checked)}
            />
            {t('universe.bringSolo')}
          </label>
        )}
        <p class="small muted">
          {t(soloProgress && bring ? 'universe.bringSoloHint' : 'universe.freshHint')}
        </p>
        <div class="row">
          <input
            class="input"
            maxLength={40}
            aria-label={t('universe.name')}
            placeholder={t('universe.namePlaceholder')}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button
            class="btn btn-primary"
            disabled={busy || !nameOk || !name.trim()}
            onClick={() =>
              run(() =>
                actions.enterUniverse(
                  { create: name.trim(), fromSolo: soloProgress && bring },
                  displayName,
                ),
              )
            }
          >
            {t('universe.createAction')}
          </button>
        </div>
      </section>
      <section class="field">
        <h3>{t('universe.join')}</h3>
        <div class="row">
          <input
            class="input code-input"
            maxLength={8}
            aria-label={t('universe.join')}
            placeholder="ABCD2345"
            value={code}
            onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())}
          />
          <button
            class="btn"
            disabled={busy || !nameOk || code.trim().length !== 8}
            onClick={() => run(() => actions.enterUniverse({ code: code.trim() }, displayName))}
          >
            {t('universe.joinAction')}
          </button>
        </div>
      </section>
      {error && <p class="small warn">{error}</p>}
    </Modal>
  );
}

/** Confirmation for an invite link (`?join=CODE`). */
export function JoinModal() {
  const t = useT();
  const code = useUi((s) => s.pendingJoin);
  const [displayName, setDisplayName] = useState(savedDisplayName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!code) return null;
  const close = () => uiStore.setState({ pendingJoin: null });
  const join = async () => {
    setBusy(true);
    const err = await actions.enterUniverse({ code }, displayName);
    setBusy(false);
    if (err) setError(t(`errors.${err}` as never));
  };
  return (
    <Modal
      title={t('universe.joinTitle')}
      onClose={close}
      footer={
        <>
          <button class="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button class="btn btn-primary" disabled={busy || !displayName.trim()} onClick={join}>
            {t('universe.joinAction')}
          </button>
        </>
      }
    >
      <p>{t('universe.joinBody', { code })}</p>
      <label class="small muted" for="kiwar-join-name">
        {t('universe.yourName')}
      </label>
      <input
        id="kiwar-join-name"
        class="input"
        maxLength={24}
        placeholder={t('universe.yourNamePlaceholder')}
        value={displayName}
        onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
      />
      {error && <p class="small warn">{error}</p>}
    </Modal>
  );
}
