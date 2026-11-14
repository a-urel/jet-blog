-- Media uploads: lower the size limit from 5 MiB to 4 MiB.
--
-- Uploads reach a Server Action, and Vercel Functions (the documented
-- reference host, D5) reject request bodies above 4.5 MB before the
-- application runs. 4 MiB (4194304 bytes) plus multipart overhead stays below
-- that limit, so oversized files get the application's own message instead of
-- a platform 413. src/features/media/validation.ts (maxMediaBytes) mirrors the
-- value.
--
-- New uploads are limited by the bucket and by register_media, the only write
-- path into public.media. The table CHECK keeps its 5 MiB bound on purpose:
-- rows registered before this migration may be larger, and those rows are
-- still updated (for example uploaded_by is set to null when the uploader's
-- profile is deleted), so a tighter CHECK, even NOT VALID, would block such
-- updates.

update storage.buckets
set file_size_limit = 4194304
where id = 'media';

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

  if v_size is null or v_size not between 1 and 4194304 then
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
