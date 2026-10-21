// Auth helpers kept out of `onlineBackend` (which loads supabase-js on demand): errors sent
// back on the redirect URL, and the guest remembered while signing in to another account.

/** An error Supabase or Google sent back on the redirect URL (e.g. a failed Google link). */
export interface AuthRedirectError {
  code: string;
  description: string;
}

const ERROR_KEYS = ['error', 'error_code', 'error_description'];

/**
 * Reads an auth error from the query string or the hash of `url`, and returns the URL without
 * it. supabase-js drops these errors silently (`detectSessionInUrl`): read them before it runs.
 */
export function takeAuthRedirectError(url: string): {
  error: AuthRedirectError | null;
  cleaned: string;
} {
  const u = new URL(url);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const from = hash.has('error') || hash.has('error_code') ? hash : u.searchParams;
  if (!from.has('error') && !from.has('error_code')) return { error: null, cleaned: url };
  const error = {
    code: from.get('error_code') || from.get('error') || 'unknown',
    description: from.get('error_description') ?? '',
  };
  for (const key of ERROR_KEYS) {
    hash.delete(key);
    u.searchParams.delete(key);
  }
  const rest = hash.toString();
  u.hash = rest ? `#${rest}` : '';
  return { error, cleaned: u.toString() };
}

/** Guest whose colony should follow when signing in to another account. */
export interface GuestStash {
  token: string;
  userId: string;
  /** Epoch ms after which the token is no longer valid. */
  expiresAt: number;
}

const GUEST_STASH_KEY = 'kiwar.guestTransfer';

export function readGuestStash(now = Date.now()): GuestStash | null {
  try {
    const stash = JSON.parse(localStorage.getItem(GUEST_STASH_KEY) ?? 'null') as GuestStash | null;
    if (stash && stash.expiresAt > now && stash.token && stash.userId) return stash;
    if (stash) localStorage.removeItem(GUEST_STASH_KEY);
  } catch {
    // unreadable: nothing to bring
  }
  return null;
}

export function writeGuestStash(stash: GuestStash): void {
  try {
    localStorage.setItem(GUEST_STASH_KEY, JSON.stringify(stash));
  } catch {
    // storage blocked: the guest colony simply stays behind
  }
}

export function clearGuestStash(): void {
  try {
    localStorage.removeItem(GUEST_STASH_KEY);
  } catch {
    // ignore
  }
}
