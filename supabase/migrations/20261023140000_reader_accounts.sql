-- Phase 11: self-service reader accounts.
--
-- Reader state stays derived: an authenticated user without an active
-- editorial_members row is a reader. This migration adds no role, no reader
-- table, and no client write path to editorial access. It adds:
--
--   1. Rate limits for the anonymous Auth flows (sign-up, sign-in, password
--      reset), keyed by hashed request subjects instead of an Auth user.
--   2. A guard that refuses editorial membership for an unconfirmed
--      self-service account, so an admin invitation of an email that someone
--      else pre-registered cannot hand that person editorial access.
--   3. The account-deletion preflight that runs as the signed-in user before
--      the server deletes the Auth user with the admin API.

-- 1. Auth flow rate limits ---------------------------------------------------
--
-- Same sliding-window mechanism as Phase 10 (advisory lock, prune, count,
-- record, SQLSTATE PT429), but the subject is a SHA-256 hex digest computed by
-- the server from the normalized email or the client IP. Raw emails and IPs
-- are never stored. Unlike content writes, every attempt counts, including
-- failed sign-ins, because failures are what brute force produces.
--
-- Rules (per subject, sliding window):
--   auth.sign_up         email 3 per hour,       ip 10 per hour
--   auth.sign_in         email 10 per 10 minutes, ip 30 per 10 minutes
--   auth.password_reset  email 3 per hour,       ip 10 per hour
--
-- Only the server (secret key) may call the function: a public grant would let
-- anyone exhaust another person's email budget without going through the app.

create table public.auth_rate_limit_events (
  id bigint generated always as identity primary key,
  action text not null,
  subject_kind text not null,
  subject_hash text not null,
  created_at timestamptz not null default now(),
  constraint auth_rate_limit_events_action_check check (
    action in ('auth.sign_up', 'auth.sign_in', 'auth.password_reset')
  ),
  constraint auth_rate_limit_events_subject_kind_check check (
    subject_kind in ('email', 'ip')
  ),
  constraint auth_rate_limit_events_subject_hash_format check (
    subject_hash ~ '^[0-9a-f]{64}$'
  )
);

create index auth_rate_limit_events_subject_idx
  on public.auth_rate_limit_events (action, subject_kind, subject_hash, created_at desc);

alter table public.auth_rate_limit_events enable row level security;
revoke all on table public.auth_rate_limit_events from anon, authenticated;

create or replace function public.consume_auth_rate_limit(
  p_action text,
  p_email_hash text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_max integer;
  v_ip_max integer;
  v_window interval;
  v_subject record;
  v_count integer;
begin
  case p_action
    when 'auth.sign_up' then
      v_email_max := 3; v_ip_max := 10; v_window := interval '1 hour';
    when 'auth.sign_in' then
      v_email_max := 10; v_ip_max := 30; v_window := interval '10 minutes';
    when 'auth.password_reset' then
      v_email_max := 3; v_ip_max := 10; v_window := interval '1 hour';
    else
      raise exception 'Unknown auth rate-limit action %', p_action
        using errcode = '22023';
  end case;

  -- Check every subject before recording any, so a rejected attempt is not
  -- counted against the other subject.
  for v_subject in
    select kind, hash, max_events
    from (values
      ('email', p_email_hash, v_email_max),
      ('ip', p_ip_hash, v_ip_max)
    ) as subjects (kind, hash, max_events)
    where hash is not null
    order by kind
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'auth_rate_limit:' || p_action || ':' || v_subject.kind || ':' || v_subject.hash,
        0
      )
    );

    delete from public.auth_rate_limit_events
    where auth_rate_limit_events.action = p_action
      and auth_rate_limit_events.subject_kind = v_subject.kind
      and auth_rate_limit_events.subject_hash = v_subject.hash
      and auth_rate_limit_events.created_at <= now() - v_window;

    select count(*)
    into v_count
    from public.auth_rate_limit_events
    where auth_rate_limit_events.action = p_action
      and auth_rate_limit_events.subject_kind = v_subject.kind
      and auth_rate_limit_events.subject_hash = v_subject.hash;

    if v_count >= v_subject.max_events then
      raise exception 'Rate limit exceeded for %', p_action
        using errcode = 'PT429',
              hint = format('At most %s per %s.', v_subject.max_events, v_window);
    end if;
  end loop;

  insert into public.auth_rate_limit_events (action, subject_kind, subject_hash)
  select p_action, kind, hash
  from (values ('email', p_email_hash), ('ip', p_ip_hash)) as subjects (kind, hash)
  where hash is not null;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, text)
  to service_role;

-- 2. Editorial membership requires a confirmed or invited account ------------
--
-- With public sign-up enabled, anyone can create an unconfirmed Auth user for
-- an email they do not own. If an admin later invites that email, the invite
-- path grants membership to the existing account, whose password the
-- registrant chose. Activation therefore requires a confirmed email or an
-- account created by the Auth invite API (invited_at). This also covers
-- service-role and SQL writes.

create or replace function public.require_confirmed_editorial_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deactivated_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.deactivated_at is null then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users
    where users.id = new.profile_id
      and (users.email_confirmed_at is not null or users.invited_at is not null)
  ) then
    raise exception 'Editorial membership requires a confirmed account'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger editorial_members_require_confirmed_account
before insert or update on public.editorial_members
for each row
execute function public.require_confirmed_editorial_account();

revoke all on function public.require_confirmed_editorial_account()
  from public, anon, authenticated;

-- 3. Account deletion preflight -------------------------------------------
--
-- The account page calls this RPC as the signed-in user, then deletes the
-- Auth user with the admin API. Deleting auth.users cascades to profiles,
-- editorial_members, and rate_limit_events. Authored content is kept:
-- posts.created_by, media.uploaded_by, authors.user_id, and audit references
-- become null through their ON DELETE SET NULL foreign keys.
--
-- Policy:
--   - Readers may always delete their account.
--   - Editors, authors, and deactivated members may delete their account. Their
--     posts, credits (the public author identity), and media stay.
--   - An active admin may not. Another admin must first change the role or
--     deactivate the membership. This keeps at least one active admin, because
--     the last-admin trigger already blocks demoting or deactivating the last
--     one, and keeps admin removal an explicit, audited admin decision.
--
-- Hooks for later phases (run here, in the same transaction, before deletion):
--   - Phase 12: delete the caller's bookmarks (the profiles cascade is the
--     safety net).
--   - Phase 13: anonymize the caller's comments (user_id null, neutral
--     display-name snapshot, body kept) before the Auth user is deleted.

create or replace function public.prepare_own_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  membership public.editorial_members%rowtype;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into membership
  from public.editorial_members
  where profile_id = actor
  for update;

  if found then
    if membership.role = 'admin' and membership.deactivated_at is null then
      raise exception 'Active admins cannot delete their account'
        using errcode = '23514';
    end if;

    insert into public.editorial_audit_log (
      actor_profile_id,
      action,
      target_profile_id,
      details
    )
    values (
      actor,
      'member.account_deletion',
      actor,
      jsonb_build_object(
        'role', membership.role,
        'deactivated', membership.deactivated_at is not null
      )
    );
  end if;
end;
$$;

revoke all on function public.prepare_own_account_deletion()
  from public, anon, authenticated;
grant execute on function public.prepare_own_account_deletion() to authenticated;
