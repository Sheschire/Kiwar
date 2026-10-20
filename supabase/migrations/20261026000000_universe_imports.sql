-- Kiwar — chantier 14: bring a solo colony along when joining a universe.
-- The host may close the universe to colonies brought along (`allow_imports`), and the member
-- row remembers when a colony was imported (`imported_at`, null: started in the universe).
-- Both are written by the game function only (no update policy for players).
alter table public.universes
  add column if not exists allow_imports boolean not null default true;

alter table public.universe_members
  add column if not exists imported_at timestamptz;
