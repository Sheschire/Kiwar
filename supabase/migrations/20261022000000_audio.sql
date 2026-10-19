-- Chantier 02: audio. Sounds uploaded from the admin space (Storage bucket `audio` + catalogue
-- table) and bindings "sound event → sounds + parameters" read by every client at startup.
-- Everyone (even signed-out visitors) can read; only accounts listed in `admins` can write.

-- True when the caller is listed in `admins` (that table has no read policy on purpose).
create function public.is_admin() returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Uploaded sound files (the bytes live in Storage, bucket `audio`, at `path`).
create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  path text not null unique check (path ~ '^[A-Za-z0-9._/-]{1,200}$'),
  mime text not null
    check (mime in ('audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4')),
  duration_ms integer not null default 0 check (duration_ms between 0 and 600000),
  size_bytes integer not null check (size_bytes between 1 and 2097152),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per sound event overriding the built-in default (e.g. `ui.click`, `music.main`).
-- `binding` holds the parameters (sources, volume, pitch, cooldown…); the client validates it
-- with the same schema as the admin editor and falls back to the default if it is invalid.
create table public.audio_bindings (
  event_id text primary key
    check (char_length(event_id) <= 64 and event_id ~ '^[a-z]+(\.[a-z0-9_-]+)+$'),
  binding jsonb not null
    check (
      jsonb_typeof(binding) = 'object'
      and octet_length(binding::text) <= 8192
      and case jsonb_typeof(binding -> 'sources')
        when 'array' then jsonb_array_length(binding -> 'sources') <= 16
        else binding -> 'sources' is null
      end
    ),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create function public.touch_audio_binding() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger audio_bindings_touch
  before update on public.audio_bindings
  for each row execute function public.touch_audio_binding();

alter table public.audio_assets enable row level security;
alter table public.audio_bindings enable row level security;

create policy "everyone reads audio assets"
  on public.audio_assets for select to anon, authenticated
  using (true);

create policy "admins add audio assets"
  on public.audio_assets for insert to authenticated
  with check (public.is_admin());

create policy "admins edit audio assets"
  on public.audio_assets for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins remove audio assets"
  on public.audio_assets for delete to authenticated
  using (public.is_admin());

create policy "everyone reads audio bindings"
  on public.audio_bindings for select to anon, authenticated
  using (true);

create policy "admins add audio bindings"
  on public.audio_bindings for insert to authenticated
  with check (public.is_admin());

create policy "admins edit audio bindings"
  on public.audio_bindings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins remove audio bindings"
  on public.audio_bindings for delete to authenticated
  using (public.is_admin());

-- Storage bucket: public read (files are served by URL), 2 MB per file, audio types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  true,
  2097152,
  array['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "everyone reads audio files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'audio');

create policy "admins upload audio files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and public.is_admin());

create policy "admins replace audio files"
  on storage.objects for update to authenticated
  using (bucket_id = 'audio' and public.is_admin())
  with check (bucket_id = 'audio' and public.is_admin());

create policy "admins delete audio files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and public.is_admin());
