import { useCallback, useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { audio } from '../audio/engine';
import { EMPTY_MANIFEST, parseManifest, type AudioManifest } from '../audio/manifest';
import { readSandbox, writeSandbox } from '../audio/sandbox';
import { isSoundEventId } from '../audio/catalog';
import { onlineConfig } from '../game/onlineConfig';
import { detectLang, LANGS, persistLang, type Lang } from '../i18n/i18n';
import { SandboxRepo, ServerRepo, type AudioRepo } from './repo';
import { ADMIN_STRINGS, fmt, type AdminStrings } from './strings';
import { SoundsTab } from './SoundsTab';
import { BindingsTab } from './BindingsTab';

type Tab = 'sounds' | 'bindings';

type Access =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'signedOut'; client: SupabaseClient }
  | { kind: 'notAdmin'; client: SupabaseClient; userId: string; who: string }
  | { kind: 'admin'; client: SupabaseClient; who: string };

/** Shared by the tabs: current repo, manifest, file URLs and a way to change them. */
export interface AdminContext {
  s: AdminStrings;
  repo: AudioRepo;
  manifest: AudioManifest;
  /** Runs a change against the repo, then reloads the manifest everywhere. */
  run(change: (repo: AudioRepo) => Promise<unknown>): Promise<boolean>;
  notify(text: string, error?: boolean): void;
}

async function resolveAccess(): Promise<Access> {
  const cfg = onlineConfig();
  if (!cfg) return { kind: 'offline' };
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  if (!user) return { kind: 'signedOut', client };
  const who = user.email ?? (user.is_anonymous ? '' : user.id.slice(0, 8));
  const { data: isAdmin, error } = await client.rpc('is_admin');
  if (error || isAdmin !== true) return { kind: 'notAdmin', client, userId: user.id, who };
  return { kind: 'admin', client, who };
}

export function AdminApp() {
  const [lang, setLang] = useState<Lang>(detectLang());
  const s = ADMIN_STRINGS[lang];
  const [access, setAccess] = useState<Access>({ kind: 'loading' });
  const [useServer, setUseServer] = useState(true);
  const [tab, setTab] = useState<Tab>('bindings');
  const [manifest, setManifest] = useState<AudioManifest>(EMPTY_MANIFEST);
  const [sandboxOn, setSandboxOn] = useState(readSandbox().enabled);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    resolveAccess()
      .then(setAccess)
      .catch(() => setAccess({ kind: 'offline' }));
  }, []);

  const cfg = onlineConfig();
  const repo: AudioRepo | null =
    access.kind === 'loading'
      ? null
      : access.kind === 'admin' && useServer && cfg
        ? new ServerRepo(access.client, cfg)
        : new SandboxRepo();
  const repoKey = `${access.kind}/${repo?.kind}`;

  const notify = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    window.setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 4000);
  }, []);

  const reload = useCallback(async (r: AudioRepo) => {
    const m = await r.load();
    setManifest(m);
    setSandboxOn(readSandbox().enabled);
    // The admin page plays through the real engine, with the edited configuration.
    audio.configure(m.bindings, await r.urls(m));
  }, []);

  useEffect(() => {
    if (repo) reload(repo).catch((e: Error) => notify(e.message, true));
    // Reload only when the repo changes.
  }, [repoKey]);

  if (!repo) return <div class="admin-loading">{s.loading}</div>;

  const ctx: AdminContext = {
    s,
    repo,
    manifest,
    notify,
    run: async (change) => {
      try {
        await change(repo);
        await reload(repo);
        return true;
      } catch (e) {
        notify(fmt(s.bindings.error, { message: (e as Error).message }), true);
        await reload(repo).catch(() => {});
        return false;
      }
    },
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kiwar-sounds-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return notify(s.io.invalid, true);
    }
    const imported = parseManifest(data);
    const ids = Object.keys(imported.bindings).filter(isSoundEventId);
    if (ids.length === 0) return notify(s.io.invalid, true);
    const known = new Set(manifest.assets.map((a) => `asset:${a.id}`));
    const missing = new Set(
      ids.flatMap((id) =>
        imported.bindings[id]!.sources.filter((src) => src.startsWith('asset:') && !known.has(src)),
      ),
    );
    const ok = await ctx.run(async (r) => {
      for (const id of ids) await r.saveBinding(id, imported.bindings[id]!);
    });
    if (ok) {
      notify(fmt(s.io.imported, { count: ids.length }));
      if (missing.size > 0) notify(fmt(s.io.missing, { count: missing.size }), true);
    }
  };

  const toggleSandbox = (enabled: boolean) => {
    writeSandbox({ ...readSandbox(), enabled });
    setSandboxOn(enabled);
  };

  return (
    <div class="admin">
      <header class="admin-header parchment">
        <h1>{s.title}</h1>
        <div class="admin-header-tools">
          <div class="segmented" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button
                key={l}
                class={`btn btn-small ${l === lang ? 'btn-active' : ''}`}
                aria-pressed={l === lang}
                onClick={() => {
                  persistLang(l);
                  setLang(l);
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <a class="btn btn-small" href="./">
            {s.backToGame}
          </a>
        </div>
      </header>

      <section class="admin-access parchment">
        <AccessPanel access={access} s={s} onSignedOut={() => setAccess({ kind: 'loading' })} />
        {access.kind === 'admin' && (
          <div class="segmented" role="group">
            <button
              class={`btn btn-small ${useServer ? 'btn-active' : ''}`}
              aria-pressed={useServer}
              onClick={() => setUseServer(true)}
            >
              {s.mode.server}
            </button>
            <button
              class={`btn btn-small ${!useServer ? 'btn-active' : ''}`}
              aria-pressed={!useServer}
              onClick={() => setUseServer(false)}
            >
              {s.mode.sandbox}
            </button>
          </div>
        )}
        <p class="small">
          <strong>{repo.kind === 'server' ? s.mode.server : s.mode.sandbox}</strong> —{' '}
          {repo.kind === 'server' ? s.mode.serverHint : s.mode.sandboxHint}
        </p>
        {repo.kind === 'server' && sandboxOn && (
          <p class="small warn">
            {s.mode.sandboxWarning}{' '}
            <button class="btn btn-small" onClick={() => toggleSandbox(false)}>
              {s.mode.stopSandbox}
            </button>
          </p>
        )}
        {repo.kind === 'sandbox' && (
          <label class="check small">
            <input
              type="checkbox"
              checked={sandboxOn}
              onChange={(e) => toggleSandbox(e.currentTarget.checked)}
            />
            {s.mode.useSandbox}
          </label>
        )}
        <div class="row">
          <button class="btn btn-small" onClick={exportJson}>
            {s.io.export}
          </button>
          <label class="btn btn-small file-btn">
            {s.io.import}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void importJson(file);
              }}
            />
          </label>
        </div>
      </section>

      <nav class="admin-tabs" role="tablist">
        {(['bindings', 'sounds'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            class={`btn ${tab === id ? 'btn-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {s.tabs[id]}
          </button>
        ))}
        {(['balance', 'sky'] as const).map((id) => (
          <button key={id} role="tab" class="btn" disabled title={s.soon}>
            {s.tabs[id]}
          </button>
        ))}
      </nav>

      <main class="admin-main">
        {tab === 'sounds' ? (
          <SoundsTab key={repoKey} ctx={ctx} />
        ) : (
          <BindingsTab key={repoKey} ctx={ctx} />
        )}
      </main>

      {message && (
        <div class={`admin-toast parchment ${message.error ? 'is-error' : ''}`} role="status">
          {message.text}
        </div>
      )}
    </div>
  );
}

function AccessPanel({
  access,
  s,
  onSignedOut,
}: {
  access: Access;
  s: AdminStrings;
  onSignedOut(): void;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (access.kind === 'loading') return <p>{s.loading}</p>;
  if (access.kind === 'offline') return <p class="small">{s.auth.offline}</p>;
  const client = access.client;
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const signOut = async () => {
    await client.auth.signOut();
    onSignedOut();
    window.location.reload();
  };
  if (access.kind === 'admin')
    return (
      <p class="small row">
        {fmt(s.auth.signedInAs, { who: access.who || s.auth.guest })}
        <button class="btn btn-small" onClick={() => void signOut()}>
          {s.auth.signOut}
        </button>
      </p>
    );
  return (
    <div class="admin-signin">
      {access.kind === 'signedOut' ? (
        <p class="small">{s.auth.signedOut}</p>
      ) : (
        <>
          <p class="small">
            {fmt(s.auth.signedInAs, { who: access.who || s.auth.guest })} — {s.auth.notAdmin}
          </p>
          <code class="admin-sql">
            insert into public.admins (user_id) values ('{access.userId}');
          </code>
        </>
      )}
      <div class="row">
        <button
          class="btn btn-small"
          onClick={() =>
            void client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
          }
        >
          {s.auth.google}
        </button>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            void client.auth
              .signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
              .then(({ error }) => !error && setSent(true));
          }}
        >
          <input
            class="input"
            type="email"
            required
            placeholder={s.auth.email}
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          <button class="btn btn-small" type="submit">
            {s.auth.sendLink}
          </button>
        </form>
        {access.kind === 'notAdmin' && (
          <button class="btn btn-small" onClick={() => void signOut()}>
            {s.auth.signOut}
          </button>
        )}
      </div>
      {sent && <p class="small">{s.auth.linkSent}</p>}
    </div>
  );
}
