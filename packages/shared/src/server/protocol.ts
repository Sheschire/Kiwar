import { INTEL } from '../data/expeditions';
import { STARDUST } from '../data/comets';
import { TITAN_WORK_IDS } from '../data/titan';
import { METEORS, SECTOR_IDS } from '../data/threats';
import { POSTURES } from '../data/units';
import { AUTO_TASKS } from '../data/jobs';
import { z } from 'zod';
import { GEAR_SLOTS, ITEM_IDS } from '../data/gear';
import { BUILDING_TYPES } from '../data/buildings';
import type { COMMAND_ERRORS } from '../sim/commands';
import { KIWI_NAME_MAX, STAT_IDS } from '../data/kiwis';
import { CLASS_IDS, SKILL_IDS } from '../data/classes';
import { TECH_IDS } from '../data/research';
import { type Command } from '../sim/commands';
import type { GameEvent } from '../sim/advance';
import type { GameState } from '../sim/state';
import { FACES, type Face } from '../types/ids';
import type {
  AllySnapshot,
  ColonyPower,
  TwinSnapshot,
  UniverseInfo,
  UniverseSummary,
} from './universes';

/**
 * Client ↔ server protocol (milestone 2). The server is authoritative: the client only sends
 * commands; it never sends a state (except a one-time import of a local milestone-1 save).
 */

const id = z.string().min(1).max(64);
const int = z.number().int();

export const commandSchema: z.ZodType<Command> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('build'),
    buildingType: z.enum(BUILDING_TYPES),
    q: int,
    r: int,
    rot: int.min(0).max(5).optional(),
  }),
  z.object({ type: z.literal('upgrade'), buildingId: id }),
  z.object({ type: z.literal('cancel'), queueItemId: id }),
  z.object({ type: z.literal('assignWorkers'), buildingId: id, count: int.min(0).max(100) }),
  z.object({
    type: z.literal('assignKiwi'),
    villagerId: id,
    buildingId: id.nullable(),
    replace: id.optional(),
  }),
  z.object({
    type: z.literal('setKiwiFlags'),
    villagerId: id,
    locked: z.boolean().optional(),
    builderPriority: z.boolean().optional(),
  }),
  z.object({ type: z.literal('hatchEgg'), star: z.boolean().optional() }),
  z.object({ type: z.literal('claimObjective'), id: z.string().max(64).optional() }),
  z.object({
    type: z.literal('launchExpedition'),
    launchpadId: id,
    targetId: id,
    crew: z.union([int.min(0).max(1000), z.array(id).max(200)]),
    provisions: z.object({ pulp: z.number().min(0).max(1e7), juice: z.number().min(0).max(1e7) }),
    mission: z.enum(['land', 'found', 'guard']).optional(),
    bringBack: z.array(id).max(200).optional(),
    orders: z
      .object({
        posture: z.enum(POSTURES),
        priority: z.enum(['nearest', 'air', 'casters', 'weakest']),
        retreatAt: z.number().min(0).max(1),
        goal: z.enum(['burn', 'loot']),
      })
      .optional(),
    fuel: z.boolean().optional(),
    sector: int
      .min(0)
      .max(INTEL.sectors - 1)
      .optional(),
    freight: z
      .object({
        pulp: z.number().min(0).max(1e7).optional(),
        fiber: z.number().min(0).max(1e7).optional(),
        seeds: z.number().min(0).max(1e7).optional(),
        juice: z.number().min(0).max(1e7).optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('raidDen'), q: z.number().int(), r: z.number().int() }),
  z.object({
    type: z.literal('fortifyBeacon'),
    targetId: id,
    sector: int.min(0).max(INTEL.sectors - 1),
  }),
  z.object({
    type: z.literal('sendCargo'),
    launchpadId: id,
    friendId: id,
    resources: z.object({
      pulp: z.number().min(0).max(1e7).optional(),
      fiber: z.number().min(0).max(1e7).optional(),
      seeds: z.number().min(0).max(1e7).optional(),
      juice: z.number().min(0).max(1e7).optional(),
    }),
    villagerIds: z.array(id).max(200).optional(),
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
  z.object({ type: z.literal('collect'), buildingId: id }),
  z.object({ type: z.literal('collectAll') }),
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
  z.object({ type: z.literal('setPosture'), posture: z.enum(POSTURES) }),
  z.object({
    type: z.literal('pinGuard'),
    villagerId: id,
    sector: z.enum(SECTOR_IDS).nullable(),
  }),
  z.object({
    type: z.literal('bless'),
    villagerId: id,
    kind: z.enum(['heal', 'respec', 'stat']),
    stat: z.enum(STAT_IDS).optional(),
  }),
  z.object({
    type: z.literal('collectStardust'),
    patchId: id,
    villagerIds: z.array(id).max(STARDUST.slots),
  }),
  z.object({ type: z.literal('setAutomation'), task: z.enum(AUTO_TASKS), on: z.boolean() }),
  z.object({ type: z.literal('assignBuilder'), queueItemId: id, villagerId: id }),
  z.object({
    type: z.literal('collectMeteor'),
    meteorId: id,
    villagerIds: z.array(id).max(METEORS.slots),
  }),
  z.object({ type: z.literal('forgeItem'), item: z.enum(ITEM_IDS) }),
  z.object({ type: z.literal('cancelForge'), orderId: id }),
  z.object({
    type: z.literal('equip'),
    villagerId: id,
    slot: z.enum(GEAR_SLOTS),
    item: z.enum(ITEM_IDS).nullable(),
  }),
  z.object({ type: z.literal('setResearch'), tech: z.enum(TECH_IDS).nullable() }),
  z.object({ type: z.literal('clearObstacle'), q: z.number().int(), r: z.number().int() }),
  z.object({ type: z.literal('transform'), villagerId: id, labId: id }),
  z.object({
    type: z.literal('titanWork'),
    villagerId: id,
    q: z.number().int(),
    r: z.number().int(),
    work: z.enum(TITAN_WORK_IDS),
  }),
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
/** Chantier 19: the home colony (0, default) or the sister colony on the twin face (1). */
const colony = z.union([z.literal(0), z.literal(1)]).optional();

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
    /** Chantier 14: bring the solo colony along (it moves into the universe). */
    fromSolo: z.boolean().optional(),
  }),
  /** Chantier 14: the host opens or closes the universe to solo colonies. */
  z.object({
    action: z.literal('universeSettings'),
    universe: z.string().min(1).max(64),
    allowImports: z.boolean(),
  }),
  z.object({ action: z.literal('universeInfo'), universe: z.string().min(1).max(64) }),
  z.object({
    action: z.literal('load'),
    universe,
    colony,
    /** World to create if the player has none yet (e.g. from a shared link). */
    create: z
      .object({ seed: z.string().min(1).max(64).optional(), face: z.enum(FACES) })
      .optional(),
  }),
  z.object({ action: z.literal('command'), universe, colony, command: commandSchema }),
  z.object({
    action: z.literal('newWorld'),
    seed: z.string().min(1).max(64).optional(),
    face: z.enum(FACES),
  }),
  z.object({ action: z.literal('import'), save: z.string().min(2).max(500_000) }),
  /**
   * A guest signed in to an existing account: bring the guest's solo colony along. Without
   * `keep`, only previews both colonies; `keep: 'guest'` swaps the two solo colonies (nothing
   * is ever deleted), `keep: 'account'` leaves them as they are.
   */
  z.object({
    action: z.literal('guestTransfer'),
    guestToken: z.string().min(16).max(8000),
    keep: z.enum(['guest', 'account']).optional(),
  }),
  /** Chantier 05: a newcomer moves to the other face of their kiwi while still pristine. */
  z.object({
    action: z.literal('pickFace'),
    universe: z.string().min(1).max(64),
    face: z.enum(FACES),
  }),
]);

export type GameRequest = z.infer<typeof requestSchema>;

/** One solo colony as shown when a guest chooses which one to keep. */
export interface ColonySummary extends ColonyPower {
  /** Simulated time of the stored state (last time it was played). */
  playedAt: number;
}

/** `guestTransfer` preview: the guest's colony and the account's own (null: none yet). */
export interface GuestTransferPreview {
  guest: ColonySummary | null;
  account: ColonySummary | null;
  /** The account's solo colony was never played: the guest's one can replace it freely. */
  accountPristine: boolean;
}

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
  'importsClosed',
  'alreadyMember',
  'shipAway',
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
      /** Shared universe: the other players' colonies, on kiwis far away (layout only). */
      allies?: AllySnapshot[];
      /** Chantier 19: the player's other colony (layout only; null: none founded). */
      sister?: TwinSnapshot | null;
      /** `guestTransfer` without `keep`. */
      transfer?: GuestTransferPreview;
    }
  | { ok: false; error: ServerError; state?: GameState; serverTime: number };

export type { Face };
