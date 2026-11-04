-- Kiwar — chantier 56: the leagues.
-- Each shared universe ranks its players on public, dated feats (an age reached, the queen,
-- a layer of the depths…) in seasons of about four weeks. A season's end only resets the
-- ranking: no colony is touched; the podium keeps a dated title and picks a cosmetic.
-- Everything is written by the game edge function (service role) from the state it holds:
-- members read, nobody else writes (no insert/update/delete policy for players).

-- The seasons of a universe, one after the other (n = 1, 2, …).
create table if not exists public.league_seasons (
  universe_id uuid not null references public.universes (id) on delete cascade,
  n integer not null check (n >= 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  -- Set once the podium has been written.
  closed_at timestamptz,
  primary key (universe_id, n)
);

-- A feat passed by a player (once per player and universe). Season 0: passed before the
-- colony entered the leagues (kept in the record, no point).
create table if not exists public.league_feats (
  id bigint generated always as identity primary key,
  universe_id uuid not null references public.universes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  colony smallint not null default 0 check (colony in (0, 1)),
  feat text not null check (char_length(feat) between 1 and 40),
  season integer not null check (season >= 0),
  points integer not null default 0 check (points >= 0),
  at timestamptz not null default now(),
  unique (universe_id, user_id, feat)
);

create index if not exists league_feats_season on public.league_feats (universe_id, season);
create index if not exists league_feats_time on public.league_feats (universe_id, at desc);

-- A player in the league of a universe: when their colony entered it, the cosmetics they wear.
create table if not exists public.league_players (
  universe_id uuid not null references public.universes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  opened_at timestamptz not null default now(),
  worn text[] not null default '{}',
  primary key (universe_id, user_id)
);

-- The podium of a closed season: a dated title, and the cosmetic picked (null until chosen).
create table if not exists public.league_titles (
  universe_id uuid not null references public.universes (id) on delete cascade,
  season integer not null check (season >= 1),
  user_id uuid not null references auth.users (id) on delete cascade,
  rank smallint not null check (rank between 1 and 3),
  points integer not null default 0,
  display_name text not null default '' check (char_length(display_name) <= 24),
  cosmetic text check (cosmetic in ('banner', 'capes', 'pennants', 'crown')),
  awarded_at timestamptz not null default now(),
  primary key (universe_id, season, user_id),
  unique (universe_id, season, rank)
);

alter table public.league_seasons enable row level security;
alter table public.league_feats enable row level security;
alter table public.league_players enable row level security;
alter table public.league_titles enable row level security;

create policy "members read the seasons"
  on public.league_seasons for select to authenticated
  using (public.is_universe_member(universe_id));

create policy "members read the feats"
  on public.league_feats for select to authenticated
  using (public.is_universe_member(universe_id));

create policy "members read the league players"
  on public.league_players for select to authenticated
  using (public.is_universe_member(universe_id));

create policy "members read the titles"
  on public.league_titles for select to authenticated
  using (public.is_universe_member(universe_id));

-- The ranking of each season (points of the feats that fell in it), read with the caller's
-- rights (security_invoker: the RLS above applies).
create or replace view public.league_ranking
  with (security_invoker = true)
as
  select universe_id, season, user_id, sum(points)::integer as points, count(*)::integer as feats,
    max(at) as last_at
  from public.league_feats
  where season >= 1
  group by universe_id, season, user_id;

grant select on public.league_ranking to authenticated;

-- Feats as they fall show up in the chat (Supabase Realtime; the publication only exists on
-- Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.league_feats;
  end if;
end;
$$;
