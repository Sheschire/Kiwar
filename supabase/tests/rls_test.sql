-- Run after the stub + migrations. Fails loudly (RAISE) if a security expectation is broken.
\set ON_ERROR_STOP on
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

set role service_role;
insert into public.games (user_id, universe_id, face, state)
  values ('11111111-1111-1111-1111-111111111111', 'solo-1', 'kiwisu', '{"a":1}'),
         ('22222222-2222-2222-2222-222222222222', 'solo-2', 'kiwino', '{"b":2}');
insert into public.command_log (user_id, command, ok) values ('11111111-1111-1111-1111-111111111111', '{}', true);
reset role;

-- Player 1 sees only their game, cannot write it, cannot read the log.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  select count(*) into n from public.games;
  if n <> 1 then raise exception 'player should see exactly 1 game, saw %', n; end if;
  update public.games set state = '{"cheat":true}';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'player could update % games', n; end if;
  delete from public.games;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'player could delete games'; end if;
  select count(*) into n from public.command_log;
  if n <> 0 then raise exception 'player can read the command log'; end if;
  select count(*) into n from public.admins;
  if n <> 0 then raise exception 'player can read admins'; end if;
  begin
    insert into public.games (user_id, universe_id, face, state)
      values ('11111111-1111-1111-1111-111111111111', 'x', 'kiwisu', '{}');
    raise exception 'player could insert a game';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Anonymous (not signed in) sees nothing.
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.games;
  if n <> 0 then raise exception 'anon can read games'; end if;
end $$;
reset role;

-- One game per player and universe.
do $$ begin
  insert into public.games (user_id, universe_id, face, state)
    values ('11111111-1111-1111-1111-111111111111', 'solo-1', 'kiwisu', '{}');
  raise exception 'duplicate game allowed';
exception when unique_violation then null;
end $$;

select 'RLS tests passed' as result;
