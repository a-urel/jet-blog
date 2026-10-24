-- Post cover image.
--
-- A post may reference one registered media row as its cover. The reference
-- lives on the post, outside the editor document, and carries its own alt text
-- because a description belongs to the occurrence, not to the file (the same
-- media can be a cover here and a body image elsewhere).
--
-- The foreign key restricts deletion, so a cover can never point at a removed
-- media row; delete_media also checks covers explicitly to report a clear
-- error. Drafts may keep a cover without alt text while they are written;
-- publishing requires it (publish_post and the CHECK constraint below).
--
-- Public readers get the cover id and alt from the posts row. They still have
-- no access to media rows: delivery URLs derive from the id (D4), and the
-- renderers use a fixed aspect ratio, so no dimensions are needed.

alter table public.posts
  add column cover_media_id uuid
    references public.media (id) on delete restrict,
  add column cover_alt text,
  add constraint posts_cover_alt_format check (
    cover_alt is null
    or (
      cover_alt = btrim(cover_alt)
      and char_length(cover_alt) between 1 and 300
      and cover_alt !~ '[[:cntrl:]]'
    )
  ),
  add constraint posts_cover_alt_requires_cover check (
    cover_alt is null or cover_media_id is not null
  ),
  add constraint posts_published_cover_requires_alt check (
    status <> 'published' or cover_media_id is null or cover_alt is not null
  );

-- Serves the foreign-key check on media deletion and the cover reference
-- check in delete_media.
create index posts_cover_media_id_idx
  on public.posts (cover_media_id)
  where cover_media_id is not null;

-- Validates a cover reference and returns the normalized alt text. The cover
-- must be a registered image; the key-share lock pairs with the row lock in
-- delete_media, like assert_post_body does for body images.
create or replace function public.assert_post_cover(
  p_cover_media_id uuid,
  p_cover_alt text,
  p_status public.post_status
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alt text := nullif(btrim(coalesce(p_cover_alt, '')), '');
  v_mime_type text;
begin
  if p_cover_media_id is null then
    if v_alt is not null then
      raise exception 'Cover alt text requires a cover image'
        using errcode = '22023';
    end if;

    return null;
  end if;

  select media.mime_type
  into v_mime_type
  from public.media
  where media.id = p_cover_media_id
  for key share;

  if not found then
    raise exception 'Unknown cover media' using errcode = '22023';
  end if;

  if v_mime_type not like 'image/%' then
    raise exception 'Cover media must be an image' using errcode = '22023';
  end if;

  if v_alt is not null
    and (char_length(v_alt) > 300 or v_alt ~ '[[:cntrl:]]')
  then
    raise exception 'Invalid cover alt text' using errcode = '22023';
  end if;

  if p_status = 'published' and v_alt is null then
    raise exception 'Cover alt text is required to publish'
      using errcode = '23514';
  end if;

  return v_alt;
end;
$$;

revoke all on function public.assert_post_cover(uuid, text, public.post_status)
  from public, anon, authenticated;

-- The authoring RPCs gain required cover parameters. Drop the previous
-- signatures so PostgREST cannot resolve a call that skips them, which would
-- otherwise clear an existing cover without the caller knowing about covers.
drop function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text
);
drop function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text
);

create function public.create_draft_post(
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb,
  p_body jsonb,
  p_content_version integer,
  p_language text,
  p_cover_media_id uuid,
  p_cover_alt text
)
returns table (post_id uuid, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_title text;
  v_slug text;
  v_excerpt text;
  v_cover_alt text;
  v_post_id uuid;
  v_revision integer;
begin
  v_title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_excerpt := nullif(btrim(coalesce(p_excerpt, '')), '');

  perform public.assert_post_metadata(
    v_title,
    v_slug,
    v_excerpt,
    p_category_id,
    'draft'::public.post_status
  );
  perform public.assert_post_language(p_language);
  perform public.assert_post_body(p_body, p_content_version);
  v_cover_alt := public.assert_post_cover(
    p_cover_media_id,
    p_cover_alt,
    'draft'::public.post_status
  );

  if exists (select 1 from public.posts where posts.slug = v_slug) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  insert into public.posts (
    title,
    slug,
    excerpt,
    category_id,
    status,
    created_by,
    body,
    content_version,
    language,
    cover_media_id,
    cover_alt
  )
  values (
    v_title,
    v_slug,
    v_excerpt,
    p_category_id,
    'draft',
    actor,
    p_body,
    p_content_version,
    p_language,
    p_cover_media_id,
    v_cover_alt
  )
  returning posts.id, posts.revision into v_post_id, v_revision;

  perform public.replace_post_relations(v_post_id, p_tag_ids, p_credits);

  return query select v_post_id, v_revision;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

create function public.update_post_metadata(
  p_post_id uuid,
  p_expected_revision integer,
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb,
  p_body jsonb,
  p_content_version integer,
  p_language text,
  p_cover_media_id uuid,
  p_cover_alt text
)
returns table (post_id uuid, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_post public.posts%rowtype;
  v_title text;
  v_slug text;
  v_excerpt text;
  v_cover_alt text;
begin
  select *
  into v_post
  from public.posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  -- Editors and admins may edit any post, including published ones. Authors may
  -- edit only their own drafts. A credited author does not gain edit access.
  if not (
    public.is_editor()
    or (v_post.created_by = actor and v_post.status = 'draft')
  ) then
    raise exception 'Not allowed to edit this post' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_post.revision <> p_expected_revision then
    raise exception 'This post changed since the form was loaded'
      using errcode = '40001';
  end if;

  v_title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_excerpt := nullif(btrim(coalesce(p_excerpt, '')), '');

  perform public.assert_post_metadata(
    v_title,
    v_slug,
    v_excerpt,
    p_category_id,
    v_post.status
  );
  perform public.assert_post_language(p_language);
  perform public.assert_post_body(p_body, p_content_version);
  -- A published post keeps the publish rule: its cover needs alt text.
  v_cover_alt := public.assert_post_cover(
    p_cover_media_id,
    p_cover_alt,
    v_post.status
  );

  if exists (
    select 1
    from public.posts
    where posts.slug = v_slug
      and posts.id <> p_post_id
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  update public.posts
  set title = v_title,
      slug = v_slug,
      excerpt = v_excerpt,
      category_id = p_category_id,
      body = p_body,
      content_version = p_content_version,
      language = p_language,
      cover_media_id = p_cover_media_id,
      cover_alt = v_cover_alt,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  perform public.replace_post_relations(p_post_id, p_tag_ids, p_credits);

  return query select p_post_id, v_post.revision + 1;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

revoke all on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text,
  uuid,
  text
) to authenticated;
grant execute on function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer,
  text,
  uuid,
  text
) to authenticated;

-- Publishing re-checks the cover: it must still be a registered image and,
-- when set, carry alt text. The signature is unchanged, so grants remain.
create or replace function public.publish_post(
  p_post_id uuid,
  p_expected_revision integer
)
returns table (post_id uuid, revision integer, slug text, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_post public.posts%rowtype;
  v_published_at timestamptz := now();
begin
  if not public.is_editor() then
    raise exception 'Not allowed to publish posts' using errcode = '42501';
  end if;

  select *
  into v_post
  from public.posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_post.revision <> p_expected_revision then
    raise exception 'This post changed since the page was loaded'
      using errcode = '40001';
  end if;

  if v_post.status <> 'draft' then
    raise exception 'Only a draft can be published' using errcode = '55000';
  end if;

  if v_post.category_id is null then
    raise exception 'Published post requires a category' using errcode = '23514';
  end if;

  perform public.assert_post_body(v_post.body, v_post.content_version);
  perform public.assert_post_cover(
    v_post.cover_media_id,
    v_post.cover_alt,
    'published'::public.post_status
  );

  update public.posts
  set status = 'published',
      published_at = v_published_at,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  return query
  select p_post_id, v_post.revision + 1, v_post.slug, v_published_at;
end;
$$;

-- Media deletion treats a cover like a body reference. The signature is
-- unchanged, so grants remain. The foreign key repeats the cover check.
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
    where posts.cover_media_id = p_media_id
      or jsonb_path_exists(
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
