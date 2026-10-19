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

-- ---------------------------------------------------------------- universes and chat
set role service_role;
insert into public.universes (id, name, code, seed, created_by)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Les Kiwis', 'ABCDEFGH', 's', '11111111-1111-1111-1111-111111111111');
insert into public.universe_members (universe_id, user_id, display_name, kiwi_index, face)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Alice', 0, 'kiwisu');
reset role;

-- A member sees the universe, posts with her own name; a non-member sees and posts nothing.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int; who text;
begin
  select count(*) into n from public.universes;
  if n <> 1 then raise exception 'member should see her universe'; end if;
  insert into public.chat_messages (universe_id, body, display_name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Coucou !', 'Fake Name');
  select display_name into who from public.chat_messages limit 1;
  if who <> 'Alice' then raise exception 'display name was spoofed: %', who; end if;
  begin
    update public.universe_members set face = 'kiwino';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'member could edit memberships'; end if;
  end;
  insert into public.chat_reports (message_id, reason) select id, 'test' from public.chat_messages limit 1;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  select count(*) into n from public.universes;
  if n <> 0 then raise exception 'stranger sees a universe'; end if;
  select count(*) into n from public.chat_messages;
  if n <> 0 then raise exception 'stranger reads the chat'; end if;
  begin
    insert into public.chat_messages (universe_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'spam');
    raise exception 'stranger could post';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.chat_reports;
  if n <> 0 then raise exception 'reports are readable'; end if;
end $$;
reset role;

-- Flood protection: the 6th message within 10 s is refused.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  for i in 1..4 loop
    insert into public.chat_messages (universe_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'msg ' || i);
  end loop;
  begin
    insert into public.chat_messages (universe_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'one too many');
    raise exception 'flood protection missing';
  exception when raise_exception then
    if sqlerrm = 'flood protection missing' then raise; end if;
  end;
end $$;
reset role;

select 'Universe and chat RLS tests passed' as result;
