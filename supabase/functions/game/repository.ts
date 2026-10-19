// Postgres implementation of the shared GameRepository port.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

interface Row {
  id: string;
  user_id: string;
  state: unknown;
  version: number;
}

// deno-lint-ignore no-explicit-any
type State = any;

export function createSupabaseRepository(db: SupabaseClient, userId: string) {
  const universe = `solo-${userId}`;
  const toGame = (r: Row) => ({
    id: r.id,
    userId: r.user_id,
    state: r.state as State,
    version: r.version,
  });
  const fail = (what: string, error: unknown): never => {
    throw new Error(`${what}: ${JSON.stringify(error)}`);
  };

  return {
    async findByUser(uid: string) {
      const { data, error } = await db
        .from('games')
        .select('id, user_id, state, version')
        .eq('user_id', uid)
        .eq('universe_id', universe)
        .maybeSingle();
      if (error) fail('findByUser', error);
      return data ? toGame(data as Row) : null;
    },
    async create(uid: string, state: State) {
      const { data, error } = await db
        .from('games')
        .insert({ user_id: uid, universe_id: universe, face: state.face, state })
        .select('id, user_id, state, version')
        .single();
      if (error) fail('create', error);
      return toGame(data as Row);
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
        .select('id, user_id, state, version')
        .maybeSingle();
      if (error) fail('update', error);
      return data ? toGame(data as Row) : null;
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
  };
}
