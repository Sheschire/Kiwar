// Postgres implementation of the shared GameRepository port.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

interface GameRow {
  id: string;
  user_id: string;
  universe_id: string;
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

const GAME_COLUMNS = 'id, user_id, universe_id, state, version';
const LEGACY_UNIVERSE_COLUMNS = 'id, name, code, seed, max_players, created_at';
const LEGACY_MEMBER_COLUMNS = 'user_id, display_name, kiwi_index, face, planet_seed';

// deno-lint-ignore no-explicit-any
type Query = PromiseLike<{ data: any; error: any; count?: number | null }>;

/** Unknown column: the chantier 14 migration has not been run yet. */
const isMissingColumn = (error: { code?: string } | null) =>
  error?.code === '42703' || error?.code === 'PGRST204';

export function createSupabaseRepository(db: SupabaseClient) {
  // Until the owner runs `20261026000000_universe_imports.sql`, fall back to the older columns
  // (imports stay allowed, nobody is flagged as imported).
  let legacy = false;
  const universeColumns = () =>
    legacy ? LEGACY_UNIVERSE_COLUMNS : `${LEGACY_UNIVERSE_COLUMNS}, created_by, allow_imports`;
  const memberColumns = () =>
    legacy ? LEGACY_MEMBER_COLUMNS : `${LEGACY_MEMBER_COLUMNS}, imported_at`;
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
    async findGame(userId: string, universeId: string) {
      const { data, error } = await db
        .from('games')
        .select(GAME_COLUMNS)
        .eq('user_id', userId)
        .eq('universe_id', universeId)
        .maybeSingle();
      if (error) fail('findGame', error);
      return data ? toGame(data as GameRow) : null;
    },
    async create(userId: string, universeId: string, state: State) {
      const { data, error } = await db
        .from('games')
        .insert({ user_id: userId, universe_id: universeId, face: state.face, state })
        .select(GAME_COLUMNS)
        .single();
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
        .select(GAME_COLUMNS)
        .maybeSingle();
      if (error) fail('update', error);
      return data ? toGame(data as GameRow) : null;
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
