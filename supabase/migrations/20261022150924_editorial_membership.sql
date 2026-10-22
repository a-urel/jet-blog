-- Phase 2: editorial profiles, membership, invitations, and audit.
-- Public reader sign-up remains disabled until Phase 11; this migration only
-- grants editorial access through invite-only membership rows.

create type public.editorial_role as enum ('admin', 'editor', 'author');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 120
  )
);

create table public.editorial_members (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role public.editorial_role not null,
  deactivated_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  bio text,
  user_id uuid unique references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authors_name_length check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint authors_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint authors_bio_length check (bio is null or char_length(bio) <= 2000)
);

create unique index authors_slug_key on public.authors (slug);

create table public.editorial_audit_log (
  id bigint generated always as identity primary key,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_profile_id uuid references public.profiles (id) on delete set null,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint editorial_audit_action_format check (
    action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
  ),
  constraint editorial_audit_target_email_length check (
    target_email is null or char_length(target_email) <= 320
  )
);

create index editorial_members_active_role_idx
  on public.editorial_members (role)
  where deactivated_at is null;

create index editorial_audit_actor_action_created_idx
  on public.editorial_audit_log (actor_profile_id, action, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger editorial_members_set_updated_at
before update on public.editorial_members
for each row
execute function public.set_updated_at();

create trigger authors_set_updated_at
before update on public.authors
for each row
execute function public.set_updated_at();

-- Every Auth user gets a profile. Display names are optional and can come from
-- invitation metadata. Keep the value bounded so a bad metadata payload cannot
-- abort account creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(
      left(
        btrim(
          coalesce(
            new.raw_user_meta_data ->> 'display_name',
            new.raw_user_meta_data ->> 'full_name',
            ''
          )
        ),
        120
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select
  users.id,
  nullif(
    left(
      btrim(
        coalesce(
          users.raw_user_meta_data ->> 'display_name',
          users.raw_user_meta_data ->> 'full_name',
          ''
        )
      ),
      120
    ),
    ''
  )
from auth.users as users
on conflict (id) do nothing;

-- Authorization helpers used by RLS. Deactivated members are treated as
-- non-members immediately; no token refresh is required.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.editorial_members
    where profile_id = auth.uid()
      and role = 'admin'
      and deactivated_at is null
  );
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.editorial_members
    where profile_id = auth.uid()
      and role in ('admin', 'editor')
      and deactivated_at is null
  );
$$;

-- Keep at least one active admin. The server also blocks self-demotion and
-- self-deactivation; this trigger protects service-role and SQL changes too.
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_admins integer;
begin
  -- Auth-user deletion cascades here. That is an out-of-band operation; the
  -- application exposes deactivation, not member deletion, and the server
  -- blocks self-deactivation. Keep role changes and deactivation guarded.
  if tg_op = 'DELETE' then
    return old;
  end if;

  if old.role = 'admin'
    and old.deactivated_at is null
    and (new.role <> 'admin' or new.deactivated_at is not null)
  then
    select count(*)
    into remaining_admins
    from public.editorial_members
    where role = 'admin'
      and deactivated_at is null
      and profile_id <> old.profile_id;

    if remaining_admins = 0 then
      raise exception 'At least one active admin is required'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger editorial_members_prevent_last_admin
before update on public.editorial_members
for each row
execute function public.prevent_last_admin_removal();

alter table public.profiles enable row level security;
alter table public.editorial_members enable row level security;
alter table public.authors enable row level security;
alter table public.editorial_audit_log enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.editorial_members from anon, authenticated;
revoke all on table public.authors from anon, authenticated;
revoke all on table public.editorial_audit_log from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.editorial_members to authenticated;
grant select, insert, update, delete on table public.authors to authenticated;
grant select on table public.editorial_audit_log to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_editor() to anon, authenticated;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy editorial_members_select_own_or_admin
on public.editorial_members
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

-- Membership and audit writes are intentionally not granted directly to
-- authenticated clients. They happen through the security-definer RPCs below,
-- which re-check admin access and write the audit row in the same transaction.

create policy authors_select_admin
on public.authors
for select
to authenticated
using (public.is_admin());

create policy authors_insert_admin
on public.authors
for insert
to authenticated
with check (public.is_admin());

create policy authors_update_admin
on public.authors
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy authors_delete_admin
on public.authors
for delete
to authenticated
using (public.is_admin());

create policy editorial_audit_select_admin
on public.editorial_audit_log
for select
to authenticated
using (public.is_admin());

-- Centralized mutations. The server actions call these functions so the
-- membership write and its audit row happen in one transaction. The functions
-- re-check the caller instead of trusting the server or a client-supplied role.
create or replace function public.require_admin_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Editorial admin access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.editorial_members
    where profile_id = actor
      and role = 'admin'
      and deactivated_at is null
  ) then
    raise exception 'Editorial admin access required' using errcode = '42501';
  end if;

  return actor;
end;
$$;

create or replace function public.grant_editorial_membership(
  p_profile_id uuid,
  p_role public.editorial_role,
  p_invited boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
  existing public.editorial_members%rowtype;
begin
  if p_profile_id = actor then
    raise exception 'Cannot grant membership to yourself' using errcode = '22023';
  end if;

  select *
  into existing
  from public.editorial_members
  where profile_id = p_profile_id;

  if found then
    if existing.deactivated_at is null then
      raise exception 'Member already active' using errcode = '23505';
    end if;
  end if;

  insert into public.editorial_members (profile_id, role, invited_by, deactivated_at)
  values (p_profile_id, p_role, actor, null)
  on conflict (profile_id) do update
    set role = excluded.role,
        deactivated_at = null,
        invited_by = excluded.invited_by,
        updated_at = now();

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    case when p_invited then 'member.invite' else 'member.granted_existing' end,
    p_profile_id,
    jsonb_build_object('role', p_role)
  );
end;
$$;

create or replace function public.change_editorial_role(
  p_profile_id uuid,
  p_role public.editorial_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
  previous_role public.editorial_role;
begin
  if p_profile_id = actor then
    raise exception 'Cannot change your own role' using errcode = '22023';
  end if;

  select role
  into previous_role
  from public.editorial_members
  where profile_id = p_profile_id;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  update public.editorial_members
  set role = p_role
  where profile_id = p_profile_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    'member.role_changed',
    p_profile_id,
    jsonb_build_object('from', previous_role, 'to', p_role)
  );
end;
$$;

create or replace function public.set_editorial_active(
  p_profile_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
begin
  if p_profile_id = actor and not p_active then
    raise exception 'Cannot deactivate yourself' using errcode = '22023';
  end if;

  perform 1
  from public.editorial_members
  where profile_id = p_profile_id;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  update public.editorial_members
  set deactivated_at = case when p_active then null else now() end
  where profile_id = p_profile_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    case when p_active then 'member.reactivated' else 'member.deactivated' end,
    p_profile_id,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.record_editorial_audit(
  p_action text,
  p_target_profile_id uuid default null,
  p_target_email text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
begin
  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    target_email,
    details
  )
  values (
    actor,
    p_action,
    p_target_profile_id,
    nullif(btrim(coalesce(p_target_email, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.require_admin_actor() to authenticated;
grant execute on function public.grant_editorial_membership(uuid, public.editorial_role, boolean) to authenticated;
grant execute on function public.change_editorial_role(uuid, public.editorial_role) to authenticated;
grant execute on function public.set_editorial_active(uuid, boolean) to authenticated;
grant execute on function public.record_editorial_audit(text, uuid, text, jsonb) to authenticated;

