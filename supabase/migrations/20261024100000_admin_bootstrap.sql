-- One-time bootstrap of the first admin.
--
-- A fresh deployment has no admin, and editorial access is invite-only, so the
-- first admin cannot be invited through the application. Granting admin to
-- "the first user who signs up" would hand the site to whoever registers first
-- while public reader sign-up is open. Instead, an operator runs
-- `npm run admin:bootstrap` with the secret key, which calls this function.
--
-- The function is executable only by service_role. It refuses while any active
-- admin exists, so it cannot be used to add admins later (use invitations) and
-- re-runs are harmless. The confirmed-account trigger from the reader-accounts
-- migration still applies: an unconfirmed self-registered account cannot be
-- promoted, only a confirmed or invited one.

create or replace function public.bootstrap_first_admin(
  p_profile_id uuid,
  p_invited boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize concurrent bootstrap runs so two operators cannot both pass the
  -- "no active admin" check.
  perform pg_advisory_xact_lock(hashtext('public.bootstrap_first_admin'));

  if exists (
    select 1
    from public.editorial_members
    where role = 'admin'
      and deactivated_at is null
  ) then
    raise exception 'An active admin already exists' using errcode = '42710';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_profile_id
  ) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  insert into public.editorial_members (profile_id, role, invited_by, deactivated_at)
  values (p_profile_id, 'admin', null, null)
  on conflict (profile_id) do update
    set role = 'admin',
        deactivated_at = null,
        invited_by = null,
        updated_at = now();

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    null,
    'member.bootstrap_admin',
    p_profile_id,
    jsonb_build_object('invited', coalesce(p_invited, false))
  );
end;
$$;

revoke all on function public.bootstrap_first_admin(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid, boolean)
  to service_role;
