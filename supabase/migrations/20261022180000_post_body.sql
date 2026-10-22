-- Phase 5: structured post bodies.
--
-- The body is a Tiptap/ProseMirror JSON document stored as JSONB with an
-- explicit content_version. The allowlist below mirrors
-- src/features/posts/content/schema.ts: supported nodes, marks, attribute keys,
-- parent/child rules, safe link schemes, size, and depth. Shared fixtures in
-- src/features/posts/content/fixtures.ts run against both implementations.
--
-- Validation runs in the authoring RPCs, which raise a specific error, and in a
-- CHECK constraint, so no write path (including service-role scripts or seeds)
-- can store an unsupported version-1 document.

create or replace function public.is_safe_post_href(p_href text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_href is not null
    and char_length(p_href) between 1 and 2048
    and p_href !~ '[[:cntrl:]]'
    and p_href ~* '^(?:https?://[^\s"<>\\]+|mailto:[^\s"<>\\]+|/(?:[^/\s"<>\\][^\s"<>\\]*)?|#[^\s"<>\\]*)$';
$$;

create or replace function public.post_body_node_error(
  p_node jsonb,
  p_depth integer,
  p_in_code_block boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text;
  v_rule text;
  v_attrs jsonb;
  v_mark jsonb;
  v_mark_type text;
  v_seen_marks text[] := '{}'::text[];
  v_child jsonb;
  v_child_type text;
  v_index bigint;
  v_allowed boolean;
  v_error text;
begin
  if p_depth > 24 then
    return 'Document is nested too deeply';
  end if;

  if jsonb_typeof(p_node) is distinct from 'object'
    or jsonb_typeof(p_node -> 'type') is distinct from 'string'
  then
    return 'Invalid node';
  end if;

  v_type := p_node ->> 'type';

  v_rule := case v_type
    when 'doc' then 'block+'
    when 'blockquote' then 'block+'
    when 'paragraph' then 'inline*'
    when 'heading' then 'inline*'
    when 'bulletList' then 'listItem+'
    when 'orderedList' then 'listItem+'
    when 'listItem' then 'listItem'
    when 'codeBlock' then 'text*'
    when 'horizontalRule' then 'none'
    when 'hardBreak' then 'none'
    when 'text' then 'text'
    else null
  end;

  if v_rule is null then
    return 'Unsupported node: ' || v_type;
  end if;

  if v_type = 'text' then
    if exists (
      select 1
      from jsonb_object_keys(p_node) as keys(key)
      where key not in ('type', 'text', 'marks')
    ) then
      return 'Invalid text node';
    end if;

    if jsonb_typeof(p_node -> 'text') is distinct from 'string'
      or p_node ->> 'text' = ''
    then
      return 'Text nodes must not be empty';
    end if;

    if not p_node ? 'marks' then
      return null;
    end if;

    if jsonb_typeof(p_node -> 'marks') is distinct from 'array'
      or jsonb_array_length(p_node -> 'marks') = 0
    then
      return 'Marks must be a non-empty array';
    end if;

    if p_in_code_block then
      return 'Code block text cannot have marks';
    end if;

    for v_mark in
      select value from jsonb_array_elements(p_node -> 'marks') as marks(value)
    loop
      if jsonb_typeof(v_mark) is distinct from 'object'
        or jsonb_typeof(v_mark -> 'type') is distinct from 'string'
      then
        return 'Invalid mark';
      end if;

      v_mark_type := v_mark ->> 'type';

      if v_mark_type not in ('bold', 'italic', 'strike', 'code', 'link') then
        return 'Unsupported mark: ' || v_mark_type;
      end if;

      if v_mark_type = any (v_seen_marks) then
        return 'Duplicate mark: ' || v_mark_type;
      end if;

      v_seen_marks := array_append(v_seen_marks, v_mark_type);

      if v_mark_type = 'link' then
        if exists (
          select 1
          from jsonb_object_keys(v_mark) as keys(key)
          where key not in ('type', 'attrs')
        )
          or jsonb_typeof(v_mark -> 'attrs') is distinct from 'object'
        then
          return 'Invalid link mark';
        end if;

        if exists (
          select 1
          from jsonb_object_keys(v_mark -> 'attrs') as keys(key)
          where key <> 'href'
        ) then
          return 'Invalid link attributes';
        end if;

        if jsonb_typeof(v_mark -> 'attrs' -> 'href') is distinct from 'string'
          or not public.is_safe_post_href(v_mark -> 'attrs' ->> 'href')
        then
          return 'Unsafe link href';
        end if;
      elsif exists (
        select 1
        from jsonb_object_keys(v_mark) as keys(key)
        where key <> 'type'
      ) then
        return 'Mark ' || v_mark_type || ' does not accept attributes';
      end if;
    end loop;

    return null;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_node) as keys(key)
    where key not in ('type', 'attrs', 'content')
  ) then
    return 'Invalid keys on ' || v_type;
  end if;

  v_attrs := p_node -> 'attrs';

  if v_type = 'heading' then
    if jsonb_typeof(v_attrs) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_attrs) as keys(key)
        where key <> 'level'
      )
      or jsonb_typeof(v_attrs -> 'level') is distinct from 'number'
      or (v_attrs ->> 'level')::numeric not in (2, 3, 4)
    then
      return 'Invalid heading level';
    end if;
  elsif v_type = 'orderedList' then
    if p_node ? 'attrs' and (
      jsonb_typeof(v_attrs) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_attrs) as keys(key)
        where key <> 'start'
      )
      or jsonb_typeof(v_attrs -> 'start') is distinct from 'number'
      or (v_attrs ->> 'start')::numeric <> trunc((v_attrs ->> 'start')::numeric)
      or (v_attrs ->> 'start')::numeric not between 1 and 9999
    ) then
      return 'Invalid ordered list start';
    end if;
  elsif v_type = 'codeBlock' then
    if p_node ? 'attrs' and (
      jsonb_typeof(v_attrs) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_attrs) as keys(key)
        where key <> 'language'
      )
      or jsonb_typeof(v_attrs -> 'language') is distinct from 'string'
      or (v_attrs ->> 'language') !~ '^[a-z0-9+#-]{1,32}$'
    ) then
      return 'Invalid code block language';
    end if;
  elsif p_node ? 'attrs' then
    return 'Node ' || v_type || ' does not accept attributes';
  end if;

  if v_rule = 'none' then
    if p_node ? 'content' then
      return v_type || ' cannot have content';
    end if;

    return null;
  end if;

  if not p_node ? 'content' then
    if v_rule in ('inline*', 'text*') then
      return null;
    end if;

    return v_type || ' must not be empty';
  end if;

  if jsonb_typeof(p_node -> 'content') is distinct from 'array' then
    return 'Invalid content on ' || v_type;
  end if;

  if v_rule in ('block+', 'listItem+', 'listItem')
    and jsonb_array_length(p_node -> 'content') = 0
  then
    return v_type || ' must not be empty';
  end if;

  for v_child, v_index in
    select value, ordinality
    from jsonb_array_elements(p_node -> 'content') with ordinality
  loop
    if jsonb_typeof(v_child) is distinct from 'object'
      or jsonb_typeof(v_child -> 'type') is distinct from 'string'
    then
      return 'Invalid node';
    end if;

    v_child_type := v_child ->> 'type';

    v_allowed := case v_rule
      when 'block+' then v_child_type in (
        'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote',
        'codeBlock', 'horizontalRule'
      )
      when 'inline*' then v_child_type in ('text', 'hardBreak')
      when 'text*' then v_child_type = 'text'
      when 'listItem+' then v_child_type = 'listItem'
      -- Matches Tiptap's "paragraph block*".
      when 'listItem' then case
        when v_index = 1 then v_child_type = 'paragraph'
        else v_child_type in (
          'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote',
          'codeBlock', 'horizontalRule'
        )
      end
      else false
    end;

    if not v_allowed then
      return v_child_type || ' is not allowed inside ' || v_type;
    end if;

    v_error := public.post_body_node_error(
      v_child,
      p_depth + 1,
      v_type = 'codeBlock'
    );

    if v_error is not null then
      return v_error;
    end if;
  end loop;

  return null;
end;
$$;

-- Returns null for a valid version-1 document, otherwise the first problem.
create or replace function public.post_body_error(p_body jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_body) is distinct from 'object'
    or p_body ->> 'type' is distinct from 'doc'
  then
    return 'Root must be a doc node';
  end if;

  if char_length(p_body::text) > 200000 then
    return 'Document is too large';
  end if;

  return public.post_body_node_error(p_body, 0, false);
end;
$$;

alter table public.posts
  add column body jsonb not null
    default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  add column content_version smallint not null default 1,
  add constraint posts_content_version_positive check (content_version >= 1),
  -- Version 1 documents must match the allowlist. A future version adds its
  -- own validator; the renderer shows a controlled fallback until it ships.
  add constraint posts_body_valid check (
    content_version <> 1 or public.post_body_error(body) is null
  );

create or replace function public.assert_post_body(
  p_body jsonb,
  p_content_version integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_error text;
begin
  if p_content_version is distinct from 1 then
    raise exception 'Unsupported content version' using errcode = '22023';
  end if;

  v_error := public.post_body_error(p_body);

  if v_error is not null then
    raise exception 'Invalid post body: %', v_error using errcode = '22023';
  end if;
end;
$$;

-- The authoring RPCs gain body parameters. Drop the Phase 4 signatures so
-- PostgREST cannot resolve a call to an overload that skips body validation.
drop function public.create_draft_post(text, text, text, uuid, uuid[], jsonb);
drop function public.update_post_metadata(
  uuid,
  integer,
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb
);

create function public.create_draft_post(
  p_title text,
  p_slug text,
  p_excerpt text,
  p_category_id uuid,
  p_tag_ids uuid[],
  p_credits jsonb,
  p_body jsonb,
  p_content_version integer
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
    content_version
  )
  values (
    v_title,
    v_slug,
    v_excerpt,
    p_category_id,
    'draft',
    actor,
    p_body,
    p_content_version
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
  p_content_version integer
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
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  perform public.replace_post_relations(p_post_id, p_tag_ids, p_credits);

  return query select p_post_id, v_post.revision + 1;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

-- Validation helpers stay internal. The CHECK constraint calls them as the
-- table owner, so clients do not need execute grants.
revoke all on function public.is_safe_post_href(text)
  from public, anon, authenticated;
revoke all on function public.post_body_node_error(jsonb, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.post_body_error(jsonb)
  from public, anon, authenticated;
revoke all on function public.assert_post_body(jsonb, integer)
  from public, anon, authenticated;

revoke all on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer
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
  integer
) from public, anon, authenticated;

grant execute on function public.create_draft_post(
  text,
  text,
  text,
  uuid,
  uuid[],
  jsonb,
  jsonb,
  integer
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
  integer
) to authenticated;
