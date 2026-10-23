-- Phase 13: flat, post-moderated comments with reader reports.
--
-- Decision D6: a comment is visible as soon as it is submitted; signed-in
-- readers report it; editors and admins hide (reversible) or soft-delete it
-- from a moderation queue. Reports never hide a comment on their own.
--
--   1. comments and comment_reports, their indexes, and explicit RLS.
--   2. Insert preparation: display-name snapshot, rate limit, duplicate guard.
--   3. Report rate limit.
--   4. The editorial moderation RPC (the only path that changes status).
--   5. A helper that tells a signed-in reader which comments are theirs.
--   6. Comment anonymization in the account-deletion preflight (Phase 11 hook).

-- 1. Tables ------------------------------------------------------------------
--
-- Deletion behavior:
--   - comments.user_id references profiles with ON DELETE SET NULL, so an Auth
--     user deleted without the preflight still leaves anonymous comments; the
--     anonymize trigger below replaces the display-name snapshot in that case
--     too. The body stays so discussions remain readable.
--   - comments.post_id references posts with ON DELETE CASCADE (no UI deletes
--     posts). Unpublishing keeps the rows; the public policy hides them while
--     the post is not published.
--   - The owner deletes their own comment as a hard delete; its reports go
--     with it. Editors soft-delete (status 'deleted') so the queue keeps a
--     trace.
--   - comment_reports cascade from their comment and from the reporter's
--     profile.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid default auth.uid()
    references public.profiles (id) on delete set null,
  -- Snapshot of the author's profile display name at submission time, set by
  -- the insert trigger; clients cannot choose it.
  display_name text not null,
  body text not null,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_status_check check (
    status in ('visible', 'hidden', 'deleted')
  ),
  constraint comments_display_name_length check (
    char_length(btrim(display_name)) between 1 and 120
  ),
  -- Plain text only. The server trims before inserting; the database refuses
  -- empty, padded, or over-long bodies from any client.
  constraint comments_body_length check (
    char_length(body) between 1 and 2000
    and body = btrim(body)
  )
);

-- Query patterns:
--   - public listing per post: post_id = x and status = 'visible' order by
--     created_at -> partial index;
--   - the moderation queue: status filter order by created_at desc;
--   - own comments on a post and the account-deletion update: user_id;
--   - the duplicate guard: user_id, post_id, recent created_at.
create index comments_post_visible_created_idx
  on public.comments (post_id, created_at)
  where status = 'visible';

create index comments_status_created_idx
  on public.comments (status, created_at desc);

create index comments_user_post_created_idx
  on public.comments (user_id, post_id, created_at desc);

create trigger comments_set_updated_at
before update on public.comments
for each row
execute function public.set_updated_at();

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint comment_reports_reason_check check (
    reason in ('spam', 'abuse', 'off_topic', 'other')
  ),
  constraint comment_reports_comment_reporter_key unique (comment_id, reporter_id)
);

-- comment_id lookups (queue embeds, cascades) use the unique index's leading
-- column; reporter_id serves own-report reads and the profile cascade.
create index comment_reports_reporter_idx
  on public.comment_reports (reporter_id);

alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;

revoke all on table public.comments from anon, authenticated;
revoke all on table public.comment_reports from anon, authenticated;

-- user_id is never readable by clients, so public listings cannot link
-- comments to accounts. Readers learn which comments are theirs through
-- list_own_comment_ids() below.
grant select (id, post_id, display_name, body, status, created_at, updated_at)
  on table public.comments to anon, authenticated;
-- No update grant: there is no comment editing, and status changes go through
-- moderate_comment(). user_id, display_name, and status come from defaults
-- and the insert trigger.
grant insert (post_id, body) on table public.comments to authenticated;
grant delete on table public.comments to authenticated;

-- reporter_id is never readable: reporter identity stays private, including
-- from the moderation queue, which shows reasons and counts.
grant select (id, comment_id, reason, created_at)
  on table public.comment_reports to authenticated;
grant insert (comment_id, reason) on table public.comment_reports to authenticated;

-- Visible comments of published posts, for everyone. The explicit status
-- check matters: editorial members can see drafts through the posts policy.
create policy comments_select_public
on public.comments
for select
to anon, authenticated
using (
  status = 'visible'
  and exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and posts.status = 'published'
  )
);

create policy comments_select_own
on public.comments
for select
to authenticated
using (user_id = (select auth.uid()));

-- The moderation queue: editors and admins read every status.
create policy comments_select_editor
on public.comments
for select
to authenticated
using ((select public.is_editor()));

create policy comments_insert_own_visible
on public.comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'visible'
  and exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and posts.status = 'published'
  )
);

create policy comments_delete_own
on public.comments
for delete
to authenticated
using (user_id = (select auth.uid()));

-- A comment can be reported while it is publicly visible, by anyone but its
-- author. Security definer so the check can read user_id, which clients
-- cannot select.
create or replace function public.is_reportable_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comments
    join public.posts on posts.id = comments.post_id
    where comments.id = p_comment_id
      and comments.status = 'visible'
      and posts.status = 'published'
      and comments.user_id is distinct from auth.uid()
  );
$$;

revoke all on function public.is_reportable_comment(uuid)
  from public, anon, authenticated;
grant execute on function public.is_reportable_comment(uuid) to authenticated;

create policy comment_reports_select_own
on public.comment_reports
for select
to authenticated
using (reporter_id = (select auth.uid()));

create policy comment_reports_select_editor
on public.comment_reports
for select
to authenticated
using ((select public.is_editor()));

create policy comment_reports_insert_own
on public.comment_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and public.is_reportable_comment(comment_id)
);

-- 2. Insert preparation ------------------------------------------------------
--
--   comment.create  10 per hour  insert into comments
--
-- The trigger runs before the RLS check. It
--   - forces the display-name snapshot from the author's profile, so a client
--     cannot post under another name; a profile without a display name leaves
--     display_name null and the insert fails with not_null_violation (23502);
--   - consumes the rate limit (PT429), which also serializes the author's
--     concurrent submissions through the advisory lock;
--   - refuses the same body on the same post by the same author within ten
--     minutes (PT409), a basic guard against double submits and paste spam.
--
-- Service-role writes (seeds, tests) without an Auth user keep the supplied
-- display_name and skip both limits.

create or replace function public.prepare_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then
    select profiles.display_name
    into new.display_name
    from public.profiles
    where profiles.id = new.user_id;
  end if;

  perform public.consume_rate_limit('comment.create', 10, interval '1 hour');

  if new.user_id is not null and exists (
    select 1
    from public.comments
    where comments.user_id = new.user_id
      and comments.post_id = new.post_id
      and comments.body = new.body
      and comments.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'Duplicate comment'
      using errcode = 'PT409';
  end if;

  return new;
end;
$$;

create trigger comments_prepare_insert
before insert on public.comments
for each row
execute function public.prepare_comment_insert();

-- Anonymization: whenever user_id becomes null (the account-deletion preflight
-- or the ON DELETE SET NULL safety net), the display-name snapshot is replaced
-- with a neutral label. The body is kept.
create or replace function public.anonymize_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := 'Silinmiş kullanıcı';
  return new;
end;
$$;

create trigger comments_anonymize
before update of user_id on public.comments
for each row
when (old.user_id is not null and new.user_id is null)
execute function public.anonymize_comment();

revoke all on function public.prepare_comment_insert()
  from public, anon, authenticated;
revoke all on function public.anonymize_comment()
  from public, anon, authenticated;

-- 3. Report rate limit -------------------------------------------------------
--
--   comment.report  20 per hour  insert into comment_reports
--
-- The unique (comment_id, reporter_id) pair already allows one report per
-- comment; the limit bounds sweeping reports across many comments.

create or replace function public.enforce_comment_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('comment.report', 20, interval '1 hour');
  return new;
end;
$$;

create trigger comment_reports_enforce_rate_limit
before insert on public.comment_reports
for each row
execute function public.enforce_comment_report_rate_limit();

revoke all on function public.enforce_comment_report_rate_limit()
  from public, anon, authenticated;

-- 4. Moderation --------------------------------------------------------------
--
-- Editors and admins (is_editor) change status:
--   visible -> hidden, hidden -> visible   (reversible)
--   visible | hidden -> deleted            (soft delete, final)
-- Each change is recorded in the editorial audit log. Returns the post id and
-- slug so the Server Action can invalidate that post's public page.

create or replace function public.moderate_comment(
  p_comment_id uuid,
  p_status text
)
returns table (post_id uuid, post_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_comment public.comments%rowtype;
begin
  if actor is null or not public.is_editor() then
    raise exception 'Editorial access required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('visible', 'hidden', 'deleted') then
    raise exception 'Unknown comment status %', p_status using errcode = '22023';
  end if;

  select *
  into v_comment
  from public.comments
  where comments.id = p_comment_id
  for update;

  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;

  if v_comment.status = 'deleted' then
    raise exception 'Deleted comments cannot be changed' using errcode = '23514';
  end if;

  if v_comment.status <> p_status then
    update public.comments
    set status = p_status
    where comments.id = p_comment_id;

    insert into public.editorial_audit_log (
      actor_profile_id,
      action,
      target_profile_id,
      details
    )
    values (
      actor,
      'comment.' || case p_status
        when 'visible' then 'restore'
        when 'hidden' then 'hide'
        else 'delete'
      end,
      v_comment.user_id,
      jsonb_build_object(
        'comment_id', v_comment.id,
        'post_id', v_comment.post_id,
        'from', v_comment.status,
        'to', p_status
      )
    );
  end if;

  return query
  select posts.id, posts.slug
  from public.posts
  where posts.id = v_comment.post_id;
end;
$$;

revoke all on function public.moderate_comment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.moderate_comment(uuid, text) to authenticated;

-- 5. Own comments ------------------------------------------------------------
--
-- The public post page is shared ISR output, so it cannot mark the visitor's
-- own comments. After hydration the browser asks which visible comments on
-- the post belong to the caller (to offer delete instead of report). Only
-- ids are returned; user_id stays unreadable.

create or replace function public.list_own_comment_ids(p_post_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select comments.id
  from public.comments
  where comments.post_id = p_post_id
    and comments.user_id = auth.uid()
    and comments.status = 'visible';
$$;

revoke all on function public.list_own_comment_ids(uuid)
  from public, anon, authenticated;
grant execute on function public.list_own_comment_ids(uuid) to authenticated;

-- 6. Account deletion --------------------------------------------------------
--
-- Same function as Phase 12 plus the Phase 13 hook: the caller's comments are
-- anonymized (user_id null; the anonymize trigger sets the neutral display
-- name; the body is kept) in the preflight transaction. The caller's reports
-- go with the profile cascade when the Auth user is deleted.

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

  -- Phase 12: private bookmarks.
  delete from public.bookmarks
  where bookmarks.user_id = actor;

  -- Phase 13: comments stay readable without the author's identity.
  update public.comments
  set user_id = null
  where comments.user_id = actor;
end;
$$;

revoke all on function public.prepare_own_account_deletion()
  from public, anon, authenticated;
grant execute on function public.prepare_own_account_deletion() to authenticated;
