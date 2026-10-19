import { useState } from 'preact/hooks';
import { makeBinding } from '../audio/binding';
import { BUILTIN_FILES } from '../audio/builtin';
import { SOUND_EVENT_IDS } from '../audio/catalog';
import { audio } from '../audio/engine';
import { SYNTH_PRESET_IDS } from '../audio/synth';
import type { AdminContext } from './AdminApp';
import { audioDurationMs, audioMime, MAX_FILE_BYTES } from './repo';
import { fmt } from './strings';

const preview = (source: string) => audio.preview(makeBinding({ sources: [source] }), 'sfx');

export const formatMs = (ms: number) =>
  ms < 0 ? '?' : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
const formatKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} Ko`;

/** Upload, listen to, rename and delete sound files; list the built-in sounds. */
export function SoundsTab({ ctx }: { ctx: AdminContext }) {
  const { s, manifest } = ctx;
  const [busy, setBusy] = useState<string | null>(null);

  const usedBy = (ref: string) =>
    SOUND_EVENT_IDS.filter((id) => manifest.bindings[id]?.sources.includes(ref));

  const upload = async (files: File[]) => {
    for (const file of files) {
      const mime = audioMime(file);
      if (!mime) {
        ctx.notify(fmt(s.sounds.badType, { name: file.name }), true);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        ctx.notify(fmt(s.sounds.tooBig, { name: file.name }), true);
        continue;
      }
      const duration = await audioDurationMs(file);
      if (duration < 0) {
        ctx.notify(fmt(s.sounds.undecodable, { name: file.name }), true);
        continue;
      }
      setBusy(fmt(s.sounds.uploading, { name: file.name }));
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'son';
      await ctx.run((r) => r.upload(file, name, mime, duration));
    }
    setBusy(null);
  };

  const remove = async (id: string) => {
    const asset = manifest.assets.find((a) => a.id === id);
    if (!asset || !window.confirm(fmt(s.sounds.confirmRemove, { name: asset.name }))) return;
    const ref = `asset:${id}`;
    await ctx.run(async (r) => {
      // Events keep their other sounds.
      for (const ev of usedBy(ref)) {
        const b = manifest.bindings[ev]!;
        await r.saveBinding(ev, { ...b, sources: b.sources.filter((x) => x !== ref) });
      }
      await r.remove(asset);
    });
  };

  return (
    <div class="admin-sounds">
      <section class="parchment admin-card">
        <label class="btn btn-primary file-btn">
          {s.sounds.upload}
          <input
            type="file"
            multiple
            accept="audio/*,.mp3,.ogg,.oga,.wav,.webm,.m4a"
            onChange={(e) => {
              const input = e.currentTarget;
              const files = input.files ? Array.from(input.files) : [];
              input.value = '';
              if (files.length) void upload(files);
            }}
          />
        </label>
        <p class="small muted">{busy ?? s.sounds.uploadHint}</p>

        {manifest.assets.length === 0 ? (
          <p class="muted">{s.sounds.empty}</p>
        ) : (
          <ul class="asset-list">
            {manifest.assets.map((a) => {
              const users = usedBy(`asset:${a.id}`);
              return (
                <li key={a.id} class="asset">
                  <button
                    class="btn btn-icon btn-small"
                    aria-label={s.sounds.play}
                    title={s.sounds.play}
                    onClick={() => preview(`asset:${a.id}`)}
                  >
                    ▶
                  </button>
                  <input
                    class="input asset-name"
                    aria-label={s.sounds.name}
                    value={a.name}
                    maxLength={80}
                    onChange={(e) => {
                      const name = e.currentTarget.value.trim();
                      if (name && name !== a.name) void ctx.run((r) => r.rename(a, name));
                    }}
                  />
                  <span class="asset-meta small muted">
                    {formatMs(a.durationMs)} · {formatKb(a.sizeBytes)} · {s.sounds.usedBy}{' '}
                    {users.length ? users.join(', ') : s.sounds.unused}
                  </span>
                  <button class="btn btn-small btn-danger-soft" onClick={() => void remove(a.id)}>
                    {s.sounds.remove}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section class="parchment admin-card">
        <h2>{s.sounds.builtin}</h2>
        <p class="small muted">{s.sounds.builtinHint}</p>
        <div class="builtin-grid">
          {[
            ...BUILTIN_FILES.map((f) => `builtin:${f}`),
            ...SYNTH_PRESET_IDS.map((p) => `synth:${p}`),
          ].map((ref) => (
            <button key={ref} class="btn btn-small" onClick={() => preview(ref)}>
              ▶ {sourceLabel(ref)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Short human label of a source reference. */
export function sourceLabel(ref: string, assetName?: string): string {
  if (ref.startsWith('synth:')) return `♪ ${ref.slice(6)}`;
  if (ref.startsWith('builtin:')) return `📁 ${ref.slice(8).replace(/\.\w+$/, '')}`;
  return `⬆ ${assetName ?? ref.slice(6, 14)}`;
}
