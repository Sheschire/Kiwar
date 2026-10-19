import { z } from 'zod';
import { bindingSchema, type SoundBinding } from './binding';
import { isSoundEventId, type SoundEventId } from './catalog';
import { audio } from './engine';

/** A sound file uploaded from the admin space. */
export const assetSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  name: z.string().min(1).max(80),
  path: z.string().max(200),
  mime: z.string().max(40),
  durationMs: z.number().int().min(0).default(0),
  sizeBytes: z.number().int().min(0).default(0),
});
export type AudioAsset = z.infer<typeof assetSchema>;

/**
 * Everything the game needs to know about custom sounds: the bindings that override the
 * built-in defaults and the uploaded files they use. Also the admin export/import format.
 */
export interface AudioManifest {
  version: 1;
  bindings: Partial<Record<SoundEventId, SoundBinding>>;
  assets: AudioAsset[];
}

export const EMPTY_MANIFEST: AudioManifest = { version: 1, bindings: {}, assets: [] };

/** Validates untrusted manifest data; invalid entries are dropped, never fatal. */
export function parseManifest(data: unknown): AudioManifest {
  const out: AudioManifest = { version: 1, bindings: {}, assets: [] };
  if (!data || typeof data !== 'object') return out;
  const raw = data as { bindings?: unknown; assets?: unknown };
  if (raw.bindings && typeof raw.bindings === 'object') {
    for (const [id, value] of Object.entries(raw.bindings as Record<string, unknown>)) {
      if (!isSoundEventId(id)) continue;
      const parsed = bindingSchema.safeParse(value);
      if (parsed.success) out.bindings[id] = parsed.data;
    }
  }
  if (Array.isArray(raw.assets)) {
    for (const a of raw.assets) {
      const parsed = assetSchema.safeParse(a);
      if (parsed.success) out.assets.push(parsed.data);
    }
  }
  return out;
}

/** `asset:<id>` → URL map for the engine. */
export function assetUrls(
  manifest: AudioManifest,
  urlOf: (asset: AudioAsset) => string | null,
): Map<string, string> {
  const urls = new Map<string, string>();
  for (const a of manifest.assets) {
    const url = urlOf(a);
    if (url) urls.set(`asset:${a.id}`, url);
  }
  return urls;
}

// ---- Supabase (public read through PostgREST, no supabase-js needed) ----

export interface RemoteConfig {
  url: string;
  anonKey: string;
}

interface BindingRow {
  event_id: string;
  binding: unknown;
}
interface AssetRow {
  id: string;
  name: string;
  path: string;
  mime: string;
  duration_ms: number;
  size_bytes: number;
}

export const storageUrl = (cfg: RemoteConfig, path: string) =>
  `${cfg.url}/storage/v1/object/public/audio/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function fetchRemoteManifest(cfg: RemoteConfig): Promise<AudioManifest> {
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` };
  const get = async <T>(path: string): Promise<T[]> => {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`audio manifest: ${res.status}`);
    return (await res.json()) as T[];
  };
  const [bindings, assets] = await Promise.all([
    get<BindingRow>('audio_bindings?select=event_id,binding'),
    get<AssetRow>('audio_assets?select=id,name,path,mime,duration_ms,size_bytes'),
  ]);
  return parseManifest({
    bindings: Object.fromEntries(bindings.map((b) => [b.event_id, b.binding])),
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      path: a.path,
      mime: a.mime,
      durationMs: a.duration_ms,
      sizeBytes: a.size_bytes,
    })),
  });
}

// ---- Startup ----

const CACHE_KEY = 'kiwar.audio.manifest';

function readCache(): AudioManifest | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? parseManifest(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(manifest: AudioManifest): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(manifest));
  } catch {
    // ignore
  }
}

/** Optional hook (the local sandbox of the admin space) that overrides the shared manifest. */
export type ManifestOverride = () => Promise<{
  manifest: AudioManifest;
  urls: Map<string, string>;
} | null>;

/**
 * Loads custom sounds without ever blocking the game: cached manifest first, then the fresh
 * one from Supabase; a local sandbox (admin space, same browser) wins over both.
 */
export async function loadAudioManifest(
  cfg: RemoteConfig | null,
  override?: ManifestOverride,
): Promise<void> {
  const local = await override?.().catch(() => null);
  if (local) {
    audio.configure(local.manifest.bindings, local.urls);
    return;
  }
  if (!cfg) return;
  const apply = (m: AudioManifest) =>
    audio.configure(
      m.bindings,
      assetUrls(m, (a) => storageUrl(cfg, a.path)),
    );
  const cached = readCache();
  if (cached) apply(cached);
  try {
    const fresh = await fetchRemoteManifest(cfg);
    writeCache(fresh);
    apply(fresh);
  } catch (error) {
    console.warn('[audio] manifest not loaded, using defaults', error);
  }
}
