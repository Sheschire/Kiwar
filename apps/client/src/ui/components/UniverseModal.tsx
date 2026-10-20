import { useEffect, useState } from 'preact/hooks';
import {
  AGE_IDS,
  colonyPower,
  FACES,
  isPristine,
  kiwiCount,
  type ColonyPower,
  type GameState,
  type UniverseSummary,
} from '@kiwar/shared';
import { formatDuration } from '../../i18n/i18n';
import { inviteLink } from '../../game/urlParams';
import { actions, savedDisplayName } from '../actions';
import { pushToast, uiStore, useT, useUi, type Translate } from '../store';
import { Modal } from './Modal';

/** Chantier 14: age, Nest, kiwis and defense of a colony, as one compact line. */
function powerLine(t: Translate, p: ColonyPower): string {
  return t('universe.power', {
    age: `@ages.${AGE_IDS[p.age] ?? AGE_IDS[0]}`,
    nest: p.nest,
    kiwis: p.kiwis,
    defense: p.defense,
  });
}

/** The solo colony that could come along (null: none, or nothing played yet). */
function useSoloColony(): GameState | null {
  return useUi((s) => (!s.universe && s.game && !isPristine(s.game) ? s.game : null));
}

/** "Bring my solo colony" with a preview of what moves. */
function BringSolo({
  solo,
  bring,
  setBring,
}: {
  solo: GameState;
  bring: boolean;
  setBring: (v: boolean) => void;
}) {
  const t = useT();
  const p = colonyPower(solo);
  return (
    <>
      <label class="check">
        <input
          type="checkbox"
          checked={bring}
          onChange={(e) => setBring(e.currentTarget.checked)}
        />
        {t('universe.bringSolo')}
      </label>
      <p class="small muted">
        {t('universe.soloPreview', {
          age: `@ages.${AGE_IDS[p.age] ?? AGE_IDS[0]}`,
          nest: p.nest,
          kiwis: p.kiwis,
        })}
      </p>
    </>
  );
}

function InvitePanel() {
  const t = useT();
  const universe = useUi((s) => s.universe);
  const me = useUi((s) => s.account?.userId);
  const allies = useUi((s) => s.allies);
  const game = useUi((s) => s.game);
  const now = useUi((s) => s.now);
  const lang = useUi((s) => s.lang);
  const [saving, setSaving] = useState(false);
  if (!universe) return null;
  const isHost = !!me && universe.hostId === me;
  const toggleImports = async (allow: boolean) => {
    setSaving(true);
    const err = await actions.setAllowImports(allow);
    setSaving(false);
    if (err) pushToast('error', `errors.${err}` as never);
  };
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
      {isHost ? (
        <label class="check">
          <input
            type="checkbox"
            disabled={saving}
            checked={universe.allowImports !== false}
            onChange={(e) => void toggleImports(e.currentTarget.checked)}
          />
          {t('universe.allowImports')}
        </label>
      ) : (
        universe.allowImports === false && <p class="small muted">{t('universe.importsClosed')}</p>
      )}
      <h3>{t('universe.members')}</h3>
      <ul class="members">
        {universe.members.map((m) => {
          const mine = m.userId === me;
          const ally = allies.find((a) => a.kiwiIndex === m.kiwiIndex);
          const power = mine && game ? colonyPower(game) : ally?.power;
          return (
            <li key={m.userId}>
              <strong>{m.displayName}</strong>
              {mine && <span class="badge">{t('universe.you')}</span>}
              {m.imported && <span class="badge badge-soft">{t('universe.imported')}</span>}
              {power && power.shieldUntil > now && (
                <span class="badge badge-soft">
                  {t('universe.shielded', {
                    duration: formatDuration(lang, power.shieldUntil - now),
                  })}
                </span>
              )}
              <span class="small muted">
                {t('universe.memberFace', { face: t(`faces.${m.face}`), index: m.kiwiIndex + 1 })}
              </span>
              {!mine && ally && (
                <button class="btn btn-small" onClick={() => actions.visitAlly(m.kiwiIndex)}>
                  {t('allies.visit')}
                </button>
              )}
              {power && <span class="member-power small">{powerLine(t, power)}</span>}
            </li>
          );
        })}
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
  const solo = useSoloColony();
  const soloProgress = !!solo;
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
      {solo && (
        <section class="field">
          <BringSolo solo={solo} bring={bring} setBring={setBring} />
        </section>
      )}
      <section class="field">
        <h3>{t('universe.create')}</h3>
        <p class="small muted">{t('universe.createHint')}</p>
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
        <p class="small muted">
          {t(soloProgress && bring ? 'universe.bringJoinHint' : 'universe.joinFreshHint')}
        </p>
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
            onClick={() =>
              run(() =>
                actions.enterUniverse(
                  { code: code.trim(), fromSolo: soloProgress && bring },
                  displayName,
                ),
              )
            }
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
  const solo = useSoloColony();
  const [bring, setBring] = useState(true);
  const [displayName, setDisplayName] = useState(savedDisplayName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!code) return null;
  const close = () => uiStore.setState({ pendingJoin: null });
  const join = async () => {
    setBusy(true);
    const err = await actions.enterUniverse({ code, fromSolo: !!solo && bring }, displayName);
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
      {solo && <BringSolo solo={solo} bring={bring} setBring={setBring} />}
      <p class="small muted">
        {t(solo && bring ? 'universe.bringJoinHint' : 'universe.joinFreshHint')}
      </p>
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
