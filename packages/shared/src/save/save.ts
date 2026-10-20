import { BIOME_IDS } from '../data/biomes';
import { z } from 'zod';
import { BUILDING_TYPES, MAX_LEVEL } from '../data/buildings';
import { FACES } from '../types/ids';
import { newSky, newThreats, SCHEMA_VERSION, soloTargets, type GameState } from '../sim/state';
import { INCIDENT_KINDS, INCIDENTS, METEORS, THREATS } from '../data/threats';
import { RESOURCE_IDS } from '../data/resources';
import { INTEL } from '../data/expeditions';
import type { Face } from '../types/ids';
import {
  KIWI,
  KIWI_NAME_MAX,
  MASTERY_IDS,
  MEMORIAL_MAX,
  SHINY_COLORS,
  STAT_IDS,
  TRAIT_IDS,
  type MasteryId,
  type StatId,
} from '../data/kiwis';
import { createRng } from '../rng/rng';
import { calendarStartFor } from '../data/cycles';
import { CLASS_IDS, SKILL_IDS } from '../data/classes';
import { TECH_IDS } from '../data/research';
import { newKiwi, rollKiwi } from '../sim/kiwis';

const resources = z.object({
  pulp: z.number(),
  fiber: z.number(),
  seeds: z.number(),
  juice: z.number(),
});
const partialResources = resources.partial();
const id = z.string().min(1);
const stats = z.object(
  Object.fromEntries(
    STAT_IDS.map((s) => [s, z.number().int().min(1).max(KIWI.stat.cap)]),
  ) as Record<StatId, z.ZodNumber>,
);

const job = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('work'), buildingId: id }),
  z.object({ kind: z.literal('build'), queueItemId: id, returnTo: id.nullable() }),
  z.object({ kind: z.literal('expedition'), expeditionId: id }),
  z.object({
    kind: z.literal('train'),
    schoolId: id,
    classId: z.enum(CLASS_IDS),
    until: z.number(),
    paid: partialResources,
  }),
  z.object({ kind: z.literal('guard') }),
  z.object({ kind: z.literal('injured'), until: z.number() }),
]);

const sides = z.object({ ground: z.number().min(0), air: z.number().min(0) });
const named = z.array(z.object({ id, name: z.string().max(4 * KIWI_NAME_MAX) }));
const threats = z.object({
  rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  next: z
    .object({
      id,
      announceAt: z.number(),
      at: z.number(),
      announced: z.boolean(),
      ground: z.number().min(0),
      air: z.number().min(0),
    })
    .nullable(),
  lastWaveAt: z.number().min(0),
  shieldUntil: z.number().min(0),
  shelterUntil: z.number().min(0),
  nextIncidentAt: z.number(),
  waves: z.number().int().min(0),
  reports: z
    .array(
      z.object({
        id,
        at: z.number(),
        victory: z.boolean(),
        sheltered: z.boolean(),
        threat: sides,
        defense: sides,
        severity: z.number().min(0).max(1),
        ammoUsed: z.number().min(0),
        damaged: z.array(z.object({ id, type: z.enum(BUILDING_TYPES) })),
        loot: resources,
        injured: named,
        dead: named,
        pathsLost: z.number().int().min(0),
      }),
    )
    .max(THREATS.history),
  incidents: z
    .array(
      z.object({
        at: z.number(),
        kind: z.enum(INCIDENT_KINDS),
        blocked: z.boolean(),
        resource: z.enum(RESOURCE_IDS).nullable(),
        amount: z.number().min(0),
      }),
    )
    .max(INCIDENTS.history),
});

const range = z.object({ min: z.number().min(0), max: z.number().min(0) });
const structure = z.object({
  kind: z.enum(['den', 'roost']),
  q: z.number().int(),
  r: z.number().int(),
});

export const gameStateSchema = z.object({
  schemaVersion: z.number().int(),
  universeId: id,
  kiwiId: id,
  playerId: id,
  seasonId: id,
  face: z.enum(FACES),
  seed: z.string().min(1).max(64),
  params: z.object({ radius: z.number().int().min(4).max(30), biome: z.enum(BIOME_IDS) }),
  createdAt: z.number(),
  calendarStart: z.number(),
  now: z.number(),
  resources,
  buildings: z.array(
    z.object({
      id,
      type: z.enum(BUILDING_TYPES),
      q: z.number().int(),
      r: z.number().int(),
      level: z.number().int().min(1).max(MAX_LEVEL),
      richness: z.number(),
      builtAt: z.number(),
      pool: z.object({ stock: z.number().min(0), tiles: z.array(z.string()).max(64) }).optional(),
      damaged: z.boolean().optional(),
    }),
  ),
  villagers: z.array(
    z.object({
      id,
      name: z.string().max(4 * KIWI_NAME_MAX),
      bornAt: z.number(),
      job,
      stats,
      trait: z.enum(TRAIT_IDS).nullable(),
      shiny: z.enum(SHINY_COLORS).nullable(),
      level: z.number().int().min(1).max(KIWI.maxLevel),
      xp: z.number().int().min(0),
      statPoints: z.number().int().min(0),
      mastery: z.object(
        Object.fromEntries(MASTERY_IDS.map((m) => [m, z.number().int().min(0)])) as Record<
          MasteryId,
          z.ZodNumber
        >,
      ),
      history: z.object({
        expeditions: z.number().int().min(0),
        victories: z.number().int().min(0),
        built: z.number().int().min(0),
      }),
      classId: z.enum(CLASS_IDS).nullable(),
      skillReadyAt: z.record(z.enum(SKILL_IDS), z.number()),
    }),
  ),
  memorial: z
    .array(
      z.object({
        id,
        name: z.string().max(4 * KIWI_NAME_MAX),
        level: z.number().int().min(1).max(KIWI.maxLevel),
        shiny: z.enum(SHINY_COLORS).nullable(),
        classId: z.enum(CLASS_IDS).nullable().optional(),
        bornAt: z.number(),
        diedAt: z.number(),
        cause: z.enum(['battle', 'starvation', 'famine', 'predator']),
      }),
    )
    .max(MEMORIAL_MAX),
  speechUntil: z.number().min(0),
  hunger: z.number().int().min(0),
  mourningUntil: z.number().min(0),
  queue: z.array(
    z.object({
      id,
      kind: z.enum(['build', 'upgrade', 'repair']),
      buildingType: z.enum(BUILDING_TYPES),
      q: z.number().int(),
      r: z.number().int(),
      buildingId: id.nullable(),
      targetLevel: z.number().int().min(1).max(MAX_LEVEL),
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
  targets: z.array(
    z.object({
      id,
      owner: z.literal('aliens'),
      kiwiIndex: z.number().int().min(0),
      face: z.enum(FACES),
      distance: z.number().min(0),
      travelMs: z.number().min(0),
    }),
  ),
  victories: z.record(z.string(), z.number().int().min(0)),
  aliens: z
    .record(
      z.string(),
      z.object({
        seed: z.string(),
        defense: z.number().min(0),
        reinforce: z.number().min(0),
        growth: z.number().min(0),
        loot: resources,
        ferretShare: z.number().min(0).max(1),
        since: z.number(),
        structures: z.array(structure).max(64),
      }),
    )
    .optional(),
  intel: z.record(
    z.string(),
    z.object({
      at: z.number(),
      source: z.enum(['recon', 'raid']),
      defense: range,
      ferrets: range,
      bats: range,
      victoriesAt: z.number().int().min(0),
      sectors: z
        .array(
          z
            .number()
            .int()
            .min(0)
            .max(INTEL.sectors - 1),
        )
        .max(INTEL.sectors),
      structures: z.array(structure).max(64),
      spotted: z.boolean().optional(),
    }),
  ),
  expeditions: z.array(
    z.object({
      id,
      mission: z.enum(['raid', 'recon']),
      targetId: id,
      launchpadId: id,
      crew: z.array(id),
      roster: z.array(
        z.object({
          id,
          name: z.string(),
          level: z.number().int().min(1).optional(),
          shiny: z.enum(SHINY_COLORS).nullable().optional(),
          classId: z.enum(CLASS_IDS).nullable().optional(),
        }),
      ),
      provisions: resources,
      cargo: z.number(),
      departedAt: z.number(),
      arriveAt: z.number(),
      returnAt: z.number(),
      status: z.enum(['outbound', 'returning', 'done']),
      broken: z.boolean().optional(),
      result: z
        .object({
          victory: z.boolean(),
          aborted: z.boolean().optional(),
          strength: z.number(),
          defense: z.number(),
          fed: z.number(),
          lostInBattle: z.array(z.string()),
          lostOnReturn: z.array(z.string()),
          loot: resources,
          broken: z.boolean().optional(),
          spotted: z.boolean().optional(),
          sectors: z.array(z.number().int().min(0)).optional(),
          injured: z.array(id).optional(),
        })
        .nullable(),
    }),
  ),
  paths: z.array(z.string().max(16)).max(500),
  deposits: z.record(z.string(), z.object({ stock: z.number().min(0), at: z.number() })),
  threats,
  sky: z.object({
    next: z
      .object({
        id,
        announceAt: z.number(),
        at: z.number(),
        announced: z.boolean(),
        q: z.number().int(),
        r: z.number().int(),
        resource: z.enum(RESOURCE_IDS),
        stock: z.number().min(0),
      })
      .nullable(),
    lastFallAt: z.number().min(0),
    falls: z.number().int().min(0),
    meteors: z
      .array(
        z.object({
          id,
          q: z.number().int(),
          r: z.number().int(),
          resource: z.enum(RESOURCE_IDS),
          stock: z.number().min(0),
          max: z.number().min(0),
          landedAt: z.number(),
          expiresAt: z.number(),
        }),
      )
      .max(METEORS.max + 1),
  }),
  research: z.object({
    points: z.number().int().min(0),
    current: z.enum(TECH_IDS).nullable(),
    done: z.array(z.enum(TECH_IDS)).max(TECH_IDS.length),
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
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2: expeditions (milestone 3).
  1: (raw) => ({
    ...raw,
    targets: soloTargets(raw.face === 'kiwino' ? 'kiwino' : 'kiwisu'),
    victories: {},
    expeditions: [],
  }),
  // v2 → v3: territory (milestone 4). Deposits start full; pools are set up by the next advance.
  2: (raw) => ({ ...raw, paths: [], deposits: {} }),
  // v3 → v4: individual kiwis (chantier 03). Existing kiwis get stats drawn from the seed and
  // their id (deterministic, the game RNG is left untouched); they start at level 1.
  3: (raw) => ({
    ...raw,
    villagers: Array.isArray(raw.villagers)
      ? raw.villagers.map((v: Record<string, unknown>) => ({
          ...v,
          ...newKiwi(rollKiwi(createRng(`${String(raw.seed)}/${String(v.id)}/kiwi`))),
        }))
      : raw.villagers,
    memorial: [],
  }),
  // v4 → v5: classes and skills (chantier 03, part 4).
  4: (raw) => ({
    ...raw,
    villagers: Array.isArray(raw.villagers)
      ? raw.villagers.map((v: Record<string, unknown>) => ({
          ...v,
          classId: null,
          skillReadyAt: {},
        }))
      : raw.villagers,
    speechUntil: 0,
  }),
  // v5 → v6: day/night and seasons (chantier 04). The calendar starts with the game.
  5: (raw) => ({ ...raw, calendarStart: calendarStartFor(Number(raw.createdAt)) }),
  // v6 → v7: hunger (chantier 04, part 3). Colonies start fed.
  6: (raw) => ({ ...raw, hunger: 0 }),
  // v7 → v8: morale (chantier 04, part 4). No mourning yet.
  7: (raw) => ({ ...raw, mourningUntil: 0 }),
  // v8 → v9: biomes (chantier 05). Existing worlds keep their map: the classic biome.
  8: (raw) => ({ ...raw, params: { ...(raw.params as object), biome: 'classic' } }),
  // v9 → v10: predators (chantier 06). The first wave is planned on the next advance.
  9: (raw) => ({
    ...raw,
    threats: newThreats(String(raw.seed), raw.face as Face, Number(raw.now)),
  }),
  // v10 → v11: gifts from the sky (chantier 06, part 3).
  10: (raw) => ({ ...raw, sky: newSky(Number(raw.now)) }),
  // v11 → v12: hidden garrisons and intel (chantier 07). Targets lose their real numbers (zod
  // strips them); the garrisons are drawn again by `ensureAliens` (server: secret seed).
  11: (raw) => ({
    ...raw,
    intel: {},
    expeditions: Array.isArray(raw.expeditions)
      ? raw.expeditions.map((e: Record<string, unknown>) => ({ ...e, mission: 'raid' }))
      : raw.expeditions,
  }),
  // v12 → v13: research (chantier 08). Kiwis start with no research practice.
  12: (raw) => ({
    ...raw,
    research: { points: 0, current: null, done: [] },
    villagers: Array.isArray(raw.villagers)
      ? raw.villagers.map((v: Record<string, unknown>) => ({
          ...v,
          mastery: { ...(v.mastery as object), research: 0 },
        }))
      : raw.villagers,
  }),
};

export type MigrateResult =
  { ok: true; state: GameState } | { ok: false; reason: 'corrupt' | 'tooNew' };

/** Upgrades a stored state to the current schema and validates it. */
export function migrateState(input: unknown): MigrateResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'corrupt' };
  let raw = input as Record<string, unknown>;
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
  return result.success
    ? { ok: true, state: result.data as GameState }
    : { ok: false, reason: 'corrupt' };
}

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
  const migrated = migrateState(file.state);
  if (!migrated.ok) return { ok: false, reason: migrated.reason };
  return {
    ok: true,
    save: { format: 'kiwar-save', savedAt: file.savedAt, state: migrated.state },
  };
}
