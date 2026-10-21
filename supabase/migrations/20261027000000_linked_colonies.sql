-- Kiwar — chantier 19 (second half): the second colony.
-- Once the ferret queen has fallen, a player founds a colony on the twin face of their kiwi:
-- a second game state, linked to the first (same calendar, shared research). Each player now
-- has up to two games per universe (solo or shared): colony 0 (home) and colony 1 (sister).
-- Players still cannot read games (anti-cheat, see 20261024000000_hide_game_state.sql): only
-- the game edge function (service role) reads and writes them.

alter table public.games
  add column colony smallint not null default 0 check (colony in (0, 1));

comment on column public.games.colony is
  'Colony of the player on this kiwi: 0 = home face, 1 = the twin face colonised (chantier 19).';

alter table public.games drop constraint games_user_id_universe_id_key;

alter table public.games
  add constraint games_user_universe_colony_key unique (user_id, universe_id, colony);
