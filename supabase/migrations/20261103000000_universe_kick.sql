-- Kiwar — the host may remove a player from a shared universe, and universes hold 16 players.
-- A removed player is banned from that universe (they cannot join back with the invite code)
-- until the host lifts it. Written and read by the game function only (service role): RLS on,
-- no policy for players.
create table if not exists public.universe_bans (
  universe_id uuid not null references public.universes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 24),
  banned_at timestamptz not null default now(),
  primary key (universe_id, user_id)
);

alter table public.universe_bans enable row level security;

-- Up to 16 players per universe (the check already allows 2–16): existing universes too.
alter table public.universes alter column max_players set default 16;
update public.universes set max_players = 16 where max_players = 8;
