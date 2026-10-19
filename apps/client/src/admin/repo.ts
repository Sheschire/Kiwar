import type { SupabaseClient } from '@supabase/supabase-js';
import type { SoundBinding } from '../audio/binding';
import type { SoundEventId } from '../audio/catalog';
import {
  parseManifest,
  storageUrl,
  type AudioAsset,
  type AudioManifest,
  type RemoteConfig,
} from '../audio/manifest';
import {
  deleteSandboxFile,
  putSandboxFile,
  readSandbox,
  sandboxUrls,
  writeSandbox,
} from '../audio/sandbox';

/** Where the admin space reads and writes sounds: the Supabase project or this browser. */
export interface AudioRepo {
  readonly kind: 'server' | 'sandbox';
  load(): Promise<AudioManifest>;
  /** `null` removes the override (back to the built-in default). */
  saveBinding(id: SoundEventId, binding: SoundBinding | null): Promise<void>;
  upload(file: Blob, name: string, mime: string, durationMs: number): Promise<AudioAsset>;
  rename(asset: AudioAsset, name: string): Promise<void>;
  remove(asset: AudioAsset): Promise<void>;
  urls(manifest: AudioManifest): Promise<Map<string, string>>;
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};
export const ACCEPTED_MIMES = Object.keys(EXT);

/** File type from the browser, or from the extension when the browser does not know it. */
export function audioMime(file: File): string | null {
  if (ACCEPTED_MIMES.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    m4a: 'audio/mp4',
  };
  return (ext && byExt[ext]) || null;
}

export class ServerRepo implements AudioRepo {
  readonly kind = 'server';
  constructor(
    private readonly client: SupabaseClient,
    private readonly cfg: RemoteConfig,
  ) {}

  async load(): Promise<AudioManifest> {
    const [bindings, assets] = await Promise.all([
      this.client.from('audio_bindings').select('event_id, binding'),
      this.client
        .from('audio_assets')
        .select('id, name, path, mime, duration_ms, size_bytes')
        .order('created_at'),
    ]);
    if (bindings.error) throw bindings.error;
    if (assets.error) throw assets.error;
    return parseManifest({
      bindings: Object.fromEntries(
        (bindings.data as { event_id: string; binding: unknown }[]).map((b) => [
          b.event_id,
          b.binding,
        ]),
      ),
      assets: (assets.data as Record<string, unknown>[]).map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        mime: a.mime,
        durationMs: a.duration_ms,
        sizeBytes: a.size_bytes,
      })),
    });
  }

  async saveBinding(id: SoundEventId, binding: SoundBinding | null): Promise<void> {
    const table = this.client.from('audio_bindings');
    const { error } = binding
      ? await table.upsert({ event_id: id, binding }, { onConflict: 'event_id' })
      : await table.delete().eq('event_id', id);
    if (error) throw error;
  }

  async upload(file: Blob, name: string, mime: string, durationMs: number): Promise<AudioAsset> {
    const id = crypto.randomUUID();
    const path = `${id}.${EXT[mime] ?? 'bin'}`;
    const bucket = this.client.storage.from('audio');
    // Raw bytes (a Blob would be sent as multipart form data).
    const up = await bucket.upload(path, await file.arrayBuffer(), {
      contentType: mime,
      upsert: false,
    });
    if (up.error) throw up.error;
    const asset: AudioAsset = { id, name, path, mime, durationMs, sizeBytes: file.size };
    const { error } = await this.client.from('audio_assets').insert({
      id,
      name,
      path,
      mime,
      duration_ms: durationMs,
      size_bytes: file.size,
    });
    if (error) {
      await bucket.remove([path]);
      throw error;
    }
    return asset;
  }

  async rename(asset: AudioAsset, name: string): Promise<void> {
    const { error } = await this.client.from('audio_assets').update({ name }).eq('id', asset.id);
    if (error) throw error;
  }

  async remove(asset: AudioAsset): Promise<void> {
    const { error } = await this.client.storage.from('audio').remove([asset.path]);
    if (error) throw error;
    const del = await this.client.from('audio_assets').delete().eq('id', asset.id);
    if (del.error) throw del.error;
  }

  urls(manifest: AudioManifest): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    for (const a of manifest.assets) urls.set(`asset:${a.id}`, storageUrl(this.cfg, a.path));
    return Promise.resolve(urls);
  }
}

export class SandboxRepo implements AudioRepo {
  readonly kind = 'sandbox';

  load(): Promise<AudioManifest> {
    return Promise.resolve(readSandbox().manifest);
  }

  /** Every change switches the sandbox on for this browser's game. */
  private update(change: (m: AudioManifest) => AudioManifest): void {
    writeSandbox({ enabled: true, manifest: change(readSandbox().manifest) });
  }

  saveBinding(id: SoundEventId, binding: SoundBinding | null): Promise<void> {
    this.update((m) => {
      const bindings = { ...m.bindings };
      if (binding) bindings[id] = binding;
      else delete bindings[id];
      return { ...m, bindings };
    });
    return Promise.resolve();
  }

  async upload(file: Blob, name: string, mime: string, durationMs: number): Promise<AudioAsset> {
    const id = crypto.randomUUID();
    await putSandboxFile(id, file);
    const asset: AudioAsset = {
      id,
      name,
      path: `${id}.${EXT[mime] ?? 'bin'}`,
      mime,
      durationMs,
      sizeBytes: file.size,
    };
    this.update((m) => ({ ...m, assets: [...m.assets, asset] }));
    return asset;
  }

  rename(asset: AudioAsset, name: string): Promise<void> {
    this.update((m) => ({
      ...m,
      assets: m.assets.map((a) => (a.id === asset.id ? { ...a, name } : a)),
    }));
    return Promise.resolve();
  }

  async remove(asset: AudioAsset): Promise<void> {
    await deleteSandboxFile(asset.id);
    this.update((m) => ({ ...m, assets: m.assets.filter((a) => a.id !== asset.id) }));
  }

  urls(manifest: AudioManifest): Promise<Map<string, string>> {
    return sandboxUrls(manifest);
  }
}

/** Duration of an audio file, decoded offline (no playback, no gesture needed). */
export async function audioDurationMs(file: Blob): Promise<number> {
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    return Math.round(buffer.duration * 1000);
  } catch {
    return -1;
  }
}
