import { BIOME_IDS } from '../data/biomes';
import { z } from 'zod';
import { BUILDING_TYPES, footprintOf, MAX_LEVEL, type BuildingType } from '../data/buildings';
import { clearPathsUnder, footprintHexes, rotationsOf } from '../sim/footprint';
import { extensionFor, siteError } from '../sim/describe';
import { FACES } from '../types/ids';
import {
  defaultAutomation,
  MISSION_KINDS,
  newComets,
  newColonyLink,
  newSiege,
  newSky,
  newThreats,
  SCHEMA_VERSION,
  soloTargets,
  type GameState,
} from '../sim/state';
import { INCIDENT_KINDS, INCIDENTS, METEORS, SECTOR_IDS, THREATS } from '../data/threats';
import { BATTLE, ENEMY_KINDS, POSTURES } from '../data/units';
import { RESOURCE_IDS } from '../data/resources';
import { BLESSINGS, COMETS, STARDUST, STARDUST_SCALE } from '../data/comets';
import { IRON, IRON_SCALE } from '../data/iron';
import { FORGE, ITEM_IDS } from '../data/gear';
import { BEACONS } from '../data/beacons';
import { INTEL } from '../data/expeditions';
import { FIREWORKS_PATTERNS, MEMORY_KINDS, MORALE } from '../data/needs';
import { ALIEN_BUILDINGS, CIV_KEYS } from '../data/aliens';
import { sectorOf } from '../sim/aliens';
import { LANDING_GOALS, LANDING_PRIORITIES } from '../data/landing';
import { SHIP_IDS } from '../data/expeditions';
import type { Face } from '../types/ids';
import {
  KIWI,
  KIWI_NAME_MAX,
  MASTERY_IDS,
  MEMORIAL_MAX,
  KIWI_COLORS,
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
import { OBSTACLE_KINDS } from '../data/obstacles';
import { TERRAFORM_KINDS, TITAN_WORK_IDS } from '../data/titan';
import { generateObstacles } from '../sim/obstacles';
import { faceMapOf, syncPools } from '../sim/territory';
import { hexKey } from '../hex/hex';
import { getTile, HEART, type FaceParams } from '../worldgen/generateFace';
import { AUTO_TASKS, type AutoTask } from '../data/jobs';
import { newDepths, type Obstacle } from '../sim/state';
import { HAZARD_KINDS, ROOM_KINDS } from '../data/depths';

const resources = z.object({
  pulp: z.number(),
  fiber: z.number(),
  seeds: z.number(),
  juice: z.number(),
});
const partialResources = resources.partial();
const id = z.string().min(1);
const sectorId = z
  .number()
  .int()
  .min(0)
  .max(INTEL.sectors - 1);
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
    returnTo: id.nullable().optional(),
  }),
  z.object({ kind: z.literal('guard') }),
  z.object({ kind: z.literal('injured'), until: z.number() }),
  z.object({ kind: z.literal('stardust'), patchId: id, returnTo: id.nullable() }),
  z.object({ kind: z.literal('meteor'), meteorId: id, returnTo: id.nullable() }),
  z.object({ kind: z.literal('outpost'), sector: sectorId, targetId: id }),
  z.object({
    kind: z.literal('titan'),
    work: z.enum(TITAN_WORK_IDS),
    q: z.number().int(),
    r: z.number().int(),
    until: z.number(),
  }),
  z.object({
    kind: z.literal('transform'),
    labId: id,
    until: z.number(),
    risk: z.number().min(0).max(1),
    paid: partialResources,
    paidDust: z.number().int().min(0).optional(),
  }),
]);

const sides = z.object({ ground: z.number().min(0), air: z.number().min(0) });
const named = z.array(z.object({ id, name: z.string().max(4 * KIWI_NAME_MAX) }));
const hexSchema = z.object({ q: z.number().int(), r: z.number().int() });

/** Chantier 36: a battle journal (a replay only: the game never reads it back). */
const battleLog = z.object({
  v: z.literal(1),
  dt: z.number().positive(),
  steps: z.number().int().min(0).max(10_000),
  units: z.array(z.array(z.unknown())).max(BATTLE.maxGround + BATTLE.maxAir + 200),
  buildings: z.array(z.array(z.unknown())).max(400),
  events: z.string().max(400_000),
  result: z.record(z.string(), z.unknown()),
});

const plannedWave = z.object({
  id,
  announceAt: z.number(),
  at: z.number(),
  announced: z.boolean(),
  ground: z.number().min(0),
  air: z.number().min(0),
  squads: z
    .array(
      z.object({
        kind: z.enum(ENEMY_KINDS),
        sector: z.enum(SECTOR_IDS),
        count: z
          .number()
          .int()
          .min(0)
          .max(BATTLE.maxGround + BATTLE.maxAir),
      }),
    )
    .max(ENEMY_KINDS.length * SECTOR_IDS.length)
    .optional(),
  gates: z.object({ front: hexSchema, left: hexSchema, right: hexSchema }).partial().optional(),
  origin: sectorId.optional(),
  tunnel: hexSchema.optional(),
});

const threats = z.object({
  rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  next: plannedWave.nullable(),
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
        log: battleLog.optional(),
      }),
    )
    .max(THREATS.history),
  posture: z.enum(POSTURES),
  pins: z.record(z.string(), z.enum(SECTOR_IDS)),
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
/** Chantier 40: aliens and buildings of a parcel as we saw them. */
const alienUnit = z.object({
  kind: z.enum(ENEMY_KINDS),
  count: z.number().int().min(0).max(1000),
  level: z.number().int().min(0).max(100),
  weapon: z.enum(ITEM_IDS).optional(),
  armor: z.enum(ITEM_IDS).optional(),
});
const alienBuilding = z.object({
  kind: z.enum(ALIEN_BUILDINGS),
  sector: sectorId,
  q: z.number().int(),
  r: z.number().int(),
});
const landingOrders = z.object({
  posture: z.enum(POSTURES),
  priority: z.enum(LANDING_PRIORITIES as [string, ...string[]]),
  retreatAt: z.number().min(0).max(1),
  goal: z.enum(LANDING_GOALS),
});

const parcelView = z.object({
  at: z.number(),
  source: z.enum(['beacon', 'landing', 'retreat', 'edge', 'report']),
  age: z.number().int().min(0).max(3),
  power: range,
  units: z.array(alienUnit).max(16),
  buildings: z.array(alienBuilding).max(64),
});
const structure = z.object({
  kind: z.enum(['den', 'roost']),
  q: z.number().int(),
  r: z.number().int(),
});

const villager = z.object({
  id,
  name: z.string().max(4 * KIWI_NAME_MAX),
  bornAt: z.number(),
  job,
  stats,
  trait: z.enum(TRAIT_IDS).nullable(),
  shiny: z.enum(KIWI_COLORS).nullable(),
  level: z.number().int().min(1).max(KIWI.maxLevel),
  xp: z.number().int().min(0),
  statPoints: z.number().int().min(0),
  blessings: z.number().int().min(0).max(BLESSINGS.statMax).optional(),
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
  classXp: z.number().int().min(0),
  skillReadyAt: z.record(z.enum(SKILL_IDS), z.number()),
  kikiwiwi: z.object({ since: z.number() }).optional(),
  locked: z.literal(true).optional(),
  builderPriority: z.literal(true).optional(),
  homeJob: id.optional(),
  lent: id.nullable().optional(),
  gear: z
    .object({
      weapon: z.enum(ITEM_IDS).optional(),
      armor: z.enum(ITEM_IDS).optional(),
      kept: z.literal(true).optional(),
    })
    .optional(),
  veteran: z.number().int().min(0).optional(),
  memories: z
    .array(
      z.object({
        kind: z.enum(MEMORY_KINDS),
        value: z.number().min(-MORALE.max).max(MORALE.max),
        until: z.number(),
      }),
    )
    .max(MEMORY_KINDS.length)
    .optional(),
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
      shipLost: z.enum(SHIP_IDS).optional(),
      reserve: resources.optional(),
      rot: z.number().int().min(0).max(5).optional(),
      cramped: z.literal(true).optional(),
    }),
  ),
  villagers: z.array(villager),
  memorial: z
    .array(
      z.object({
        id,
        name: z.string().max(4 * KIWI_NAME_MAX),
        level: z.number().int().min(1).max(KIWI.maxLevel),
        shiny: z.enum(KIWI_COLORS).nullable(),
        classId: z.enum(CLASS_IDS).nullable().optional(),
        bornAt: z.number(),
        diedAt: z.number(),
        cause: z.enum(['battle', 'starvation', 'famine', 'predator']),
      }),
    )
    .max(MEMORIAL_MAX),
  speechUntil: z.number().min(0),
  speech: z.object({ until: z.number().min(0), readyAt: z.number().min(0) }),
  village: z.object({
    cabaretOpen: z.boolean(),
    fireworksNight: z.number().min(0),
    lastShow: z.object({ at: z.number().min(0), pattern: z.enum(FIREWORKS_PATTERNS) }).optional(),
  }),
  hunger: z.number().int().min(0),
  queue: z.array(
    z.object({
      id,
      kind: z.enum(['build', 'upgrade', 'repair', 'clear', 'canal', 'fill']),
      buildingType: z.enum(BUILDING_TYPES),
      q: z.number().int(),
      r: z.number().int(),
      buildingId: id.nullable(),
      // 0 for works that build nothing (clearing, digging or filling a canal).
      targetLevel: z.number().int().min(0).max(MAX_LEVEL),
      richness: z.number(),
      durationMs: z.number(),
      startedAt: z.number().nullable(),
      paid: partialResources,
      paidDust: z.number().int().min(0).optional(),
      paidIron: z.number().int().min(0).optional(),
      orderedAt: z.number(),
      rot: z.number().int().min(0).max(5).optional(),
    }),
  ),
  egg: z
    .object({ startedAt: z.number(), readyAt: z.number(), star: z.boolean().optional() })
    .nullable(),
  objectiveIndex: z.number().int().min(0),
  objectives: z.object({
    claimed: z.array(z.string()),
    giftEggs: z.number().int().min(0),
  }),
  stats: z.object({
    produced: resources,
    constructionsCompleted: z.number().int(),
    eggsHatched: z.number().int(),
    collects: z.number().int().min(0),
    wavesHeld: z.number().int().min(0),
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
        civ: z
          .object({
            lead: z.number(),
            hours: z.number(),
            sectors: z.array(z.number()).length(INTEL.sectors),
            fights: z
              .array(
                z.object({ sector: sectorId, at: z.number(), share: z.number().min(0).max(1) }),
              )
              .max(64),
            keys: z
              .array(
                z.object({
                  kind: z.enum(CIV_KEYS),
                  sector: sectorId,
                  readyAt: z.number().optional(),
                }),
              )
              .max(INTEL.sectors),
            day: z.number().int().min(0),
            royalSeen: z.boolean().optional(),
            log: z
              .array(
                z.object({
                  at: z.number(),
                  kind: z.enum(['burn', 'defeat', 'fight']),
                  sector: sectorId.optional(),
                  hours: z.number(),
                }),
              )
              .max(32),
          })
          .optional(),
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
      civAge: z.number().int().min(0).max(3).optional(),
    }),
  ),
  faceViews: z.record(
    z.string(),
    z.object({
      beacons: z
        .array(
          z.object({
            sector: sectorId,
            since: z.number(),
            guards: z.array(id).max(BEACONS.maxGuards).optional(),
            orders: landingOrders.optional(),
            fort: z.number().int().min(0).max(12).optional(),
            fortifying: z
              .object({ until: z.number(), level: z.number().int().min(1).max(12) })
              .optional(),
          }),
        )
        .max(INTEL.sectors),
      parcels: z.record(z.string().max(2), parcelView),
      attack: z
        .object({
          id,
          sector: sectorId.nullable(),
          origin: sectorId.nullable(),
          announceAt: z.number(),
          at: z.number(),
          announced: z.boolean(),
        })
        .nullable()
        .optional(),
      attacks: z.number().int().min(0).optional(),
      lastAttackAt: z.number().optional(),
      queen: z
        .object({
          sector: sectorId,
          since: z.number(),
          at: z.number(),
          age: z.number().int().min(0).max(3),
          ground: z.number().min(0),
          air: z.number().min(0),
          escort: z.array(alienUnit).max(16),
          wounds: z.object({ share: z.number().min(0).max(1), at: z.number() }).optional(),
        })
        .optional(),
      reports: z
        .array(
          z.object({
            id,
            at: z.number(),
            sector: sectorId,
            origin: sectorId,
            held: z.boolean(),
            fought: z.boolean(),
            power: z.number(),
            dead: z.array(z.string()).max(BEACONS.maxGuards),
            hurt: z.array(z.string()).max(BEACONS.maxGuards).optional(),
            back: z.number().int().min(0),
            log: battleLog.optional(),
          }),
        )
        .max(BEACONS.reports)
        .optional(),
    }),
  ),
  depths: z.object({
    views: z.record(
      z.string().max(8),
      z.object({
        at: z.number(),
        source: z.enum(['delve', 'retreat', 'lantern', 'edge']),
        kind: z.enum(ROOM_KINDS).optional(),
        units: z.array(alienUnit).max(16).optional(),
        hazard: z
          .object({ kind: z.enum(HAZARD_KINDS), strength: z.number().min(0).max(1) })
          .nullable()
          .optional(),
      }),
    ),
    galleries: z.record(
      z.string().max(8),
      z.object({ kind: z.enum(ROOM_KINDS), since: z.number() }),
    ),
    door: z.object({
      closed: z.boolean(),
      fort: z.number().int().min(0).max(100),
      fortifying: z
        .object({ until: z.number(), level: z.number().int().min(0).max(100) })
        .optional(),
    }),
    rng: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    next: plannedWave.nullable(),
    upwells: z.number().int().min(0),
    lastUpwellAt: z.number().min(0),
  }),
  depthSeed: z.string().max(400).optional(),
  bestiary: z.record(
    z.enum(ENEMY_KINDS),
    z.object({
      level: z.number().int().min(0).max(100),
      weapon: z.enum(ITEM_IDS).optional(),
      armor: z.enum(ITEM_IDS).optional(),
      seen: z.number().int().min(0),
      firstAt: z.number(),
      lastAt: z.number(),
    }),
  ),
  expeditions: z.array(
    z.object({
      id,
      mission: z.enum(MISSION_KINDS),
      targetId: id,
      launchpadId: id,
      crew: z.array(id),
      roster: z.array(
        z.object({
          id,
          name: z.string(),
          level: z.number().int().min(1).optional(),
          shiny: z.enum(KIWI_COLORS).nullable().optional(),
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
      sector: sectorId.optional(),
      bringBack: z.array(id).max(200).optional(),
      freight: resources.optional(),
      orders: landingOrders.optional(),
      delayed: z.boolean().optional(),
      room: z.string().max(8).optional(),
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
          queenFallen: z.boolean().optional(),
          queenOut: z.boolean().optional(),
          sector: sectorId.optional(),
          burnt: z.boolean().optional(),
          founded: z.boolean().optional(),
          outcome: z.enum(['victory', 'retreat', 'defeat']).optional(),
          log: battleLog.optional(),
          beacon: z.boolean().optional(),
          seen: z.array(alienUnit).max(16).optional(),
          shipLost: z.boolean().optional(),
          iron: z.number().int().min(0).optional(),
          hazard: z
            .object({
              kind: z.enum(HAZARD_KINDS),
              strength: z.number().min(0).max(1),
              hits: z.array(z.object({ id, share: z.number().min(0).max(1) })).max(200),
            })
            .optional(),
          gallery: z.boolean().optional(),
          lantern: z.string().max(8).optional(),
        })
        .nullable(),
    }),
  ),
  friends: z
    .array(
      z.object({
        id,
        owner: z.string(),
        kiwiIndex: z.number().int().min(0),
        distance: z.number().min(0),
        travelMs: z.number().min(0),
      }),
    )
    .max(16),
  shipments: z
    .array(
      z.object({
        id,
        launchpadId: id,
        friendId: id,
        owner: z.string(),
        kiwiIndex: z.number().int().min(0),
        resources,
        departedAt: z.number(),
        arriveAt: z.number(),
        returnAt: z.number(),
        status: z.enum(['outbound', 'returning']),
        villagers: z.array(villager).max(200).optional(),
        delivered: z.boolean().optional(),
      }),
    )
    .max(16),
  incoming: z
    .array(
      z.object({
        id,
        from: z.string(),
        resources,
        departedAt: z.number(),
        arriveAt: z.number(),
        villagers: z.array(villager).max(200).optional(),
      }),
    )
    .max(64),
  paths: z.array(z.string().max(16)).max(500),
  deposits: z.record(z.string(), z.object({ stock: z.number().min(0), at: z.number() })),
  obstacles: z
    .array(
      z.object({
        id,
        kind: z.enum(OBSTACLE_KINDS),
        q: z.number().int(),
        r: z.number().int(),
        loot: partialResources,
        iron: z.number().int().min(0).optional(),
      }),
    )
    .max(64),
  terraform: z.record(z.string().max(16), z.enum([...TERRAFORM_KINDS, 'canal', 'land'])),
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
        iron: z.number().int().min(0),
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
          iron: z.number().int().min(0),
          ironMax: z.number().int().min(0),
          landedAt: z.number(),
          expiresAt: z.number(),
        }),
      )
      .max(METEORS.max + 1),
  }),
  comets: z.object({
    next: z
      .object({ id, announceAt: z.number(), at: z.number(), announced: z.boolean() })
      .nullable(),
    lastAt: z.number().min(0),
    passes: z.number().int().min(0),
    patches: z
      .array(
        z.object({
          id,
          q: z.number().int(),
          r: z.number().int(),
          stock: z.number().int().min(0),
          max: z.number().int().min(0),
          landedAt: z.number(),
          expiresAt: z.number(),
        }),
      )
      .max(COMETS.tiles[1] * 2),
  }),
  stardust: z
    .number()
    .int()
    .min(0)
    .max(STARDUST.cap * STARDUST_SCALE),
  meteorIron: z
    .number()
    .int()
    .min(0)
    .max(Math.max(...IRON.cap) * IRON_SCALE),
  forge: z.object({
    orders: z
      .array(
        z.object({
          id,
          item: z.enum(ITEM_IDS),
          progress: z.number().int().min(0),
          paid: partialResources,
          iron: z.number().int().min(0),
        }),
      )
      .max(16),
    armory: z.record(z.enum(ITEM_IDS), z.number().int().min(0).max(FORGE.armoryMax)),
  }),
  research: z.object({
    points: z.number().int().min(0),
    current: z.enum(TECH_IDS).nullable(),
    done: z.array(z.enum(TECH_IDS)).max(TECH_IDS.length),
    outbox: z.number().int().min(0),
  }),
  automation: z.object(
    Object.fromEntries(AUTO_TASKS.map((t) => [t, z.boolean()])) as Record<AutoTask, z.ZodBoolean>,
  ),
  siege: z.object({
    conqueredAt: z.number().min(0),
  }),
  colony: z.object({
    index: z.union([z.literal(0), z.literal(1)]),
    founding: z
      .object({ at: z.number(), settlers: z.array(villager).max(200), resources })
      .nullable(),
    foundedAt: z.number().min(0),
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
  // v13 → v14: deliveries between allies (multiplayer).
  13: (raw) => ({ ...raw, friends: [], shipments: [], incoming: [] }),
  // v14 → v15: obstacles (chantier 08, second half), only on tiles nothing stands on.
  14: (raw) => ({ ...raw, obstacles: obstaclesForOldGame(raw) }),
  // v15 → v16: laboratory against nature and Kikiwiwis (nothing to fill: optional field).
  15: (raw) => raw,
  // v16 → v17: titan works (no tile reshaped yet).
  16: (raw) => ({ ...raw, terraform: {} }),
  // v17 → v18 (chantier 09): optional kiwi flags (locked, builder priority, home workplace).
  17: (raw) => raw,
  // v18 → v19: comets and stardust (chantier 13). The first comet comes 36 h after loading.
  18: (raw) => ({ ...raw, comets: newComets(Number(raw.now)), stardust: 0 }),
  // v19 → v20: blessings and star eggs (optional fields, chantier 13).
  19: (raw) => raw,
  // v20 → v21 (chantier 15): every task in automatic mode (the optional `lent` needs nothing).
  20: (raw) => ({ ...raw, automation: defaultAutomation() }),
  // v21 → v22 (chantier 19): no siege yet (the new optional fields need nothing).
  21: (raw) => ({ ...raw, siege: newSiege() }),
  // v22 → v23 (chantier 19, second half): a home colony, no sister, nothing to send.
  22: (raw) => ({
    ...raw,
    colony: newColonyLink(),
    research: { ...(raw.research as object), outbox: 0 },
  }),
  // v23 → v24 (chantier 30): three levels per age; the old age levels 4/5/6 become 4/7/10.
  23: migrateLevels,
  // v24 → v25 (chantier 30): warehouse reserves (optional, empty).
  24: (raw) => raw,
  // v25 → v26 (chantier 31): the age objectives notebook; the waves held so far are the
  // victories still in the reports.
  25: (raw) => {
    const threats = raw.threats as { reports?: { victory?: boolean }[] } | undefined;
    const held = (threats?.reports ?? []).filter((r) => r.victory).length;
    return {
      ...raw,
      objectives: { claimed: [], giftEggs: 0 },
      stats: { ...(raw.stats as object), collects: 0, wavesHeld: held },
    };
  },
  // v26 → v27 (chantier 35): big buildings start cramped on their anchor; `spreadOldBuildings`
  // gives each one room after the parse (it needs the whole state).
  26: (raw) => ({
    ...raw,
    buildings: (Array.isArray(raw.buildings)
      ? (raw.buildings as Record<string, unknown>[])
      : []
    ).map((b) => (footprintOf(b.type as BuildingType) > 1 ? { ...b, cramped: true } : b)),
  }),
  // v27 → v28 (chantier 36): a cautious garrison, no pinned guard (squads and battle logs are
  // optional: an announced wave gets its squads at the strike).
  27: (raw) => ({
    ...raw,
    threats: { ...(raw.threats as object), posture: 'cautious', pins: {} },
  }),
  // v28 → v29 (chantier 37): a Kikiwiwi loses its class (and its class skills).
  28: (raw) => ({
    ...raw,
    villagers: (Array.isArray(raw.villagers)
      ? (raw.villagers as Record<string, unknown>[])
      : []
    ).map((v) => (v.kikiwiwi ? { ...v, classId: null, skillReadyAt: {} } : v)),
  }),
  // v29 → v30 (chantier 37): every class starts at rank 1.
  29: (raw) => ({
    ...raw,
    villagers: (Array.isArray(raw.villagers)
      ? (raw.villagers as Record<string, unknown>[])
      : []
    ).map((v) => ({ ...v, classXp: 0 })),
  }),
  // v30 → v31 (chantier 38): meteoric iron. Craters already on the ground keep their old gift.
  30: (raw) => {
    const sky = (raw.sky ?? {}) as Record<string, unknown>;
    const next = sky.next as Record<string, unknown> | null | undefined;
    return {
      ...raw,
      meteorIron: 0,
      sky: {
        ...sky,
        next: next ? { ...next, iron: 0 } : null,
        meteors: (Array.isArray(sky.meteors) ? (sky.meteors as Record<string, unknown>[]) : []).map(
          (m) => ({ ...m, iron: 0, ironMax: 0 }),
        ),
      },
    };
  },
  // v31 → v32 (chantier 38): the Forge's queue and armory, two new automatic tasks.
  31: (raw) => ({
    ...raw,
    forge: { orders: [], armory: {} },
    automation: { ...(raw.automation as Record<string, boolean>), forge: true, equip: true },
  }),
  // v32 → v33 (chantier 40): beacons and parcels seen, the bestiary.
  32: (raw) => ({ ...raw, faceViews: {}, bestiary: {} }),
  // v33 → v34 (chantier 40): the landing replaces the raids, the reconnaissance and the siege.
  33: migrateToLandings,
  // v34 → v35 (chantier 42): the old siege's bridgeheads, counter-attacks and reports are gone.
  34: (raw) => {
    type Raw = Record<string, unknown>;
    const siege = (raw.siege ?? {}) as Raw;
    const intel = Object.fromEntries(
      Object.entries((raw.intel ?? {}) as Record<string, Raw>).map(([k, r]) => {
        const rest = { ...r };
        delete rest.siege;
        return [k, rest];
      }),
    );
    return { ...raw, siege: { conqueredAt: Number(siege.conqueredAt ?? 0) }, intel };
  },
  // v35 → v36 (chantier 43): one morale gauge per kiwi; the colony's mourning becomes a memory.
  35: (raw) => {
    const { mourningUntil, ...rest } = raw;
    const until = Number(mourningUntil ?? 0);
    if (!(until > Number(raw.now ?? 0)) || !Array.isArray(raw.villagers)) return rest;
    const memory = { kind: 'mourning', value: MORALE.memories.mourning.value, until };
    const villagers = (raw.villagers as Record<string, unknown>[]).map((v) => ({
      ...v,
      memories: [memory],
    }));
    return { ...rest, villagers };
  },
  // v36 → v37 (chantier 43): the Speech moves to the Town Hall (an old one ends normally).
  36: (raw) => ({ ...raw, speech: { until: 0, readyAt: 0 } }),
  // v37 → v38 (chantier 44): the cabaret and the fireworks.
  37: (raw) => ({ ...raw, village: { cabaretOpen: true, fireworksNight: 0 } }),
  // v38 → v39 (chantier 48): the depths, nothing seen yet (the hidden seed is drawn where the
  // truth is held: `ensureDepths`).
  38: (raw) => ({
    ...raw,
    depths: newDepths(String(raw.seed ?? ''), (raw.face ?? 'kiwisu') as Face),
  }),
};

const OLD_MISSIONS = ['raid', 'recon', 'assault', 'reinforce', 'final', 'retreat'];

/**
 * Chantier 40: ships of the old missions in flight turn back with their crew; bridgeheads
 * become beacons (their holders come home at once); the old reports become dated views of the
 * parcels they saw. A conquered face stays conquered.
 */
function migrateToLandings(raw: Record<string, unknown>): Record<string, unknown> {
  type Raw = Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);
  const targets = list(raw.targets);
  const twinId = targets.find((t) => t.distance === 0)?.id as string | undefined;
  const faceViews = { ...((raw.faceViews ?? {}) as Record<string, Raw>) };
  const viewOf = (id: string) => {
    const v = (faceViews[id] ??= { beacons: [], parcels: {} });
    return v as { beacons: Raw[]; parcels: Record<string, Raw> };
  };
  const expeditions = list(raw.expeditions).map((e) => {
    if (!OLD_MISSIONS.includes(String(e.mission)) || e.status !== 'outbound') return e;
    return {
      ...e,
      status: 'returning',
      result: {
        victory: false,
        aborted: true,
        strength: 0,
        defense: 0,
        fed: 1,
        lostInBattle: [],
        lostOnReturn: [],
        loot: { pulp: 0, fiber: 0, seeds: 0, juice: 0 },
      },
    };
  });
  const siege = { ...((raw.siege ?? {}) as Raw) };
  if (twinId)
    for (const b of list(siege.bridgeheads))
      viewOf(twinId).beacons.push({ sector: b.sector, since: b.since });
  siege.bridgeheads = [];
  siege.counter = null;
  const villagers = list(raw.villagers).map((v) =>
    (v.job as Raw | undefined)?.kind === 'outpost' ? { ...v, job: { kind: 'idle' } } : v,
  );
  for (const [id, report] of Object.entries((raw.intel ?? {}) as Record<string, Raw>)) {
    const view = viewOf(id);
    const lit = new Set(view.beacons.map((b) => b.sector));
    const defense = (report.defense ?? { min: 0, max: 0 }) as { min: number; max: number };
    const structures = list(report.structures);
    for (const sector of (report.sectors ?? []) as number[]) {
      if (lit.has(sector) || view.parcels[String(sector)]) continue;
      const inner = sector < INTEL.sectors / 2;
      view.parcels[String(sector)] = {
        at: report.at,
        source: 'report',
        age: typeof report.civAge === 'number' ? report.civAge : 0,
        power: inner ? { min: defense.min * 2, max: defense.max * 3 } : { ...defense },
        units: [],
        buildings: structures
          .filter((x) => sectorOf(Number(x.q), Number(x.r)) === sector)
          .map((x) => ({
            kind: x.kind === 'den' ? 'burrow' : 'roost',
            sector,
            q: x.q,
            r: x.r,
          })),
      };
    }
  }
  for (const v of Object.values(faceViews))
    (v.beacons as Raw[]).sort((a, b) => Number(a.sector) - Number(b.sector));
  return { ...raw, expeditions, siege, villagers, faceViews };
}

/**
 * Chantier 35: after loading an older save, each big building (oldest first) spreads over the
 * free orientation that covers the least harvest, or stays cramped; big sites in the queue get
 * an orientation too (none: they stay cramped and finish so). Paths under the new covered tiles
 * are refunded. No building is lost.
 */
export function spreadOldBuildings(state: GameState): void {
  const map = faceMapOf(state);
  for (const b of state.buildings) {
    if (!b.cramped) continue;
    const rot = extensionFor(state, map, b);
    if (rot === null) continue;
    delete b.cramped;
    b.rot = rot;
    clearPathsUnder(state, footprintHexes(b.type, b.q, b.r, rot));
  }
  for (const item of state.queue) {
    if (item.kind !== 'build' || item.rot !== undefined || footprintOf(item.buildingType) === 1)
      continue;
    const tile = getTile(map, item);
    const rot = tile
      ? rotationsOf(item.buildingType).find(
          (r) => siteError(state, map, item.buildingType, tile, r, item.id) === null,
        )
      : undefined;
    if (rot === undefined) continue;
    item.rot = rot;
    clearPathsUnder(state, footprintHexes(item.buildingType, item.q, item.r, rot));
  }
  state.buildings = [...state.buildings];
  syncPools(state, map, state.now);
}

/** Chantier 30: old level of a building → its new level (each level keeps its age). */
function newLevel(level: number): number {
  return level <= 4 ? level : level === 5 ? 7 : 10;
}

function migrateLevels(raw: Record<string, unknown>): Record<string, unknown> {
  const buildings = Array.isArray(raw.buildings)
    ? (raw.buildings as Record<string, unknown>[])
    : [];
  const fixed = (type: unknown) => type === 'monument' || type === 'lab';
  let added = 0;
  const levelOf = new Map<unknown, number>();
  const nextBuildings = buildings.map((b) => {
    const level = Number(b.level);
    if (fixed(b.type) || !(level > 4)) return b;
    const after = newLevel(level);
    added += after - level;
    levelOf.set(b.id, after);
    return { ...b, level: after };
  });
  // A queued upgrade aims at the level after the building's new one.
  const queue = Array.isArray(raw.queue) ? (raw.queue as Record<string, unknown>[]) : [];
  const nextQueue = queue.map((i) => {
    const target = Number(i.targetLevel);
    if (i.kind === 'repair' && levelOf.has(i.buildingId))
      return { ...i, targetLevel: levelOf.get(i.buildingId) };
    if (i.kind !== 'upgrade' || fixed(i.buildingType) || !(target > 4)) return i;
    const from = levelOf.get(i.buildingId) ?? newLevel(target - 1);
    return { ...i, targetLevel: from + 1 };
  });
  const stats = raw.stats as Record<string, unknown> | undefined;
  return {
    ...raw,
    buildings: nextBuildings,
    queue: nextQueue,
    // The levels skipped count as earned constructions (`isPlausible`).
    stats: stats
      ? { ...stats, constructionsCompleted: Number(stats.constructionsCompleted) + added }
      : stats,
  };
}

function obstaclesForOldGame(raw: Record<string, unknown>): Obstacle[] {
  const face: Face = raw.face === 'kiwino' ? 'kiwino' : 'kiwisu';
  const params = raw.params as FaceParams | undefined;
  if (!params || typeof raw.seed !== 'string') return [];
  const taken = new Set<string>([hexKey(HEART)]);
  const at = (list: unknown) =>
    Array.isArray(list)
      ? (list as { q?: unknown; r?: unknown }[]).map((x) => `${Number(x.q)},${Number(x.r)}`)
      : [];
  for (const k of at(raw.buildings)) taken.add(k);
  for (const k of at(raw.queue)) taken.add(k);
  const sky = raw.sky as { meteors?: unknown; next?: { q: number; r: number } | null } | undefined;
  for (const k of at(sky?.meteors)) taken.add(k);
  if (sky?.next) taken.add(hexKey(sky.next));
  if (Array.isArray(raw.paths)) for (const k of raw.paths) taken.add(String(k));
  return generateObstacles(faceMapOf({ seed: raw.seed, face, params }), taken);
}

export type MigrateResult =
  { ok: true; state: GameState } | { ok: false; reason: 'corrupt' | 'tooNew' };

/** Upgrades a stored state to the current schema and validates it. */
export function migrateState(input: unknown): MigrateResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'corrupt' };
  let raw = input as Record<string, unknown>;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return { ok: false, reason: 'tooNew' };
  const from = version;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, reason: 'corrupt' };
    raw = migrate(raw);
    version++;
    raw.schemaVersion = version;
  }
  const result = gameStateSchema.safeParse(raw);
  if (!result.success) return { ok: false, reason: 'corrupt' };
  const state = result.data as GameState;
  if (from < 27) spreadOldBuildings(state);
  return { ok: true, state };
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
