/**
 * Identifier types. Most of them are unused in milestone 1 (single player, local save)
 * but are carried in the state so that multiplayer / server authority can be added later.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type UniverseId = Brand<string, 'UniverseId'>;
/** A kiwi *planet* (pair of faces Kiwisu / Kiwino) inside a universe. */
export type KiwiId = Brand<string, 'KiwiId'>;
export type SeasonId = Brand<string, 'SeasonId'>;
/** A kiwi *bird* living on a face (villager). */
export type VillagerId = Brand<string, 'VillagerId'>;
export type BuildingId = Brand<string, 'BuildingId'>;
export type QueueItemId = Brand<string, 'QueueItemId'>;

export const FACES = ['kiwisu', 'kiwino'] as const;
export type Face = (typeof FACES)[number];

export function isFace(value: unknown): value is Face {
  return typeof value === 'string' && (FACES as readonly string[]).includes(value);
}

export function otherFace(face: Face): Face {
  return face === 'kiwisu' ? 'kiwino' : 'kiwisu';
}

/** Epoch milliseconds. All simulation time is expressed as integers in ms. */
export type TimeMs = number;
