import { BUILDINGS, levelDef, MAX_LEVEL } from '../data/buildings';
import { OBJECTIVES } from '../data/objectives';
import { START } from '../data/start';
import { RESOURCE_IDS } from '../data/resources';
import { deserializeSave } from '../save/save';
import { advance, type GameEvent } from '../sim/advance';
import { applyCommand } from '../sim/commands';
import { capacity, housing, nest, nestDef } from '../sim/selectors';
import { newGame, type GameState } from '../sim/state';
import { generateFace, type FaceMap } from '../worldgen/generateFace';
import type { Face, PlayerId, UniverseId } from '../types/ids';
import { requestSchema, type GameResponse } from './protocol';

export interface StoredGame {
  id: string;
  userId: string;
  state: GameState;
  /** Optimistic concurrency token, incremented on every write. */
  version: number;
}

/** Persistence port, implemented with Postgres in the edge function and in memory in tests. */
export interface GameRepository {
  findByUser(userId: string): Promise<StoredGame | null>;
  create(userId: string, state: GameState): Promise<StoredGame>;
  /** Writes if the stored version still equals `expectedVersion`; returns null on conflict. */
  update(gameId: string, state: GameState, expectedVersion: number): Promise<StoredGame | null>;
  /** Number of commands this user sent since `sinceMs` (rate limiting). */
  countRecentCommands(userId: string, sinceMs: number): Promise<number>;
  logCommand(entry: {
    userId: string;
    gameId: string;
    command: unknown;
    ok: boolean;
    error?: string;
    at: number;
  }): Promise<void>;
}

export interface ServiceContext {
  repo: GameRepository;
  userId: string;
  now: () => number;
  /** Server-side random seed generator (the server owns randomness, not the client). */
  randomSeed: () => string;
  /** Admins may use debug commands (time is never accelerable server-side). */
  isAdmin?: boolean;
}

export const RATE_LIMIT = { windowMs: 10_000, maxCommands: 40 };

const mapCache = new Map<string, FaceMap>();
function mapFor(state: GameState): FaceMap {
  const key = `${state.seed}/${state.face}/${state.params.radius}`;
  let map = mapCache.get(key);
  if (!map) {
    map = generateFace(state.seed, state.face, state.params);
    if (mapCache.size > 64) mapCache.clear();
    mapCache.set(key, map);
  }
  return map;
}

function freshGame(ctx: ServiceContext, seed: string, face: Face): GameState {
  return newGame({
    seed,
    face,
    now: ctx.now(),
    playerId: ctx.userId,
    universeId: `solo-${ctx.userId}`,
  });
}

/** A game with no player progress can be replaced by an import without loss. */
export function isPristine(state: GameState): boolean {
  return (
    state.stats.constructionsCompleted === 0 &&
    state.queue.length === 0 &&
    state.objectiveIndex === 0
  );
}

/**
 * Basic anti-cheat for imported local saves: the state must be internally consistent and
 * reachable by the rules (no resources beyond storage, no impossible levels or counts…).
 */
export function isPlausible(state: GameState, now: number): boolean {
  if (state.now > now + 60_000 || state.createdAt > state.now) return false;
  const cap = capacity(state);
  for (const id of RESOURCE_IDS) {
    // Stock may exceed storage only by what objective rewards can add on top of it.
    const rewards = OBJECTIVES.reduce((sum, o) => sum + (o.reward[id] ?? 0), 0);
    const v = state.resources[id];
    if (!Number.isFinite(v) || v < 0 || v > cap[id] + rewards) return false;
  }
  if (state.buildings.filter((b) => b.type === 'nest').length !== 1) return false;
  const n = nest(state);
  if (n.q !== 0 || n.r !== 0) return false;
  if (state.buildings.filter((b) => b.type !== 'nest').length > (nestDef(state).maxBuildings ?? 0))
    return false;
  for (const b of state.buildings) {
    if (b.level < 1 || b.level > MAX_LEVEL || !levelDef(b.type, b.level)) return false;
    if (
      b.type !== 'nest' &&
      b.level >= 3 &&
      n.level < (BUILDINGS[b.type].levels[2]?.requiresNestLevel ?? 1)
    )
      return false;
    if (b.richness < 0.8 || b.richness > 1.25) return false;
  }
  const map = mapFor(state);
  for (const b of state.buildings) {
    const tile = map.tiles[map.index.get(`${b.q},${b.r}`) ?? -1];
    if (!tile || !BUILDINGS[b.type].allowedTiles.includes(tile.type)) return false;
    // Richness is copied from the tile at placement (the Nest always has 1).
    const expected = b.type === 'nest' ? 1 : tile.richness;
    if (Math.abs(expected - b.richness) > 1e-6) return false;
  }
  if (state.villagers.length > housing(state)) return false;
  // Every level must have been earned through a completed construction…
  const levelsEarned = state.buildings.reduce(
    (sum, b) => sum + (b.type === 'nest' ? b.level - 1 : b.level),
    0,
  );
  if (state.stats.constructionsCompleted < levelsEarned) return false;
  // …and every kiwi beyond the first ones must have hatched.
  if (state.villagers.length > START.villagers + state.stats.eggsHatched) return false;
  if (state.objectiveIndex > OBJECTIVES.length) return false;
  if (state.queue.length > (nestDef(state).queueSize ?? 0)) return false;
  return true;
}

function reply(ctx: ServiceContext, state: GameState, events: GameEvent[] = []): GameResponse {
  return { ok: true, state, events, serverTime: ctx.now() };
}

/**
 * Server-authoritative game service. The server owns the clock, the randomness and the state;
 * the client sends commands that are validated with the very same rules as offline play.
 */
export async function handleGameRequest(ctx: ServiceContext, body: unknown): Promise<GameResponse> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'invalidRequest', serverTime: ctx.now() };
  const req = parsed.data;
  const { repo } = ctx;

  switch (req.action) {
    case 'load': {
      const existing = await repo.findByUser(ctx.userId);
      // The stored state is returned as is: the client advances it to the server time,
      // which lets it show the "while you were away" summary.
      if (existing) return reply(ctx, existing.state);
      const created = await repo.create(
        ctx.userId,
        freshGame(ctx, req.create?.seed ?? ctx.randomSeed(), req.create?.face ?? 'kiwisu'),
      );
      return reply(ctx, created.state);
    }

    case 'newWorld': {
      const state = freshGame(ctx, req.seed ?? ctx.randomSeed(), req.face);
      const existing = await repo.findByUser(ctx.userId);
      if (!existing) return reply(ctx, (await repo.create(ctx.userId, state)).state);
      const saved = await repo.update(existing.id, state, existing.version);
      return saved
        ? reply(ctx, saved.state)
        : { ok: false, error: 'conflict', serverTime: ctx.now() };
    }

    case 'import': {
      const loaded = deserializeSave(req.save);
      const now = ctx.now();
      if (!loaded.ok || !isPlausible(loaded.save.state, now)) {
        return { ok: false, error: 'importRejected', serverTime: now };
      }
      const existing = await repo.findByUser(ctx.userId);
      if (existing && !isPristine(existing.state)) {
        return { ok: false, error: 'importRejected', state: existing.state, serverTime: now };
      }
      const imported: GameState = {
        ...loaded.save.state,
        playerId: ctx.userId as PlayerId,
        universeId: `solo-${ctx.userId}` as UniverseId,
      };
      const state = advance(imported, now).state;
      const saved = existing
        ? await repo.update(existing.id, state, existing.version)
        : await repo.create(ctx.userId, state);
      return saved ? reply(ctx, saved.state) : { ok: false, error: 'conflict', serverTime: now };
    }

    case 'command': {
      const now = ctx.now();
      const recent = await repo.countRecentCommands(ctx.userId, now - RATE_LIMIT.windowMs);
      if (recent >= RATE_LIMIT.maxCommands)
        return { ok: false, error: 'rateLimited', serverTime: now };
      if (req.command.type === 'debugGrant' && !ctx.isAdmin) {
        return { ok: false, error: 'forbidden', serverTime: now };
      }
      // Optimistic concurrency: retry once if another request wrote in between.
      for (let attempt = 0; attempt < 2; attempt++) {
        const game = await repo.findByUser(ctx.userId);
        if (!game) return { ok: false, error: 'invalidRequest', serverTime: now };
        const result = applyCommand(game.state, req.command, {
          now: ctx.now(),
          map: mapFor(game.state),
        });
        await repo.logCommand({
          userId: ctx.userId,
          gameId: game.id,
          command: req.command,
          ok: result.ok,
          error: result.ok ? undefined : result.error,
          at: now,
        });
        if (!result.ok)
          return { ok: false, error: result.error, state: game.state, serverTime: ctx.now() };
        const saved = await repo.update(game.id, result.state, game.version);
        if (saved)
          return { ok: true, state: saved.state, events: result.events, serverTime: ctx.now() };
      }
      return { ok: false, error: 'conflict', serverTime: ctx.now() };
    }
  }
}

/** In-memory repository (tests, local tooling). */
export function createMemoryRepository(): GameRepository & {
  games: Map<string, StoredGame>;
  log: unknown[];
} {
  const games = new Map<string, StoredGame>();
  const log: { userId: string; at: number }[] = [];
  let next = 1;
  const clone = (g: StoredGame): StoredGame => JSON.parse(JSON.stringify(g)) as StoredGame;
  return {
    games,
    log,
    async findByUser(userId) {
      for (const g of games.values()) if (g.userId === userId) return clone(g);
      return null;
    },
    async create(userId, state) {
      const g: StoredGame = { id: `g${next++}`, userId, state, version: 1 };
      games.set(g.id, clone(g));
      return clone(g);
    },
    async update(gameId, state, expectedVersion) {
      const g = games.get(gameId);
      if (!g || g.version !== expectedVersion) return null;
      const updated = { ...g, state, version: g.version + 1 };
      games.set(gameId, clone(updated));
      return clone(updated);
    },
    async countRecentCommands(userId, sinceMs) {
      return log.filter((e) => e.userId === userId && e.at >= sinceMs).length;
    },
    async logCommand(entry) {
      log.push(entry);
    },
  };
}
