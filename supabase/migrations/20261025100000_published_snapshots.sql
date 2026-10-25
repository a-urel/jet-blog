-- Phase 26: published snapshots separate from the working copy.
--
-- Decision (user, 2026-10-25; replaces D3's "one working copy, no published
-- snapshot"): everything a reader sees waits for an editor to republish.
--
--   posts, post_authors, post_tags
--       The working copy. Members only: editors and admins read every post,
--       authors read their own. Anonymous readers and reader accounts no
--       longer read these tables at all. Saving a published post changes only
--       the working copy; the revision compare-and-swap is unchanged.
--   published_posts, published_post_authors, published_post_tags
--       The published snapshot: one row per published post with the title,
--       slug, excerpt, language, category, cover and alt text, body and
--       content version, publication times, and the ordered credits and tags
--       as of the last publish or republish. Every public read (pages,
--       archives, feeds, sitemap, search, bookmarks, comments) uses these
--       tables. Rows exist only while the post is published.
--   post_versions
--       One immutable row per publish and republish: who, when, and the full
--       snapshot as JSON. No history or restore interface yet; editors may
--       read the rows, nobody may change them.
--
-- Transitions (security-definer RPCs, revision compare-and-swap):
--   publish_post        draft -> published (editors/admins), snapshot v(n+1)
--   republish_post      published working copy -> snapshot (editors/admins)
--   discard_post_changes working copy := published snapshot (anyone who may
--                       edit the post)
--   unpublish_post      removes the snapshot (editors/admins)
-- Authors may now edit the working copy of their own published posts; they
-- still cannot publish, republish, or unpublish.
--
-- Slugs: a working-copy slug change is private. The published slug changes on
-- republish, and that is when the old published slug starts redirecting
-- (trigger on published_posts). A working copy may not take a slug that is
-- another post's published slug or redirect, so a republish cannot collide.

-- 1. Snapshot tables --------------------------------------------------------

create table public.published_posts (
  post_id uuid primary key references public.posts (id) on delete cascade,
  title text not null,
  slug text not null,
  excerpt text,
  language text not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  cover_media_id uuid references public.media (id) on delete restrict,
  cover_alt text,
  body jsonb not null,
  content_version smallint not null,
  -- First publication of the current publication period; kept by republish.
  published_at timestamptz not null,
  -- Last publish or republish; "updated" is shown when it is later than
  -- published_at.
  updated_at timestamptz not null,
  -- post_versions.version of the snapshot these rows hold.
  version integer not null,
  constraint published_posts_title_normalized check (
    title = btrim(regexp_replace(title, '\s+', ' ', 'g'))
    and char_length(title) between 1 and 200
  ),
  constraint published_posts_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 200
  ),
  constraint published_posts_excerpt_length check (
    excerpt is null
    or (excerpt = btrim(excerpt) and char_length(excerpt) between 1 and 500)
  ),
  constraint published_posts_language_check check (
    public.is_post_language_tag(language)
  ),
  constraint published_posts_cover_alt_format check (
    cover_alt is null
    or (
      cover_alt = btrim(cover_alt)
      and char_length(cover_alt) between 1 and 300
      and cover_alt !~ '[[:cntrl:]]'
    )
  ),
  constraint published_posts_cover_requires_alt check (
    (cover_media_id is null) = (cover_alt is null)
  ),
  constraint published_posts_content_version_positive check (content_version >= 1),
  constraint published_posts_body_valid check (
    content_version <> 1 or public.post_body_error(body) is null
  ),
  constraint published_posts_version_positive check (version >= 1),
  constraint published_posts_updated_after_published check (
    updated_at >= published_at
  )
);

create unique index published_posts_slug_key on public.published_posts (slug);
-- Listings: published_at desc with the id as tiebreaker (src/features/posts/queries.ts).
create index published_posts_listing_idx
  on public.published_posts (published_at desc, post_id desc);
create index published_posts_category_idx
  on public.published_posts (category_id, published_at desc);
create index published_posts_cover_media_id_idx
  on public.published_posts (cover_media_id)
  where cover_media_id is not null;

create table public.published_post_authors (
  post_id uuid not null references public.published_posts (post_id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete restrict,
  sort_order integer not null,
  primary key (post_id, author_id),
  constraint published_post_authors_sort_order_range check (sort_order between 0 and 999)
);

create index published_post_authors_author_id_idx
  on public.published_post_authors (author_id);
create unique index published_post_authors_post_sort_order_key
  on public.published_post_authors (post_id, sort_order);

create table public.published_post_tags (
  post_id uuid not null references public.published_posts (post_id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete restrict,
  primary key (post_id, tag_id)
);

create index published_post_tags_tag_id_idx on public.published_post_tags (tag_id);

create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  version integer not null,
  -- Null for versions backfilled by this migration (the publisher was not
  -- recorded before Phase 26) and after the publisher's account is deleted.
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  snapshot jsonb not null,
  constraint post_versions_version_positive check (version >= 1),
  constraint post_versions_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  unique (post_id, version)
);

create index post_versions_published_by_idx on public.post_versions (published_by);

-- Versions are immutable. Direct UPDATE and DELETE statements fail for every
-- role, including service_role; only the referential actions run (cascade
-- when a post is deleted, set null when a publisher's profile is deleted),
-- which fire this trigger one level deeper.
create or replace function public.prevent_post_version_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception 'Post versions are immutable' using errcode = '55000';
end;
$$;

create trigger post_versions_immutable
before update or delete on public.post_versions
for each row
execute function public.prevent_post_version_change();

-- 2. Content documents ------------------------------------------------------
--
-- The same JSON shape for the working copy and the published snapshot, so
-- "unpublished changes" is a plain comparison and a version stores exactly
-- what was published. Credits keep their order; tags are sorted by id.

create or replace function public.post_working_content(p_post_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', posts.title,
    'slug', posts.slug,
    'excerpt', posts.excerpt,
    'language', posts.language,
    'category_id', posts.category_id,
    'cover_media_id', posts.cover_media_id,
    'cover_alt', posts.cover_alt,
    'body', posts.body,
    'content_version', posts.content_version,
    'credits', coalesce((
      select jsonb_agg(
        jsonb_build_object('author_id', credits.author_id, 'sort_order', credits.sort_order)
        order by credits.sort_order
      )
      from public.post_authors as credits
      where credits.post_id = posts.id
    ), '[]'::jsonb),
    'tag_ids', coalesce((
      select jsonb_agg(relations.tag_id order by relations.tag_id)
      from public.post_tags as relations
      where relations.post_id = posts.id
    ), '[]'::jsonb)
  )
  from public.posts
  where posts.id = p_post_id;
$$;

create or replace function public.post_published_content(p_post_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', published.title,
    'slug', published.slug,
    'excerpt', published.excerpt,
    'language', published.language,
    'category_id', published.category_id,
    'cover_media_id', published.cover_media_id,
    'cover_alt', published.cover_alt,
    'body', published.body,
    'content_version', published.content_version,
    'credits', coalesce((
      select jsonb_agg(
        jsonb_build_object('author_id', credits.author_id, 'sort_order', credits.sort_order)
        order by credits.sort_order
      )
      from public.published_post_authors as credits
      where credits.post_id = published.post_id
    ), '[]'::jsonb),
    'tag_ids', coalesce((
      select jsonb_agg(relations.tag_id order by relations.tag_id)
      from public.published_post_tags as relations
      where relations.post_id = published.post_id
    ), '[]'::jsonb)
  )
  from public.published_posts as published
  where published.post_id = p_post_id;
$$;

-- PostgREST computed field for the admin (select=...,has_unpublished_changes).
-- Security invoker: it reads only what the caller can already read, and it is
-- evaluated only for posts rows the caller's RLS returned.
create or replace function public.has_unpublished_changes(p_post public.posts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_post.status = 'published'
    and public.post_working_content(p_post.id)
      is distinct from public.post_published_content(p_post.id);
$$;

revoke all on function public.post_working_content(uuid) from public, anon, authenticated;
revoke all on function public.post_published_content(uuid) from public, anon, authenticated;
revoke all on function public.has_unpublished_changes(public.posts) from public, anon;
grant execute on function public.post_working_content(uuid) to authenticated;
grant execute on function public.post_published_content(uuid) to authenticated;
grant execute on function public.has_unpublished_changes(public.posts) to authenticated;

-- 3. Writing a snapshot -----------------------------------------------------
--
-- Copies the working copy into the published tables and appends a version.
-- Callers lock the posts row and check authorization, the revision, and the
-- publish rules first. p_published_at is the publication time to keep (the
-- first publish passes now()); p_updated_at the time of this snapshot.

create or replace function public.store_published_snapshot(
  p_post_id uuid,
  p_actor uuid,
  p_published_at timestamptz,
  p_updated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_version integer;
begin
  select * into v_post from public.posts where posts.id = p_post_id;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  select coalesce(max(post_versions.version), 0) + 1
  into v_version
  from public.post_versions
  where post_versions.post_id = p_post_id;

  insert into public.published_posts (
    post_id, title, slug, excerpt, language, category_id, cover_media_id,
    cover_alt, body, content_version, published_at, updated_at, version
  )
  values (
    v_post.id, v_post.title, v_post.slug, v_post.excerpt, v_post.language,
    v_post.category_id, v_post.cover_media_id, v_post.cover_alt, v_post.body,
    v_post.content_version, p_published_at, p_updated_at, v_version
  )
  on conflict (post_id) do update
    set title = excluded.title,
        slug = excluded.slug,
        excerpt = excluded.excerpt,
        language = excluded.language,
        category_id = excluded.category_id,
        cover_media_id = excluded.cover_media_id,
        cover_alt = excluded.cover_alt,
        body = excluded.body,
        content_version = excluded.content_version,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        version = excluded.version;

  delete from public.published_post_authors where post_id = p_post_id;
  insert into public.published_post_authors (post_id, author_id, sort_order)
  select post_authors.post_id, post_authors.author_id, post_authors.sort_order
  from public.post_authors
  where post_authors.post_id = p_post_id;

  delete from public.published_post_tags where post_id = p_post_id;
  insert into public.published_post_tags (post_id, tag_id)
  select post_tags.post_id, post_tags.tag_id
  from public.post_tags
  where post_tags.post_id = p_post_id;

  insert into public.post_versions (post_id, version, published_by, created_at, snapshot)
  values (
    p_post_id,
    v_version,
    p_actor,
    p_updated_at,
    public.post_published_content(p_post_id)
      || jsonb_build_object('published_at', p_published_at, 'updated_at', p_updated_at)
  );

  return v_version;
end;
$$;

revoke all on function public.store_published_snapshot(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Rebuilds the snapshot of a published post from its working copy without an
-- actor, keeping posts.published_at and posts.updated_at. For the backfill
-- below, the synthetic seed, and tests that insert published rows with the
-- secret key. Not executable by client roles.
create or replace function public.sync_published_post(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where posts.id = p_post_id for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if v_post.status <> 'published' then
    raise exception 'Only a published post has a snapshot' using errcode = '55000';
  end if;

  return public.store_published_snapshot(
    p_post_id,
    null,
    v_post.published_at,
    greatest(v_post.updated_at, v_post.published_at)
  );
end;
$$;

revoke all on function public.sync_published_post(uuid) from public, anon, authenticated;
grant execute on function public.sync_published_post(uuid) to service_role;

-- 4. Slug ownership ---------------------------------------------------------
--
-- Working copy (posts): only refuse slugs that belong to another post's public
-- URLs (its published slug or one of its redirects). Taking back an own old
-- slug, and recording redirects, wait for the published snapshot.
create or replace function public.maintain_post_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.post_slug_redirects
    where post_slug_redirects.old_slug = new.slug
      and post_slug_redirects.post_id <> new.id
  ) or exists (
    select 1
    from public.published_posts
    where published_posts.slug = new.slug
      and published_posts.post_id <> new.id
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  return new;
end;
$$;

-- Published snapshot: the Phase 8 rules, now on the public slug.
create or replace function public.maintain_published_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.post_slug_redirects
    where post_slug_redirects.old_slug = new.slug
      and post_slug_redirects.post_id <> new.post_id
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  delete from public.post_slug_redirects
  where post_slug_redirects.old_slug = new.slug
    and post_slug_redirects.post_id = new.post_id;

  if tg_op = 'UPDATE' and old.slug <> new.slug then
    insert into public.post_slug_redirects (old_slug, post_id)
    values (old.slug, new.post_id)
    on conflict (old_slug) do update
      set post_id = excluded.post_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger published_posts_maintain_slug_redirects
after insert or update of slug on public.published_posts
for each row
execute function public.maintain_published_slug_redirects();

revoke all on function public.maintain_published_slug_redirects()
  from public, anon, authenticated;
revoke all on function public.prevent_post_version_change()
  from public, anon, authenticated;

-- 5. Backfill ---------------------------------------------------------------
--
-- Every post that is published right now gets its snapshot and version 1 with
-- its current content and times. The insert trigger above finds the post's
-- own slug free (redirects never point a post's current slug at itself).

select public.sync_published_post(posts.id)
from public.posts
where posts.status = 'published'
order by posts.published_at, posts.id;

-- 6. Search moves to the snapshot ----------------------------------------------

drop index public.posts_search_vector_idx;
alter table public.posts drop column search_vector;

alter table public.published_posts
  add column search_vector tsvector
  generated always as (
    public.post_search_document(language, title, excerpt, body)
  ) stored;

create index published_posts_search_vector_idx
  on public.published_posts using gin (search_vector);

-- Listing indexes now live on published_posts.
drop index public.posts_published_listing_idx;
drop index public.posts_category_published_idx;

-- Unchanged contract (signature, output, service_role-only grant). Reads the
-- published snapshot, which holds published posts only, so the former status
-- filter is the table itself.
create or replace function public.search_published_posts(
  p_query text,
  p_language text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  post_id uuid,
  search_rank real,
  title_highlight text,
  snippet text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_query text := public.post_search_text(p_query);
  v_folded tsquery;
  v_any tsquery;
  v_config regconfig;
  v_markers constant text := chr(2) || chr(3);
  v_options constant text :=
    'StartSel=' || chr(2) || ', StopSel=' || chr(3);
begin
  if p_query is null or char_length(p_query) > 200 then
    raise exception 'Search query must be at most 200 characters'
      using errcode = '22023';
  end if;

  if p_language is not null and not public.is_post_language_tag(p_language) then
    raise exception 'Unsupported search language %', p_language
      using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 1000 then
    raise exception 'Search page out of range'
      using errcode = '22023';
  end if;

  v_folded := pg_catalog.websearch_to_tsquery('public.search_folded'::regconfig, v_query);

  if pg_catalog.numnode(v_folded) = 0 then
    return;
  end if;

  v_any := v_folded;
  for v_config in
    select distinct map.config from public.post_search_config_map() as map
  loop
    v_any := v_any || pg_catalog.websearch_to_tsquery(v_config, v_query);
  end loop;

  return query
  with configs as (
    select
      candidates.config,
      pg_catalog.websearch_to_tsquery(candidates.config, v_query) || v_folded as query
    from (
      select map.config from public.post_search_config_map() as map
      union
      select 'public.search_folded'::regconfig
    ) as candidates (config)
  ),
  matches as (
    select
      published.post_id as id,
      published.title,
      published.excerpt,
      published.body,
      published.published_at,
      published.search_vector,
      configs.config,
      configs.query
    from public.published_posts as published
    join configs
      on configs.config = public.post_search_config(published.language)
    where published.search_vector @@ v_any
      and published.search_vector @@ configs.query
      and (p_language is null or published.language = p_language)
  ),
  ranked as (
    select
      matches.*,
      pg_catalog.ts_rank(matches.search_vector, matches.query, 1) as rank,
      count(*) over () as total
    from matches
  ),
  page as (
    select ranked.*
    from ranked
    order by ranked.rank desc, ranked.published_at desc, ranked.id desc
    limit p_limit
    offset p_offset
  )
  select
    page.id,
    page.rank,
    highlights.title_highlight,
    highlights.snippet,
    page.total
  from page
  cross join lateral (
    select
      pg_catalog.translate(page.title, v_markers, '') as title_text,
      pg_catalog.translate(
        concat_ws(' ', page.excerpt, public.post_body_search_text(page.body)),
        v_markers,
        ''
      ) as document_text
  ) as source
  cross join lateral (
    select
      pg_catalog.ts_headline(
        'public.search_folded'::regconfig,
        pg_catalog.ts_headline(
          page.config, source.title_text, page.query,
          v_options || ', HighlightAll=true'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as title_highlight,
      pg_catalog.ts_headline(
        'public.search_folded'::regconfig,
        pg_catalog.ts_headline(
          page.config, source.document_text, page.query,
          v_options || ', MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter=" … "'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as snippet_stemmed,
      pg_catalog.ts_headline(
        page.config,
        pg_catalog.ts_headline(
          'public.search_folded'::regconfig, source.document_text, page.query,
          v_options || ', MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter=" … "'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as snippet_folded
  ) as candidates
  cross join lateral (
    select
      candidates.title_highlight,
      case
        when greatest(
          public.search_marker_count(candidates.snippet_folded),
          public.search_marker_count(candidates.snippet_stemmed)
        ) = 0
          then pg_catalog.ts_headline(
            page.config, source.document_text, page.query,
            v_options || ', MaxWords=32, MinWords=24'
          )
        when public.search_marker_count(candidates.snippet_folded)
          > public.search_marker_count(candidates.snippet_stemmed)
          then candidates.snippet_folded
        else candidates.snippet_stemmed
      end as snippet
  ) as highlights
  order by page.rank desc, page.published_at desc, page.id desc;
end;
$$;

revoke all on function public.search_published_posts(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_published_posts(text, text, integer, integer)
  to service_role;

-- 7. Visibility -------------------------------------------------------------

create or replace function public.is_post_published(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.published_posts where published_posts.post_id = p_post_id
  );
$$;

-- The working copy: editors and admins read every post, authors their own.
create or replace function public.can_view_post_working_copy(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts
    where posts.id = p_post_id
      and (
        public.is_editor()
        or (posts.created_by = auth.uid() and public.is_active_member())
      )
  );
$$;

-- "The post exists for this caller": published, or a working copy the caller
-- may read. Still used by the post_slug_redirects policy.
create or replace function public.can_view_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_post_published(p_post_id)
    or public.can_view_post_working_copy(p_post_id);
$$;

revoke all on function public.is_post_published(uuid) from public;
revoke all on function public.can_view_post_working_copy(uuid) from public;
grant execute on function public.is_post_published(uuid) to anon, authenticated;
grant execute on function public.can_view_post_working_copy(uuid) to anon, authenticated;

drop policy posts_select_visible on public.posts;
drop policy post_authors_select_visible on public.post_authors;
drop policy post_tags_select_visible on public.post_tags;

create policy posts_select_working_copy
on public.posts
for select
to authenticated
using (public.can_view_post_working_copy(id));

create policy post_authors_select_working_copy
on public.post_authors
for select
to authenticated
using (public.can_view_post_working_copy(post_id));

create policy post_tags_select_working_copy
on public.post_tags
for select
to authenticated
using (public.can_view_post_working_copy(post_id));

-- Anonymous visitors have no business with the working copy.
revoke select on table public.posts from anon;
revoke select on table public.post_authors from anon;
revoke select on table public.post_tags from anon;

alter table public.published_posts enable row level security;
alter table public.published_post_authors enable row level security;
alter table public.published_post_tags enable row level security;
alter table public.post_versions enable row level security;

revoke all on table public.published_posts from anon, authenticated;
revoke all on table public.published_post_authors from anon, authenticated;
revoke all on table public.published_post_tags from anon, authenticated;
revoke all on table public.post_versions from anon, authenticated;

grant select on table public.published_posts to anon, authenticated;
grant select on table public.published_post_authors to anon, authenticated;
grant select on table public.published_post_tags to anon, authenticated;
grant select on table public.post_versions to authenticated;

-- Snapshot rows exist only while a post is published, so they are public.
create policy published_posts_select_public
on public.published_posts
for select
to anon, authenticated
using (true);

create policy published_post_authors_select_public
on public.published_post_authors
for select
to anon, authenticated
using (true);

create policy published_post_tags_select_public
on public.published_post_tags
for select
to anon, authenticated
using (true);

create policy post_versions_select_editor
on public.post_versions
for select
to authenticated
using ((select public.is_editor()));

-- An author identity is public once it is credited on a published snapshot.
-- A credit that exists only in a working copy stays private.
drop policy authors_select_credited on public.authors;

create policy authors_select_credited
on public.authors
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.published_post_authors
    where published_post_authors.author_id = authors.id
  )
);

-- Bookmarks and comments target published posts. The former checks read
-- posts under the caller's RLS, which no longer returns rows to readers.
drop policy bookmarks_insert_own_published on public.bookmarks;

create policy bookmarks_insert_own_published
on public.bookmarks
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.published_posts
    where published_posts.post_id = bookmarks.post_id
  )
);

drop policy comments_select_public on public.comments;

create policy comments_select_public
on public.comments
for select
to anon, authenticated
using (
  status = 'visible'
  and exists (
    select 1
    from public.published_posts
    where published_posts.post_id = comments.post_id
  )
);

drop policy comments_insert_own_visible on public.comments;

create policy comments_insert_own_visible
on public.comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'visible'
  and exists (
    select 1
    from public.published_posts
    where published_posts.post_id = comments.post_id
  )
);

-- PostgREST computed relationships from rows that reference a post to its
-- published snapshot (to-one): bookmarks -> post, redirects -> target. The
-- snapshot's own RLS applies.
create or replace function public.published_post(public.bookmarks)
returns setof public.published_posts
rows 1
language sql
stable
set search_path = ''
as $$
  select * from public.published_posts where published_posts.post_id = $1.post_id;
$$;

create or replace function public.published_post(public.post_slug_redirects)
returns setof public.published_posts
rows 1
language sql
stable
set search_path = ''
as $$
  select * from public.published_posts where published_posts.post_id = $1.post_id;
$$;

-- 8. Authoring --------------------------------------------------------------
--
-- Same signature and checks as 20261024140000_post_cover_image.sql, except
-- that an author may edit the working copy of an own published post. A save
-- never touches the published snapshot.
create or replace function public.update_post_metadata(
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

  -- Editors and admins edit any post. Authors edit their own posts, drafts
  -- and working copies of published posts alike. A credit grants nothing.
  if not (public.is_editor() or v_post.created_by = actor) then
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

-- 9. Publication ------------------------------------------------------------

-- Shared publish checks on a locked working copy.
create or replace function public.assert_post_publishable(p_post public.posts)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_post.category_id is null then
    raise exception 'Published post requires a category' using errcode = '23514';
  end if;

  perform public.assert_post_body(p_post.body, p_post.content_version);
  perform public.assert_post_cover(
    p_post.cover_media_id,
    p_post.cover_alt,
    'published'::public.post_status
  );
end;
$$;

revoke all on function public.assert_post_publishable(public.posts)
  from public, anon, authenticated;

-- Signature unchanged since Phase 8, so grants remain.
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

  perform public.assert_post_publishable(v_post);

  update public.posts
  set status = 'published',
      published_at = v_published_at,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  perform public.store_published_snapshot(p_post_id, actor, v_published_at, v_published_at);

  return query
  select p_post_id, v_post.revision + 1, v_post.slug, v_published_at;
end;
$$;

-- Copies the working copy of a published post over its snapshot. The
-- revision is compared but not bumped: the working copy does not change, and
-- the editor republishes exactly the revision the page showed. Publication
-- time stays; updated_at becomes now.
create or replace function public.republish_post(
  p_post_id uuid,
  p_expected_revision integer
)
returns table (post_id uuid, revision integer, slug text, previous_slug text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_post public.posts%rowtype;
  v_previous_slug text;
  v_version integer;
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

  if v_post.status <> 'published' then
    raise exception 'Only a published post can be republished'
      using errcode = '55000';
  end if;

  perform public.assert_post_publishable(v_post);
  perform public.consume_rate_limit('post.publication', 30, interval '1 hour');

  select published_posts.slug
  into v_previous_slug
  from public.published_posts
  where published_posts.post_id = p_post_id
  for update;

  v_version := public.store_published_snapshot(
    p_post_id,
    actor,
    v_post.published_at,
    greatest(now(), v_post.published_at)
  );

  return query
  select p_post_id, v_post.revision, v_post.slug, v_previous_slug, v_version;
end;
$$;

-- Resets the working copy of a published post to its snapshot. Allowed for
-- whoever may edit the post (editors, admins, the post's own author), with
-- the revision compare-and-swap of a save.
create or replace function public.discard_post_changes(
  p_post_id uuid,
  p_expected_revision integer
)
returns table (post_id uuid, revision integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_post public.posts%rowtype;
  v_published public.published_posts%rowtype;
begin
  select *
  into v_post
  from public.posts
  where posts.id = p_post_id
  for update;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  if not (public.is_editor() or v_post.created_by = actor) then
    raise exception 'Not allowed to edit this post' using errcode = '42501';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  if v_post.revision <> p_expected_revision then
    raise exception 'This post changed since the page was loaded'
      using errcode = '40001';
  end if;

  select *
  into v_published
  from public.published_posts
  where published_posts.post_id = p_post_id;

  if v_post.status <> 'published' or not found then
    raise exception 'Only a published post has changes to discard'
      using errcode = '55000';
  end if;

  update public.posts
  set title = v_published.title,
      slug = v_published.slug,
      excerpt = v_published.excerpt,
      category_id = v_published.category_id,
      body = v_published.body,
      content_version = v_published.content_version,
      language = v_published.language,
      cover_media_id = v_published.cover_media_id,
      cover_alt = v_published.cover_alt,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  delete from public.post_authors where post_authors.post_id = p_post_id;
  insert into public.post_authors (post_id, author_id, sort_order)
  select credits.post_id, credits.author_id, credits.sort_order
  from public.published_post_authors as credits
  where credits.post_id = p_post_id;

  delete from public.post_tags where post_tags.post_id = p_post_id;
  insert into public.post_tags (post_id, tag_id)
  select relations.post_id, relations.tag_id
  from public.published_post_tags as relations
  where relations.post_id = p_post_id;

  return query select p_post_id, v_post.revision + 1;
end;
$$;

-- Signature unchanged since Phase 8, so grants remain. Removing the snapshot
-- removes the post from every public read at once; versions stay.
create or replace function public.unpublish_post(
  p_post_id uuid,
  p_expected_revision integer
)
returns table (post_id uuid, revision integer, slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_active_editorial_actor();
  v_post public.posts%rowtype;
  v_public_slug text;
begin
  if not public.is_editor() then
    raise exception 'Not allowed to unpublish posts' using errcode = '42501';
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

  if v_post.status <> 'published' then
    raise exception 'Only a published post can be unpublished'
      using errcode = '55000';
  end if;

  delete from public.published_posts
  where published_posts.post_id = p_post_id
  returning published_posts.slug into v_public_slug;

  update public.posts
  set status = 'draft',
      published_at = null,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  return query select p_post_id, v_post.revision + 1, coalesce(v_public_slug, v_post.slug);
end;
$$;

revoke all on function public.republish_post(uuid, integer) from public, anon, authenticated;
revoke all on function public.discard_post_changes(uuid, integer) from public, anon, authenticated;
grant execute on function public.republish_post(uuid, integer) to authenticated;
grant execute on function public.discard_post_changes(uuid, integer) to authenticated;

-- 10. Taxonomy, authors, and media see both copies --------------------------
--
-- A category, tag, or author can be referenced by a working copy, a
-- snapshot, or both. Deleting a category moves both; deleting a tag detaches
-- it from both. Neither counts as an unpublished change, because both copies
-- change together. Versions keep the old ids (history).

create or replace function public.delete_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_target_category_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_current public.categories%rowtype;
  v_post_count integer;
  v_child_count integer;
begin
  select *
  into v_current
  from public.categories
  where id = p_category_id
  for update;

  if not found then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Category changed since it was loaded' using errcode = '40001';
  end if;

  if p_target_category_id is not null and (
    p_target_category_id = p_category_id
    or not exists (select 1 from public.categories where id = p_target_category_id)
  ) then
    raise exception 'Invalid target category' using errcode = '22023';
  end if;

  select count(*)
  into v_post_count
  from (
    select posts.id from public.posts where posts.category_id = p_category_id
    union
    select published_posts.post_id
    from public.published_posts
    where published_posts.category_id = p_category_id
  ) as affected;

  if v_post_count > 0 and p_target_category_id is null then
    raise exception 'Target category required' using errcode = '22023';
  end if;

  perform set_config('jet.taxonomy_reassignment', 'on', true);

  update public.posts
  set category_id = p_target_category_id,
      revision = revision + 1
  where category_id = p_category_id;

  update public.published_posts
  set category_id = p_target_category_id
  where category_id = p_category_id;

  update public.categories
  set parent_id = v_current.parent_id
  where parent_id = p_category_id;

  get diagnostics v_child_count = row_count;

  if p_target_category_id is not null then
    update public.category_slug_redirects
    set category_id = p_target_category_id
    where category_id = p_category_id;
  end if;

  delete from public.categories where id = p_category_id;

  if p_target_category_id is not null then
    insert into public.category_slug_redirects (old_slug, category_id)
    values (v_current.slug, p_target_category_id)
    on conflict (old_slug) do update
      set category_id = excluded.category_id,
          created_at = now();
  end if;

  perform set_config('jet.taxonomy_reassignment', 'off', true);

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'category.deleted',
    jsonb_build_object(
      'category_id', p_category_id,
      'name', v_current.name,
      'slug', v_current.slug,
      'target_category_id', p_target_category_id,
      'moved_posts', v_post_count,
      'moved_children', v_child_count
    )
  );

  return v_post_count;
end;
$$;

create or replace function public.delete_tag(
  p_tag_id uuid,
  p_expected_updated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_current public.tags%rowtype;
  v_post_count integer;
begin
  select *
  into v_current
  from public.tags
  where id = p_tag_id
  for update;

  if not found then
    raise exception 'Tag not found' using errcode = 'P0002';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Tag changed since it was loaded' using errcode = '40001';
  end if;

  perform set_config('jet.taxonomy_reassignment', 'on', true);

  select count(*)
  into v_post_count
  from (
    select post_tags.post_id from public.post_tags where post_tags.tag_id = p_tag_id
    union
    select published_post_tags.post_id
    from public.published_post_tags
    where published_post_tags.tag_id = p_tag_id
  ) as affected;

  update public.posts
  set revision = revision + 1
  where id in (
    select post_tags.post_id
    from public.post_tags
    where post_tags.tag_id = p_tag_id
  );

  delete from public.post_tags where tag_id = p_tag_id;
  delete from public.published_post_tags where tag_id = p_tag_id;
  delete from public.tags where id = p_tag_id;

  perform set_config('jet.taxonomy_reassignment', 'off', true);

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'tag.deleted',
    jsonb_build_object(
      'tag_id', p_tag_id,
      'name', v_current.name,
      'slug', v_current.slug,
      'detached_posts', v_post_count
    )
  );

  return v_post_count;
end;
$$;

create or replace function public.delete_author(
  p_author_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_author_admin();
  v_current public.authors%rowtype;
  v_credit_count integer;
begin
  select *
  into v_current
  from public.authors
  where id = p_author_id
  for update;

  if not found then
    raise exception 'Author not found' using errcode = 'P0002';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Author changed since it was loaded' using errcode = '40001';
  end if;

  -- Credits in a working copy or a published snapshot both count; the foreign
  -- keys restrict deletion as well.
  select count(*)
  into v_credit_count
  from (
    select post_authors.post_id
    from public.post_authors
    where post_authors.author_id = p_author_id
    union
    select published_post_authors.post_id
    from public.published_post_authors
    where published_post_authors.author_id = p_author_id
  ) as credited;

  if v_credit_count > 0 then
    raise exception 'Author is credited on % posts', v_credit_count
      using errcode = '23503';
  end if;

  delete from public.authors where id = p_author_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    'author.deleted',
    v_current.user_id,
    jsonb_build_object(
      'author_id', p_author_id,
      'name', v_current.name,
      'slug', v_current.slug
    )
  );
end;
$$;

-- A published snapshot keeps its images like a working copy does. Versions
-- do not block deletion: they are history, and restoring one (a later
-- increment) has to cope with media removed since.
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

  delete from public.media where media.id = p_media_id;

  return v_media.object_path;
end;
$$;

-- 11. Public slugs for comment cache invalidation ---------------------------
--
-- Comments render on the public page, which lives at the published slug.

create or replace function public.moderate_comment(
  p_comment_id uuid,
  p_status text
)
returns table (post_id uuid, post_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_comment public.comments%rowtype;
begin
  if actor is null or not public.is_editor() then
    raise exception 'Editorial access required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('visible', 'hidden', 'deleted') then
    raise exception 'Unknown comment status %', p_status using errcode = '22023';
  end if;

  select *
  into v_comment
  from public.comments
  where comments.id = p_comment_id
  for update;

  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;

  if v_comment.status = 'deleted' then
    raise exception 'Deleted comments cannot be changed' using errcode = '23514';
  end if;

  if v_comment.status <> p_status then
    update public.comments
    set status = p_status
    where comments.id = p_comment_id;

    insert into public.editorial_audit_log (
      actor_profile_id,
      action,
      target_profile_id,
      details
    )
    values (
      actor,
      'comment.' || case p_status
        when 'visible' then 'restore'
        when 'hidden' then 'hide'
        else 'delete'
      end,
      v_comment.user_id,
      jsonb_build_object(
        'comment_id', v_comment.id,
        'post_id', v_comment.post_id,
        'from', v_comment.status,
        'to', p_status
      )
    );
  end if;

  return query
  select posts.id, coalesce(published_posts.slug, posts.slug)
  from public.posts
  left join public.published_posts on published_posts.post_id = posts.id
  where posts.id = v_comment.post_id;
end;
$$;

create or replace function public.set_own_avatar(p_avatar_id uuid)
returns table (previous_avatar_id uuid, post_ids uuid[], post_slugs text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_previous uuid;
  v_post_ids uuid[];
  v_post_slugs text[];
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform public.consume_rate_limit('avatar.update', 10, interval '1 hour');

  select profiles.avatar_id
  into v_previous
  from public.profiles
  where profiles.id = actor
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if p_avatar_id is not distinct from v_previous then
    return query select null::uuid, '{}'::uuid[], '{}'::text[];
    return;
  end if;

  if p_avatar_id is not null then
    perform public.assert_avatar_object('profiles', p_avatar_id, actor);
  end if;

  update public.profiles
  set avatar_id = p_avatar_id
  where profiles.id = actor;

  -- Comments render only on published posts, at their published slug.
  with changed as (
    update public.comments
    set avatar_id = p_avatar_id
    where comments.user_id = actor
    returning comments.post_id
  )
  select
    coalesce(array_agg(published_posts.post_id), '{}'),
    coalesce(array_agg(published_posts.slug), '{}')
  into v_post_ids, v_post_slugs
  from public.published_posts
  where published_posts.post_id in (select changed.post_id from changed);

  return query select v_previous, v_post_ids, v_post_slugs;
end;
$$;
