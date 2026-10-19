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
}

interface MemberRowDb {
  user_id: string;
  display_name: string;
  kiwi_index: number;
  face: 'kiwisu' | 'kiwino';
}

// deno-lint-ignore no-explicit-any
type State = any;

const GAME_COLUMNS = 'id, user_id, universe_id, state, version';
const UNIVERSE_COLUMNS = 'id, name, code, seed, max_players, created_at';

export function createSupabaseRepository(db: SupabaseClient) {
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
  });
  const toMember = (r: MemberRowDb) => ({
    userId: r.user_id,
    displayName: r.display_name,
    kiwiIndex: r.kiwi_index,
    face: r.face,
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
      createdBy: string;
    }) {
      const { data, error } = await db
        .from('universes')
        .insert({
          name: row.name,
          code: row.code,
          seed: row.seed,
          max_players: row.maxPlayers,
          created_by: row.createdBy,
        })
        .select(UNIVERSE_COLUMNS)
        .single();
      if (error) fail('createUniverse', error);
      return toUniverse(data as UniverseRowDb);
    },
    async getUniverse(id: string) {
      // Universe ids are uuids; anything else (e.g. 'solo') simply does not exist.
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await db
        .from('universes')
        .select(UNIVERSE_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) fail('getUniverse', error);
      return data ? toUniverse(data as UniverseRowDb) : null;
    },
    async findUniverseByCode(code: string) {
      const { data, error } = await db
        .from('universes')
        .select(UNIVERSE_COLUMNS)
        .eq('code', code)
        .maybeSingle();
      if (error) fail('findUniverseByCode', error);
      return data ? toUniverse(data as UniverseRowDb) : null;
    },
    async listMembers(universeId: string) {
      const { data, error } = await db
        .from('universe_members')
        .select('user_id, display_name, kiwi_index, face')
        .eq('universe_id', universeId)
        .order('joined_at');
      if (error) fail('listMembers', error);
      return ((data ?? []) as MemberRowDb[]).map(toMember);
    },
    async addMember(
      universeId: string,
      m: { userId: string; displayName: string; kiwiIndex: number; face: string },
    ) {
      const { error } = await db.from('universe_members').insert({
        universe_id: universeId,
        user_id: m.userId,
        display_name: m.displayName,
        kiwi_index: m.kiwiIndex,
        face: m.face,
      });
      if (error?.code === '23505') return false; // unique violation: face taken meanwhile
      if (error) fail('addMember', error);
      return true;
    },
    async listUserUniverses(userId: string) {
      const { data, error } = await db
        .from('universe_members')
        .select(`universes (${UNIVERSE_COLUMNS})`)
        .eq('user_id', userId)
        .order('joined_at');
      if (error) fail('listUserUniverses', error);
      return ((data ?? []) as unknown as { universes: UniverseRowDb }[]).map((r) =>
        toUniverse(r.universes),
      );
    },
  };
}
