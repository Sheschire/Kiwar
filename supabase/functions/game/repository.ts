// Postgres implementation of the shared GameRepository port.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

interface GameRow {
  id: string;
  user_id: string;
  universe_id: string;
  colony?: number;
  state: unknown;
  version: number;
}

interface UniverseRowDb {
  id: string;
  name: string;
  code: string;
  seed: string;
  max_players: number;
  created_at: string;
  created_by?: string | null;
  allow_imports?: boolean;
  pvp?: boolean;
}

interface MemberRowDb {
  user_id: string;
  display_name: string;
  kiwi_index: number;
  face: 'kiwisu' | 'kiwino';
  planet_seed: string | null;
  imported_at?: string | null;
}

// deno-lint-ignore no-explicit-any
type State = any;

const LEGACY_GAME_COLUMNS = 'id, user_id, universe_id, state, version';
// `pvp` exists since the first universes migration (chantier 57 reads it).
const LEGACY_UNIVERSE_COLUMNS = 'id, name, code, seed, max_players, created_at, pvp';
const LEGACY_MEMBER_COLUMNS = 'user_id, display_name, kiwi_index, face, planet_seed';

// deno-lint-ignore no-explicit-any
type Query = PromiseLike<{ data: any; error: any; count?: number | null }>;

/** Unknown column: the chantier 14 migration has not been run yet. */
const isMissingColumn = (error: { code?: string } | null) =>
  error?.code === '42703' || error?.code === 'PGRST204';
/** Unknown table: the `universe_bans` migration has not been run yet. */
const isMissingTable = (error: { code?: string } | null) =>
  error?.code === '42P01' || error?.code === 'PGRST205';

interface BanRowDb {
  user_id: string;
  display_name: string;
  banned_at: string;
}

type Cosmetic = 'banner' | 'capes' | 'pennants' | 'crown';

interface SeasonRowDb {
  n: number;
  starts_at: string;
  ends_at: string;
  closed_at: string | null;
}

interface FeatRowDb {
  user_id: string;
  colony: number;
  feat: string;
  season: number;
  points: number;
  at: string;
}

interface PlayerRowDb {
  user_id: string;
  opened_at: string;
  worn: string[] | null;
}

interface TitleRowDb {
  season: number;
  user_id: string;
  rank: number;
  points: number;
  display_name: string;
  cosmetic: Cosmetic | null;
  awarded_at: string;
}

interface TitleIn {
  season: number;
  userId: string;
  rank: number;
  points: number;
  displayName: string;
  awardedAt: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createSupabaseRepository(db: SupabaseClient) {
  // Until the owner runs `20261026000000_universe_imports.sql`, fall back to the older columns
  // (imports stay allowed, nobody is flagged as imported).
  let legacy = false;
  const universeColumns = () =>
    legacy ? LEGACY_UNIVERSE_COLUMNS : `${LEGACY_UNIVERSE_COLUMNS}, created_by, allow_imports`;
  const memberColumns = () =>
    legacy ? LEGACY_MEMBER_COLUMNS : `${LEGACY_MEMBER_COLUMNS}, imported_at`;
  // Until the owner runs `20261027000000_linked_colonies.sql`, games have no `colony` column:
  // only home colonies exist (a founding waits in the home colony until then).
  let legacyGames = false;
  const gameColumns = () => (legacyGames ? LEGACY_GAME_COLUMNS : `${LEGACY_GAME_COLUMNS}, colony`);
  const tolerantGames = async (run: () => Query) => {
    const res = await run();
    if (legacyGames || !isMissingColumn(res.error)) return res;
    legacyGames = true;
    return await run();
  };
  const tolerant = async (run: () => Query) => {
    const res = await run();
    if (legacy || !isMissingColumn(res.error)) return res;
    legacy = true;
    return await run();
  };
  const toGame = (r: GameRow) => ({
    id: r.id,
    userId: r.user_id,
    universeId: r.universe_id,
    ...(r.colony === 1 ? { colony: 1 as const } : {}),
    state: r.state as State,
    version: r.version,
  });
  const toUniverse = (r: UniverseRowDb) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    seed: r.seed,
    maxPlayers: r.max_players,
    createdAt: Date.parse(r.created_at),
    ...(r.created_by ? { createdBy: r.created_by } : {}),
    ...(r.allow_imports === false ? { allowImports: false } : {}),
    ...(r.pvp ? { pvp: true } : {}),
  });
  const toMember = (r: MemberRowDb) => ({
    userId: r.user_id,
    displayName: r.display_name,
    kiwiIndex: r.kiwi_index,
    face: r.face,
    ...(r.planet_seed ? { planetSeed: r.planet_seed } : {}),
    ...(r.imported_at ? { imported: true } : {}),
  });
  const fail = (what: string, error: unknown): never => {
    throw new Error(`${what}: ${JSON.stringify(error)}`);
  };

  return {
    async findGame(userId: string, universeId: string, colony: 0 | 1 = 0) {
      const { data, error } = await tolerantGames(() => {
        const q = db
          .from('games')
          .select(gameColumns())
          .eq('user_id', userId)
          .eq('universe_id', universeId);
        return (legacyGames ? q : q.eq('colony', colony)).maybeSingle();
      });
      if (error) fail('findGame', error);
      if (legacyGames && colony === 1) return null;
      return data ? toGame(data as GameRow) : null;
    },
    async findGames(universeId: string, userIds: string[]) {
      const { data, error } = await tolerantGames(() => {
        const q = db
          .from('games')
          .select(gameColumns())
          .eq('universe_id', universeId)
          .in('user_id', userIds);
        return legacyGames ? q : q.eq('colony', 0);
      });
      if (error) fail('findGames', error);
      return ((data ?? []) as GameRow[]).map(toGame);
    },
    async create(userId: string, universeId: string, state: State, colony: 0 | 1 = 0) {
      const insert = () =>
        db
          .from('games')
          .insert({
            user_id: userId,
            universe_id: universeId,
            face: state.face,
            state,
            ...(legacyGames ? {} : { colony }),
          })
          .select(gameColumns())
          .single();
      // A sister colony needs the column: never retry it as a home colony.
      if (colony === 1 && legacyGames) fail('create', 'the colony column is missing (migration)');
      const { data, error } = colony === 1 ? await insert() : await tolerantGames(insert);
      if (colony === 1 && isMissingColumn(error)) legacyGames = true;
      if (error) fail('create', error);
      return toGame(data as GameRow);
    },
    async update(gameId: string, state: State, expectedVersion: number) {
      const { data, error } = await db
        .from('games')
        .update({
          state,
          face: state.face,
          version: expectedVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
        .eq('version', expectedVersion)
        // Egress: the state is already in memory, never read it back (it weighs up to 160 kB).
        .select(gameColumns().replace('state, ', ''))
        .maybeSingle();
      if (error) fail('update', error);
      return data ? toGame({ ...(data as Omit<GameRow, 'state'>), state }) : null;
    },
    async countRecentCommands(uid: string, sinceMs: number) {
      const { count, error } = await db
        .from('command_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gte('created_at', new Date(sinceMs).toISOString());
      if (error) fail('countRecentCommands', error);
      return count ?? 0;
    },
    async logCommand(entry: {
      userId: string;
      gameId: string;
      command: unknown;
      ok: boolean;
      error?: string;
    }) {
      const { error } = await db.from('command_log').insert({
        user_id: entry.userId,
        game_id: entry.gameId,
        command: entry.command,
        ok: entry.ok,
        error: entry.error ?? null,
      });
      if (error) console.warn('logCommand failed', error);
    },
    async createUniverse(row: {
      name: string;
      code: string;
      seed: string;
      maxPlayers: number;
      createdAt?: number;
      createdBy: string;
      pvp?: boolean;
    }) {
      const { data, error } = await tolerant(() =>
        db
          .from('universes')
          .insert({
            name: row.name,
            code: row.code,
            seed: row.seed,
            max_players: row.maxPlayers,
            created_by: row.createdBy,
            pvp: !!row.pvp,
            ...(row.createdAt ? { created_at: new Date(row.createdAt).toISOString() } : {}),
          })
          .select(universeColumns())
          .single(),
      );
      if (error) fail('createUniverse', error);
      return toUniverse(data as UniverseRowDb);
    },
    async getUniverse(id: string) {
      // Universe ids are uuids; anything else (e.g. 'solo') simply does not exist.
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await tolerant(() =>
        db.from('universes').select(universeColumns()).eq('id', id).maybeSingle(),
      );
      if (error) fail('getUniverse', error);
      return data ? toUniverse(data as UniverseRowDb) : null;
    },
    async findUniverseByCode(code: string) {
      const { data, error } = await tolerant(() =>
        db.from('universes').select(universeColumns()).eq('code', code).maybeSingle(),
      );
      if (error) fail('findUniverseByCode', error);
      return data ? toUniverse(data as UniverseRowDb) : null;
    },
    async listMembers(universeId: string) {
      const { data, error } = await tolerant(() =>
        db
          .from('universe_members')
          .select(memberColumns())
          .eq('universe_id', universeId)
          .order('joined_at'),
      );
      if (error) fail('listMembers', error);
      return ((data ?? []) as MemberRowDb[]).map(toMember);
    },
    async addMember(
      universeId: string,
      m: {
        userId: string;
        displayName: string;
        kiwiIndex: number;
        face: string;
        planetSeed?: string;
        imported?: boolean;
      },
    ) {
      const { error } = await tolerant(() =>
        db.from('universe_members').insert({
          universe_id: universeId,
          user_id: m.userId,
          display_name: m.displayName,
          kiwi_index: m.kiwiIndex,
          face: m.face,
          planet_seed: m.planetSeed ?? null,
          ...(m.imported && !legacy ? { imported_at: new Date().toISOString() } : {}),
        }),
      );
      if (error?.code === '23505') return false; // unique violation: face taken meanwhile
      if (error) fail('addMember', error);
      return true;
    },
    async moveMember(universeId: string, userId: string, face: string) {
      const { error } = await db
        .from('universe_members')
        .update({ face })
        .eq('universe_id', universeId)
        .eq('user_id', userId);
      if (error?.code === '23505') return false; // unique violation: face taken meanwhile
      if (error) fail('moveMember', error);
      return true;
    },
    async setAllowImports(universeId: string, allow: boolean) {
      const { error } = await db
        .from('universes')
        .update({ allow_imports: allow })
        .eq('id', universeId);
      if (isMissingColumn(error)) return false;
      if (error) fail('setAllowImports', error);
      return true;
    },
    async kickMember(
      universeId: string,
      member: { userId: string; displayName: string },
      at: number,
    ) {
      // Banned first: they cannot slip back in between the two deletions.
      const ban = await db.from('universe_bans').upsert({
        universe_id: universeId,
        user_id: member.userId,
        display_name: member.displayName,
        banned_at: new Date(at).toISOString(),
      });
      if (ban.error && !isMissingTable(ban.error)) fail('kickMember (ban)', ban.error);
      const left = await db
        .from('universe_members')
        .delete()
        .eq('universe_id', universeId)
        .eq('user_id', member.userId);
      if (left.error) fail('kickMember (member)', left.error);
      // Their colonies there (home and sister); their command log goes with them (cascade).
      const games = await db
        .from('games')
        .delete()
        .eq('universe_id', universeId)
        .eq('user_id', member.userId);
      if (games.error) fail('kickMember (games)', games.error);
    },
    async isBanned(universeId: string, userId: string) {
      const { data, error } = await db
        .from('universe_bans')
        .select('user_id')
        .eq('universe_id', universeId)
        .eq('user_id', userId)
        .maybeSingle();
      if (isMissingTable(error)) return false;
      if (error) fail('isBanned', error);
      return !!data;
    },
    async listBans(universeId: string) {
      const { data, error } = await db
        .from('universe_bans')
        .select('user_id, display_name, banned_at')
        .eq('universe_id', universeId)
        .order('banned_at');
      if (isMissingTable(error)) return [];
      if (error) fail('listBans', error);
      return ((data ?? []) as BanRowDb[]).map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        at: Date.parse(r.banned_at),
      }));
    },
    async unban(universeId: string, userId: string) {
      const { error } = await db
        .from('universe_bans')
        .delete()
        .eq('universe_id', universeId)
        .eq('user_id', userId);
      if (error && !isMissingTable(error)) fail('unban', error);
    },
    // Chantier 54: the hidden seed of the universe's orchard (`universe_secrets`, read by the
    // function only). Until the owner runs `20261107000000_orchard.sql`: null (each colony then
    // keeps a seed of its own).
    async orchardSeedOf(universeId: string, fresh: string) {
      const read = await db
        .from('universe_secrets')
        .select('orchard_seed')
        .eq('universe_id', universeId)
        .maybeSingle();
      if (isMissingTable(read.error)) return null;
      if (read.error) fail('orchardSeedOf', read.error);
      if (read.data) return (read.data as { orchard_seed: string }).orchard_seed;
      const put = await db
        .from('universe_secrets')
        .upsert(
          { universe_id: universeId, orchard_seed: fresh },
          { onConflict: 'universe_id', ignoreDuplicates: true },
        );
      if (put.error) fail('orchardSeedOf (insert)', put.error);
      // Two members at once: the first one stored wins.
      const again = await db
        .from('universe_secrets')
        .select('orchard_seed')
        .eq('universe_id', universeId)
        .single();
      if (again.error) fail('orchardSeedOf (read)', again.error);
      return (again.data as { orchard_seed: string }).orchard_seed;
    },
    // Chantier 56: the leagues. Until the owner runs `20261105000000_leagues.sql`, a missing
    // table reads as empty and writes are skipped (the game never waits on the leagues).
    async leagueSeasons(universeId: string) {
      const { data, error } = await db
        .from('league_seasons')
        .select('n, starts_at, ends_at, closed_at')
        .eq('universe_id', universeId)
        .order('n');
      if (isMissingTable(error)) return [];
      if (error) fail('leagueSeasons', error);
      return ((data ?? []) as SeasonRowDb[]).map((r) => ({
        n: r.n,
        startsAt: Date.parse(r.starts_at),
        endsAt: Date.parse(r.ends_at),
        closedAt: r.closed_at ? Date.parse(r.closed_at) : null,
      }));
    },
    async addSeasons(
      universeId: string,
      seasons: { n: number; startsAt: number; endsAt: number }[],
    ) {
      const { error } = await db.from('league_seasons').upsert(
        seasons.map((s) => ({
          universe_id: universeId,
          n: s.n,
          starts_at: iso(s.startsAt),
          ends_at: iso(s.endsAt),
        })),
        { onConflict: 'universe_id,n', ignoreDuplicates: true },
      );
      if (error && !isMissingTable(error)) fail('addSeasons', error);
    },
    async closeSeason(universeId: string, n: number, at: number, titles: TitleIn[]) {
      if (titles.length > 0) {
        const { error } = await db.from('league_titles').upsert(
          titles.map((t) => ({
            universe_id: universeId,
            season: t.season,
            user_id: t.userId,
            rank: t.rank,
            points: t.points,
            display_name: t.displayName,
            awarded_at: iso(t.awardedAt),
          })),
          { onConflict: 'universe_id,season,user_id', ignoreDuplicates: true },
        );
        // A unique rank already taken (two requests at once): the first podium stands.
        if (error && !isMissingTable(error) && error.code !== '23505') fail('closeSeason', error);
      }
      const { error } = await db
        .from('league_seasons')
        .update({ closed_at: iso(at) })
        .eq('universe_id', universeId)
        .eq('n', n)
        .is('closed_at', null);
      if (error && !isMissingTable(error)) fail('closeSeason', error);
    },
    async leagueFeats(universeId: string) {
      const { data, error } = await db
        .from('league_feats')
        .select('user_id, colony, feat, season, points, at')
        .eq('universe_id', universeId)
        .order('at');
      if (isMissingTable(error)) return [];
      if (error) fail('leagueFeats', error);
      return ((data ?? []) as FeatRowDb[]).map((r) => ({
        userId: r.user_id,
        colony: (r.colony === 1 ? 1 : 0) as 0 | 1,
        feat: r.feat,
        season: r.season,
        points: r.points,
        at: Date.parse(r.at),
      }));
    },
    async recordFeats(
      universeId: string,
      feats: {
        userId: string;
        colony: 0 | 1;
        feat: string;
        season: number;
        points: number;
        at: number;
      }[],
    ) {
      if (feats.length === 0) return;
      const { error } = await db.from('league_feats').upsert(
        feats.map((f) => ({
          universe_id: universeId,
          user_id: f.userId,
          colony: f.colony,
          feat: f.feat,
          season: f.season,
          points: f.points,
          at: iso(f.at),
        })),
        { onConflict: 'universe_id,user_id,feat', ignoreDuplicates: true },
      );
      if (error && !isMissingTable(error)) fail('recordFeats', error);
    },
    // Chantier 57: a battle between players, for the chat. Until the owner runs
    // `20261110000000_pvp.sql`, the line is skipped (the game never waits on it).
    async recordPvpBattle(row: {
      id: string;
      universeId: string;
      attackerId: string;
      attackerName: string;
      defenderId: string;
      defenderName: string;
      outcome: 'held' | 'looted' | 'turnedBack';
      loot: number;
      at: number;
    }) {
      const { error } = await db.from('pvp_battles').upsert(
        {
          id: row.id,
          universe_id: row.universeId,
          attacker_id: row.attackerId,
          attacker_name: row.attackerName,
          defender_id: row.defenderId,
          defender_name: row.defenderName,
          outcome: row.outcome,
          loot: row.loot,
          at: iso(row.at),
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error && !isMissingTable(error)) fail('recordPvpBattle', error);
    },
    async leaguePlayers(universeId: string) {
      const { data, error } = await db
        .from('league_players')
        .select('user_id, opened_at, worn')
        .eq('universe_id', universeId);
      if (isMissingTable(error)) return [];
      if (error) fail('leaguePlayers', error);
      return ((data ?? []) as PlayerRowDb[]).map((r) => ({
        userId: r.user_id,
        openedAt: Date.parse(r.opened_at),
        worn: (r.worn ?? []) as Cosmetic[],
      }));
    },
    async openLeaguePlayer(universeId: string, userId: string, at: number) {
      const { data, error } = await db
        .from('league_players')
        .upsert(
          { universe_id: universeId, user_id: userId, opened_at: iso(at) },
          { onConflict: 'universe_id,user_id', ignoreDuplicates: true },
        )
        .select('user_id');
      // Without the table nobody enters: feats are not written either.
      if (isMissingTable(error)) return false;
      if (error) fail('openLeaguePlayer', error);
      return ((data ?? []) as unknown[]).length > 0;
    },
    async leagueTitles(universeId: string) {
      const { data, error } = await db
        .from('league_titles')
        .select('season, user_id, rank, points, display_name, cosmetic, awarded_at')
        .eq('universe_id', universeId)
        .order('season');
      if (isMissingTable(error)) return [];
      if (error) fail('leagueTitles', error);
      return ((data ?? []) as TitleRowDb[]).map((r) => ({
        season: r.season,
        userId: r.user_id,
        rank: r.rank,
        points: r.points,
        displayName: r.display_name,
        cosmetic: r.cosmetic,
        awardedAt: Date.parse(r.awarded_at),
      }));
    },
    async setTitleCosmetic(universeId: string, season: number, userId: string, cosmetic: Cosmetic) {
      const { error } = await db
        .from('league_titles')
        .update({ cosmetic })
        .eq('universe_id', universeId)
        .eq('season', season)
        .eq('user_id', userId)
        .is('cosmetic', null);
      if (error) fail('setTitleCosmetic', error);
    },
    async setWorn(universeId: string, userId: string, worn: Cosmetic[]) {
      const { error } = await db
        .from('league_players')
        .update({ worn })
        .eq('universe_id', universeId)
        .eq('user_id', userId);
      if (error) fail('setWorn', error);
    },
    async listUserUniverses(userId: string) {
      const { data, error } = await tolerant(() =>
        db
          .from('universe_members')
          .select(`universes (${universeColumns()})`)
          .eq('user_id', userId)
          .order('joined_at'),
      );
      if (error) fail('listUserUniverses', error);
      return ((data ?? []) as unknown as { universes: UniverseRowDb }[]).map((r) =>
        toUniverse(r.universes),
      );
    },
  };
}
