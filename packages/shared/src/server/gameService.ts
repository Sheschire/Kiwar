import { MORALE, SPEECH } from '../data/needs';
import { COMETS, STARDUST_SCALE } from '../data/comets';
import { IRON, IRON_SCALE } from '../data/iron';
import { ITEMS, type ItemId } from '../data/gear';
import { forgeQueueSize } from '../sim/forge';
import { ironCap } from '../sim/iron';
import type { HexKey } from '../hex/hex';
import { faceMapOf } from '../sim/territory';
import { TITAN } from '../data/titan';
import { kikiwiwiCap, kikiwiwiCount } from '../sim/kikiwiwi';
import { OBSTACLES, OBSTACLE_RULES } from '../data/obstacles';
import { METEORS, THREATS } from '../data/threats';
import { defenseOf } from '../sim/threats';
import { generateObstacles, obstacleId } from '../sim/obstacles';
import { drawBiomes } from '../data/biomes';
import { CALENDAR, calendarStartFor } from '../data/cycles';
import { BUILDINGS, levelDef, MAX_LEVEL } from '../data/buildings';
import { AGE_OBJECTIVES, OBJECTIVES, type ObjectiveDef } from '../data/objectives';
import { START } from '../data/start';
import { CAMPS } from '../data/territory';
import { RESOURCE_IDS, type Resources } from '../data/resources';
import { KIWI, MASTERY_IDS, STAT_IDS } from '../data/kiwis';
import { CLASSES, SKILLS } from '../data/classes';
import { levelForXp } from '../sim/kiwis';
import { PASSAGE_TECHS, RESEARCH_SCALE, TECHS } from '../data/research';
import { ageOf, libraries, techEffects } from '../sim/research';
import { canalCap } from '../sim/canals';
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
  reserveCapOf,
} from '../sim/selectors';
import {
  cloneAliens,
  cloneState,
  newColonyLink,
  newGame,
  type Friend,
  type GameState,
  type Shipment,
  type Villager,
} from '../sim/state';
import { alienDefOf } from '../data/expeditions';
import {
  colonyNeedsSync,
  deliverToSister,
  hasSister,
  isSister,
  SISTER_FRIEND,
  sisterFriend,
  syncColonies,
  takeFounding,
} from '../sim/colonies';
import { deliveryOf } from '../sim/deliveries';
import { ensureAliens, hiddenDue, publicState } from '../sim/aliens';
import { resetSiege } from '../sim/siege';
import { resetLandings } from '../sim/landing';
import { generateFace, type FaceMap } from '../worldgen/generateFace';
import type { Face, KiwiId, PlayerId, UniverseId } from '../types/ids';
import { requestSchema, type ColonySummary, type GameResponse, type ServerError } from './protocol';
import {
  assignFace,
  inviteCode,
  kiwiCount,
  planetSeedOf,
  MAX_PLAYERS,
  universeFriends,
  universeTargets,
  allyTwinOf,
  colonyOfFriend,
  friendId,
  layoutBuilding,
  layoutSnapshot,
  userOfFriend,
  type UniverseInfo,
  type UniverseMember,
  type AllySnapshot,
  type ColonyPower,
  type SisterSnapshot,
  type TwinSnapshot,
  type UniverseSummary,
} from './universes';
import { footprintTiles } from '../sim/footprint';

export interface StoredGame {
  id: string;
  userId: string;
  universeId: string;
  /** Chantier 19: 0 the home colony, 1 the sister colony on the twin face (absent: 0). */
  colony?: 0 | 1;
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
  /** Chantier 14: newcomers may bring their solo colony (absent: allowed). */
  allowImports?: boolean;
  /** Creator of the universe (the host). */
  createdBy?: string;
}

/** Persistence port, implemented with Postgres in the edge function and in memory in tests. */
export interface GameRepository {
  /** Chantier 19: `colony` 1 is the sister colony (default 0, the home colony). */
  findGame(userId: string, universeId: string, colony?: 0 | 1): Promise<StoredGame | null>;
  create(userId: string, universeId: string, state: GameState, colony?: 0 | 1): Promise<StoredGame>;
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
  /** Chantier 14: the host opens or closes the universe to solo colonies. */
  setAllowImports(universeId: string, allow: boolean): Promise<boolean>;
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
  /**
   * `guestTransfer`: the anonymous (guest) user an access token belongs to, or null when the
   * token is invalid, expired or not a guest's. Absent: transfers are unavailable.
   */
  guestUserOf?: (token: string) => Promise<string | null>;
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

const soloOf = (userId: string) => `solo-${userId}`;
const soloId = (ctx: ServiceContext) => soloOf(ctx.userId);

function freshGame(
  ctx: ServiceContext,
  seed: string,
  face: Face,
  userId: string = ctx.userId,
): GameState {
  return newGame({
    seed,
    face,
    now: ctx.now(),
    playerId: userId,
    universeId: soloOf(userId),
    alienSeed: ctx.randomSeed(),
  });
}

/** A solo colony handed to another user (guest transfer): same game, new owner. */
function soloFor(state: GameState, userId: string): GameState {
  return {
    ...state,
    playerId: userId as PlayerId,
    universeId: soloOf(userId) as UniverseId,
  };
}

function colonySummary(game: StoredGame | null): ColonySummary | null {
  return game ? { ...colonyPower(game.state), playedAt: game.state.now } : null;
}

/**
 * A guest signed in to an existing account (chantier 20 hotfix): the guest's solo colony
 * follows. Without `keep`, previews both; `keep: 'guest'` swaps the two solo colonies, so the
 * account's previous one stays with the guest user (never deleted); `keep: 'account'` changes
 * nothing.
 */
async function guestTransfer(
  ctx: ServiceContext,
  repo: GameRepository,
  guestToken: string,
  keep: 'guest' | 'account' | undefined,
): Promise<GameResponse> {
  const fail = (error: ServerError): GameResponse => ({ ok: false, error, serverTime: ctx.now() });
  const guestId = ctx.guestUserOf ? await ctx.guestUserOf(guestToken) : null;
  if (!guestId || guestId === ctx.userId) return fail('forbidden');
  const guest = await repo.findGame(guestId, soloOf(guestId));
  const mine = await repo.findGame(ctx.userId, soloId(ctx));
  const guestPlayed = !!guest && !isPristine(guest.state);
  if (keep === undefined) {
    return {
      ok: true,
      events: [],
      transfer: {
        guest: guestPlayed ? colonySummary(guest) : null,
        account: colonySummary(mine),
        accountPristine: !mine || isPristine(mine.state),
      },
      serverTime: ctx.now(),
    };
  }
  if (keep === 'account' || !guest || !guestPlayed) {
    return mine ? reply(ctx, mine.state) : fail('invalidRequest');
  }
  const incoming = soloFor(guest.state, ctx.userId);
  const saved = mine
    ? await repo.update(mine.id, incoming, mine.version)
    : await repo.create(ctx.userId, soloId(ctx), incoming);
  if (!saved) return fail('conflict');
  // The account's previous colony goes to the guest user (a fresh world if it had none):
  // the guest's colony never exists twice.
  const left = mine
    ? soloFor(mine.state, guestId)
    : freshGame(ctx, ctx.randomSeed(), 'kiwisu', guestId);
  await repo.update(guest.id, left, guest.version);
  // Chantier 19: the sister colonies follow their home colony.
  const guestSister = await repo.findGame(guestId, soloOf(guestId), 1);
  const mySister = await repo.findGame(ctx.userId, soloId(ctx), 1);
  const put = async (row: StoredGame | null, userId: string, state: GameState) =>
    row ? repo.update(row.id, state, row.version) : repo.create(userId, soloOf(userId), state, 1);
  if (guestSister) await put(mySister, ctx.userId, soloFor(guestSister.state, ctx.userId));
  if (mySister) await put(guestSister, guestId, soloFor(mySister.state, guestId));
  return reply(ctx, saved.state);
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
    allowImports: row.allowImports !== false,
    ...(row.createdBy ? { hostId: row.createdBy } : {}),
  };
}

/** Chantier 14: what the other players see of a colony's strength. */
export function colonyPower(s: GameState): ColonyPower {
  const d = defenseOf(s);
  return {
    age: ageOf(s),
    nest: nest(s).level,
    kiwis: s.villagers.length,
    defense: Math.round(d.ground + d.air),
    shieldUntil: s.threats.shieldUntil,
  };
}

/** Chantier 59: how far the server brings an ally's village forward for a visit. */
export const VILLAGE_ADVANCE_MAX_MS = 12 * 3_600_000;

/**
 * Chantier 59: what a visitor gets of an ally's colony — everything the village shows (kiwis
 * and their jobs, buildings, sites, paths, crops), never their stocks nor what they know of
 * the aliens.
 */
export function villageView(s: GameState): GameState {
  const pub = publicState(s);
  return {
    ...pub,
    resources: zeroResources(),
    intel: {},
    faceViews: {},
  };
}

function zeroResources(): Resources {
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as Resources;
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
  // Chantier 19: our other colony is a delivery target; a sister colony has no alien target.
  if (hasSister(state) || isSister(state)) next.friends = [...next.friends, sisterFriend(state)];
  if (isSister(state)) next.targets = [];
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
      return {
        owner: m.displayName,
        kiwiIndex: m.kiwiIndex,
        friendId: friendId(m.userId),
        // Gifts already on their way take their room too.
        room: roomOf(s),
        seed: s.seed,
        face: s.face,
        params: s.params,
        buildings: s.buildings.map(layoutBuilding),
        paths: s.paths,
        obstacles: s.obstacles.map((o) => ({ kind: o.kind, q: o.q, r: o.r })),
        terraform: s.terraform,
        power: colonyPower(s),
        twin: allyTwinOf(s),
        at: now,
        ...(await allySister(repo, info.id, m, s, now)),
      };
    }),
  );
  const all = snapshots.filter((x): x is AllySnapshot => x !== null);
  const twin = all.find((a) => a.kiwiIndex === me.kiwiIndex && a.face !== me.face) ?? null;
  return { twin, allies: all.filter((a) => a !== twin) };
}

/** Free storage per resource, minus the gifts already on their way. */
function roomOf(s: GameState): Resources {
  const cap = capacity(s);
  return Object.fromEntries(
    RESOURCE_IDS.map((r) => {
      const coming = s.incoming.reduce((sum, d) => sum + d.resources[r], 0);
      return [r, Math.max(0, Math.floor(cap[r] - s.resources[r] - coming))];
    }),
  ) as Resources;
}

/** Chantier 19: an ally's sister colony, once founded (we see it, we may deliver to it). */
async function allySister(
  repo: GameRepository,
  universeId: string,
  m: UniverseMember,
  home: GameState,
  now: number,
): Promise<{ sister?: SisterSnapshot }> {
  if (home.colony.foundedAt <= 0) return {};
  const game = await repo.findGame(m.userId, universeId, 1);
  if (!game || !isSister(game.state)) return {};
  return {
    sister: {
      ...layoutSnapshot(game.state, m.displayName, now),
      friendId: friendId(m.userId, 1),
      room: roomOf(game.state),
    },
  };
}

/** Chantier 19: an ally's sister colony as a delivery target (looked up when we deliver). */
async function allySisterFriend(
  repo: GameRepository,
  scope: Scope,
  id: string,
): Promise<Friend | null> {
  if (!scope.shared || colonyOfFriend(id) !== 1) return null;
  const home = scope.shared.info.members.find((m) => friendId(m.userId) === id.replace(/:1$/, ''));
  if (!home || home.userId === scope.shared.me.userId) return null;
  const game = await repo.findGame(home.userId, scope.universeId, 1);
  if (!game || !isSister(game.state)) return null;
  const distance = Math.abs(home.kiwiIndex - scope.shared.me.kiwiIndex);
  return {
    id,
    owner: home.displayName,
    kiwiIndex: home.kiwiIndex,
    distance,
    travelMs: alienDefOf(distance).travelMs,
  };
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
    const game = await repo.findGame(
      userOfFriend(shipment.friendId),
      universeId,
      colonyOfFriend(shipment.friendId),
    );
    if (!game) return;
    const s = game.state;
    if (s.incoming.some((d) => d.id === delivery.id)) return;
    const next = { ...s, incoming: [...s.incoming, delivery] };
    if (await repo.update(game.id, next, game.version)) return;
  }
}

/** Chantier 19: the player's two colonies on this kiwi (the sister once founded). */
interface ColonyPair {
  home: StoredGame | null;
  sister: StoredGame | null;
}

/**
 * Keeps the two colonies of a player linked (chantier 19): creates the sister colony from a
 * landed founding, hands the ships between the two faces over, sends the sister's research
 * points home and teaches it what home knows. Writes the sister first (its points leave it
 * once), then home. Returns the pair as stored.
 */
async function linkColonies(
  ctx: ServiceContext,
  repo: GameRepository,
  scope: Scope,
): Promise<ColonyPair> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const home = await repo.findGame(ctx.userId, scope.universeId, 0);
    if (!home || !hasSister(home.state)) return { home, sister: null };
    const row = await repo.findGame(ctx.userId, scope.universeId, 1);
    // A row left from an earlier world (new world, colony moved) is not this colony's sister.
    const linked = row && isSister(row.state) && home.state.colony.foundedAt > 0 ? row : null;
    const h = cloneState(home.state);
    let s = linked ? cloneState(linked.state) : null;
    let dirty = false;
    let created = false;
    const f = h.colony.founding;
    if (f && !s) {
      s = takeFounding(h);
      created = dirty = true;
    } else if (f) {
      h.colony = { ...h.colony, founding: null, foundedAt: f.at };
      dirty = true;
    }
    if (!s) return { home, sister: null };
    if (deliverToSister(h, s) > 0) dirty = true;
    if (deliverToSister(s, h) > 0) dirty = true;
    if (colonyNeedsSync(h, s)) {
      syncColonies(h, s);
      dirty = true;
    }
    if (!dirty) return { home, sister: linked };
    const savedSister = created
      ? row
        ? await repo.update(row.id, s, row.version)
        : await repo.create(ctx.userId, scope.universeId, s, 1)
      : await repo.update(linked!.id, s, linked!.version);
    if (!savedSister) continue;
    const savedHome = await repo.update(home.id, h, home.version);
    if (savedHome) return { home: savedHome, sister: savedSister };
  }
  const home = await repo.findGame(ctx.userId, scope.universeId, 0);
  const sister =
    home && hasSister(home.state) ? await repo.findGame(ctx.userId, scope.universeId, 1) : null;
  return { home, sister: sister && isSister(sister.state) ? sister : null };
}

/** The layout of the player's other colony, for the planet at the twin's place. */
function sisterOf(pair: ColonyPair, colony: 0 | 1, now: number): TwinSnapshot | null {
  const other = colony === 0 ? pair.sister : pair.home;
  return other && pair.sister ? layoutSnapshot(other.state, '', now) : null;
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
/** Chantier 13: no more stardust or comets than the time played allows. */
function plausibleStardust(state: GameState): boolean {
  const c = state.comets;
  const played = state.now - state.createdAt;
  const maxPasses =
    played < COMETS.firstMs ? 0 : 1 + Math.floor((played - COMETS.firstMs) / COMETS.intervalMs[0]);
  if (c.passes > maxPasses) return false;
  const richest = Math.max(...COMETS.ageFactor) * COMETS.stock * STARDUST_SCALE;
  if (state.stardust > c.passes * richest) return false;
  if (c.next && c.next.at < state.createdAt + COMETS.firstMs) return false;
  return c.patches.every((p) => p.stock <= p.max && p.max <= richest);
}

/** Chantier 38: meteoric iron within its cap, craters holding no more than they could. */
function plausibleIron(state: GameState): boolean {
  if (state.meteorIron > ironCap(state)) return false;
  const richest = Math.max(...METEORS.ageFactor) * IRON.crater * 1.5 * IRON_SCALE;
  if (state.meteorIron > 0 && state.sky.falls === 0) return false;
  return state.sky.meteors.every((m) => m.iron <= m.ironMax && m.ironMax <= richest);
}

/** Chantier 38: pieces only of researched tiers, an order queue within the Forge's size. */
function plausibleGear(state: GameState): boolean {
  const opened = (id: ItemId) => state.research.done.includes(ITEMS[id].tech);
  if (state.forge.orders.length > forgeQueueSize(state)) return false;
  if (!state.forge.orders.every((o) => opened(o.item))) return false;
  if (!(Object.keys(state.forge.armory) as ItemId[]).every(opened)) return false;
  return state.villagers.every(
    (v) => (!v.gear?.weapon || opened(v.gear.weapon)) && (!v.gear?.armor || opened(v.gear.armor)),
  );
}

export function isPlausible(state: GameState, now: number): boolean {
  if (state.now > now + 60_000 || state.createdAt > state.now) return false;
  // Solo games follow their own calendar (no skipping winter).
  if (state.calendarStart !== calendarStartFor(state.createdAt)) return false;
  // The biome comes from the seed (older worlds keep the classic one): no picking it by hand.
  const biome = state.params.biome;
  if (biome !== 'classic' && biome !== drawBiomes(state.seed)[state.face]) return false;
  const cap = capacity(state);
  // Chantier 31: claimed age objectives exist, once each; gift eggs come from them.
  const claimed = state.objectives.claimed.map((c) => AGE_OBJECTIVES.find((o) => o.id === c));
  if (claimed.some((o) => !o) || new Set(state.objectives.claimed).size !== claimed.length)
    return false;
  if (state.objectives.giftEggs > claimed.filter((o) => o!.egg).length) return false;
  const rewarded = [...OBJECTIVES, ...(claimed as ObjectiveDef[])];
  for (const id of RESOURCE_IDS) {
    // Stock may exceed storage only by what objective rewards can add on top of it.
    const rewards = rewarded.reduce((sum, o) => sum + (o.reward[id] ?? 0), 0);
    const v = state.resources[id];
    if (!Number.isFinite(v) || v < 0 || v > cap[id] + rewards) return false;
  }
  if (!plausibleStardust(state)) return false;
  if (!plausibleIron(state)) return false;
  if (!plausibleGear(state)) return false;
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
    // Chantier 30: a reserve never exceeds what its warehouse holds.
    if (b.reserve) {
      const cap = reserveCapOf(state, b);
      for (const id of RESOURCE_IDS) {
        const v = b.reserve[id];
        if (!Number.isFinite(v) || v < 0 || v > cap + 1e-6) return false;
      }
    }
  }
  const map = mapFor(state);
  // Chantier 35: every covered tile is allowed and covered once.
  const covered = new Set<string>();
  for (const b of state.buildings)
    for (const h of footprintTiles(b)) {
      const key = `${h.q},${h.r}` as const;
      const t = map.tiles[map.index.get(key) ?? -1];
      if (!t || !BUILDINGS[b.type].allowedTiles.includes(t.type) || covered.has(key)) return false;
      covered.add(key);
    }
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
  const shinies = state.villagers.filter((v) => v.shiny && v.shiny !== 'star').length;
  if (shinies > 2 + Math.floor(state.villagers.length / 128)) return false;
  // Golden shinies come from star eggs, which cost stardust (chantier 13).
  const stars = state.villagers.filter((v) => v.shiny === 'star').length;
  if (stars > state.comets.passes) return false;
  const mayors = state.villagers.filter(
    (v) => v.classId === 'mayor' || (v.job.kind === 'train' && v.job.classId === 'mayor'),
  );
  if (mayors.length > 1 || state.speechUntil > state.now + SKILLS.speechMs * 2) return false;
  // Chantier 43: the Speech at the Town Hall.
  if (state.speech.until > state.now + SPEECH.gatherMs) return false;
  if (state.speech.readyAt > state.now + SPEECH.cooldownMs[2].ms) return false;
  if (!plausibleResearch(state) || !plausibleAge(state)) return false;
  if (!plausibleObstacles(state)) return false;
  // Chantier 08: one laboratory (after its technology), Kikiwiwis within the cap of the age.
  const labs = state.buildings.filter((b) => b.type === 'lab').length;
  if (labs > 1 || (labs > 0 && !techEffects(state).laboratory)) return false;
  if (kikiwiwiCount(state) > kikiwiwiCap(state)) return false;
  if (!plausibleTerraform(state)) return false;
  return state.villagers.every((v) => plausibleKiwi(v, state.now));
}

/**
 * Reshaped tiles (chantier 08): within the cap of the age, on tiles of the right kind. Canals
 * (chantier 45) have their own technology and cap, on flesh.
 */
export function plausibleTerraform(state: GameState): boolean {
  const all = Object.entries(state.terraform);
  if (all.length === 0) return true;
  const canals = all.filter(([, kind]) => kind === 'canal');
  const entries = all.filter(([, kind]) => kind !== 'canal');
  if (canals.length > 0 && !techEffects(state).canals) return false;
  if (canals.length > canalCap(state)) return false;
  if (entries.length > 0 && !techEffects(state).terraform) return false;
  if (entries.length > (TITAN.maxTerraform[ageOf(state)] ?? 0)) return false;
  const base = baseMapFor(state);
  for (const [key, kind] of all) {
    const tile = base.tiles[base.index.get(key as HexKey) ?? -1];
    if (!tile) return false;
    const ok =
      kind === 'canal'
        ? tile.type === 'flesh'
        : kind === 'terrace'
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
  // Chantier 37: a Kikiwiwi has no class.
  if (v.kikiwiwi && v.classId) return false;
  // Chantier 43: no memory better or longer than the best its kind can give.
  for (const m of v.memories ?? []) {
    const def = MORALE.memories[m.kind];
    if (m.value > def.best || m.until > now + def.ms) return false;
  }
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
      if (!req.fromSolo) return joinAndPlay(ctx, repo, row, req.displayName);
      // Chantier 14: the solo colony comes along (once: a member already has a colony there).
      if (row.allowImports === false) return fail('importsClosed');
      const members = await repo.listMembers(row.id);
      if (members.some((m) => m.userId === ctx.userId)) return fail('alreadyMember');
      if (members.length >= row.maxPlayers) return fail('universeFull');
      const solo = await repo.findGame(ctx.userId, soloId(ctx));
      if (!solo || isPristine(solo.state)) return fail('invalidRequest');
      // Targets are renamed on the way: no ship may be out meanwhile.
      if (solo.state.expeditions.some((e) => e.status !== 'done') || solo.state.shipments.length)
        return fail('shipAway');
      return moveSoloInto(ctx, repo, row, solo, req.displayName, members);
    }

    case 'universeSettings': {
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope?.shared) return fail('forbidden');
      const { info } = scope.shared;
      if (info.hostId !== ctx.userId) return fail('forbidden');
      if (!(await repo.setAllowImports(info.id, req.allowImports))) return fail('internal');
      return {
        ok: true,
        events: [],
        universe: { ...info, allowImports: req.allowImports },
        serverTime: ctx.now(),
      };
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
      const near = scope.shared
        ? await neighboursOf(repo, scope.shared.info, scope.shared.me, ctx.now())
        : {};
      if (req.colony === 1) {
        // Chantier 19: the sister colony (no hidden garrison there: nothing to resolve).
        const pair = await linkColonies(ctx, repo, scope);
        if (!pair.sister) return fail('invalidRequest');
        return {
          ...reply(ctx, withScopeTargets(ctx, pair.sister.state, scope).state),
          universe: scope.shared?.info,
          ...near,
          sister: sisterOf(pair, 1, ctx.now()),
        };
      }
      const existing = await repo.findGame(ctx.userId, scope.universeId);
      // The stored state is returned as is: the client advances it to the server time,
      // which lets it show the "while you were away" summary.
      if (existing) {
        const scoped = withScopeTargets(ctx, existing.state, scope);
        let state = scoped.state;
        let events: GameEvent[] = [];
        // Ships that landed and alien moves due meanwhile are resolved here: the client
        // cannot (hidden garrison).
        // Chantier 42: one resolved move may make the next one due (an attack announced, then
        // struck), so this runs until nothing hidden is due.
        let resolved = false;
        for (let pass = 0; pass < 16; pass++) {
          const due = hiddenDue(state, ctx.now()).filter((at) => pass === 0 || at > state.now);
          if (due.length === 0) break;
          const result = advance(state, Math.max(state.now, ...due));
          state = result.state;
          events = [...events, ...result.events];
          resolved = true;
        }
        if (scoped.changed || resolved) {
          const saved = await repo.update(existing.id, state, existing.version);
          // Another request wrote in between: it resolved everything as well.
          if (!saved) state = (await repo.findGame(ctx.userId, scope.universeId))?.state ?? state;
        }
        // Chantier 19: a landed founding, ships between the faces, the shared research.
        const pair = hasSister(state) ? await linkColonies(ctx, repo, scope) : null;
        if (pair?.home) state = withScopeTargets(ctx, pair.home.state, scope).state;
        return {
          ...reply(ctx, state, events),
          universe: scope.shared?.info,
          ...near,
          sister: pair ? sisterOf(pair, 0, ctx.now()) : null,
        };
      }
      const state = scope.shared
        ? universeGame(ctx, scope.shared.info, scope.shared.me)
        : freshGame(ctx, req.create?.seed ?? ctx.randomSeed(), req.create?.face ?? 'kiwisu');
      const created = await repo.create(ctx.userId, scope.universeId, state);
      return { ...reply(ctx, created.state), universe: scope.shared?.info, ...near };
    }

    case 'guestTransfer':
      return guestTransfer(ctx, repo, req.guestToken, req.keep);

    case 'allyVillage': {
      const scope = await resolveScope(ctx, repo, req.universe);
      if (!scope?.shared) return fail('forbidden');
      const { info, me } = scope.shared;
      const member = info.members.find(
        (m) => m.kiwiIndex === req.kiwiIndex && m.face === req.face && m.userId !== me.userId,
      );
      const game = member ? await repo.findGame(member.userId, info.id) : null;
      if (!member || !game) return fail('invalidRequest');
      const now = ctx.now();
      const state = withScopeTargets(ctx, game.state, {
        universeId: info.id,
        shared: { info, me: member },
      }).state;
      // Brought up to now in memory only (never saved: it is their colony). An ally away for
      // long is shown as they left it, so a visit never costs a long simulation.
      const lag = now - state.now;
      const lived = lag > 0 && lag <= VILLAGE_ADVANCE_MAX_MS ? advance(state, now).state : state;
      return { ok: true, events: [], serverTime: now, village: villageView(lived) };
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
        // Chantier 19: a local second colony cannot be checked (nor its conquest).
        colony: newColonyLink(),
      };
      // A local save carries its own garrisons: never trust them, draw secret ones.
      delete imported.aliens;
      resetSiege(imported);
      // Chantier 40: beacons and landings in flight cannot be checked either.
      resetLandings(imported);
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
      const colony = req.colony ?? 0;
      // Chantier 19: the shared research is chosen at home, whichever colony asks.
      const target: 0 | 1 = req.command.type === 'setResearch' ? 0 : colony;
      const cmd = req.command;
      const allySister =
        cmd.type === 'sendCargo' ? await allySisterFriend(repo, scope, cmd.friendId) : null;
      // Optimistic concurrency: retry once if another request wrote in between.
      for (let attempt = 0; attempt < 2; attempt++) {
        const game = await repo.findGame(ctx.userId, scope.universeId, target);
        if (!game || (target === 1 && !isSister(game.state))) return fail('invalidRequest');
        const current = withScopeTargets(ctx, game.state, scope).state;
        if (allySister) current.friends = [...current.friends, allySister];
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
            if (sent && sent.friendId !== SISTER_FRIEND)
              await deliver(repo, scope.shared.info.id, scope.shared.me, sent);
          }
          const linked = hasSister(saved.state) || isSister(saved.state);
          const pair = linked ? await linkColonies(ctx, repo, scope) : null;
          const mine =
            (colony === 0 ? pair?.home : pair?.sister) ?? (target === colony ? saved : null);
          const state = mine
            ? withScopeTargets(ctx, mine.state, scope).state
            : (await repo.findGame(ctx.userId, scope.universeId, colony))?.state;
          if (!state) return fail('invalidRequest');
          return {
            ok: true,
            state,
            events: target === colony ? result.events : [],
            serverTime: ctx.now(),
            ...(pair ? { sister: sisterOf(pair, colony, ctx.now()) } : {}),
          };
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
 * The solo colony becomes a kiwi of a universe: the founder's (kiwi 0) or, when joining
 * (chantier 14), the first free kiwi, with an arrival shield. Moved, not copied: the solo slot
 * starts over. Its planet keeps its seed, its alien twin and what we know of it.
 */
async function moveSoloInto(
  ctx: ServiceContext,
  repo: GameRepository,
  row: UniverseRow,
  solo: StoredGame,
  displayName: string,
  members: UniverseMember[] = [],
): Promise<GameResponse> {
  const joining = members.length > 0;
  const me: UniverseMember = {
    userId: ctx.userId,
    displayName: displayName.trim(),
    kiwiIndex: assignFace(members).kiwiIndex,
    face: solo.state.face,
    planetSeed: solo.state.seed,
    ...(joining ? { imported: true } : {}),
  };
  // Another player took that kiwi at the same instant: they may retry.
  if (!(await repo.addMember(row.id, me)))
    return { ok: false, error: 'conflict', serverTime: ctx.now() };
  const info = toInfo(row, [...members, me]);
  const now = ctx.now();
  const moved: GameState = {
    ...rekeyTwin(advance(solo.state, now).state, me.kiwiIndex),
    universeId: row.id as UniverseId,
    kiwiId: `k${me.kiwiIndex}` as KiwiId,
    friends: [],
    shipments: [],
    incoming: [],
  };
  if (joining) shieldArrival(moved, now);
  const scope: Scope = { universeId: row.id, shared: { info, me } };
  const game = await repo.create(ctx.userId, row.id, withScopeTargets(ctx, moved, scope).state);
  // Chantier 19: the sister colony moves along (the solo row left behind is unlinked).
  const sister =
    solo.state.colony.foundedAt > 0 ? await repo.findGame(ctx.userId, solo.universeId, 1) : null;
  if (sister && isSister(sister.state)) {
    const next: GameState = {
      ...advance(sister.state, now).state,
      universeId: row.id as UniverseId,
      kiwiId: `k${me.kiwiIndex}` as KiwiId,
      friends: [],
      shipments: [],
      incoming: [],
    };
    if (joining) shieldArrival(next, now);
    await repo.create(ctx.userId, row.id, withScopeTargets(ctx, next, scope).state, 1);
  }
  // The solo slot starts over (a new world, drawn by the server).
  await repo.update(solo.id, freshGame(ctx, ctx.randomSeed(), 'kiwisu'), solo.version);
  return {
    ok: true,
    state: game.state,
    events: [],
    universe: info,
    ...(await neighboursOf(repo, info, me, now)),
    serverTime: now,
  };
}

/** Solo targets live on kiwi 0: what we know of our twin moves with us to kiwi `k`. */
function rekeyTwin(state: GameState, k: number): GameState {
  if (k === 0) return state;
  const key = (id: string) => id.replace(/^aliens:0:/, `aliens:${k}:`);
  const rekey = <T>(rec: Record<string, T>) =>
    Object.fromEntries(Object.entries(rec).map(([id, v]) => [key(id), v]));
  return {
    ...state,
    victories: rekey(state.victories),
    intel: rekey(state.intel),
    ...(state.aliens ? { aliens: rekey(state.aliens) } : {}),
    expeditions: state.expeditions.map((e) => ({ ...e, targetId: key(e.targetId) })),
  };
}

/** Chantier 14: an arriving colony gets a few quiet days (a wave already planned is dropped). */
export function shieldArrival(state: GameState, now: number): void {
  const t = state.threats;
  t.shieldUntil = Math.max(t.shieldUntil, now + THREATS.importShieldMs);
  if (t.next && t.next.at < t.shieldUntil) t.next = null;
}

/** Stored states may predate the current schema: upgrade them when read. */
function migrating(repo: GameRepository): GameRepository {
  return {
    ...repo,
    async findGame(userId, universeId, colony) {
      const game = await repo.findGame(userId, universeId, colony);
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
    async findGame(userId, universeId, colony = 0) {
      for (const g of games.values())
        if (g.userId === userId && g.universeId === universeId && (g.colony ?? 0) === colony)
          return clone(g);
      return null;
    },
    async create(userId, universeId, state, colony = 0) {
      for (const g of games.values())
        if (g.userId === userId && g.universeId === universeId && (g.colony ?? 0) === colony)
          throw new Error('duplicate game');
      const g: StoredGame = {
        id: `g${next++}`,
        userId,
        universeId,
        ...(colony ? { colony } : {}),
        state,
        version: 1,
      };
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
        allowImports: true,
        createdBy: row.createdBy,
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
    async setAllowImports(universeId, allow) {
      const u = universes.get(universeId);
      if (!u) return false;
      u.allowImports = allow;
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
