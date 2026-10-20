import { alienDefOf } from '../data/expeditions';
import type { ExpeditionTarget } from '../sim/state';
import type { BuildingType } from '../data/buildings';
import type { FaceParams } from '../worldgen/generateFace';
import { FACES, type Face } from '../types/ids';

/**
 * Shared universes (milestone 3). A universe holds several kiwis (pairs of faces). Each player
 * gets a kiwi of their own and lives on one face; the other half is held by aliens, their own
 * enemy to face. Allies are the other kiwis, far away. (Universes created before this rule may
 * hold two players on one kiwi: they keep it.)
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
  /** Seed of their kiwi when it is not the universe's own (a solo colony brought along). */
  planetSeed?: string;
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

/** An ally's colony on another kiwi of the universe (what we see of it from afar). */
export interface AllySnapshot extends TwinSnapshot {
  kiwiIndex: number;
  /** Seed of their kiwi (to draw the face). */
  seed: string;
}

/**
 * Number of kiwis: one per player, plus one when every face is taken (older universes, where
 * two players shared a kiwi), so there is always an alien face to explore.
 */
export function kiwiCount(members: Pick<UniverseMember, 'kiwiIndex'>[]): number {
  const used = members.reduce((n, m) => Math.max(n, m.kiwiIndex + 1), 0);
  return members.length >= used * FACES.length ? used + 1 : used;
}

/** A newcomer gets the first kiwi nobody lives on (the twin half stays alien). */
export function assignFace(members: Pick<UniverseMember, 'kiwiIndex' | 'face'>[]): {
  kiwiIndex: number;
  face: Face;
} {
  const used = new Set(members.map((m) => m.kiwiIndex));
  let k = 0;
  while (used.has(k)) k++;
  return { kiwiIndex: k, face: FACES[0] };
}

/** Seed of a kiwi planet: both faces of a kiwi share it, so they are two halves of one fruit. */
export function kiwiSeed(universeSeed: string, kiwiIndex: number): string {
  return `${universeSeed}-k${kiwiIndex}`;
}

/** Seed of a kiwi of a universe, including a planet brought along from a solo colony. */
export function planetSeedOf(
  universe: { seed: string; members: Pick<UniverseMember, 'kiwiIndex' | 'planetSeed'>[] },
  kiwiIndex: number,
): string {
  const brought = universe.members.find((m) => m.kiwiIndex === kiwiIndex && m.planetSeed);
  return brought?.planetSeed ?? kiwiSeed(universe.seed, kiwiIndex);
}

/** Alien-held faces a member can send expeditions to (co-op: players never target players). */
export function universeTargets(
  members: Pick<UniverseMember, 'kiwiIndex' | 'face'>[],
  me: { kiwiIndex: number; face: Face },
): ExpeditionTarget[] {
  const taken = new Set(members.map((m) => `${m.kiwiIndex}:${m.face}`));
  const targets: ExpeditionTarget[] = [];
  for (let k = 0; k < kiwiCount(members); k++) {
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
