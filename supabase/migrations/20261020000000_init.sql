-- Kiwar — milestone 2: server-authoritative games.
-- Players never write their game directly: every write goes through the `game` edge function
-- (service role), which validates commands with the shared rules. Players can only read.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Milestone 2: one solo universe per player ('solo-<user id>'). Milestone 3 adds shared ones.
  universe_id text not null,
  face text not null check (face in ('kiwisu', 'kiwino')),
  state jsonb not null,
  -- Optimistic concurrency token, incremented on every write.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, universe_id)
);

comment on table public.games is 'Authoritative game states (written by the game edge function only).';

-- Audit trail of every command (anti-cheat, rate limiting, balancing data later).
create table public.command_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  command jsonb not null,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index command_log_user_time on public.command_log (user_id, created_at desc);

-- Accounts allowed to use debug commands on the server.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.games enable row level security;
alter table public.command_log enable row level security;
alter table public.admins enable row level security;

-- Players (guests included: anonymous users are `authenticated`) may read their own games.
create policy "players read their own games"
  on public.games for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policy on games, and no policy at all on command_log / admins:
-- only the service role (edge function) can write them.

-- Keep the log small: commands older than 30 days are purged by this helper
-- (schedule it with pg_cron if wanted: select cron.schedule('purge-kiwar-log', '0 4 * * *', 'select public.purge_command_log()')).
create function public.purge_command_log() returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.command_log where created_at < now() - interval '30 days';
$$;

revoke all on function public.purge_command_log() from public, anon, authenticated;
