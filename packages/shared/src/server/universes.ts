import { alienDefOf } from '../data/expeditions';
import type { ExpeditionTarget } from '../sim/state';
import type { BuildingType } from '../data/buildings';
import type { FaceParams } from '../worldgen/generateFace';
import { FACES, type Face } from '../types/ids';

/**
 * Shared universes (milestone 3). A universe holds several kiwis (pairs of faces). Each player
 * owns one face; every face without a player is held by aliens. There is always at least one
 * alien face: the universe grows by one kiwi whenever all faces are taken.
 */

export const MAX_PLAYERS = 8;

export interface UniverseSummary {
  id: string;
  name: string;
  code: string;
  players: number;
  maxPlayers: number;
}

export interface UniverseMember {
  userId: string;
  displayName: string;
  kiwiIndex: number;
  face: Face;
}

export interface UniverseInfo extends UniverseSummary {
  seed: string;
  members: UniverseMember[];
  kiwiCount: number;
  /** Creation time: start of the shared calendar. */
  createdAt?: number;
}

/**
 * What a player sees of a friend living on the other half of their kiwi (chantier 05): the
 * layout only (no stocks), refreshed when the universe is loaded or its info refreshed.
 */
export interface TwinSnapshot {
  owner: string;
  face: Face;
  params: FaceParams;
  buildings: { type: BuildingType; level: number; q: number; r: number }[];
  paths: string[];
  /** Server time of the snapshot. */
  at: number;
}

/** Number of kiwis: enough for every player plus at least one alien face. */
export function kiwiCount(members: number): number {
  return Math.floor(members / 2) + 1;
}

/** First free face, filling kiwi after kiwi (so new friends land on a twin face first). */
export function assignFace(members: Pick<UniverseMember, 'kiwiIndex' | 'face'>[]): {
  kiwiIndex: number;
  face: Face;
} {
  const taken = new Set(members.map((m) => `${m.kiwiIndex}:${m.face}`));
  for (let k = 0; ; k++) {
    for (const face of FACES) if (!taken.has(`${k}:${face}`)) return { kiwiIndex: k, face };
  }
}

/** Seed of a kiwi planet: both faces of a kiwi share it, so they are two halves of one fruit. */
export function kiwiSeed(universeSeed: string, kiwiIndex: number): string {
  return `${universeSeed}-k${kiwiIndex}`;
}

/** Alien-held faces a member can send expeditions to (co-op: players never target players). */
export function universeTargets(
  members: Pick<UniverseMember, 'kiwiIndex' | 'face'>[],
  me: { kiwiIndex: number; face: Face },
): ExpeditionTarget[] {
  const taken = new Set(members.map((m) => `${m.kiwiIndex}:${m.face}`));
  const targets: ExpeditionTarget[] = [];
  for (let k = 0; k < kiwiCount(members.length); k++) {
    for (const face of FACES) {
      if (taken.has(`${k}:${face}`)) continue;
      const distance = Math.abs(k - me.kiwiIndex);
      // Public part only: the garrison itself is drawn server-side (`ensureAliens`).
      targets.push({
        id: `aliens:${k}:${face}`,
        owner: 'aliens',
        kiwiIndex: k,
        face,
        distance,
        travelMs: alienDefOf(distance).travelMs,
      });
    }
  }
  return targets.sort((a, b) => a.distance - b.distance);
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Invite code from random bytes (the caller provides the randomness). */
export function inviteCode(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function isInviteCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code);
}
