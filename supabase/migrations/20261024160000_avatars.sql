-- Profile pictures (avatars) for accounts and public author identities.
--
-- Two separate concepts get two separate avatars:
--   * profiles.avatar_id: the account holder's own picture, set by that user
--     at /account. It appears next to their comments.
--   * authors.avatar_id: the public author identity's picture, set by admins
--     at /admin/authors. It appears in bylines and on the author archive.
-- An author identity never falls back to its linked account's avatar: equal
-- pictures would reveal that authors.user_id points at that account, and the
-- link must stay unreadable.
--
-- Storage: one public `avatars` bucket, separate from post media (decision
-- D4 covers media only). Objects are immutable and named by kind and a fresh
-- UUID: `profiles/<uuid>` or `authors/<uuid>`. The path carries no user or
-- author id, so a public URL links nothing. A replaced or removed avatar is
-- deleted by the server right after the RPC detaches it.
--
-- Comments: the avatar follows the commenter's live profile picture, unlike
-- the display-name snapshot. Replacing or removing an avatar deletes the old
-- object, so a snapshot would point at a missing file, and a reader who
-- removes their picture expects it gone from public pages. comments.avatar_id
-- is a denormalized copy kept in sync by set_own_avatar(), so public reads
-- still need no access to profiles, and the RPC returns the affected posts
-- for per-post cache invalidation. Anonymization (account deletion) clears it.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2. Columns -----------------------------------------------------------------
--
-- The column holds the UUID part of the object name; the kind prefix follows
-- from the table. Unique, so one object backs at most one profile or author.

alter table public.profiles add column avatar_id uuid unique;
alter table public.authors add column avatar_id uuid unique;
alter table public.comments add column avatar_id uuid;

-- profiles keeps its whole-table select grant (own row or admin) and its
-- display_name-only update grant: avatar_id changes only through
-- set_own_avatar(). The author and comment avatar columns are public.
grant select (avatar_id) on table public.authors to anon, authenticated;
grant select (avatar_id) on table public.comments to anon, authenticated;

-- 3. Storage helpers and policies --------------------------------------------

-- True when a profile or author currently uses the object. Security definer so
-- the delete policy does not depend on what the caller may read.
create or replace function public.is_attached_avatar_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name !~ '^(profiles|authors)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_id := split_part(p_name, '/', 2)::uuid;

  if split_part(p_name, '/', 1) = 'profiles' then
    return exists (select 1 from public.profiles where profiles.avatar_id = v_id);
  end if;

  return exists (select 1 from public.authors where authors.avatar_id = v_id);
end;
$$;

-- Any signed-in account may upload its own picture under profiles/; only
-- active admins may upload under authors/. Ten uploads per user in any
-- ten-minute window, counted from Storage like the media limit, so a client
-- that bypasses the Server Action is limited too.
create or replace function public.avatar_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      p_name ~ '^profiles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (
        p_name ~ '^authors/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.is_admin()
      )
    )
    and (
      select count(*)
      from storage.objects
      where objects.bucket_id = 'avatars'
        and objects.owner_id = auth.uid()::text
        and objects.created_at > now() - interval '10 minutes'
    ) < 10;
$$;

-- Who may see (list, download through the API) and remove an object: its
-- uploader for profiles/, any active admin for authors/. Public delivery uses
-- the public bucket URL and needs no policy.
create or replace function public.can_manage_avatar_object(p_name text, p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      (p_name like 'profiles/%' and p_owner_id = auth.uid()::text)
      or (p_name like 'authors/%' and public.is_admin())
    );
$$;

revoke all on function public.is_attached_avatar_object(text)
  from public, anon, authenticated;
revoke all on function public.avatar_upload_allowed(text)
  from public, anon, authenticated;
revoke all on function public.can_manage_avatar_object(text, text)
  from public, anon, authenticated;
grant execute on function public.is_attached_avatar_object(text) to authenticated;
grant execute on function public.avatar_upload_allowed(text) to authenticated;
grant execute on function public.can_manage_avatar_object(text, text) to authenticated;

create policy avatars_objects_select_manager
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and public.can_manage_avatar_object(name, owner_id)
);

create policy avatars_objects_insert_allowed
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and public.avatar_upload_allowed(name)
);

-- No update policy: objects are immutable and uploads never upsert. An object
-- in use is detached by its RPC first, then removed.
create policy avatars_objects_delete_detached
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and public.can_manage_avatar_object(name, owner_id)
  and not public.is_attached_avatar_object(name)
);

-- 4. Attaching an uploaded object --------------------------------------------
--
-- Type and size come from the Storage metadata, which the server set after
-- checking the file signature; the bucket allowlist and size limit apply
-- before that. The object must belong to the caller, so nobody can attach an
-- upload of someone else.

create or replace function public.assert_avatar_object(
  p_kind text,
  p_avatar_id uuid,
  p_owner uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb;
  v_mime_type text;
  v_size bigint;
begin
  select objects.metadata
  into v_metadata
  from storage.objects
  where objects.bucket_id = 'avatars'
    and objects.name = p_kind || '/' || p_avatar_id::text
    and objects.owner_id = p_owner::text;

  if not found then
    raise exception 'Uploaded avatar not found' using errcode = 'P0002';
  end if;

  v_mime_type := v_metadata ->> 'mimetype';
  v_size := (v_metadata ->> 'size')::bigint;

  if v_mime_type is null
    or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
  then
    raise exception 'Unsupported avatar type' using errcode = '22023';
  end if;

  if v_size is null or v_size not between 1 and 2097152 then
    raise exception 'Invalid avatar size' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_avatar_object(text, uuid, uuid)
  from public, anon, authenticated;

-- 5. Own avatar --------------------------------------------------------------
--
--   avatar.update  10 per hour  set or remove the caller's avatar
--
-- p_avatar_id null removes the avatar. Returns the previous avatar id (null
-- when nothing was detached), which the server deletes from Storage, and the
-- posts whose comments now show the new picture, for cache invalidation.

create or replace function public.set_own_avatar(p_avatar_id uuid)
returns table (previous_avatar_id uuid, post_ids uuid[], post_slugs text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_previous uuid;
  v_post_ids uuid[];
  v_post_slugs text[];
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform public.consume_rate_limit('avatar.update', 10, interval '1 hour');

  select profiles.avatar_id
  into v_previous
  from public.profiles
  where profiles.id = actor
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if p_avatar_id is not distinct from v_previous then
    return query select null::uuid, '{}'::uuid[], '{}'::text[];
    return;
  end if;

  if p_avatar_id is not null then
    perform public.assert_avatar_object('profiles', p_avatar_id, actor);
  end if;

  update public.profiles
  set avatar_id = p_avatar_id
  where profiles.id = actor;

  with changed as (
    update public.comments
    set avatar_id = p_avatar_id
    where comments.user_id = actor
    returning comments.post_id
  )
  select
    coalesce(array_agg(posts.id), '{}'),
    coalesce(array_agg(posts.slug), '{}')
  into v_post_ids, v_post_slugs
  from public.posts
  where posts.id in (select changed.post_id from changed);

  return query select v_previous, v_post_ids, v_post_slugs;
end;
$$;

revoke all on function public.set_own_avatar(uuid)
  from public, anon, authenticated;
grant execute on function public.set_own_avatar(uuid) to authenticated;

-- 6. Author avatar (admin) ---------------------------------------------------
--
-- Same guard as the other author RPCs: active admin, author.write rate limit,
-- stale-form check on updated_at, and an audit entry. Returns the previous
-- avatar id for Storage cleanup. delete_author keeps its signature; the
-- Server Action removes the deleted author's object afterwards.

create or replace function public.set_author_avatar(
  p_author_id uuid,
  p_expected_updated_at timestamptz,
  p_avatar_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_author_admin();
  v_current public.authors%rowtype;
begin
  select *
  into v_current
  from public.authors
  where authors.id = p_author_id
  for update;

  if not found then
    raise exception 'Author not found' using errcode = 'P0002';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Author changed since it was loaded' using errcode = '40001';
  end if;

  if p_avatar_id is not distinct from v_current.avatar_id then
    return null;
  end if;

  if p_avatar_id is not null then
    perform public.assert_avatar_object('authors', p_avatar_id, actor);
  end if;

  update public.authors
  set avatar_id = p_avatar_id
  where authors.id = p_author_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    case when p_avatar_id is null then 'author.avatar_removed' else 'author.avatar_set' end,
    null,
    jsonb_build_object('author_id', p_author_id, 'slug', v_current.slug)
  );

  return v_current.avatar_id;
end;
$$;

revoke all on function public.set_author_avatar(uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.set_author_avatar(uuid, timestamptz, uuid)
  to authenticated;

-- 7. Comments ------------------------------------------------------------------
--
-- The insert trigger copies the current avatar with the display name; the
-- anonymize trigger clears it with the name. Both bodies are otherwise the
-- Phase 13 versions.

create or replace function public.prepare_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then
    select profiles.display_name, profiles.avatar_id
    into new.display_name, new.avatar_id
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

create or replace function public.anonymize_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := 'Silinmiş kullanıcı';
  new.avatar_id := null;
  return new;
end;
$$;

-- Comments anonymized before this migration had no avatar; nothing to clear.

-- 8. Account deletion ----------------------------------------------------------
--
-- Same function as Phase 13 plus the avatar hook: the profile avatar is
-- detached in the preflight transaction (comment avatars are cleared by the
-- anonymize trigger). The account action then removes the caller's avatar
-- objects through Storage, which the delete policy admits once nothing uses
-- them, before the Auth user is deleted.

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

  -- Avatars: the account picture leaves with the account.
  update public.profiles
  set avatar_id = null
  where profiles.id = actor;
end;
$$;

revoke all on function public.prepare_own_account_deletion()
  from public, anon, authenticated;
grant execute on function public.prepare_own_account_deletion() to authenticated;
