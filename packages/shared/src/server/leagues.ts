/**
 * Chantier 56: the leagues of a shared universe, server side. Feats are read from the state the
 * server holds (`featsOf`) and written only here; seasons open and close lazily, on the
 * requests the universe receives. Nothing here ever touches a game: a season's end only resets
 * the ranking, and rewards are cosmetic.
 */
import { featPoints, isFeatKey, type FeatKey } from '../data/feats';
import { featsOf, newFeats } from '../league/feats';
import {
  LEAGUE_COSMETICS,
  podiumOf,
  rankSeason,
  seasonsToOpen,
  type LeagueCosmetic,
  type LeagueSeason,
} from '../league/seasons';
import type { GameState } from '../sim/state';
import type { UniverseMember } from './universes';

/** A feat as stored (season 0: passed before the colony entered the leagues, no point). */
export interface LeagueFeat {
  userId: string;
  colony: 0 | 1;
  feat: FeatKey;
  season: number;
  points: number;
  at: number;
}

/** A place on the podium of a closed season. */
export interface LeagueTitle {
  season: number;
  userId: string;
  rank: number;
  points: number;
  displayName: string;
  /** Picked by the player (null until then). */
  cosmetic: LeagueCosmetic | null;
  awardedAt: number;
}

export interface LeaguePlayer {
  userId: string;
  openedAt: number;
  /** Cosmetics the player shows (among the ones they picked). */
  worn: LeagueCosmetic[];
}

/** What a colony wears, as drawn by everyone: each cosmetic with its best rank and season. */
export type LeagueLook = Partial<Record<LeagueCosmetic, { rank: number; season: number }>>;

/** The `league` response: everything the League screen shows. */
export interface LeagueView {
  season: LeagueSeason;
  feats: LeagueFeat[];
  titles: LeagueTitle[];
  players: LeaguePlayer[];
}

/** Persistence of the leagues (Postgres in the edge function, memory in tests and the mock). */
export interface LeagueRepository {
  leagueSeasons(universeId: string): Promise<LeagueSeason[]>;
  /** Adds seasons (already present ones are left as they are). */
  addSeasons(universeId: string, seasons: LeagueSeason[]): Promise<void>;
  /** Writes the podium of a season (ignoring places already written) and marks it closed. */
  closeSeason(universeId: string, n: number, at: number, titles: LeagueTitle[]): Promise<void>;
  leagueFeats(universeId: string): Promise<LeagueFeat[]>;
  /** Adds feats (a feat a player already has is left as it is). */
  recordFeats(universeId: string, feats: LeagueFeat[]): Promise<void>;
  leaguePlayers(universeId: string): Promise<LeaguePlayer[]>;
  /** Enters a player in the league; false if they already were. */
  openLeaguePlayer(universeId: string, userId: string, at: number): Promise<boolean>;
  leagueTitles(universeId: string): Promise<LeagueTitle[]>;
  setTitleCosmetic(
    universeId: string,
    season: number,
    userId: string,
    cosmetic: LeagueCosmetic,
  ): Promise<void>;
  setWorn(universeId: string, userId: string, worn: LeagueCosmetic[]): Promise<void>;
}

/**
 * Opens the seasons due and closes the ones that ended (podium written once). Returns the
 * season running now.
 */
export async function ensureSeasons(
  repo: LeagueRepository,
  universeId: string,
  members: readonly UniverseMember[],
  now: number,
): Promise<LeagueSeason> {
  let seasons = await repo.leagueSeasons(universeId);
  const last = seasons.reduce<LeagueSeason | null>((a, s) => (!a || s.n > a.n ? s : a), null);
  const added = seasonsToOpen(last, now);
  if (added.length > 0) {
    await repo.addSeasons(universeId, added);
    seasons = [...seasons, ...added];
  }
  const ended = seasons.filter((s) => s.endsAt <= now && s.closedAt === null);
  if (ended.length > 0) {
    const feats = await repo.leagueFeats(universeId);
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    for (const s of ended.sort((a, b) => a.n - b.n)) {
      const podium = podiumOf(rankSeason(feats.filter((f) => f.season === s.n)));
      const titles = podium.map((p, i): LeagueTitle => ({
        season: s.n,
        userId: p.userId,
        rank: i + 1,
        points: p.points,
        displayName: names.get(p.userId) ?? '',
        cosmetic: null,
        awardedAt: s.endsAt,
      }));
      await repo.closeSeason(universeId, s.n, now, titles);
      s.closedAt = now;
    }
  }
  // Without the tables (migration not run), the season computed here stands in.
  return (
    seasons.find((s) => s.startsAt <= now && now < s.endsAt) ??
    seasons[seasons.length - 1] ??
    seasonsToOpen(null, now)[0]!
  );
}

/**
 * Writes the feats a colony passed between two of its states (a command). On a load
 * (`enter`), the colony's feats not recorded yet are written too, so a feat missed by a failed
 * write is caught up. The first time a player is seen in the league of a universe, what their
 * colony had already passed goes to the record only (season 0, no point): a colony brought
 * along or played before the leagues does not win a season with its past.
 */
export async function recordLeague(
  repo: LeagueRepository,
  universeId: string,
  members: readonly UniverseMember[],
  userId: string,
  colony: 0 | 1,
  before: GameState | null,
  after: GameState,
  now: number,
  enter = false,
): Promise<LeagueFeat[]> {
  const had = before ? featsOf(before) : [];
  const reached = featsOf(after);
  let fresh = newFeats(had, reached);
  if (fresh.length === 0 && !enter) return [];
  const opened = await repo.openLeaguePlayer(universeId, userId, now);
  let pastKeys: FeatKey[] = [];
  if (opened) {
    pastKeys = enter ? reached : had;
    if (enter) fresh = [];
  } else if (enter) {
    const known = new Set(
      (await repo.leagueFeats(universeId)).filter((f) => f.userId === userId).map((f) => f.feat),
    );
    fresh = reached.filter((k) => !known.has(k));
  }
  if (fresh.length === 0 && pastKeys.length === 0) return [];
  const past = pastKeys.map((feat): LeagueFeat => ({
    userId,
    colony,
    feat,
    season: 0,
    points: 0,
    at: now,
  }));
  const season = fresh.length > 0 ? await ensureSeasons(repo, universeId, members, now) : null;
  const scored = fresh.map((feat): LeagueFeat => ({
    userId,
    colony,
    feat,
    season: season?.n ?? 0,
    points: featPoints(feat),
    at: now,
  }));
  await repo.recordFeats(universeId, [...past, ...scored]);
  return scored;
}

/** What each player of a universe wears (cosmetics picked and shown, best rank first). */
export function looksOf(
  titles: readonly LeagueTitle[],
  players: readonly LeaguePlayer[],
): Map<string, LeagueLook> {
  const out = new Map<string, LeagueLook>();
  const worn = new Map(players.map((p) => [p.userId, new Set(p.worn)]));
  for (const t of titles) {
    if (!t.cosmetic || !worn.get(t.userId)?.has(t.cosmetic)) continue;
    const look = out.get(t.userId) ?? {};
    const prev = look[t.cosmetic];
    if (!prev || t.rank < prev.rank || (t.rank === prev.rank && t.season > prev.season)) {
      look[t.cosmetic] = { rank: t.rank, season: t.season };
    }
    out.set(t.userId, look);
  }
  return out;
}

/** The League screen of a universe (feats of the members only). */
export async function leagueView(
  repo: LeagueRepository,
  universeId: string,
  members: readonly UniverseMember[],
  now: number,
): Promise<LeagueView> {
  const season = await ensureSeasons(repo, universeId, members, now);
  const ids = new Set(members.map((m) => m.userId));
  const [feats, titles, players] = await Promise.all([
    repo.leagueFeats(universeId),
    repo.leagueTitles(universeId),
    repo.leaguePlayers(universeId),
  ]);
  return {
    season,
    feats: feats.filter((f) => ids.has(f.userId) && isFeatKey(f.feat)),
    titles,
    players: players.filter((p) => ids.has(p.userId)),
  };
}

export function isCosmetic(x: string): x is LeagueCosmetic {
  return (LEAGUE_COSMETICS as readonly string[]).includes(x);
}

/** Never throws: the leagues must never block a game request. */
export async function quietly<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

/** In-memory league store (tests and the mock server). */
export function createMemoryLeagues(): LeagueRepository {
  const seasons = new Map<string, LeagueSeason[]>();
  const feats = new Map<string, LeagueFeat[]>();
  const players = new Map<string, LeaguePlayer[]>();
  const titles = new Map<string, LeagueTitle[]>();
  const list = <T>(m: Map<string, T[]>, k: string): T[] => {
    let v = m.get(k);
    if (!v) m.set(k, (v = []));
    return v;
  };
  return {
    async leagueSeasons(u) {
      return list(seasons, u).map((s) => ({ ...s }));
    },
    async addSeasons(u, add) {
      const all = list(seasons, u);
      for (const s of add) if (!all.some((x) => x.n === s.n)) all.push({ ...s });
    },
    async closeSeason(u, n, at, podium) {
      const all = list(titles, u);
      for (const t of podium) {
        if (!all.some((x) => x.season === t.season && (x.userId === t.userId || x.rank === t.rank)))
          all.push({ ...t });
      }
      const s = list(seasons, u).find((x) => x.n === n);
      if (s && s.closedAt === null) s.closedAt = at;
    },
    async leagueFeats(u) {
      return list(feats, u).map((f) => ({ ...f }));
    },
    async recordFeats(u, add) {
      const all = list(feats, u);
      for (const f of add) {
        if (!all.some((x) => x.userId === f.userId && x.feat === f.feat)) all.push({ ...f });
      }
    },
    async leaguePlayers(u) {
      return list(players, u).map((p) => ({ ...p, worn: [...p.worn] }));
    },
    async openLeaguePlayer(u, userId, at) {
      const all = list(players, u);
      if (all.some((p) => p.userId === userId)) return false;
      all.push({ userId, openedAt: at, worn: [] });
      return true;
    },
    async leagueTitles(u) {
      return list(titles, u).map((t) => ({ ...t }));
    },
    async setTitleCosmetic(u, season, userId, cosmetic) {
      const t = list(titles, u).find((x) => x.season === season && x.userId === userId);
      if (t) t.cosmetic = cosmetic;
    },
    async setWorn(u, userId, worn) {
      const p = list(players, u).find((x) => x.userId === userId);
      if (p) p.worn = [...worn];
    },
  };
}
