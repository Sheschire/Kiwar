-- Kiwar — chantier 54: the cosmic orchard. Every member of a universe meets the same raspberry;
-- what its drupelets hold is drawn from a secret seed of the universe, which players must never
-- read (the universe's own seed is readable by its members). Written and read by the game
-- function only (service role): RLS on, no policy for players.
create table if not exists public.universe_secrets (
  universe_id uuid primary key references public.universes (id) on delete cascade,
  orchard_seed text not null check (char_length(orchard_seed) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.universe_secrets enable row level security;
