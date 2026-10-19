import { z } from 'zod';
import { BUILDING_TYPES } from '../data/buildings';
import type { COMMAND_ERRORS } from '../sim/commands';
import { type Command } from '../sim/commands';
import type { GameEvent } from '../sim/advance';
import type { GameState } from '../sim/state';
import { FACES, type Face } from '../types/ids';

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
    type: z.literal('debugGrant'),
    resources: z.object({
      pulp: z.number().min(0).max(1e6).optional(),
      fiber: z.number().min(0).max(1e6).optional(),
      seeds: z.number().min(0).max(1e6).optional(),
      juice: z.number().min(0).max(1e6).optional(),
    }),
  }),
]) as unknown as z.ZodType<Command>;

export const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('load'),
    /** World to create if the player has none yet (e.g. from a shared link). */
    create: z
      .object({ seed: z.string().min(1).max(64).optional(), face: z.enum(FACES) })
      .optional(),
  }),
  z.object({ action: z.literal('command'), command: commandSchema }),
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
] as const;
export type ServerError = (typeof SERVER_ERRORS)[number] | (typeof COMMAND_ERRORS)[number];

export type GameResponse =
  | { ok: true; state: GameState; events: GameEvent[]; serverTime: number }
  | { ok: false; error: ServerError; state?: GameState; serverTime: number };

export type { Face };
