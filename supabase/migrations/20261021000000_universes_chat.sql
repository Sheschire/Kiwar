-- Kiwar — milestone 3: shared universes and team chat.
-- Universes and memberships are written by the `game` edge function only (it assigns faces).
-- Chat messages are written directly by members, under RLS.

create table public.universes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  seed text not null,
  created_by uuid references auth.users (id) on delete set null,
  max_players integer not null default 8 check (max_players between 2 and 16),
  -- Player-versus-player raids (later milestones); co-op only for now.
  pvp boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.universe_members (
  universe_id uuid not null references public.universes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  kiwi_index integer not null check (kiwi_index >= 0),
  face text not null check (face in ('kiwisu', 'kiwino')),
  joined_at timestamptz not null default now(),
  primary key (universe_id, user_id),
  unique (universe_id, kiwi_index, face)
);

create index universe_members_user on public.universe_members (user_id);

-- Membership test usable in policies without recursive RLS evaluation.
create function public.is_universe_member(target uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.universe_members m
    where m.universe_id = target and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_universe_member(uuid) from public, anon;
grant execute on function public.is_universe_member(uuid) to authenticated;

alter table public.universes enable row level security;
alter table public.universe_members enable row level security;

create policy "members read their universes"
  on public.universes for select to authenticated
  using (public.is_universe_member(id));

create policy "members read the member list"
  on public.universe_members for select to authenticated
  using (public.is_universe_member(universe_id));

-- Team chat ----------------------------------------------------------------

create table public.chat_messages (
  id bigint generated always as identity primary key,
  universe_id uuid not null references public.universes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default '',
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index chat_messages_universe_time on public.chat_messages (universe_id, created_at desc);

-- The author name comes from the membership (cannot be spoofed); light flood protection.
create function public.chat_before_insert() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  recent integer;
begin
  new.user_id := auth.uid();
  new.created_at := now();
  select m.display_name into new.display_name
    from public.universe_members m
    where m.universe_id = new.universe_id and m.user_id = new.user_id;
  if new.display_name is null then
    raise exception 'not a member of this universe' using errcode = '42501';
  end if;
  select count(*) into recent from public.chat_messages c
    where c.user_id = new.user_id and c.created_at > now() - interval '10 seconds';
  if recent >= 5 then
    raise exception 'slow down' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger chat_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_before_insert();

alter table public.chat_messages enable row level security;

create policy "members read the chat"
  on public.chat_messages for select to authenticated
  using (public.is_universe_member(universe_id));

create policy "members post in the chat"
  on public.chat_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_universe_member(universe_id));

-- Reports go to the admins (no read access for players).
create table public.chat_reports (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  unique (message_id, reporter)
);

alter table public.chat_reports enable row level security;

create policy "members report messages of their universes"
  on public.chat_reports for insert to authenticated
  with check (
    reporter = (select auth.uid())
    and exists (
      select 1 from public.chat_messages c
      where c.id = message_id and public.is_universe_member(c.universe_id)
    )
  );

-- Live chat through Supabase Realtime (the publication only exists on Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
