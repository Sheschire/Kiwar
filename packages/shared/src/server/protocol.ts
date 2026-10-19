import { z } from 'zod';
import { BUILDING_TYPES } from '../data/buildings';
import type { COMMAND_ERRORS } from '../sim/commands';
import { type Command } from '../sim/commands';
import type { GameEvent } from '../sim/advance';
import type { GameState } from '../sim/state';
import { FACES, type Face } from '../types/ids';
import type { UniverseInfo, UniverseSummary } from './universes';

/**
 * Client ↔ server protocol (milestone 2). The server is authoritative: the client only sends
 * commands; it never sends a state (except a one-time import of a local milestone-1 save).
 */

const id = z.string().min(1).max(64);
const int = z.number().int();

export const commandSchema: z.ZodType<Command> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('build'), buildingType: z.enum(BUILDING_TYPES), q: int, r: int }),
  z.object({ type: z.literal('upgrade'), buildingId: id }),
  z.object({ type: z.literal('cancel'), queueItemId: id }),
  z.object({ type: z.literal('assignWorkers'), buildingId: id, count: int.min(0).max(100) }),
  z.object({ type: z.literal('hatchEgg') }),
  z.object({ type: z.literal('claimObjective') }),
  z.object({
    type: z.literal('launchExpedition'),
    launchpadId: id,
    targetId: id,
    crew: int.min(0).max(1000),
    provisions: z.object({ pulp: z.number().min(0).max(1e7), juice: z.number().min(0).max(1e7) }),
  }),
  z.object({
    type: z.literal('buildPath'),
    tiles: z
      .array(z.object({ q: int, r: int }))
      .min(1)
      .max(40),
  }),
  z.object({
    type: z.literal('removePath'),
    tiles: z
      .array(z.object({ q: int, r: int }))
      .min(1)
      .max(40),
  }),
  z.object({ type: z.literal('gather'), q: int, r: int }),
  z.object({ type: z.literal('dismantle'), buildingId: id }),
  z.object({
    type: z.literal('debugGrant'),
    resources: z.object({
      pulp: z.number().min(0).max(1e6).optional(),
      fiber: z.number().min(0).max(1e6).optional(),
      seeds: z.number().min(0).max(1e6).optional(),
      juice: z.number().min(0).max(1e6).optional(),
    }),
  }),
]) as unknown as z.ZodType<Command>;

/** 'solo' (default) or the id of a shared universe the player belongs to. */
const universe = z.string().min(1).max(64).optional();
const displayName = z.string().trim().min(1).max(24);

export const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('listUniverses') }),
  z.object({
    action: z.literal('createUniverse'),
    name: z.string().trim().min(1).max(40),
    displayName,
  }),
  z.object({
    action: z.literal('joinUniverse'),
    code: z.string().trim().min(8).max(8),
    displayName,
  }),
  z.object({ action: z.literal('universeInfo'), universe: z.string().min(1).max(64) }),
  z.object({
    action: z.literal('load'),
    universe,
    /** World to create if the player has none yet (e.g. from a shared link). */
    create: z
      .object({ seed: z.string().min(1).max(64).optional(), face: z.enum(FACES) })
      .optional(),
  }),
  z.object({ action: z.literal('command'), universe, command: commandSchema }),
  z.object({
    action: z.literal('newWorld'),
    seed: z.string().min(1).max(64).optional(),
    face: z.enum(FACES),
  }),
  z.object({ action: z.literal('import'), save: z.string().min(2).max(500_000) }),
]);

export type GameRequest = z.infer<typeof requestSchema>;

export const SERVER_ERRORS = [
  'invalidRequest',
  'unauthorized',
  'forbidden',
  'rateLimited',
  'conflict',
  'importRejected',
  'internal',
  'universeNotFound',
  'universeFull',
] as const;
export type ServerError = (typeof SERVER_ERRORS)[number] | (typeof COMMAND_ERRORS)[number];

export type GameResponse =
  | {
      ok: true;
      /** Present for game actions (load, command, join…), absent for listings. */
      state?: GameState;
      events: GameEvent[];
      serverTime: number;
      universe?: UniverseInfo;
      universes?: UniverseSummary[];
    }
  | { ok: false; error: ServerError; state?: GameState; serverTime: number };

export type { Face };
