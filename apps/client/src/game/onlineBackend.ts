import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { GameRequest, GameResponse } from '@kiwar/shared';
import { NetworkError, type OnlineConfig } from './onlineConfig';
import {
  takeAuthRedirectError,
  writeGuestStash,
  writeLastAccount,
  type AuthRedirectError,
} from './authRedirect';

export interface Account {
  userId: string;
  /** Guest (anonymous Supabase user) until linked to Google or an email. */
  isAnonymous: boolean;
  email: string | null;
  providers: string[];
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

/** Auth and game calls give up after this long (a hung request must not freeze the boot). */
const INIT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NetworkError(`${what} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Thin wrapper over Supabase: guest auth, account linking and the `game` edge function. */
export class OnlineBackend {
  readonly client: SupabaseClient;
  private account: Account | null = null;
  /** Error that came back from the last redirect (Google, magic link), shown once. */
  readonly redirectError: AuthRedirectError | null;

  constructor(config: OnlineConfig, onAccount: (account: Account | null) => void) {
    const { error, cleaned } = takeAuthRedirectError(window.location.href);
    this.redirectError = error;
    if (error) window.history.replaceState(window.history.state, '', cleaned);
    this.client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this.account = toAccount(session);
      if (this.account && !this.account.isAnonymous)
        writeLastAccount({
          provider: this.account.providers.includes('google') ? 'google' : 'email',
          email: this.account.email,
        });
      onAccount(this.account);
    });
  }

  /** Restores the session, or starts playing immediately as a guest. */
  init(): Promise<Account> {
    return withTimeout(this.restore(), INIT_TIMEOUT_MS, 'sign-in');
  }

  private async restore(): Promise<Account> {
    const { data, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) console.error('session', sessionError);
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

  call(request: GameRequest): Promise<GameResponse> {
    return withTimeout(this.invoke(request), CALL_TIMEOUT_MS, request.action);
  }

  private async invoke(request: GameRequest): Promise<GameResponse> {
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

  /**
   * Before switching to another account, remember the guest so its colony can follow
   * (`guestTransfer`). The token lives until it expires (about an hour).
   */
  private async stashGuest(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    const session = data.session;
    if (!session?.user.is_anonymous) return;
    writeGuestStash({
      token: session.access_token,
      userId: session.user.id,
      expiresAt: (session.expires_at ?? 0) * 1000,
    });
  }

  /** Returning player (or a Google account already used): the guest colony may follow. */
  async signInWithGoogle(): Promise<void> {
    await this.stashGuest();
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: this.redirectTo() },
    });
    if (error) throw error;
  }

  async signInWithEmail(email: string): Promise<void> {
    await this.stashGuest();
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
