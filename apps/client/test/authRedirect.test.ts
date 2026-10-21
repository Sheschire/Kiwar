import { describe, expect, it } from 'vitest';
import { shouldAutoSignIn, takeAuthRedirectError } from '../src/game/authRedirect';
import { isTaken } from '../src/ui/components/AccountSection';

describe('auth redirect errors', () => {
  it('reads an error from the hash and removes it', () => {
    const { error, cleaned } = takeAuthRedirectError(
      'https://kiwars.vercel.app/#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user',
    );
    expect(error).toEqual({
      code: 'identity_already_exists',
      description: 'Identity is already linked to another user',
    });
    expect(cleaned).toBe('https://kiwars.vercel.app/');
  });

  it('reads an error from the query string and keeps the other parameters', () => {
    const { error, cleaned } = takeAuthRedirectError(
      'https://kiwars.vercel.app/?join=ABCD1234&error=access_denied&error_description=denied',
    );
    expect(error).toEqual({ code: 'access_denied', description: 'denied' });
    expect(cleaned).toBe('https://kiwars.vercel.app/?join=ABCD1234');
  });

  it('leaves a normal URL (or a session hash) untouched', () => {
    const url = 'https://kiwars.vercel.app/#access_token=abc&refresh_token=def';
    expect(takeAuthRedirectError(url)).toEqual({ error: null, cleaned: url });
  });

  it('recognises an email or a Google account that already has a user', () => {
    expect(isTaken({ message: 'x', code: 'email_exists' })).toBe(true);
    expect(isTaken({ message: 'A user with this email address has already been registered' })).toBe(
      true,
    );
    expect(isTaken({ message: 'Network down' })).toBe(false);
  });

  it('signs a guest in to an existing Google account once per tab', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const taken = { code: 'identity_already_exists', description: '' };
    expect(shouldAutoSignIn({ code: 'access_denied', description: '' }, true, storage)).toBe(false);
    expect(shouldAutoSignIn(taken, false, storage)).toBe(false);
    expect(shouldAutoSignIn(taken, true, storage)).toBe(true);
    expect(shouldAutoSignIn(taken, true, storage)).toBe(false);
  });
});
