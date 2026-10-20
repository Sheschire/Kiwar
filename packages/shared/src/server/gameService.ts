import type { HexKey } from '../hex/hex';
import { faceMapOf } from '../sim/territory';
import { TITAN } from '../data/titan';
import { kikiwiwiCap, kikiwiwiCount } from '../sim/kikiwiwi';
import { OBSTACLES, OBSTACLE_RULES } from '../data/obstacles';
import { METEORS } from '../data/threats';
import { generateObstacles, obstacleId } from '../sim/obstacles';
import { drawBiomes } from '../data/biomes';
import { CALENDAR, calendarStartFor } from '../data/cycles';
import { BUILDINGS, levelDef, MAX_LEVEL } from '../data/buildings';
import { OBJECTIVES } from '../data/objectives';
import { START } from '../data/start';
import { CAMPS } from '../data/territory';
import { RESOURCE_IDS, type Resources } from '../data/resources';
import { KIWI, MASTERY_IDS, STAT_IDS } from '../data/kiwis';
import { CLASSES, SKILLS } from '../data/classes';
import { levelForXp } from '../sim/kiwis';
import { PASSAGE_TECHS, RESEARCH_SCALE, TECHS } from '../data/research';
import { ageOf, libraries, techEffects } from '../sim/research';
import { deserializeSave, migrateState } from '../save/save';
import { advance, type GameEvent } from '../sim/advance';
import { applyCommand } from '../sim/commands';
import {
  buildingCount,
  capacity,
  housing,
  nest,
  nestDef,
  pathLimit,
  turretCount,
  turretLimit,
} from '../sim/selectors';
import { cloneAliens, newGame, type GameState, type Shipment, type Villager } from '../sim/state';
import { deliveryOf } from '../sim/deliveries';
import { ensureAliens, publicState } from '../sim/aliens';
import { generateFace, type FaceMap } from '../worldgen/generateFace';
import type { Face, KiwiId, PlayerId, UniverseId } from '../types/ids';
import { requestSchema, type GameResponse, type ServerError } from './protocol';
import {
  assignFace,
  inviteCode,
  kiwiCount,
  planetSeedOf,
  MAX_PLAYERS,
  universeFriends,
  universeTargets,
  friendId,
  userOfFriend,
  type UniverseInfo,
  type UniverseMember,
  type AllySnapshot,
  type TwinSnapshot,
  type UniverseSummary,
} from './universes';

export interface StoredGame {
  id: string;
  userId: string;
  universeId: string;
  state: GameState;
  /** Optimistic concurrency token, incremented on every write. */
  version: number;
}

export interface UniverseRow {
  id: string;
  name: string;
  code: string;
  seed: string;
  maxPlayers: number;
  /** Creation time (the universe's shared calendar starts then). */
  createdAt?: number;
}

/** Persistence port, implemented with Postgres in the edge function and in memory in tests. */
export interface GameRepository {
  findGame(userId: string, universeId: string): Promise<StoredGame | null>;
  create(userId: string, universeId: string, state: GameState): Promise<StoredGame>;
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
  // Shared universes.
  createUniverse(row: Omit<UniverseRow, 'id'> & { createdBy: string }): Promise<UniverseRow>;
  getUniverse(id: string): Promise<UniverseRow | null>;
  findUniverseByCode(code: string): Promise<UniverseRow | null>;
  listMembers(universeId: string): Promise<UniverseMember[]>;
  /** Adds a member; returns false if the face (or the user) is already taken (race). */
  addMember(universeId: string, member: UniverseMember): Promise<boolean>;
  listUserUniverses(userId: string): Promise<UniverseRow[]>;
  /** Moves a member to another face of their kiwi; false if that face is taken (race). */
  moveMember(universeId: string, userId: string, face: Face): Promise<boolean>;
}

export interface ServiceContext {
  repo: GameRepository;
  userId: string;
  now: () => number;
  /** Server-side random seed generator (the server owns randomness, not the client). */
  randomSeed: () => string;
  /** Random bytes for invite codes. */
  randomBytes: (n: number) => Uint8Array;
  /** Admins may use debug commands (time is never accelerable server-side). */
  isAdmin?: boolean;
}

export const RATE_LIMIT = { windowMs: 10_000, maxCommands: 40 };

/** The colony's map, reshaped tiles included (chantier 08: the same one as the simulation). */
function mapFor(state: GameState): FaceMap {
  return faceMapOf(state);
}

const mapCache = new Map<string, FaceMap>();
// The generated map only (obstacles are drawn on it).
function baseMapFor(state: GameState): FaceMap {
  const key = `${state.seed}/${state.face}/${state.params.radius}/${state.params.biome}`;
  let map = mapCache.get(key);
  if (!map) {
    map = generateFace(state.seed, state.face, state.params);
    if (mapCache.size > 64) mapCache.clear();
    mapCache.set(key, map);
  }
  return map;
}

const soloId = (ctx: ServiceContext) => `solo-${ctx.userId}`;

function freshGame(ctx: ServiceContext, seed: string, face: Face): GameState {
  return newGame({
    seed,
    face,
    now: ctx.now(),
    playerId: ctx.userId,
    universeId: soloId(ctx),
    alienSeed: ctx.randomSeed(),
  });
}

/** Where a request plays: the player's solo universe or a shared one they belong to. */
interface Scope {
  universeId: string;
  shared: { info: UniverseInfo; me: UniverseMember } | null;
}

async function resolveScope(
  ctx: ServiceContext,
  repo: GameRepository,
  universe: string | undefined,
): Promise<Scope | null> {
  if (!universe || universe === 'solo') return { universeId: soloId(ctx), shared: null };
  const row = await repo.getUniverse(universe);
  if (!row) return null;
  const members = await repo.listMembers(row.id);
  const me = members.find((m) => m.userId === ctx.userId);
  if (!me) return null;
  return { universeId: row.id, shared: { info: toInfo(row, members), me } };
}

function toInfo(row: UniverseRow, members: UniverseMember[]): UniverseInfo {
  return {
    ...toSummary(row, members.length),
    seed: row.seed,
    members,
    kiwiCount: kiwiCount(members),
    createdAt: row.createdAt,
  };
}

function toSummary(row: UniverseRow, players: number): UniverseSummary {
  return { id: row.id, name: row.name, code: row.code, players, maxPlayers: row.maxPlayers };
}

/**
 * In a shared universe, the reachable alien faces change as friends join, and every colony
 * follows the universe's calendar (games created before chantier 04 are aligned here). Every
 * target gets its hidden garrison, drawn from a secret server seed (chantier 07).
 */
function withScopeTargets(
  ctx: ServiceContext,
  state: GameState,
  scope: Scope,
): { state: GameState; changed: boolean } {
  const next: GameState = scope.shared
    ? {
        ...state,
        targets: universeTargets(scope.shared.info.members, scope.shared.me),
        friends: universeFriends(scope.shared.info.members, scope.shared.me),
        calendarStart:
          scope.shared.info.createdAt === undefined
            ? state.calendarStart
            : calendarStartFor(scope.shared.info.createdAt),
      }
    : { ...state, friends: [] };
  if (state.aliens) next.aliens = cloneAliens(state.aliens);
  const changed = ensureAliens(next, ctx.randomSeed());
  return { state: next, changed };
}

function universeGame(ctx: ServiceContext, info: UniverseInfo, me: UniverseMember): GameState {
  return newGame({
    seed: planetSeedOf(info, me.kiwiIndex),
    face: me.face,
    now: ctx.now(),
    playerId: ctx.userId,
    universeId: info.id,
    kiwiId: `k${me.kiwiIndex}`,
    // Everyone in a universe lives the same days and seasons.
    calendarStart: calendarStartFor(info.createdAt ?? ctx.now()),
    targets: universeTargets(info.members, me),
    alienSeed: ctx.randomSeed(),
  });
}

/**
 * What a player sees of the other players of their universe: the layout of each colony (no
 * stocks), as it is now. `twin`: a friend on the other half of our own kiwi (older universes);
 * `allies`: everyone else, on kiwis far away.
 */
async function neighboursOf(
  repo: GameRepository,
  info: UniverseInfo,
  me: UniverseMember,
  now: number,
): Promise<{ twin: TwinSnapshot | null; allies: AllySnapshot[] }> {
  const others = info.members.filter((m) => m.userId !== me.userId);
  const snapshots = await Promise.all(
    others.map(async (m): Promise<AllySnapshot | null> => {
      const game = await repo.findGame(m.userId, info.id);
      if (!game) return null;
      const s = game.state;
      const cap = capacity(s);
      return {
        owner: m.displayName,
        kiwiIndex: m.kiwiIndex,
        friendId: friendId(m.userId),
        room: Object.fromEntries(
          RESOURCE_IDS.map((r) => {
            // Gifts already on their way take their room too.
            const coming = s.incoming.reduce((sum, d) => sum + d.resources[r], 0);
            return [r, Math.max(0, Math.floor(cap[r] - s.resources[r] - coming))];
          }),
        ) as Resources,
        seed: s.seed,
        face: s.face,
        params: s.params,
        buildings: s.buildings.map((b) => ({ type: b.type, level: b.level, q: b.q, r: b.r })),
        paths: s.paths,
        obstacles: s.obstacles.map((o) => ({ kind: o.kind, q: o.q, r: o.r })),
        terraform: s.terraform,
        at: now,
      };
    }),
  );
  const all = snapshots.filter((x): x is AllySnapshot => x !== null);
  const twin = all.find((a) => a.kiwiIndex === me.kiwiIndex && a.face !== me.face) ?? null;
  return { twin, allies: all.filter((a) => a !== twin) };
}

/** Writes a gift into the ally's game: it lands there at the same time as our ship. */
async function deliver(
  repo: GameRepository,
  universeId: string,
  me: UniverseMember,
  shipment: Shipment,
): Promise<void> {
  const delivery = deliveryOf(shipment, me.displayName, me.userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const game = await repo.findGame(userOfFriend(shipment.friendId), universeId);
    if (!game) return;
    const s = game.state;
    if (s.incoming.some((d) => d.id === delivery.id)) return;
    const next = { ...s, incoming: [...s.incoming, delivery] };
    if (await repo.update(game.id, next, game.version)) return;
  }
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
  // Solo games follow their own calendar (no skipping winter).
  if (state.calendarStart !== calendarStartFor(state.createdAt)) return false;
  // The biome comes from the seed (older worlds keep the classic one): no picking it by hand.
  const biome = state.params.biome;
  if (biome !== 'classic' && biome !== drawBiomes(state.seed)[state.face]) return false;
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
  if (buildingCount(state) > (nestDef(state).maxBuildings ?? 0)) return false;
  if (state.buildings.filter((b) => b.type === 'camp').length > CAMPS.max) return false;
  if (turretCount(state) > turretLimit(state)) return false;
  if (state.paths.length > pathLimit(state)) return false;
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
    (sum, b) => sum + (b.type === 'nest' ? b.level - 1 : b.type === 'camp' ? 0 : b.level),
    0,
  );
  if (state.stats.constructionsCompleted < levelsEarned) return false;
  // …and every kiwi beyond the first ones must have hatched.
  if (state.villagers.length > START.villagers + state.stats.eggsHatched) return false;
  if (state.objectiveIndex > OBJECTIVES.length) return false;
  if (state.queue.length > (nestDef(state).queueSize ?? 0)) return false;
  // Local saves cannot bring expeditions or victories along (milestone-1 saves have none).
  if (state.expeditions.length > 0 || Object.keys(state.victories).length > 0) return false;
  if (state.memorial.length > 0) return false;
  // Shinies are 1 in 512: a save full of them was edited.
  const shinies = state.villagers.filter((v) => v.shiny).length;
  if (shinies > 2 + Math.floor(state.villagers.length / 128)) return false;
  const mayors = state.villagers.filter(
    (v) => v.classId === 'mayor' || (v.job.kind === 'train' && v.job.classId === 'mayor'),
  );
  if (mayors.length > 1 || state.speechUntil > state.now + SKILLS.speechMs * 2) return false;
  if (!plausibleResearch(state) || !plausibleAge(state)) return false;
  if (!plausibleObstacles(state)) return false;
  // Chantier 08: one laboratory (after its technology), Kikiwiwis within the cap of the age.
  const labs = state.buildings.filter((b) => b.type === 'lab').length;
  if (labs > 1 || (labs > 0 && !techEffects(state).laboratory)) return false;
  if (kikiwiwiCount(state) > kikiwiwiCap(state)) return false;
  if (!plausibleTerraform(state)) return false;
  return state.villagers.every((v) => plausibleKiwi(v, state.now));
}

/** Reshaped tiles (chantier 08): within the cap of the age, on tiles of the right kind. */
function plausibleTerraform(state: GameState): boolean {
  const entries = Object.entries(state.terraform);
  if (entries.length === 0) return true;
  if (!techEffects(state).terraform) return false;
  if (entries.length > (TITAN.maxTerraform[ageOf(state)] ?? 0)) return false;
  const base = baseMapFor(state);
  for (const [key, kind] of entries) {
    const tile = base.tiles[base.index.get(key as HexKey) ?? -1];
    if (!tile) return false;
    const ok =
      kind === 'terrace'
        ? !!tile.flood
        : kind === 'flatten'
          ? tile.type === 'grove' || tile.type === 'seedRing'
          : tile.type === 'flesh' || tile.type === 'grove' || tile.type === 'seedRing';
    if (!ok) return false;
  }
  return true;
}

/**
 * Obstacles (chantier 08): rocks and stumps come from the seed (a save may only have fewer),
 * wrecks are capped and stand on land, loot is never above its table.
 */
function plausibleObstacles(state: GameState): boolean {
  const map = baseMapFor(state);
  const generated = new Map(generateObstacles(map).map((o) => [o.id, o]));
  const wrecks = state.obstacles.filter((o) => o.kind === 'wreck');
  if (wrecks.length > OBSTACLE_RULES.maxWrecks) return false;
  const maxAge = METEORS.ageFactor[METEORS.ageFactor.length - 1] ?? 1;
  for (const o of state.obstacles) {
    if (o.id !== obstacleId(o.kind, o.q, o.r)) return false;
    if (o.kind === 'wreck') {
      const tile = map.tiles[map.index.get(`${o.q},${o.r}`) ?? -1];
      if (!tile || !OBSTACLES.wreck.tiles.includes(tile.type)) return false;
      for (const r of RESOURCE_IDS)
        if ((o.loot[r] ?? 0) > Math.round((OBSTACLES.wreck.loot[r] ?? 0) * maxAge)) return false;
    } else {
      const g = generated.get(o.id);
      if (!g || RESOURCE_IDS.some((r) => (o.loot[r] ?? 0) > (g.loot[r] ?? 0))) return false;
    }
  }
  return true;
}

/**
 * Research (chantier 08): known techs belong to the ages reached, and no more points were
 * earned than the Libraries could produce since the start (best researchers, all day long).
 */
function plausibleResearch(state: GameState): boolean {
  const r = state.research;
  if (new Set(r.done).size !== r.done.length) return false;
  if (r.current && r.done.includes(r.current)) return false;
  const age = ageOf(state);
  if (r.done.some((id) => TECHS[id].age > age)) return false;
  const perHour = libraries(state).reduce((sum, b) => {
    const def = levelDef(b.type, b.level);
    return sum + (def?.research ?? 0) * (def?.workerSlots ?? 0);
  }, 0);
  const earned = r.done.reduce((sum, id) => sum + TECHS[id].cost, 0) + r.points / RESEARCH_SCALE;
  const hours = Math.max(0, state.now - state.createdAt) / 3_600_000;
  return earned <= perHour * MAX_RESEARCH_POWER * hours + 1;
}

/** Ages (chantier 08): one monument, each level earned by its passage technology. */
function plausibleAge(state: GameState): boolean {
  const monuments = state.buildings.filter((b) => b.type === 'monument');
  if (monuments.length > 1) return false;
  const age = ageOf(state);
  for (let a = 1; a <= age; a++) if (!state.research.done.includes(PASSAGE_TECHS[a]!)) return false;
  return state.buildings.every((b) => (levelDef(b.type, b.level)?.requiresAge ?? 0) <= age);
}

/** Best research power of a kiwi (Spirit cap, mastery rank 10, mage, dreamer), rounded up. */
const MAX_RESEARCH_POWER = 4;

/** Upper bound of experience / practice gained per ms (best stats, best trait, building). */
const MAX_XP_PER_MS = 100 * KIWI.xpPerHour.build * (1 + KIWI.spiritXp * KIWI.stat.cap) * 1.25;
const MAX_PRACTICE_PER_MS = 100 * 1.25;

/** Stats, levels and masteries a local save can honestly have reached. */
function plausibleKiwi(v: Villager, now: number): boolean {
  if (v.bornAt > now) return false;
  const age = now - v.bornAt;
  const sum = STAT_IDS.reduce((s, id) => s + v.stats[id], 0);
  if (sum + v.statPoints > KIWI.statTotal.max + v.level - 1) return false;
  if (v.statPoints > Math.floor(v.level / 2)) return false;
  if (levelForXp(v.xp) !== v.level || v.xp > MAX_XP_PER_MS * age) return false;
  const practice = MASTERY_IDS.reduce((s, id) => s + v.mastery[id], 0);
  if (practice > MAX_PRACTICE_PER_MS * age) return false;
  // A class needs the level it is taught at.
  if (v.classId && v.level < CLASSES[v.classId].minLevel) return false;
  return v.history.expeditions === 0 && v.history.victories === 0;
}

type OkResponse = Extract<GameResponse, { ok: true }>;

function reply(ctx: ServiceContext, state: GameState, events: GameEvent[] = []): OkResponse {
  return { ok: true, state, events, serverTime: ctx.now() };
}

/**
 * Server-authoritative game service. The server owns the clock, the randomness and the state;
 * the client sends commands that are validated with the very same rules as offline play.
 */
export async function handleGameRequest(ctx: ServiceContext, body: unknown): Promise<GameResponse> {
  const res = await handle(ctx, body);
  // Anti-cheat (chantier 07): the real alien garrisons never leave the server.
  return res.state ? { ...res, state: publicState(res.state) } : res;
}

async function handle(ctx: ServiceContext, body: unknown): Promise<GameResponse> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'invalidRequest', serverTime: ctx.now() };
  const req = parsed.data;
  const repo = migrating(ctx.repo);
  const fail = (error: ServerError, state?: GameState): GameResponse =>
    state
      ? { ok: false, error, state, serverTime: ctx.now() }
      : { ok: false, error, serverTime: ctx.now() };

  switch (req.action) {
    case 'listUniverses': {
      const rows = await repo.listUserUniverses(ctx.userId);
      const universes = await Promise.all(
        rows.map(async (r) => toSummary(r, (await repo.listMembers(r.id)).length)),
      );
      return { ok: true, events: [], universes, serverTime: ctx.now() };
    }

    case 'createUniverse': {
      const mine = await repo.listUserUniverses(ctx.userId);
      if (mine.length >= MAX_UNIVERSES_PER_PLAYER) return fail('forbidden');
      const solo = req.fromSolo ? await repo.findGame(ctx.userId, soloId(ctx)) : null;
      if (req.fromSolo && (!solo || isPristine(solo.state))) return fail('invalidRequest');
      const row = await repo.createUniverse({
        name: req.name.trim(),
        code: inviteCode(ctx.randomBytes(8)),
        seed: ctx.randomSeed(),
        maxPlayers: MAX_PLAYERS,
        // A colony brought along keeps its days and seasons: the universe calendar is its own.
        createdAt: solo
          ? Math.min(ctx.now(), solo.state.calendarStart + CALENDAR.startOffsetMs)
          : ctx.now(),
        createdBy: ctx.userId,
      });
      if (!solo) return joinAndPlay(ctx, repo, row, req.displayName);
      return moveSoloInto(ctx, repo, row, solo, req.displayName);
    }

    case 'joinUniverse': {
      const row = await repo.findUniverseByCode(req.code.toUpperCase());
      if (!row) return fail('universeNotFound');
      return joinAndPlay(ctx, repo, row, req.displayName);
    }

    case 'universeInfo': {
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope?.shared) return fail('forbidden');
      const { info, me } = scope.shared;
      return {
        ok: true,
        events: [],
        universe: info,
        ...(await neighboursOf(repo, info, me, ctx.now())),
        serverTime: ctx.now(),
      };
    }

    case 'pickFace': {
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope?.shared) return fail('forbidden');
      const { info, me } = scope.shared;
      const game = await repo.findGame(ctx.userId, info.id);
      if (!game) return fail('invalidRequest');
      if (me.face !== req.face) {
        // Only a newcomer may still change sides, and only to a face nobody holds.
        if (!isPristine(game.state)) return fail('forbidden', game.state);
        const holder = info.members.find(
          (m) => m.kiwiIndex === me.kiwiIndex && m.face === req.face,
        );
        if (holder || !(await repo.moveMember(info.id, ctx.userId, req.face)))
          return fail('faceTaken', game.state);
        const moved: UniverseMember = { ...me, face: req.face };
        const members = info.members.map((m) => (m.userId === ctx.userId ? moved : m));
        const next = { ...info, members };
        const saved = await repo.update(game.id, universeGame(ctx, next, moved), game.version);
        if (!saved) return fail('conflict');
        return {
          ok: true,
          state: withScopeTargets(ctx, saved.state, {
            universeId: info.id,
            shared: { info: next, me: moved },
          }).state,
          events: [],
          universe: next,
          ...(await neighboursOf(repo, next, moved, ctx.now())),
          serverTime: ctx.now(),
        };
      }
      return {
        ...reply(ctx, withScopeTargets(ctx, game.state, scope).state),
        universe: info,
        ...(await neighboursOf(repo, info, me, ctx.now())),
      };
    }

    case 'load': {
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope) return fail('forbidden');
      const existing = await repo.findGame(ctx.userId, scope.universeId);
      // The stored state is returned as is: the client advances it to the server time,
      // which lets it show the "while you were away" summary.
      const near = scope.shared
        ? await neighboursOf(repo, scope.shared.info, scope.shared.me, ctx.now())
        : {};
      if (existing) {
        const scoped = withScopeTargets(ctx, existing.state, scope);
        let state = scoped.state;
        let events: GameEvent[] = [];
        // Ships that landed meanwhile are resolved here: the client cannot (hidden garrison).
        const landed = state.expeditions
          .filter((e) => e.status === 'outbound' && e.arriveAt <= ctx.now())
          .map((e) => e.arriveAt);
        if (landed.length > 0) {
          const result = advance(state, Math.max(...landed));
          state = result.state;
          events = result.events;
        }
        if (scoped.changed || landed.length > 0) {
          const saved = await repo.update(existing.id, state, existing.version);
          // Another request wrote in between: it resolved everything as well.
          if (!saved) state = (await repo.findGame(ctx.userId, scope.universeId))?.state ?? state;
        }
        return { ...reply(ctx, state, events), universe: scope.shared?.info, ...near };
      }
      const state = scope.shared
        ? universeGame(ctx, scope.shared.info, scope.shared.me)
        : freshGame(ctx, req.create?.seed ?? ctx.randomSeed(), req.create?.face ?? 'kiwisu');
      const created = await repo.create(ctx.userId, scope.universeId, state);
      return { ...reply(ctx, created.state), universe: scope.shared?.info, ...near };
    }

    case 'newWorld': {
      const state = freshGame(ctx, req.seed ?? ctx.randomSeed(), req.face);
      const existing = await repo.findGame(ctx.userId, soloId(ctx));
      if (!existing) return reply(ctx, (await repo.create(ctx.userId, soloId(ctx), state)).state);
      const saved = await repo.update(existing.id, state, existing.version);
      return saved ? reply(ctx, saved.state) : fail('conflict');
    }

    case 'import': {
      const loaded = deserializeSave(req.save);
      const now = ctx.now();
      if (!loaded.ok || !isPlausible(loaded.save.state, now)) return fail('importRejected');
      const existing = await repo.findGame(ctx.userId, soloId(ctx));
      if (existing && !isPristine(existing.state)) return fail('importRejected', existing.state);
      const imported: GameState = {
        ...loaded.save.state,
        playerId: ctx.userId as PlayerId,
        universeId: soloId(ctx) as UniverseId,
        friends: [],
        shipments: [],
        incoming: [],
      };
      // A local save carries its own garrisons: never trust them, draw secret ones.
      delete imported.aliens;
      ensureAliens(imported, ctx.randomSeed());
      const state = advance(imported, now).state;
      const saved = existing
        ? await repo.update(existing.id, state, existing.version)
        : await repo.create(ctx.userId, soloId(ctx), state);
      return saved ? reply(ctx, saved.state) : fail('conflict');
    }

    case 'command': {
      const now = ctx.now();
      const recent = await repo.countRecentCommands(ctx.userId, now - RATE_LIMIT.windowMs);
      if (recent >= RATE_LIMIT.maxCommands) return fail('rateLimited');
      if (req.command.type === 'debugGrant' && !ctx.isAdmin) return fail('forbidden');
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope) return fail('forbidden');
      // Optimistic concurrency: retry once if another request wrote in between.
      for (let attempt = 0; attempt < 2; attempt++) {
        const game = await repo.findGame(ctx.userId, scope.universeId);
        if (!game) return fail('invalidRequest');
        const current = withScopeTargets(ctx, game.state, scope).state;
        const result = applyCommand(current, req.command, { now: ctx.now(), map: mapFor(current) });
        await repo.logCommand({
          userId: ctx.userId,
          gameId: game.id,
          command: req.command,
          ok: result.ok,
          error: result.ok ? undefined : result.error,
          at: now,
        });
        if (!result.ok) return fail(result.error, current);
        const saved = await repo.update(game.id, result.state, game.version);
        if (saved) {
          if (req.command.type === 'sendCargo' && scope.shared) {
            const sent = saved.state.shipments.find(
              (x) => !current.shipments.some((y) => y.id === x.id),
            );
            if (sent) await deliver(repo, scope.shared.info.id, scope.shared.me, sent);
          }
          return { ok: true, state: saved.state, events: result.events, serverTime: ctx.now() };
        }
      }
      return fail('conflict');
    }
  }
}

/** A player may create (and own) a handful of universes. */
export const MAX_UNIVERSES_PER_PLAYER = 5;

/** Joins (if needed) and returns the player's game in that universe. */
async function joinAndPlay(
  ctx: ServiceContext,
  repo: GameRepository,
  row: UniverseRow,
  displayName: string,
): Promise<GameResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const members = await repo.listMembers(row.id);
    let me = members.find((m) => m.userId === ctx.userId);
    if (!me) {
      if (members.length >= row.maxPlayers)
        return { ok: false, error: 'universeFull', serverTime: ctx.now() };
      me = { userId: ctx.userId, displayName: displayName.trim(), ...assignFace(members) };
      // Two friends joining at the same instant may get the same face: retry.
      if (!(await repo.addMember(row.id, me))) continue;
      members.push(me);
    }
    const info = toInfo(row, members);
    const existing = await repo.findGame(ctx.userId, row.id);
    const game = existing ?? (await repo.create(ctx.userId, row.id, universeGame(ctx, info, me)));
    const scope: Scope = { universeId: row.id, shared: { info, me } };
    return {
      ok: true,
      state: withScopeTargets(ctx, game.state, scope).state,
      events: [],
      universe: info,
      ...(await neighboursOf(repo, info, me, ctx.now())),
      serverTime: ctx.now(),
    };
  }
  return { ok: false, error: 'conflict', serverTime: ctx.now() };
}

/**
 * The solo colony becomes the founder's kiwi in a new universe (moved, not copied: the solo
 * slot starts over). Its planet keeps its seed, its alien twin and what we know of it.
 */
async function moveSoloInto(
  ctx: ServiceContext,
  repo: GameRepository,
  row: UniverseRow,
  solo: StoredGame,
  displayName: string,
): Promise<GameResponse> {
  const me: UniverseMember = {
    userId: ctx.userId,
    displayName: displayName.trim(),
    kiwiIndex: 0,
    face: solo.state.face,
    planetSeed: solo.state.seed,
  };
  if (!(await repo.addMember(row.id, me)))
    return { ok: false, error: 'conflict', serverTime: ctx.now() };
  const info = toInfo(row, [me]);
  const now = ctx.now();
  const moved: GameState = {
    ...advance(solo.state, now).state,
    universeId: row.id as UniverseId,
    kiwiId: 'k0' as KiwiId,
    targets: universeTargets(info.members, me),
  };
  ensureAliens(moved, ctx.randomSeed());
  const game = await repo.create(ctx.userId, row.id, moved);
  // The solo slot starts over (a new world, drawn by the server).
  await repo.update(solo.id, freshGame(ctx, ctx.randomSeed(), 'kiwisu'), solo.version);
  const scope: Scope = { universeId: row.id, shared: { info, me } };
  return {
    ok: true,
    state: withScopeTargets(ctx, game.state, scope).state,
    events: [],
    universe: info,
    twin: null,
    allies: [],
    serverTime: now,
  };
}

/** Stored states may predate the current schema: upgrade them when read. */
function migrating(repo: GameRepository): GameRepository {
  return {
    ...repo,
    async findGame(userId, universeId) {
      const game = await repo.findGame(userId, universeId);
      if (!game) return null;
      const migrated = migrateState(game.state);
      if (!migrated.ok)
        throw new Error(`Stored game ${game.id} is unreadable (${migrated.reason})`);
      return { ...game, state: migrated.state };
    },
  };
}

/** In-memory repository (tests, local tooling). */
export function createMemoryRepository(): GameRepository & {
  games: Map<string, StoredGame>;
  log: unknown[];
} {
  const games = new Map<string, StoredGame>();
  const universes = new Map<string, UniverseRow>();
  const members = new Map<string, UniverseMember[]>();
  const log: { userId: string; at: number }[] = [];
  let next = 1;
  const clone = <T>(g: T): T => JSON.parse(JSON.stringify(g)) as T;
  return {
    games,
    log,
    async findGame(userId, universeId) {
      for (const g of games.values())
        if (g.userId === userId && g.universeId === universeId) return clone(g);
      return null;
    },
    async create(userId, universeId, state) {
      const g: StoredGame = { id: `g${next++}`, userId, universeId, state, version: 1 };
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
    async createUniverse(row) {
      const u: UniverseRow = {
        id: `u${next++}`,
        name: row.name,
        code: row.code,
        seed: row.seed,
        maxPlayers: row.maxPlayers,
        createdAt: row.createdAt,
      };
      universes.set(u.id, u);
      members.set(u.id, []);
      return clone(u);
    },
    async getUniverse(id) {
      const u = universes.get(id);
      return u ? clone(u) : null;
    },
    async findUniverseByCode(code) {
      for (const u of universes.values()) if (u.code === code) return clone(u);
      return null;
    },
    async listMembers(universeId) {
      return clone(members.get(universeId) ?? []);
    },
    async addMember(universeId, member) {
      const list = members.get(universeId) ?? [];
      if (
        list.some(
          (m) =>
            m.userId === member.userId ||
            (m.kiwiIndex === member.kiwiIndex && m.face === member.face),
        )
      ) {
        return false;
      }
      list.push(clone(member));
      members.set(universeId, list);
      return true;
    },
    async moveMember(universeId, userId, face) {
      const list = members.get(universeId) ?? [];
      const me = list.find((m) => m.userId === userId);
      if (!me || list.some((m) => m.kiwiIndex === me.kiwiIndex && m.face === face)) return false;
      me.face = face;
      return true;
    },
    async listUserUniverses(userId) {
      return [...universes.values()]
        .filter((u) => (members.get(u.id) ?? []).some((m) => m.userId === userId))
        .map(clone);
    },
  };
}
