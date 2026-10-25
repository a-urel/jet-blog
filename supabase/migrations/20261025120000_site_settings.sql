-- Phase 27: admin-editable site settings (white-label branding).
--
-- Decisions (user, 2026-10-25):
--   * Single tenant: every customer runs its own deployment and Supabase
--     project, so one settings row describes the whole site.
--   * Branding text is not per interface language: one value per field.
--
-- public.site_settings is a singleton (primary key `id boolean` that must be
-- true). Everyone reads the public columns, because every public page, feed,
-- icon, and robots.txt renders from them. Clients have no direct write
-- grants; admins change the row only through update_site_settings(), which
-- re-checks admin membership (D1), compares the loaded revision atomically
-- (40001 on a stale form), validates the media references, records an audit
-- entry, and consumes a site_settings.write rate-limit event.
--
-- The migration inserts no row: the brand of a deployment is not part of the
-- schema. Until the first save the application falls back to
-- NEXT_PUBLIC_SITE_NAME and the built-in locale defaults; the first save
-- (expected revision 0) creates the row. The development seed inserts a
-- synthetic row.
--
-- Logos, the icon, and the default social image are rows of public.media in
-- the public `media` bucket (D4), uploaded through the existing validated
-- upload path (JPEG, PNG, WebP, GIF by file signature; no SVG). A referenced
-- media row cannot be deleted (on delete restrict, and delete_media reports
-- it as in use).

-- 1. Validation helpers ------------------------------------------------------

-- Interface locales (src/lib/interface-locales.ts): a non-empty set without
-- duplicates, drawn from the supported list.
create or replace function public.is_valid_interface_locale_set(p_locales text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_locales is not null
    and cardinality(p_locales) between 1 and 3
    and p_locales <@ array['tr', 'en', 'de']::text[]
    and cardinality(p_locales) = (
      select count(distinct locale) from unnest(p_locales) as locale
    );
$$;

-- Social links: an object whose keys come from the provider allowlist
-- (src/features/site-settings/social.ts) and whose values are https URLs.
-- The application also checks each provider's host; the database bounds the
-- shape, scheme, and length.
create or replace function public.is_valid_site_social_links(p_links jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_links is not null
    and jsonb_typeof(p_links) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_links) as link (provider, url)
      where link.provider not in (
          'website', 'x', 'bluesky', 'mastodon', 'github', 'linkedin',
          'instagram', 'facebook', 'youtube'
        )
        or jsonb_typeof(link.url) <> 'string'
        or (link.url #>> '{}') !~ '^https://[^\s/?#]+'
        or char_length(link.url #>> '{}') > 300
    );
$$;

-- 2. Table -------------------------------------------------------------------

create table public.site_settings (
  id boolean primary key default true,
  revision integer not null default 1,
  site_name text not null,
  tagline text,
  meta_description text,
  logo_light_media_id uuid references public.media (id) on delete restrict,
  logo_dark_media_id uuid references public.media (id) on delete restrict,
  icon_media_id uuid references public.media (id) on delete restrict,
  og_image_media_id uuid references public.media (id) on delete restrict,
  accent_color text,
  social_links jsonb not null default '{}'::jsonb,
  footer_text text,
  default_locale text not null default 'tr',
  enabled_locales text[] not null default array['tr', 'en', 'de']::text[],
  search_indexing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint site_settings_singleton check (id),
  constraint site_settings_revision_positive check (revision > 0),
  constraint site_settings_site_name_check check (
    site_name = btrim(site_name) and char_length(site_name) between 1 and 80
  ),
  constraint site_settings_tagline_check check (
    tagline is null or (tagline = btrim(tagline) and char_length(tagline) between 1 and 160)
  ),
  constraint site_settings_meta_description_check check (
    meta_description is null
    or (meta_description = btrim(meta_description) and char_length(meta_description) between 1 and 300)
  ),
  constraint site_settings_footer_text_check check (
    footer_text is null
    or (footer_text = btrim(footer_text) and char_length(footer_text) between 1 and 500)
  ),
  -- Lowercase #rrggbb only; contrast is checked by the Server Action.
  constraint site_settings_accent_color_check check (
    accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'
  ),
  constraint site_settings_social_links_check check (
    public.is_valid_site_social_links(social_links)
  ),
  constraint site_settings_enabled_locales_check check (
    public.is_valid_interface_locale_set(enabled_locales)
  ),
  constraint site_settings_default_locale_check check (
    default_locale = any (enabled_locales)
  )
);

-- No indexes on the media references: the table has at most one row, so the
-- foreign-key checks from public.media deletes scan one row.

create trigger site_settings_set_updated_at
before update on public.site_settings
for each row
execute function public.set_updated_at();

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from anon, authenticated;

-- Every column except updated_by (an admin's profile id) is public.
grant select (
  id,
  revision,
  site_name,
  tagline,
  meta_description,
  logo_light_media_id,
  logo_dark_media_id,
  icon_media_id,
  og_image_media_id,
  accent_color,
  social_links,
  footer_text,
  default_locale,
  enabled_locales,
  search_indexing,
  created_at,
  updated_at
) on table public.site_settings to anon, authenticated;

create policy site_settings_select_public
on public.site_settings
for select
to anon, authenticated
using (true);

-- No insert, update, or delete policy and no write grant: writes go through
-- update_site_settings() below.

-- 3. Update RPC --------------------------------------------------------------

-- A referenced image must be registered media. The icon must be square and at
-- least 48 px (it is resized to 32-192 px icons); the default social image at
-- least 200 px on each side (the smallest preview major platforms accept).
-- The field name goes into the error detail, so the form can mark the field.
create or replace function public.assert_site_settings_media(
  p_media_id uuid,
  p_field text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_media public.media%rowtype;
begin
  if p_media_id is null then
    return;
  end if;

  select * into v_media from public.media where media.id = p_media_id;

  if not found then
    raise exception 'Media not found' using errcode = 'P0002', detail = p_field;
  end if;

  if p_field = 'icon' and (v_media.width <> v_media.height or v_media.width < 48) then
    raise exception 'The icon must be a square image of at least 48 pixels'
      using errcode = '22023', detail = p_field;
  end if;

  if p_field = 'ogImage' and (v_media.width < 200 or v_media.height < 200) then
    raise exception 'The social image must be at least 200 pixels on each side'
      using errcode = '22023', detail = p_field;
  end if;
end;
$$;

create or replace function public.update_site_settings(
  p_expected_revision integer,
  p_site_name text,
  p_tagline text,
  p_meta_description text,
  p_logo_light_media_id uuid,
  p_logo_dark_media_id uuid,
  p_icon_media_id uuid,
  p_og_image_media_id uuid,
  p_accent_color text,
  p_social_links jsonb,
  p_footer_text text,
  p_default_locale text,
  p_enabled_locales text[],
  p_search_indexing boolean
)
returns table (revision integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
  v_current public.site_settings%rowtype;
  v_revision integer;
  v_updated_at timestamptz;
begin
  perform public.consume_rate_limit('site_settings.write', 30, interval '10 minutes');

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  perform public.assert_site_settings_media(p_logo_light_media_id, 'logoLight');
  perform public.assert_site_settings_media(p_logo_dark_media_id, 'logoDark');
  perform public.assert_site_settings_media(p_icon_media_id, 'icon');
  perform public.assert_site_settings_media(p_og_image_media_id, 'ogImage');

  -- The row lock serializes concurrent saves; the second one sees the bumped
  -- revision and fails with 40001 instead of overwriting.
  select * into v_current from public.site_settings where id for update;

  if not found then
    -- Revision 0 means "no row was loaded". A concurrent first save loses on
    -- the primary key and is reported as stale too.
    if p_expected_revision <> 0 then
      raise exception 'Site settings changed since they were loaded' using errcode = '40001';
    end if;

    begin
      insert into public.site_settings (
        id, revision, site_name, tagline, meta_description,
        logo_light_media_id, logo_dark_media_id, icon_media_id, og_image_media_id,
        accent_color, social_links, footer_text, default_locale, enabled_locales,
        search_indexing, updated_by
      )
      values (
        true, 1, p_site_name, p_tagline, p_meta_description,
        p_logo_light_media_id, p_logo_dark_media_id, p_icon_media_id, p_og_image_media_id,
        p_accent_color, coalesce(p_social_links, '{}'::jsonb), p_footer_text,
        p_default_locale, p_enabled_locales, p_search_indexing, actor
      )
      returning site_settings.revision, site_settings.updated_at
      into v_revision, v_updated_at;
    exception
      when unique_violation then
        raise exception 'Site settings changed since they were loaded' using errcode = '40001';
    end;
  else
    if v_current.revision <> p_expected_revision then
      raise exception 'Site settings changed since they were loaded' using errcode = '40001';
    end if;

    update public.site_settings
    set revision = v_current.revision + 1,
        site_name = p_site_name,
        tagline = p_tagline,
        meta_description = p_meta_description,
        logo_light_media_id = p_logo_light_media_id,
        logo_dark_media_id = p_logo_dark_media_id,
        icon_media_id = p_icon_media_id,
        og_image_media_id = p_og_image_media_id,
        accent_color = p_accent_color,
        social_links = coalesce(p_social_links, '{}'::jsonb),
        footer_text = p_footer_text,
        default_locale = p_default_locale,
        enabled_locales = p_enabled_locales,
        search_indexing = p_search_indexing,
        updated_by = actor
    where site_settings.id
    returning site_settings.revision, site_settings.updated_at
    into v_revision, v_updated_at;
  end if;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    'site_settings.updated',
    null,
    jsonb_build_object(
      'revision', v_revision,
      'site_name', p_site_name,
      'default_locale', p_default_locale,
      'enabled_locales', to_jsonb(p_enabled_locales),
      'search_indexing', p_search_indexing
    )
  );

  return query select v_revision, v_updated_at;
end;
$$;

-- 4. Media deletion ----------------------------------------------------------
--
-- Same as Phase 26, plus the site settings references, so the media library
-- reports a logo, icon, or social image as in use instead of failing on the
-- foreign key.
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
  ) or exists (
    select 1
    from public.published_posts
    where published_posts.cover_media_id = p_media_id
      or jsonb_path_exists(
        published_posts.body,
        'strict $.** ? (@.type == "image" && @.attrs.mediaId == $id)',
        jsonb_build_object('id', p_media_id::text),
        true
      )
  ) then
    raise exception 'Media is used by a post' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.site_settings
    where p_media_id in (
      site_settings.logo_light_media_id,
      site_settings.logo_dark_media_id,
      site_settings.icon_media_id,
      site_settings.og_image_media_id
    )
  ) then
    raise exception 'Media is used by the site settings' using errcode = '23503';
  end if;

  delete from public.media where media.id = p_media_id;

  return v_media.object_path;
end;
$$;

revoke all on function public.is_valid_interface_locale_set(text[])
  from public, anon, authenticated;
revoke all on function public.is_valid_site_social_links(jsonb)
  from public, anon, authenticated;
revoke all on function public.assert_site_settings_media(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_site_settings(
  integer, text, text, text, uuid, uuid, uuid, uuid, text, jsonb, text, text, text[], boolean
) from public, anon, authenticated;

grant execute on function public.update_site_settings(
  integer, text, text, text, uuid, uuid, uuid, uuid, text, jsonb, text, text, text[], boolean
) to authenticated;
