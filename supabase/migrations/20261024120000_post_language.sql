-- Post language.
--
-- Each post is written in one language, stored as a BCP 47 primary language
-- subtag. Translations are not linked to each other yet; a nullable
-- translation group can be added later without changing this column. The
-- allowed set mirrors src/features/posts/language.ts. The interface language
-- is independent of this value.
--
-- Existing posts were all written in Turkish, so the default backfills them.

alter table public.posts
  add column language text not null default 'tr'
    constraint posts_language_check check (language in ('tr', 'en', 'de'));

create or replace function public.assert_post_language(p_language text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_language is null or p_language not in ('tr', 'en', 'de') then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_post_language(text)
  from public, anon, authenticated;

-- The authoring RPCs gain a required language parameter. Drop the previous
-- signatures so PostgREST cannot resolve a call that skips the language.
drop function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer
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
  integer
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
  p_language text
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
    language
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
    p_language
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
  p_language text
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
  text
) to authenticated;
