import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRequest, GameResponse } from '@kiwar/shared';

export interface Account {
  userId: string;
  /** Guest (anonymous Supabase user) until linked to Google or an email. */
  isAnonymous: boolean;
  email: string | null;
  providers: string[];
}

export class NetworkError extends Error {}

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

function toAccount(session: Session | null): Account | null {
  const user = session?.user;
  if (!user) return null;
  return {
    userId: user.id,
    isAnonymous: user.is_anonymous ?? false,
    email: user.email ?? null,
    providers: (user.identities ?? []).map((i) => i.provider),
  };
}

/** Thin wrapper over Supabase: guest auth, account linking and the `game` edge function. */
export class OnlineBackend {
  readonly client: SupabaseClient;
  private account: Account | null = null;

  constructor(config: OnlineConfig, onAccount: (account: Account | null) => void) {
    this.client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this.account = toAccount(session);
      onAccount(this.account);
    });
  }

  /** Restores the session, or starts playing immediately as a guest. */
  async init(): Promise<Account> {
    const { data } = await this.client.auth.getSession();
    let session = data.session;
    if (!session) {
      const { data: anon, error } = await this.client.auth.signInAnonymously();
      if (error || !anon.session)
        throw new NetworkError(error?.message ?? 'anonymous sign-in failed');
      session = anon.session;
    }
    this.account = toAccount(session);
    return this.account!;
  }

  get currentAccount(): Account | null {
    return this.account;
  }

  async call(request: GameRequest): Promise<GameResponse> {
    const { data, error } = await this.client.functions.invoke<GameResponse>('game', {
      body: request,
    });
    if (data && typeof data === 'object' && 'serverTime' in data) return data;
    // Non-2xx responses still carry a JSON body with the error code.
    const context = (error as { context?: Response } | null)?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as GameResponse;
        if (body && 'serverTime' in body) return body;
      } catch {
        // fall through
      }
    }
    throw new NetworkError(error?.message ?? 'game function unreachable');
  }

  private redirectTo(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  /** Guest → permanent account with Google (keeps the same user and colony). */
  async linkGoogle(): Promise<void> {
    const { error } = await this.client.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: this.redirectTo() },
    });
    if (error) throw error;
  }

  /** Guest → permanent account with an email: a confirmation link is sent. */
  async linkEmail(email: string): Promise<void> {
    const { error } = await this.client.auth.updateUser(
      { email },
      { emailRedirectTo: this.redirectTo() },
    );
    if (error) throw error;
  }

  /** Returning player on another device (replaces the current guest). */
  async signInWithGoogle(): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: this.redirectTo() },
    });
    if (error) throw error;
  }

  async signInWithEmail(email: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: this.redirectTo(), shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}
