import { BEAUTY, isVillageLife, LEISURE, speechCooldownMs, speechEffectMs } from '../data/needs';
import { meteorIronOf } from './iron';
import { TASKS } from '../data/jobs';
import { stardustOf } from './comets';
import { climateOf } from '../data/biomes';
import {
  BUILDINGS,
  isTurret,
  levelDef,
  MAX_LEVEL,
  maxLevelOf,
  type BuildingType,
} from '../data/buildings';
import { PASSAGE_TECHS, type TechId } from '../data/research';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import type { CommandError } from './commands';
import { ageOf, hasTech, techEffects } from './research';
import {
  buildingCount,
  canAfford,
  copiesOf,
  isRampart,
  nest,
  nestDef,
  pendingUpgrade,
  turretCount,
  turretLimit,
  upgradeCost,
} from './selectors';
import type { Building, GameState } from './state';
import { getTile, type FaceMap, type Tile } from '../worldgen/generateFace';
import type { BuildingId } from '../types/ids';
import { hexKey } from '../hex/hex';
import { cutsLand, footprintHexes, occupancy, rotationsOf, wallsOf } from './footprint';
import { isFlooded } from './territory';
import { seasonOf } from './calendar';
import { obstacleAt } from './obstacles';
import { titanAt } from './titan';
import { meteorAt } from './sky';

/**
 * Chantier 11: what a building level or a technology brings, in numbers. One source of truth for
 * the upgrade preview, the building tree and the tests.
 */

export const LEVEL_STATS = [
  'production',
  'passive',
  'workers',
  'housing',
  'storage',
  'reserve',
  'defenseGround',
  'defenseAir',
  'ammo',
  'cargo',
  'travelTime',
  'trainingSlots',
  'trainingTime',
  'research',
  'maxBuildings',
  'queueSize',
  'buildSlots',
  'speechMemory',
  'speechCooldown',
  'leisureRange',
  'beauty',
] as const;
export type LevelStatId = (typeof LEVEL_STATS)[number];

export interface LevelStat {
  stat: LevelStatId;
  /** Production stats: one line per resource. */
  resource?: ResourceId;
  value: number;
}

export interface StatChange {
  stat: LevelStatId;
  resource?: ResourceId;
  before: number;
  after: number;
}

/**
 * The numbers of a building level. Without a state: the raw table. With one: production at full
 * staffing with the face climate and the researched bonuses, storage and defense with theirs.
 */
export function describeLevel(type: BuildingType, level: number, state?: GameState): LevelStat[] {
  const def = levelDef(type, level);
  if (!def) return [];
  const climate = state ? climateOf(state.face, state.params.biome) : null;
  const tech = state ? techEffects(state) : null;
  const out: LevelStat[] = [];
  const push = (stat: LevelStatId, value: number | undefined, resource?: ResourceId) => {
    if (value === undefined) return;
    out.push(resource ? { stat, resource, value } : { stat, value });
  };
  for (const r of RESOURCE_IDS) {
    const v = def.production?.[r];
    if (v) push('production', v * (climate?.[r] ?? 1) * (tech?.harvest[r] ?? 1), r);
  }
  for (const r of RESOURCE_IDS) {
    const v = def.passiveProduction?.[r];
    if (v) push('passive', v * (climate?.[r] ?? 1), r);
  }
  push('workers', def.workerSlots || undefined);
  push('housing', def.housing);
  push('storage', def.storage === undefined ? undefined : def.storage * (tech?.storage ?? 1));
  push('reserve', def.reserve === undefined ? undefined : def.reserve * (tech?.storage ?? 1));
  const k = tech?.turretDefense ?? 1;
  push('defenseGround', def.defense?.ground === undefined ? undefined : def.defense.ground * k);
  push('defenseAir', def.defense?.air === undefined ? undefined : def.defense.air * k);
  push('ammo', def.ammo);
  push('cargo', def.cargo);
  push('travelTime', def.travelTime);
  push('trainingSlots', def.trainingSlots);
  push('trainingTime', def.trainingTime);
  push('research', def.research);
  push('maxBuildings', def.maxBuildings);
  push('queueSize', def.queueSize);
  // Chantier 15: constructions under way at once.
  if (type === 'nest')
    push('buildSlots', TASKS.buildSlots[Math.min(level, TASKS.buildSlots.length - 1)]);
  // Chantier 43: how long a speech is remembered, and the rest between two (hours).
  push('leisureRange', LEISURE[type]?.radius);
  push('beauty', BEAUTY[type]);
  if (type === 'townHall') {
    push('speechMemory', speechEffectMs(level) / 3_600_000);
    push('speechCooldown', speechCooldownMs(level) / 3_600_000);
  }
  return out;
}

const statKey = (s: { stat: LevelStatId; resource?: ResourceId }) =>
  `${s.stat}:${s.resource ?? ''}`;

/** Level `from` → level `to`, stat by stat (a stat new at `to` starts from 0). */
export function describeUpgrade(
  type: BuildingType,
  from: number,
  to: number,
  state?: GameState,
): StatChange[] {
  const before = new Map(describeLevel(type, from, state).map((s) => [statKey(s), s.value]));
  return describeLevel(type, to, state).map((s) => ({
    stat: s.stat,
    ...(s.resource ? { resource: s.resource } : {}),
    before: before.get(statKey(s)) ?? 0,
    after: s.value,
  }));
}

export const TECH_STATS = [
  'harvest',
  'storage',
  'turretDefense',
  'guard',
  'travel',
  'rations',
  'build',
  'injuries',
  'armor',
  'recon',
  'firearms',
  'laboratory',
  'terraform',
  'kikiwiwiPower',
  'kikiwiwiUpkeep',
  'infusionRisk',
  'nightWork',
  'waveNotice',
  'cometInterval',
  'meteorStock',
  'meteorDrill',
] as const;
export type TechStatId = (typeof TECH_STATS)[number];

export interface TechChange {
  stat: TechStatId;
  resource?: ResourceId;
  /** Multipliers (1 = none), bonuses (0 = none), or 0/1 for what the tech opens. */
  before: number;
  after: number;
  kind: 'multiplier' | 'bonus' | 'unlock';
}

const MULTIPLIERS = [
  'storage',
  'turretDefense',
  'guard',
  'travel',
  'rations',
  'build',
  'injuries',
  'kikiwiwiPower',
  'kikiwiwiUpkeep',
  'nightWork',
  'cometInterval',
  'meteorStock',
] as const;
const BONUSES = ['armor', 'recon', 'infusionRisk', 'waveNotice'] as const;
const UNLOCKS = ['firearms', 'laboratory', 'terraform', 'meteorDrill'] as const;

/** What researching `id` changes for this colony: its current effects, then with the tech. */
export function describeTech(id: TechId, state: GameState): TechChange[] {
  const now = techEffects(state);
  const done = state.research.done.includes(id)
    ? state.research.done
    : [...state.research.done, id];
  const next = techEffects({ ...state, research: { ...state.research, done } });
  const out: TechChange[] = [];
  for (const r of RESOURCE_IDS)
    if (now.harvest[r] !== next.harvest[r])
      out.push({
        stat: 'harvest',
        resource: r,
        before: now.harvest[r],
        after: next.harvest[r],
        kind: 'multiplier',
      });
  for (const s of MULTIPLIERS)
    if (now[s] !== next[s])
      out.push({ stat: s, before: now[s], after: next[s], kind: 'multiplier' });
  for (const s of BONUSES)
    if (now[s] !== next[s]) out.push({ stat: s, before: now[s], after: next[s], kind: 'bonus' });
  for (const s of UNLOCKS)
    if (now[s] !== next[s])
      out.push({ stat: s, before: now[s] ? 1 : 0, after: next[s] ? 1 : 0, kind: 'unlock' });
  return out;
}

/**
 * Why this type cannot be built anywhere right now (Nest level, age, technology, one per colony,
 * caps), or null. The tile, the resources and the queue are checked by the `build` command.
 */
export function buildLock(state: GameState, type: BuildingType): CommandError | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'notBuildable';
  const first = def.levels[0]!;
  if (nest(state).level < first.requiresNestLevel) return 'nestLevelTooLow';
  if ((first.requiresAge ?? 0) > ageOf(state)) return 'ageTooLow';
  if (type === 'lab') {
    if (copiesOf(state, 'lab') > 0) return 'labExists';
    if (!techEffects(state).laboratory) return 'techMissing';
  } else if (type === 'forge') {
    if (copiesOf(state, 'forge') > 0) return 'forgeExists';
    if (!techEffects(state).forge) return 'techMissing';
    if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return 'buildingLimit';
  } else if (type === 'townHall') {
    if (copiesOf(state, 'townHall') > 0) return 'townHallExists';
  } else if (type === 'mayorStatue') {
    if (copiesOf(state, 'mayorStatue') > 0) return 'statueExists';
  } else if (isVillageLife(type)) {
    // Chantiers 43–44: the campfire, decorations and games stand outside the building cap, as
    // many as the player pays for.
  } else if (type === 'monument') {
    if (copiesOf(state, 'monument') > 0) return 'monumentExists';
    if (!hasTech(state, PASSAGE_TECHS[1]!)) return 'passageMissing';
  } else if (isTurret(type)) {
    if (turretCount(state) >= turretLimit(state)) return 'turretLimit';
  } else if (buildingCount(state) >= (nestDef(state).maxBuildings ?? 0)) return 'buildingLimit';
  return null;
}

/** Why one tile of a footprint cannot take this building, or null (`self` may stand on it). */
function tileError(
  state: GameState,
  map: FaceMap,
  type: BuildingType,
  h: { q: number; r: number },
  self: string | null,
): CommandError | null {
  const tile = getTile(map, h);
  if (!tile || !BUILDINGS[type].allowedTiles.includes(tile.type)) return 'tileNotAllowed';
  const here = occupancy(state).tiles.get(hexKey(h));
  if (here && here.id !== self) return 'tileOccupied';
  if (obstacleAt(state, h.q, h.r)) return 'obstacle';
  if (titanAt(state, h.q, h.r)) return 'titanAtWork';
  // Chantier 15: a crater is a temporary post, nothing is built on it.
  if (meteorAt(state, h.q, h.r)) return 'onCrater';
  if (isFlooded(tile, map.params.biome, seasonOf(state))) return 'flooded';
  return null;
}

/**
 * Why this tile cannot take this building (type of tile, taken, obstacle, flood…), or null.
 * Chantier 35: every tile of the footprint turned by `rot` is checked, and the covered tiles
 * must not cut the walkable land in two. `self`: a building spreading from its anchor.
 */
export function siteError(
  state: GameState,
  map: FaceMap,
  type: BuildingType,
  tile: Tile,
  rot = 0,
  self: string | null = null,
): CommandError | null {
  const tiles = footprintHexes(type, tile.q, tile.r, rot);
  for (const h of tiles) {
    const error = tileError(state, map, type, h, self);
    if (error) return error;
  }
  if (isTurret(type) && !isRampart(map, tile.q, tile.r)) return 'notOnRampart';
  if (tiles.length > 1) {
    const walls = wallsOf(tiles).map((h) => hexKey(h));
    if (cutsLand(map, walls, occupancy(state).blocked)) return 'cutsLand';
  }
  return null;
}

/** Tiles where `type` can be built right now with this orientation (the placement mode). */
export function buildableTiles(
  state: GameState,
  map: FaceMap,
  type: BuildingType,
  rot = 0,
): Tile[] {
  if (buildLock(state, type)) return [];
  return map.tiles.filter((t) => siteError(state, map, type, t, rot) === null);
}

/** Covered tiles of a footprint that a producer harvests now (chantier 35: that harvest is lost). */
export function coveredHarvest(
  state: GameState,
  type: BuildingType,
  q: number,
  r: number,
  rot = 0,
): { key: string; owner: BuildingId }[] {
  const keys = new Set<string>(footprintHexes(type, q, r, rot).map((h) => hexKey(h)));
  const out: { key: string; owner: BuildingId }[] = [];
  for (const b of state.buildings)
    for (const k of b.pool?.tiles ?? []) if (keys.has(k)) out.push({ key: k, owner: b.id });
  return out;
}

/**
 * Chantier 35: the orientation a cramped building spreads to at its next upgrade — the free
 * one that covers the least harvest — or null when none has room.
 */
export function extensionFor(state: GameState, map: FaceMap, b: Building): number | null {
  const anchor = getTile(map, b);
  if (!anchor) return null;
  let best: { rot: number; lost: number } | null = null;
  for (const rot of rotationsOf(b.type)) {
    if (siteError(state, map, b.type, anchor, rot, b.id)) continue;
    const lost = coveredHarvest(state, b.type, b.q, b.r, rot).filter(
      (c) => c.owner !== b.id,
    ).length;
    if (!best || lost < best.lost) best = { rot, lost };
  }
  return best?.rot ?? null;
}

/**
 * Chantier 35: what keeps a cramped building from spreading — the covered tiles that fail, for
 * the orientation with the fewest of them (the sheet lights them up).
 */
export function crampedBlockers(state: GameState, map: FaceMap, b: Building): string[] {
  let best: string[] | null = null;
  for (const rot of rotationsOf(b.type)) {
    const all = footprintHexes(b.type, b.q, b.r, rot);
    const tiles = all.slice(1);
    const failing = tiles.filter((h) => tileError(state, map, b.type, h, b.id) !== null);
    const keys = failing.map((h) => hexKey(h));
    const walls = wallsOf(all).map((h) => hexKey(h));
    if (failing.length === 0 && cutsLand(map, walls, occupancy(state).blocked))
      keys.push(...tiles.map((h) => hexKey(h)));
    if (!best || keys.length < best.length) best = keys;
  }
  return best ?? [];
}

/**
 * Why this building cannot be upgraded right now, or null (the `upgrade` command and the
 * "upgradable" arrow of the level badges).
 */
export function upgradeLock(state: GameState, b: Building, map?: FaceMap): CommandError | null {
  if (b.level >= Math.min(MAX_LEVEL, maxLevelOf(b.type))) return 'maxLevel';
  // Levels 4–6 wait for the ages; each monument level for its passage technology.
  if ((levelDef(b.type, b.level + 1)!.requiresAge ?? 0) > ageOf(state)) return 'ageTooLow';
  if (b.type === 'monument' && !hasTech(state, PASSAGE_TECHS[b.level + 1]!))
    return 'passageMissing';
  const pending = pendingUpgrade(state, b.id);
  if (pending) return pending.kind === 'repair' ? 'alreadyRepairing' : 'alreadyUpgrading';
  // Chantier 35: a cramped building needs room to spread before it grows.
  if (b.cramped && map && extensionFor(state, map, b) === null) return 'cramped';
  const def = levelDef(b.type, b.level + 1)!;
  // The Nest gates the others; the Nest itself only needs its current level.
  if (b.type !== 'nest' && nest(state).level < def.requiresNestLevel) return 'nestLevelTooLow';
  if (state.queue.length >= (nestDef(state).queueSize ?? 1)) return 'queueFull';
  if (!canAfford(state.resources, upgradeCost(b.type, b.level + 1))) return 'notEnoughResources';
  if (stardustOf(state) < (def.stardust ?? 0)) return 'notEnoughStardust';
  if (meteorIronOf(state) < (def.iron ?? 0)) return 'notEnoughIron';
  return null;
}
