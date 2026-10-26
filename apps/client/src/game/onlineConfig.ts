// Kept separate from onlineBackend.ts so that supabase-js is only downloaded in online mode.
import type { ServerError } from '@kiwar/shared';

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

/** The server answered, with an error code (not a connection problem). */
export class ServerFailure extends Error {
  constructor(readonly code: ServerError) {
    super(`server error: ${code}`);
  }
}

/** The server sent a colony newer than this client can read: the page must be reloaded. */
export class OutdatedClient extends Error {}

/** What to tell the player about a failed server exchange. */
export function failureCode(e: unknown): ServerError | 'network' | 'outdated' | 'broken' {
  if (e instanceof ServerFailure) return e.code;
  if (e instanceof NetworkError) return 'network';
  if (e instanceof OutdatedClient) return 'outdated';
  // A bug on this device (a state the client could not advance or draw): say so, and log it.
  console.error(e);
  return 'broken';
}
