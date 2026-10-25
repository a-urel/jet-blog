-- Phase 28: static pages and site navigation.
--
-- Pages (About, privacy/KVKK/GDPR, terms, imprint, contact, ...) are a
-- separate resource from posts: no category, tags, author credits, cover,
-- language, comments, bookmarks, feeds, or search. They never appear in post
-- queries. A deployment serves one publication (single tenant) and keeps one
-- version of each page; the text is not translated per interface language.
--
-- Pages keep a single copy (no published snapshot as posts have since
-- Phase 26). Only editors and admins (D1) write pages, there is no author
-- review step, and legal texts change rarely and deliberately, so a save of a
-- published page goes live at once. The admin editor says so before saving.
--
-- Writes go through security-definer RPCs with the same revision
-- compare-and-swap as posts (D3). Bodies use the post body allowlist
-- (post_body_error / assert_post_body), so the read-only renderer and the
-- editor stay aligned on supported nodes.

-- 1. Pages ------------------------------------------------------------------

create type public.page_kind as enum ('privacy', 'terms', 'imprint', 'cookies', 'other');

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  meta_description text,
  -- Legal pages carry their kind, so the footer, the sign-up form, and the
  -- comment form can link the current privacy notice without a hardcoded slug.
  kind public.page_kind not null default 'other',
  body jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_version smallint not null default 1,
  status public.post_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_title_normalized check (
    title = btrim(regexp_replace(title, '\s+', ' ', 'g'))
    and char_length(title) between 1 and 200
  ),
  constraint pages_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 200
  ),
  constraint pages_meta_description_length check (
    meta_description is null
    or (
      meta_description = btrim(meta_description)
      and char_length(meta_description) between 1 and 300
    )
  ),
  constraint pages_revision_positive check (revision >= 1),
  constraint pages_content_version_positive check (content_version >= 1),
  constraint pages_body_valid check (
    content_version <> 1 or public.post_body_error(body) is null
  ),
  constraint pages_published_at_matches_status check (
    (status = 'published') = (published_at is not null)
  )
);

create unique index pages_slug_key on public.pages (slug);
create index pages_created_by_idx on public.pages (created_by);
-- At most one published page per legal kind, so "the privacy notice" is
-- unambiguous. Drafts of the same kind may coexist (a replacement in progress).
create unique index pages_published_kind_key
  on public.pages (kind)
  where status = 'published' and kind <> 'other';
-- Public listings (sitemap, footer legal links) read published pages only.
create index pages_published_idx
  on public.pages (published_at)
  where status = 'published';

create trigger pages_set_updated_at
before update on public.pages
for each row
execute function public.set_updated_at();

-- Old published slugs keep working, exactly like post_slug_redirects: the
-- redirect stores the page id, so it resolves to the current slug in one hop.
create table public.page_slug_redirects (
  old_slug text primary key,
  page_id uuid not null references public.pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint page_slug_redirects_slug_format check (
    old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(old_slug) <= 200
  )
);

create index page_slug_redirects_page_id_idx
  on public.page_slug_redirects (page_id);

create or replace function public.maintain_page_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.page_slug_redirects
    where page_slug_redirects.old_slug = new.slug
      and page_slug_redirects.page_id <> new.id
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  delete from public.page_slug_redirects
  where page_slug_redirects.old_slug = new.slug
    and page_slug_redirects.page_id = new.id;

  if tg_op = 'UPDATE'
    and old.slug <> new.slug
    and old.status = 'published'
  then
    insert into public.page_slug_redirects (old_slug, page_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set page_id = excluded.page_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger pages_maintain_slug_redirects
after insert or update of slug on public.pages
for each row
execute function public.maintain_page_slug_redirects();

-- Images in page bodies reference media like post bodies do. delete_media
-- checks posts only; this trigger keeps a page's images too, for every
-- delete path, without redefining delete_media.
create or replace function public.prevent_page_media_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.pages
    where jsonb_path_exists(
      pages.body,
      'strict $.** ? (@.type == "image" && @.attrs.mediaId == $id)',
      jsonb_build_object('id', old.id::text),
      true
    )
  ) then
    raise exception 'Media is used by a page' using errcode = '23503';
  end if;

  return old;
end;
$$;

create trigger media_prevent_page_reference_delete
before delete on public.media
for each row
execute function public.prevent_page_media_delete();

-- 2. Navigation -------------------------------------------------------------
--
-- Two ordered menus: the header and the footer. An item links a page (its
-- current slug, resolved at render time, so a slug change never breaks a
-- menu) or an external https URL. A menu is saved as a whole with a revision
-- compare-and-swap on navigation_menus.

create type public.navigation_location as enum ('header', 'footer');

create table public.navigation_menus (
  location public.navigation_location primary key,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint navigation_menus_revision_positive check (revision >= 1)
);

insert into public.navigation_menus (location)
values ('header'), ('footer');

create table public.navigation_items (
  id uuid primary key default gen_random_uuid(),
  location public.navigation_location not null
    references public.navigation_menus (location) on delete cascade,
  sort_order integer not null,
  -- Optional for a page link (the page title is shown), required for a URL.
  label text,
  -- Deleting a linked page is refused (delete_page), so a menu never loses
  -- an entry silently.
  page_id uuid references public.pages (id) on delete restrict,
  url text,
  created_at timestamptz not null default now(),
  constraint navigation_items_sort_order_range check (sort_order between 0 and 49),
  constraint navigation_items_label_normalized check (
    label is null
    or (
      label = btrim(regexp_replace(label, '\s+', ' ', 'g'))
      and char_length(label) between 1 and 80
    )
  ),
  constraint navigation_items_one_target check (
    (page_id is null) <> (url is null)
  ),
  constraint navigation_items_url_label check (url is null or label is not null),
  -- https only, no credentials, whitespace, or markup characters.
  constraint navigation_items_url_safe check (
    url is null
    or (
      char_length(url) <= 2000
      and url ~* '^https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s"<>\\]*)?$'
    )
  )
);

create unique index navigation_items_location_order_key
  on public.navigation_items (location, sort_order);
create index navigation_items_page_id_idx on public.navigation_items (page_id);

-- 3. RLS --------------------------------------------------------------------

alter table public.pages enable row level security;
alter table public.page_slug_redirects enable row level security;
alter table public.navigation_menus enable row level security;
alter table public.navigation_items enable row level security;

revoke all on table public.pages from anon, authenticated;
revoke all on table public.page_slug_redirects from anon, authenticated;
revoke all on table public.navigation_menus from anon, authenticated;
revoke all on table public.navigation_items from anon, authenticated;

-- created_by stays private; every other column is public for published pages.
grant select (
  id, title, slug, meta_description, kind, body, content_version, status,
  published_at, revision, created_at, updated_at
) on table public.pages to anon, authenticated;
grant select on table public.page_slug_redirects to anon, authenticated;
grant select (location, revision, updated_at) on table public.navigation_menus
  to anon, authenticated;
grant select on table public.navigation_items to anon, authenticated;

-- Readers and the public see published pages; editors and admins see drafts.
-- Authors have no page access (D1: pages are publication-level content).
create policy pages_select_published_or_editor
on public.pages
for select
to anon, authenticated
using (status = 'published' or public.is_editor());

create or replace function public.is_page_published(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages
    where pages.id = p_page_id
      and pages.status = 'published'
  );
$$;

-- A redirect is visible exactly when its page is, so an unpublished page's
-- old URLs return 404.
create policy page_slug_redirects_select_visible
on public.page_slug_redirects
for select
to anon, authenticated
using (public.is_page_published(page_id) or public.is_editor());

create policy navigation_menus_select_public
on public.navigation_menus
for select
to anon, authenticated
using (true);

-- An item that links a draft page stays hidden from the public, so neither
-- its label nor the page id leaks before publication.
create policy navigation_items_select_visible
on public.navigation_items
for select
to anon, authenticated
using (
  page_id is null
  or public.is_page_published(page_id)
  or public.is_editor()
);

-- 4. Page RPCs --------------------------------------------------------------

create or replace function public.require_page_editor()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
begin
  if not public.is_editor() then
    raise exception 'Not allowed to manage pages' using errcode = '42501';
  end if;

  return actor;
end;
$$;

-- Normalizes and checks the fields outside the body. Returns the normalized
-- title, slug, and meta description.
create or replace function public.normalize_page_fields(
  p_title text,
  p_slug text,
  p_meta_description text,
  out title text,
  out slug text,
  out meta_description text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  title := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  slug := lower(btrim(coalesce(p_slug, '')));
  meta_description := nullif(btrim(coalesce(p_meta_description, '')), '');

  if char_length(title) not between 1 and 200 then
    raise exception 'Title must be 1-200 characters' using errcode = '22023';
  end if;

  if slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(slug) > 200 then
    raise exception 'Invalid slug' using errcode = '22023';
  end if;

  if meta_description is not null and char_length(meta_description) > 300 then
    raise exception 'Meta description must be at most 300 characters'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_page(
  p_title text,
  p_slug text,
  p_meta_description text,
  p_kind public.page_kind,
  p_body jsonb,
  p_content_version integer
)
returns table (page_id uuid, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_fields record;
  v_page_id uuid;
begin
  select * into v_fields
  from public.normalize_page_fields(p_title, p_slug, p_meta_description);
  perform public.assert_post_body(p_body, p_content_version);
  perform public.consume_rate_limit('page.write', 120, interval '1 hour');

  if exists (select 1 from public.pages where pages.slug = v_fields.slug) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  insert into public.pages (
    title, slug, meta_description, kind, body, content_version, created_by
  )
  values (
    v_fields.title,
    v_fields.slug,
    v_fields.meta_description,
    coalesce(p_kind, 'other'),
    p_body,
    p_content_version,
    actor
  )
  returning pages.id into v_page_id;

  return query select v_page_id, 1;
exception
  when unique_violation then
    raise exception 'Slug already in use' using errcode = '23505';
end;
$$;

-- Saves every field. For a published page the change is public at once, and
-- a changed slug records a redirect; changing the kind of a published page to
-- a legal kind that another published page has is refused.
create or replace function public.update_page(
  p_page_id uuid,
  p_expected_revision integer,
  p_title text,
  p_slug text,
  p_meta_description text,
  p_kind public.page_kind,
  p_body jsonb,
  p_content_version integer
)
returns table (page_id uuid, revision integer, slug text, previous_slug text, status public.post_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_page public.pages%rowtype;
  v_fields record;
begin
  select *
  into v_page
  from public.pages
  where pages.id = p_page_id
  for update;

  if not found then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_page.revision <> p_expected_revision then
    raise exception 'This page changed since the form was loaded'
      using errcode = '40001';
  end if;

  select * into v_fields
  from public.normalize_page_fields(p_title, p_slug, p_meta_description);
  perform public.assert_post_body(p_body, p_content_version);
  perform public.consume_rate_limit('page.write', 120, interval '1 hour');

  if exists (
    select 1
    from public.pages
    where pages.slug = v_fields.slug
      and pages.id <> p_page_id
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  begin
    update public.pages
    set title = v_fields.title,
        slug = v_fields.slug,
        meta_description = v_fields.meta_description,
        kind = coalesce(p_kind, 'other'),
        body = p_body,
        content_version = p_content_version,
        revision = v_page.revision + 1
    where pages.id = p_page_id;
  exception
    when unique_violation then
      if exists (
        select 1
        from public.pages
        where pages.slug = v_fields.slug
          and pages.id <> p_page_id
      ) then
        raise exception 'Slug already in use' using errcode = '23505';
      end if;

      raise exception 'A published page of this kind already exists'
        using errcode = '23505';
  end;

  return query
  select p_page_id, v_page.revision + 1, v_fields.slug, v_page.slug, v_page.status;
end;
$$;

create or replace function public.publish_page(
  p_page_id uuid,
  p_expected_revision integer
)
returns table (page_id uuid, revision integer, slug text, published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_page public.pages%rowtype;
  v_published_at timestamptz := now();
begin
  select *
  into v_page
  from public.pages
  where pages.id = p_page_id
  for update;

  if not found then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_page.revision <> p_expected_revision then
    raise exception 'This page changed since the page was loaded'
      using errcode = '40001';
  end if;

  if v_page.status <> 'draft' then
    raise exception 'Only a draft can be published' using errcode = '55000';
  end if;

  perform public.assert_post_body(v_page.body, v_page.content_version);
  perform public.consume_rate_limit('page.write', 120, interval '1 hour');

  update public.pages
  set status = 'published',
      published_at = v_published_at,
      revision = v_page.revision + 1
  where pages.id = p_page_id;

  return query select p_page_id, v_page.revision + 1, v_page.slug, v_published_at;
exception
  when unique_violation then
    raise exception 'A published page of this kind already exists'
      using errcode = '23505';
end;
$$;

create or replace function public.unpublish_page(
  p_page_id uuid,
  p_expected_revision integer
)
returns table (page_id uuid, revision integer, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_page public.pages%rowtype;
begin
  select *
  into v_page
  from public.pages
  where pages.id = p_page_id
  for update;

  if not found then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_page.revision <> p_expected_revision then
    raise exception 'This page changed since the page was loaded'
      using errcode = '40001';
  end if;

  if v_page.status <> 'published' then
    raise exception 'Only a published page can be unpublished'
      using errcode = '55000';
  end if;

  perform public.consume_rate_limit('page.write', 120, interval '1 hour');

  update public.pages
  set status = 'draft',
      published_at = null,
      revision = v_page.revision + 1
  where pages.id = p_page_id;

  return query select p_page_id, v_page.revision + 1, v_page.slug;
end;
$$;

-- Only drafts can be deleted: a published page (often a legal text) is
-- unpublished first. A page still linked from a menu is refused (23503).
create or replace function public.delete_page(
  p_page_id uuid,
  p_expected_revision integer
)
returns table (page_id uuid, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_page public.pages%rowtype;
begin
  select *
  into v_page
  from public.pages
  where pages.id = p_page_id
  for update;

  if not found then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or v_page.revision <> p_expected_revision then
    raise exception 'This page changed since the page was loaded'
      using errcode = '40001';
  end if;

  if v_page.status <> 'draft' then
    raise exception 'Only a draft page can be deleted' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.navigation_items where navigation_items.page_id = p_page_id
  ) then
    raise exception 'Page is linked from navigation' using errcode = '23503';
  end if;

  perform public.consume_rate_limit('page.write', 120, interval '1 hour');

  delete from public.pages where pages.id = p_page_id;

  return query select p_page_id, v_page.slug;
end;
$$;

-- 5. Navigation RPC ---------------------------------------------------------

-- Replaces one menu with p_items, an ordered JSON array of
-- { "page_id": uuid } or { "url": "https://...", "label": "..." } objects
-- (a page item may also carry a label). Array order is the display order.
create or replace function public.save_navigation(
  p_location public.navigation_location,
  p_expected_revision integer,
  p_items jsonb
)
returns table (location public.navigation_location, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_page_editor();
  v_menu public.navigation_menus%rowtype;
  v_item jsonb;
  v_index integer := 0;
  v_page_id uuid;
  v_url text;
  v_label text;
begin
  select *
  into v_menu
  from public.navigation_menus
  where navigation_menus.location = p_location
  for update;

  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  if p_expected_revision is null or v_menu.revision <> p_expected_revision then
    raise exception 'This menu changed since the page was loaded'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid navigation items' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many navigation items' using errcode = '22023';
  end if;

  perform public.consume_rate_limit('navigation.write', 30, interval '10 minutes');

  delete from public.navigation_items where navigation_items.location = p_location;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_item) as keys(key)
        where keys.key not in ('page_id', 'url', 'label')
      )
    then
      raise exception 'Invalid navigation item %', v_index using errcode = '22023';
    end if;

    v_label := nullif(btrim(regexp_replace(coalesce(v_item ->> 'label', ''), '\s+', ' ', 'g')), '');
    v_url := nullif(btrim(coalesce(v_item ->> 'url', '')), '');
    v_page_id := null;

    if v_item ? 'page_id' and jsonb_typeof(v_item -> 'page_id') = 'string' then
      if (v_item ->> 'page_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid navigation page %', v_index using errcode = '22023';
      end if;

      v_page_id := (v_item ->> 'page_id')::uuid;

      perform 1 from public.pages where pages.id = v_page_id for key share;

      if not found then
        raise exception 'Invalid navigation page %', v_index using errcode = '22023';
      end if;
    end if;

    if (v_page_id is null) = (v_url is null) then
      raise exception 'Invalid navigation item %', v_index using errcode = '22023';
    end if;

    if v_label is not null and char_length(v_label) > 80 then
      raise exception 'Invalid navigation label %', v_index using errcode = '22023';
    end if;

    if v_url is not null and v_label is null then
      raise exception 'Invalid navigation label %', v_index using errcode = '22023';
    end if;

    if v_url is not null and not (
      char_length(v_url) <= 2000
      and v_url ~* '^https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s"<>\\]*)?$'
    ) then
      raise exception 'Invalid navigation URL %', v_index using errcode = '22023';
    end if;

    insert into public.navigation_items (location, sort_order, label, page_id, url)
    values (p_location, v_index, v_label, v_page_id, v_url);

    v_index := v_index + 1;
  end loop;

  update public.navigation_menus
  set revision = v_menu.revision + 1,
      updated_at = now(),
      updated_by = actor
  where navigation_menus.location = p_location;

  return query select p_location, v_menu.revision + 1;
end;
$$;

-- 6. Grants -----------------------------------------------------------------

revoke all on function public.maintain_page_slug_redirects() from public, anon, authenticated;
revoke all on function public.prevent_page_media_delete() from public, anon, authenticated;
revoke all on function public.require_page_editor() from public, anon, authenticated;
revoke all on function public.normalize_page_fields(text, text, text) from public, anon, authenticated;
revoke all on function public.is_page_published(uuid) from public;
revoke all on function public.create_page(text, text, text, public.page_kind, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.update_page(uuid, integer, text, text, text, public.page_kind, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.publish_page(uuid, integer) from public, anon, authenticated;
revoke all on function public.unpublish_page(uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_page(uuid, integer) from public, anon, authenticated;
revoke all on function public.save_navigation(public.navigation_location, integer, jsonb)
  from public, anon, authenticated;

-- RLS policies call is_page_published as the querying role.
grant execute on function public.is_page_published(uuid) to anon, authenticated;
grant execute on function public.create_page(text, text, text, public.page_kind, jsonb, integer)
  to authenticated;
grant execute on function public.update_page(uuid, integer, text, text, text, public.page_kind, jsonb, integer)
  to authenticated;
grant execute on function public.publish_page(uuid, integer) to authenticated;
grant execute on function public.unpublish_page(uuid, integer) to authenticated;
grant execute on function public.delete_page(uuid, integer) to authenticated;
grant execute on function public.save_navigation(public.navigation_location, integer, jsonb)
  to authenticated;
