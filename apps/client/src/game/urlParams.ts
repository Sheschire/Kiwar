import { isFace, type Face } from '@kiwar/shared';

export interface UrlWorldParams {
  seed: string | null;
  face: Face | null;
  /** Invite code of a shared universe (`?join=ABCD2345`). */
  join: string | null;
}

export function readUrlParams(search = window.location.search): UrlWorldParams {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  const face = params.get('face');
  const join = params.get('join')?.trim().toUpperCase() ?? '';
  return {
    seed: seed && seed.trim() ? seed.trim().slice(0, 64) : null,
    face: isFace(face) ? face : null,
    join: /^[A-HJ-NP-Z2-9]{8}$/.test(join) ? join : null,
  };
}

/** Removes the world params from the address bar once consumed (keeps reloads from resetting). */
export function clearUrlParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  url.searchParams.delete('face');
  url.searchParams.delete('join');
  window.history.replaceState(null, '', url.toString());
}

/** Short human-friendly random seed (client-side only: the simulation never draws randomness). */
export function randomSeed(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/** Shareable invite link to a universe. */
export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', code);
  return url.toString();
}
