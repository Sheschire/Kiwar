import { z } from 'zod';
import { BUILDING_TYPES } from '../data/buildings';
import { FACES } from '../types/ids';
import { SCHEMA_VERSION, type GameState } from '../sim/state';

const resources = z.object({
  pulp: z.number(),
  fiber: z.number(),
  seeds: z.number(),
  juice: z.number(),
});
const partialResources = resources.partial();
const id = z.string().min(1);

const job = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('work'), buildingId: id }),
  z.object({ kind: z.literal('build'), queueItemId: id, returnTo: id.nullable() }),
]);

export const gameStateSchema = z.object({
  schemaVersion: z.number().int(),
  universeId: id,
  kiwiId: id,
  playerId: id,
  seasonId: id,
  face: z.enum(FACES),
  seed: z.string().min(1).max(64),
  params: z.object({ radius: z.number().int().min(4).max(30) }),
  createdAt: z.number(),
  now: z.number(),
  resources,
  buildings: z.array(
    z.object({
      id,
      type: z.enum(BUILDING_TYPES),
      q: z.number().int(),
      r: z.number().int(),
      level: z.number().int().min(1).max(3),
      richness: z.number(),
      builtAt: z.number(),
    }),
  ),
  villagers: z.array(z.object({ id, name: z.string(), bornAt: z.number(), job })),
  queue: z.array(
    z.object({
      id,
      kind: z.enum(['build', 'upgrade']),
      buildingType: z.enum(BUILDING_TYPES),
      q: z.number().int(),
      r: z.number().int(),
      buildingId: id.nullable(),
      targetLevel: z.number().int().min(1).max(3),
      richness: z.number(),
      durationMs: z.number(),
      startedAt: z.number().nullable(),
      paid: partialResources,
      orderedAt: z.number(),
    }),
  ),
  egg: z.object({ startedAt: z.number(), readyAt: z.number() }).nullable(),
  objectiveIndex: z.number().int().min(0),
  stats: z.object({
    produced: resources,
    constructionsCompleted: z.number().int(),
    eggsHatched: z.number().int(),
  }),
  nextId: z.number().int(),
  rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export interface SaveFile {
  format: 'kiwar-save';
  savedAt: number;
  state: GameState;
}

/** Migrations from version N to N+1, applied in order on load. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function serializeSave(state: GameState, savedAt: number): string {
  const file: SaveFile = { format: 'kiwar-save', savedAt, state };
  return JSON.stringify(file);
}

export type LoadResult =
  { ok: true; save: SaveFile } | { ok: false; reason: 'empty' | 'corrupt' | 'tooNew' };

export function deserializeSave(text: string | null | undefined): LoadResult {
  if (!text) return { ok: false, reason: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'corrupt' };
  const file = parsed as { format?: unknown; savedAt?: unknown; state?: unknown };
  if (file.format !== 'kiwar-save' || typeof file.savedAt !== 'number' || !file.state) {
    return { ok: false, reason: 'corrupt' };
  }
  let raw = file.state as Record<string, unknown>;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return { ok: false, reason: 'tooNew' };
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, reason: 'corrupt' };
    raw = migrate(raw);
    version++;
    raw.schemaVersion = version;
  }
  const result = gameStateSchema.safeParse(raw);
  if (!result.success) return { ok: false, reason: 'corrupt' };
  return {
    ok: true,
    save: { format: 'kiwar-save', savedAt: file.savedAt, state: result.data as GameState },
  };
}
