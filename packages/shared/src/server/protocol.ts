import { z } from 'zod';
import { BUILDING_TYPES } from '../data/buildings';
import type { COMMAND_ERRORS } from '../sim/commands';
import { KIWI_NAME_MAX, STAT_IDS } from '../data/kiwis';
import { CLASS_IDS, SKILL_IDS } from '../data/classes';
import { TECH_IDS } from '../data/research';
import { type Command } from '../sim/commands';
import type { GameEvent } from '../sim/advance';
import type { GameState } from '../sim/state';
import { FACES, type Face } from '../types/ids';
import type { TwinSnapshot, UniverseInfo, UniverseSummary } from './universes';

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
    crew: z.union([int.min(0).max(1000), z.array(id).max(200)]),
    provisions: z.object({ pulp: z.number().min(0).max(1e7), juice: z.number().min(0).max(1e7) }),
    mission: z.enum(['raid', 'recon']).optional(),
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
  z.object({ type: z.literal('demolish'), buildingId: id }),
  z.object({ type: z.literal('dismantle'), buildingId: id }),
  z.object({
    type: z.literal('renameVillager'),
    villagerId: id,
    name: z
      .string()
      .min(1)
      .max(4 * KIWI_NAME_MAX),
  }),
  z.object({ type: z.literal('spendStatPoint'), villagerId: id, stat: z.enum(STAT_IDS) }),
  z.object({
    type: z.literal('train'),
    villagerId: id,
    schoolId: id,
    classId: z.enum(CLASS_IDS),
  }),
  z.object({ type: z.literal('useSkill'), villagerId: id, skill: z.enum(SKILL_IDS) }),
  z.object({ type: z.literal('shelter') }),
  z.object({ type: z.literal('repair'), buildingId: id }),
  z.object({ type: z.literal('setGarrison'), villagerIds: z.array(id).max(200) }),
  z.object({ type: z.literal('setResearch'), tech: z.enum(TECH_IDS).nullable() }),
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
    /** Bring the solo colony along (it moves into the new universe). */
    fromSolo: z.boolean().optional(),
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
  /** Chantier 05: a newcomer moves to the other face of their kiwi while still pristine. */
  z.object({
    action: z.literal('pickFace'),
    universe: z.string().min(1).max(64),
    face: z.enum(FACES),
  }),
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
  'faceTaken',
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
      /** Shared universe: the twin face when a friend lives there (null: aliens, fogged). */
      twin?: TwinSnapshot | null;
    }
  | { ok: false; error: ServerError; state?: GameState; serverTime: number };

export type { Face };
