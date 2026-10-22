-- Phase 4: centralized draft-authoring mutations.
--
-- Clients still have no direct write grants on content tables. Every metadata
-- write goes through one security-definer RPC so authorization, revision
-- comparison, taxonomy validation, and relation replacement happen in a single
-- transaction. A stale form is rejected instead of overwriting another edit.

-- Active editorial membership is required for every content mutation. Authors
-- remain limited to their own drafts by the per-post check below.
create or replace function public.require_active_editorial_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_active_member() then
    raise exception 'Editorial access required' using errcode = '42501';
  end if;

  return actor;
end;
$$;

create or replace function public.assert_post_metadata(
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_post_status public.post_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_title is null or char_length(p_title) not between 1 and 200 then
    raise exception 'Title must be between 1 and 200 characters'
      using errcode = '22023';
  end if;

  if p_slug is null
    or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(p_slug) > 200
  then
    raise exception 'Invalid slug' using errcode = '22023';
  end if;

  if p_excerpt is not null and char_length(p_excerpt) > 500 then
    raise exception 'Excerpt must be at most 500 characters'
      using errcode = '22023';
  end if;

  if p_category_id is not null
    and not exists (
      select 1
      from public.categories
      where categories.id = p_category_id
    )
  then
    raise exception 'Invalid category' using errcode = '22023';
  end if;

  if p_post_status = 'published' and p_category_id is null then
    raise exception 'Published post requires a category' using errcode = '23514';
  end if;
end;
$$;

-- Validate and replace both relation sets. Credited authors arrive as explicit
-- objects because sort_order is part of the contract. The function rejects
-- invalid UUIDs, unknown categories/authors/tags, duplicate credits, and
-- non-contiguous or out-of-range sort orders before writing anything.
create or replace function public.replace_post_relations(
  p_post_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag_ids uuid[] := coalesce(p_tag_ids, '{}'::uuid[]);
  v_credits jsonb := coalesce(p_credits, '[]'::jsonb);
  v_entry jsonb;
  v_author_text text;
  v_sort_text text;
  v_author_id uuid;
  v_sort_order integer;
  v_author_ids uuid[] := '{}'::uuid[];
  v_sort_orders integer[] := '{}'::integer[];
  v_found_count integer;
begin
  if jsonb_typeof(v_credits) <> 'array' then
    raise exception 'Invalid author credits' using errcode = '22023';
  end if;

  if cardinality(v_tag_ids) > 0 then
    if exists (
      select 1
      from unnest(v_tag_ids) as tag_id
      where tag_id is null
    ) then
      raise exception 'Invalid tag' using errcode = '22023';
    end if;

    select count(distinct tag_id)
    into v_found_count
    from unnest(v_tag_ids) as tag_id;

    if v_found_count <> cardinality(v_tag_ids) then
      raise exception 'Duplicate tag' using errcode = '22023';
    end if;

    select count(*)
    into v_found_count
    from public.tags
    where tags.id = any (v_tag_ids);

    if v_found_count <> cardinality(v_tag_ids) then
      raise exception 'Invalid tag' using errcode = '22023';
    end if;
  end if;

  for v_entry in
    select value from jsonb_array_elements(v_credits) as credits(value)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'Invalid author credit' using errcode = '22023';
    end if;

    v_author_text := v_entry ->> 'author_id';
    v_sort_text := v_entry ->> 'sort_order';

    if v_author_text is null
      or v_author_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'Invalid author credit' using errcode = '22023';
    end if;

    if v_sort_text is null or v_sort_text !~ '^[0-9]+$' then
      raise exception 'Author credit sort order must be an integer'
        using errcode = '22023';
    end if;

    v_author_id := v_author_text::uuid;
    v_sort_order := v_sort_text::integer;

    if v_sort_order > 999 then
      raise exception 'Author credit sort order must be between 0 and 999'
        using errcode = '22023';
    end if;

    if v_author_id = any (v_author_ids) then
      raise exception 'Duplicate author credit' using errcode = '22023';
    end if;

    if v_sort_order = any (v_sort_orders) then
      raise exception 'Duplicate author credit sort order'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.authors
      where authors.id = v_author_id
    ) then
      raise exception 'Invalid author credit' using errcode = '22023';
    end if;

    v_author_ids := array_append(v_author_ids, v_author_id);
    v_sort_orders := array_append(v_sort_orders, v_sort_order);
  end loop;

  if cardinality(v_sort_orders) > 0 then
    if (select min(value) from unnest(v_sort_orders) as value) <> 0
      or (select max(value) from unnest(v_sort_orders) as value)
        <> cardinality(v_sort_orders) - 1
    then
      raise exception 'Author credit sort order must be contiguous from 0'
        using errcode = '22023';
    end if;
  end if;

  delete from public.post_tags where post_tags.post_id = p_post_id;
  delete from public.post_authors where post_authors.post_id = p_post_id;

  if cardinality(v_tag_ids) > 0 then
    insert into public.post_tags (post_id, tag_id)
    select p_post_id, tag_id
    from unnest(v_tag_ids) as tag_id;
  end if;

  if cardinality(v_author_ids) > 0 then
    for i in 1..cardinality(v_author_ids) loop
      insert into public.post_authors (post_id, author_id, sort_order)
      values (p_post_id, v_author_ids[i], v_sort_orders[i]);
    end loop;
  end if;
end;
$$;

create or replace function public.create_draft_post(
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb
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

  if exists (select 1 from public.posts where posts.slug = v_slug) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  insert into public.posts (
    title,
    slug,
    excerpt,
    category_id,
    status,
    created_by
  )
  values (
    v_title,
    v_slug,
    v_excerpt,
    p_category_id,
    'draft',
    actor
  )
  returning posts.id, posts.revision into v_post_id, v_revision;

  perform public.replace_post_relations(v_post_id, p_tag_ids, p_credits);

  return query select v_post_id, v_revision;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

create or replace function public.update_post_metadata(
  p_post_id uuid,
  p_expected_revision integer,
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb
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
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  perform public.replace_post_relations(p_post_id, p_tag_ids, p_credits);

  return query select p_post_id, v_post.revision + 1;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

-- Active editorial members need the full author list to build credits. The
-- column grant still hides authors.user_id from every client.
create policy authors_select_editorial
on public.authors
for select
to authenticated
using (public.is_active_member());

revoke all on function public.require_active_editorial_actor()
  from public, anon, authenticated;
revoke all on function public.assert_post_metadata(
  text,
  text,
  text,
  uuid,
  public.post_status
) from public, anon, authenticated;
revoke all on function public.replace_post_relations(uuid, uuid[], jsonb)
  from public, anon, authenticated;

revoke all on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb
) from public, anon, authenticated;
revoke all on function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb
) to authenticated;
grant execute on function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb
) to authenticated;
