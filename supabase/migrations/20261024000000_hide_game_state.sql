-- Chantier 07: stored games hold the real alien garrisons, which players must never see (they
-- only get what their reconnaissance missions report). The game function (service role) is the
-- only reader and writer of games: players no longer read their rows directly.
drop policy if exists "players read their own games" on public.games;
