-- Housekeeping (November 2026): every visit without a session creates an anonymous guest and
-- a colony, link previews and robots included (≈ 800 guests for a dozen players). This
-- helper removes the guests nobody will ever come back to.
--
-- A guest is idle when: anonymous, created and last seen more than `older_than` ago, not a
-- member nor the creator of a shared universe, not an admin, and every colony of theirs was
-- written at most 3 times (a world picked, nothing played). Deleting the user cascades to
-- their games and command log.
--
-- `dry_run` (the default) only counts. Run it by hand, or schedule it with pg_cron:
--   select cron.schedule('purge-kiwar-guests', '30 4 * * *',
--     $$select public.purge_idle_guests(false)$$);
create or replace function public.purge_idle_guests(
  dry_run boolean default true,
  older_than interval default interval '7 days'
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(u.id), '{}')
  into ids
  from auth.users u
  where u.is_anonymous
    and u.created_at < now() - older_than
    and coalesce(u.last_sign_in_at, u.created_at) < now() - older_than
    and not exists (select 1 from public.universe_members m where m.user_id = u.id)
    and not exists (select 1 from public.universes x where x.created_by = u.id)
    and not exists (select 1 from public.admins a where a.user_id = u.id)
    and not exists (select 1 from public.games g where g.user_id = u.id and g.version > 3);
  if not dry_run then
    delete from auth.users where id = any (ids);
  end if;
  return cardinality(ids);
end;
$$;

revoke all on function public.purge_idle_guests(boolean, interval) from public, anon, authenticated;
