-- Media library search by file name.
--
-- Stores the uploaded file's original name for display and for the library
-- search in the site settings and post cover pickers. The name is a label
-- only: objects stay keyed by media id (object_path = id), and the name never
-- reaches a Storage path or URL. Existing rows keep a null name.
--
-- The server (src/features/media/validation.ts) reduces the name to its last
-- path segment, NFC, without control characters, at most 200 characters with
-- the extension kept. The CHECK below is the database bound.

alter table public.media
  add column original_name text,
  add constraint media_original_name_check check (
    original_name is null
    or (
      char_length(original_name) between 1 and 200
      and original_name = btrim(original_name)
      and original_name !~ '[[:cntrl:]/\\]'
    )
  );

-- register_media gains an optional name. The three-argument function is
-- replaced rather than overloaded, so existing named-argument calls resolve
-- to the new one through the default.
drop function public.register_media(uuid, integer, integer);

create function public.register_media(
  p_media_id uuid,
  p_width integer,
  p_height integer,
  p_original_name text default null
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
  v_original_name text;
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

  if v_size is null or v_size not between 1 and 4194304 then
    raise exception 'Invalid media size' using errcode = '22023';
  end if;

  if p_width is null or p_height is null
    or p_width not between 1 and 10000
    or p_height not between 1 and 10000
  then
    raise exception 'Invalid media dimensions' using errcode = '22023';
  end if;

  -- The server normalizes the name; the CHECK constraint is the final bound.
  v_original_name := nullif(btrim(p_original_name), '');

  insert into public.media (
    id,
    object_path,
    uploaded_by,
    mime_type,
    size_bytes,
    width,
    height,
    original_name
  )
  values (
    p_media_id,
    p_media_id::text,
    actor,
    v_mime_type,
    v_size,
    p_width,
    p_height,
    v_original_name
  );

  return p_media_id;
exception
  when check_violation then
    raise exception 'Invalid original file name' using errcode = '22023';
  when unique_violation then
    raise exception 'Media already registered' using errcode = '23505';
end;
$$;

revoke all on function public.register_media(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.register_media(uuid, integer, integer, text)
  to authenticated;
