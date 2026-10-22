-- Phase 6: media uploads.
--
-- D4 (answered 2026-10-22): one public bucket with UUID object paths and
-- server-side validation. Anyone who knows an object URL can fetch it, including
-- images that are only used by drafts. Revisit before public launch.
--
-- Binary files live in Storage; references and metadata live in public.media.
-- The object path is the media id, so a stored image node that references a
-- media id can derive its delivery URL without another lookup. Alt text and
-- captions belong to the image node in the post body, not to the media row.
--
-- Clients have no direct write grants on public.media. Registration and
-- deletion go through security-definer RPCs. Storage policies admit uploads
-- only from active editorial members, only at UUID paths, and only below a
-- per-user rate limit.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'media',
  'media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'media',
  object_path text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  mime_type text not null,
  size_bytes integer not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_bucket_id_check check (bucket_id = 'media'),
  constraint media_object_path_is_id check (object_path = id::text),
  constraint media_object_unique unique (bucket_id, object_path),
  constraint media_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  constraint media_size_bytes_check check (size_bytes between 1 and 5242880),
  constraint media_dimensions_check check (
    width between 1 and 10000 and height between 1 and 10000
  )
);

create index media_uploaded_by_idx on public.media (uploaded_by);
create index media_created_at_idx on public.media (created_at desc);

create trigger media_set_updated_at
before update on public.media
for each row
execute function public.set_updated_at();

alter table public.media enable row level security;

revoke all on table public.media from anon, authenticated;
grant select on table public.media to authenticated;

-- The media library is shared by the editorial team. Readers and anonymous
-- visitors do not need rows: published bodies carry the media id, dimensions,
-- and alt text.
create policy media_select_members
on public.media
for select
to authenticated
using (public.is_active_member());

-- Storage helpers run as the owner so policy checks do not depend on what the
-- caller may read.
create or replace function public.is_registered_media_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media
    where media.bucket_id = 'media'
      and media.object_path = p_name
  );
$$;

-- Twenty uploads per member in any ten-minute window. Storage enforces it in
-- the insert policy, so a client that bypasses the Server Action is limited too.
create or replace function public.media_upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.is_active_member()
    and (
      select count(*)
      from storage.objects
      where objects.bucket_id = 'media'
        and objects.owner_id = auth.uid()::text
        and objects.created_at > now() - interval '10 minutes'
    ) < 20;
$$;

revoke all on function public.is_registered_media_object(text)
  from public, anon, authenticated;
revoke all on function public.media_upload_allowed()
  from public, anon, authenticated;
grant execute on function public.is_registered_media_object(text)
  to authenticated;
grant execute on function public.media_upload_allowed() to authenticated;

-- Public delivery uses the public bucket URL and needs no select policy. Listing
-- and API downloads are limited to active members.
create policy media_objects_select_members
on storage.objects
for select
to authenticated
using (bucket_id = 'media' and public.is_active_member());

create policy media_objects_insert_members
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'media'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.media_upload_allowed()
);

-- No update policy: objects are immutable and uploads never upsert. An object
-- can be removed only after its media row is gone, by its uploader or an
-- editor. Registered objects are removed through delete_media first.
create policy media_objects_delete_unregistered
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'media'
  and public.is_active_member()
  and not public.is_registered_media_object(name)
  and (owner_id = (select auth.uid())::text or public.is_editor())
);

-- Registers an object the caller just uploaded. Type and size come from the
-- Storage metadata; dimensions come from the server, which parsed the file
-- header before uploading.
create or replace function public.register_media(
  p_media_id uuid,
  p_width integer,
  p_height integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_object storage.objects%rowtype;
  v_mime_type text;
  v_size bigint;
begin
  if p_media_id is null then
    raise exception 'Media id is required' using errcode = '22023';
  end if;

  select *
  into v_object
  from storage.objects
  where objects.bucket_id = 'media'
    and objects.name = p_media_id::text;

  if not found or v_object.owner_id is distinct from actor::text then
    raise exception 'Uploaded object not found' using errcode = 'P0002';
  end if;

  v_mime_type := v_object.metadata ->> 'mimetype';
  v_size := (v_object.metadata ->> 'size')::bigint;

  if v_mime_type is null
    or v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  then
    raise exception 'Unsupported media type' using errcode = '22023';
  end if;

  if v_size is null or v_size not between 1 and 5242880 then
    raise exception 'Invalid media size' using errcode = '22023';
  end if;

  if p_width is null or p_height is null
    or p_width not between 1 and 10000
    or p_height not between 1 and 10000
  then
    raise exception 'Invalid media dimensions' using errcode = '22023';
  end if;

  insert into public.media (
    id,
    object_path,
    uploaded_by,
    mime_type,
    size_bytes,
    width,
    height
  )
  values (
    p_media_id,
    p_media_id::text,
    actor,
    v_mime_type,
    v_size,
    p_width,
    p_height
  );

  return p_media_id;
exception
  when unique_violation then
    raise exception 'Media already registered' using errcode = '23505';
end;
$$;

-- Deletes a media row that no post references. The caller removes the Storage
-- object afterwards; the Storage delete policy admits it once the row is gone.
-- The row lock pairs with the key-share lock that assert_post_body takes, so a
-- concurrent post save either sees the row and blocks deletion or fails after
-- it is gone.
create or replace function public.delete_media(p_media_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_media public.media%rowtype;
begin
  select *
  into v_media
  from public.media
  where media.id = p_media_id
  for update;

  if not found then
    raise exception 'Media not found' using errcode = 'P0002';
  end if;

  if not (public.is_editor() or v_media.uploaded_by = actor) then
    raise exception 'Not allowed to delete this media' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.posts
    where jsonb_path_exists(
      posts.body,
      'strict $.** ? (@.type == "image" && @.attrs.mediaId == $id)',
      jsonb_build_object('id', p_media_id::text),
      true
    )
  ) then
    raise exception 'Media is used by a post' using errcode = '23503';
  end if;

  delete from public.media where media.id = p_media_id;

  return v_media.object_path;
end;
$$;

revoke all on function public.register_media(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.delete_media(uuid)
  from public, anon, authenticated;
grant execute on function public.register_media(uuid, integer, integer)
  to authenticated;
grant execute on function public.delete_media(uuid) to authenticated;
