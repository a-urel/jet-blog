-- Phase 12: private bookmarks.
--
-- A bookmark is a row owned by one signed-in user that points at a published
-- post. Bookmarks are private (decision D6): no policy lets anyone, including
-- editors and admins, read another user's rows, and no count is exposed.
--
--   1. The bookmarks table, its indexes, and explicit RLS.
--   2. A per-user rate limit on bookmark creation (Phase 10 mechanism).
--   3. Bookmark removal in the account-deletion preflight (Phase 11 hook).

-- 1. Table -------------------------------------------------------------------
--
-- Deletion behavior:
--   - user_id references profiles with ON DELETE CASCADE, and profiles cascade
--     from auth.users, so deleting an account removes its bookmarks even if
--     the preflight below did not run.
--   - post_id references posts with ON DELETE CASCADE, so a post removal (no UI
--     deletes posts yet) cannot leave orphan rows.
--   - Unpublishing keeps the row: the saved list filters to published posts,
--     so the post disappears from the list and returns if it is republished.

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint bookmarks_user_post_key unique (user_id, post_id)
);

-- Query patterns:
--   - bookmark state for the posts on a page: user_id = me and post_id in (...)
--     -> served by the (user_id, post_id) unique index;
--   - the saved list: user_id = me order by created_at desc;
--   - the post_id cascade on post deletion.
create index bookmarks_user_created_idx
  on public.bookmarks (user_id, created_at desc);

create index bookmarks_post_id_idx
  on public.bookmarks (post_id);

alter table public.bookmarks enable row level security;

revoke all on table public.bookmarks from anon, authenticated;
-- No update: a bookmark is created or deleted, never edited. user_id has a
-- default and the insert policy pins it to the caller.
grant select, delete on table public.bookmarks to authenticated;
grant insert (user_id, post_id) on table public.bookmarks to authenticated;

create policy bookmarks_select_own
on public.bookmarks
for select
to authenticated
using (user_id = (select auth.uid()));

-- Only as the caller, and only for a post that is published right now. The
-- explicit status check matters: editorial members can see drafts through the
-- posts select policy, but must not bookmark them.
create policy bookmarks_insert_own_published
on public.bookmarks
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    where posts.id = bookmarks.post_id
      and posts.status = 'published'
  )
);

create policy bookmarks_delete_own
on public.bookmarks
for delete
to authenticated
using (user_id = (select auth.uid()));

-- 2. Rate limit -------------------------------------------------------------
--
--   bookmark.create  60 per 10 minutes  insert into bookmarks
--
-- Only inserts are limited. Every delete needs an earlier insert, so the
-- insert budget also bounds save/unsave toggling, and the account-deletion
-- preflight can remove any number of bookmarks without hitting a limit.

create or replace function public.enforce_bookmark_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('bookmark.create', 60, interval '10 minutes');
  return new;
end;
$$;

create trigger bookmarks_enforce_write_rate_limit
before insert on public.bookmarks
for each row
execute function public.enforce_bookmark_write_rate_limit();

revoke all on function public.enforce_bookmark_write_rate_limit()
  from public, anon, authenticated;

-- 3. Account deletion --------------------------------------------------------
--
-- Same function as Phase 11 plus the Phase 12 hook: the caller's bookmarks
-- are removed in the preflight transaction. The profiles cascade stays the
-- safety net when the Auth user is deleted.
--
-- Hook still open for Phase 13: anonymize the caller's comments (user_id null,
-- neutral display-name snapshot, body kept) before the Auth user is deleted.

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
end;
$$;

revoke all on function public.prepare_own_account_deletion()
  from public, anon, authenticated;
grant execute on function public.prepare_own_account_deletion() to authenticated;
