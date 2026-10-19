// Kept separate from onlineBackend.ts so that supabase-js is only downloaded in online mode.
export interface OnlineConfig {
  url: string;
  anonKey: string;
}

/** Online mode is enabled when the Supabase env vars are set (and not forced off by `?offline=1`). */
export function onlineConfig(): OnlineConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  if (new URLSearchParams(window.location.search).has('offline')) return null;
  return { url, anonKey };
}

export class NetworkError extends Error {}
