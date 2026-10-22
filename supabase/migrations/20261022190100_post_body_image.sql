-- Phase 6: image nodes in post bodies.
--
-- Adds the `image` block node to the version-1 allowlist. The TypeScript
-- allowlist (src/features/posts/content/schema.ts), the Tiptap extensions, the
-- renderer, and the shared fixtures change in the same commit.
--
-- An image node references media by id and carries its intrinsic dimensions
-- and occurrence-specific alt text and caption:
--   { "type": "image",
--     "attrs": { "mediaId": uuid, "width": int, "height": int, "alt": text,
--                "caption"?: text, "decorative"?: true } }
-- Signed or public URLs are never stored; renderers derive the delivery URL.
--
-- The CHECK constraint posts_body_valid calls post_body_error, which calls the
-- replaced node validator, so existing rows stay valid (no node was removed).

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
  v_alt text;
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
    when 'image' then 'none'
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
  elsif v_type = 'image' then
    if jsonb_typeof(v_attrs) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_attrs) as keys(key)
        where key not in (
          'mediaId', 'width', 'height', 'alt', 'caption', 'decorative'
        )
      )
    then
      return 'Invalid image attributes';
    end if;

    if jsonb_typeof(v_attrs -> 'mediaId') is distinct from 'string'
      or (v_attrs ->> 'mediaId')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      return 'Invalid image media reference';
    end if;

    if jsonb_typeof(v_attrs -> 'width') is distinct from 'number'
      or jsonb_typeof(v_attrs -> 'height') is distinct from 'number'
      or (v_attrs ->> 'width')::numeric <> trunc((v_attrs ->> 'width')::numeric)
      or (v_attrs ->> 'height')::numeric <> trunc((v_attrs ->> 'height')::numeric)
      or (v_attrs ->> 'width')::numeric not between 1 and 10000
      or (v_attrs ->> 'height')::numeric not between 1 and 10000
    then
      return 'Invalid image dimensions';
    end if;

    if jsonb_typeof(v_attrs -> 'alt') is distinct from 'string' then
      return 'Invalid image alt text';
    end if;

    v_alt := v_attrs ->> 'alt';

    if char_length(v_alt) > 300 or v_alt ~ '[[:cntrl:]]' then
      return 'Invalid image alt text';
    end if;

    -- Alt text is required unless the image is explicitly decorative, in which
    -- case it must be empty.
    if v_attrs ? 'decorative' then
      if v_attrs -> 'decorative' is distinct from 'true'::jsonb then
        return 'Invalid decorative flag';
      end if;

      if v_alt <> '' then
        return 'Decorative images must have empty alt text';
      end if;
    elsif v_alt !~ '\S' then
      return 'Image alt text is required';
    end if;

    if v_attrs ? 'caption' and (
      jsonb_typeof(v_attrs -> 'caption') is distinct from 'string'
      or char_length(v_attrs ->> 'caption') > 500
      or (v_attrs ->> 'caption') ~ '[[:cntrl:]]'
      or (v_attrs ->> 'caption') !~ '\S'
    ) then
      return 'Invalid image caption';
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
        'codeBlock', 'horizontalRule', 'image'
      )
      when 'inline*' then v_child_type in ('text', 'hardBreak')
      when 'text*' then v_child_type = 'text'
      when 'listItem+' then v_child_type = 'listItem'
      -- Matches Tiptap's "paragraph block*".
      when 'listItem' then case
        when v_index = 1 then v_child_type = 'paragraph'
        else v_child_type in (
          'paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote',
          'codeBlock', 'horizontalRule', 'image'
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


-- The authoring RPCs call assert_post_body. It now also requires every
-- referenced media row to exist and takes a key-share lock on it, so
-- delete_media cannot remove an image while a save that uses it commits.
-- Direct service-role writes bypass this check; the CHECK constraint still
-- validates their shape.
create or replace function public.assert_post_body(
  p_body jsonb,
  p_content_version integer
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_error text;
  v_media_id text;
begin
  if p_content_version is distinct from 1 then
    raise exception 'Unsupported content version' using errcode = '22023';
  end if;

  v_error := public.post_body_error(p_body);

  if v_error is not null then
    raise exception 'Invalid post body: %', v_error using errcode = '22023';
  end if;

  for v_media_id in
    select distinct ids.value #>> '{}'
    from jsonb_path_query(
      p_body,
      'strict $.** ? (@.type == "image").attrs.mediaId'
    ) as ids(value)
  loop
    perform 1
    from public.media
    where media.id = v_media_id::uuid
    for key share;

    if not found then
      raise exception 'Invalid post body: Unknown media %', v_media_id
        using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public.post_body_node_error(jsonb, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.assert_post_body(jsonb, integer)
  from public, anon, authenticated;
