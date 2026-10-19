import {
  EMPTY_MANIFEST,
  parseManifest,
  type AudioManifest,
  type ManifestOverride,
} from './manifest';

/**
 * Local sandbox of the admin space: sound settings kept in this browser only (bindings in
 * localStorage, uploaded files in IndexedDB), to experiment without a server. When enabled,
 * the game in the same browser uses it instead of the shared manifest.
 */
export interface SandboxData {
  enabled: boolean;
  manifest: AudioManifest;
}

const KEY = 'kiwar.audio.sandbox';
const DB_NAME = 'kiwar-audio';
const STORE = 'files';

export function readSandbox(): SandboxData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { enabled: false, manifest: { ...EMPTY_MANIFEST } };
    const data = JSON.parse(raw) as { enabled?: unknown; manifest?: unknown };
    return { enabled: data.enabled === true, manifest: parseManifest(data.manifest) };
  } catch {
    return { enabled: false, manifest: { ...EMPTY_MANIFEST } };
  }
}

export function writeSandbox(data: SandboxData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore (private mode)
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const putSandboxFile = (id: string, blob: Blob) =>
  withStore('readwrite', (s) => s.put(blob, id)).then(() => undefined);
export const getSandboxFile = (id: string) =>
  withStore<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteSandboxFile = (id: string) =>
  withStore('readwrite', (s) => s.delete(id)).then(() => undefined);

/** Object URLs of the sandbox files (`asset:<id>` → blob URL). */
export async function sandboxUrls(manifest: AudioManifest): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const a of manifest.assets) {
    const blob = await getSandboxFile(a.id).catch(() => undefined);
    if (blob) urls.set(`asset:${a.id}`, URL.createObjectURL(blob));
  }
  return urls;
}

/** Manifest override for the game: the sandbox, if enabled in this browser. */
export const sandboxOverride: ManifestOverride = async () => {
  const data = readSandbox();
  if (!data.enabled) return null;
  return { manifest: data.manifest, urls: await sandboxUrls(data.manifest) };
};
