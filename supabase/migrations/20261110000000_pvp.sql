-- Kiwar — chantier 57: optional PvP.
-- In a universe created with `pvp` on, a player may land on another member's home colony. The
-- game edge function (service role) plays the battle from both colonies it holds and writes a
-- line here when it ends: members read it (the universe's chat shows it), nobody else writes
-- (no insert/update/delete policy for players). Colonies stay in `games` (never readable).

create table if not exists public.pvp_battles (
  -- The attack: attacker id / ship id.
  id text primary key check (char_length(id) between 1 and 120),
  universe_id uuid not null references public.universes (id) on delete cascade,
  attacker_id uuid not null references auth.users (id) on delete cascade,
  attacker_name text not null default '' check (char_length(attacker_name) <= 24),
  defender_id uuid not null references auth.users (id) on delete cascade,
  defender_name text not null default '' check (char_length(defender_name) <= 24),
  -- held: the defence held; looted: the crew carried resources away; turnedBack: no fight.
  outcome text not null check (outcome in ('held', 'looted', 'turnedBack')),
  loot integer not null default 0 check (loot >= 0),
  at timestamptz not null default now()
);

create index if not exists pvp_battles_time on public.pvp_battles (universe_id, at desc);

alter table public.pvp_battles enable row level security;

create policy "members read the battles"
  on public.pvp_battles for select to authenticated
  using (public.is_universe_member(universe_id));

-- Battles as they end show up in the chat (Supabase Realtime; the publication only exists on
-- Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pvp_battles;
  end if;
end;
$$;
