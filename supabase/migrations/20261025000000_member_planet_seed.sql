-- Kiwar — a solo colony can found a shared universe (multiplayer playtest fixes).
-- The colony moves into the universe with its own planet: its member row keeps the seed of that
-- kiwi (null: the universe's own `<seed>-k<index>`). Written by the game function only.
alter table public.universe_members
  add column if not exists planet_seed text
  check (planet_seed is null or char_length(planet_seed) between 1 and 64);
