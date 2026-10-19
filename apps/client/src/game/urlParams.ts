import { isFace, type Face } from '@kiwar/shared';

export interface UrlWorldParams {
  seed: string | null;
  face: Face | null;
}

export function readUrlParams(search = window.location.search): UrlWorldParams {
  const params = new URLSearchParams(search);
  const seed = params.get('seed');
  const face = params.get('face');
  return {
    seed: seed && seed.trim() ? seed.trim().slice(0, 64) : null,
    face: isFace(face) ? face : null,
  };
}

/** Removes the world params from the address bar once consumed (keeps reloads from resetting). */
export function clearUrlParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('seed');
  url.searchParams.delete('face');
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
