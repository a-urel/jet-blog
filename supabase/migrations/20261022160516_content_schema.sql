-- Phase 3: content schema, taxonomy, and public read rules.
--
-- Workflow (D2a, answered 2026-10-22): draft -> published only. Review and
-- archived states arrive in a later increment.
-- Concurrency (D3, answered 2026-10-22): one working copy with an integer
-- revision for atomic compare-and-swap updates. There is no separate published
-- snapshot, so an edit to a published post is public immediately and bumps
-- updated_at.
--
-- Public readers (anon and authenticated users without an editorial grant) may
-- read published posts and their relations. Editors read every post. Authors
-- read their own drafts. Writes are not granted to clients in this phase; the
-- centralized mutations arrive with Phase 4.

create type public.post_status as enum ('draft', 'published');

-- Names and slugs share one normalization policy:
--   * names are trimmed and white-space collapsed, and unique case-insensitively
--   * slugs are lower-case ASCII kebab-case and unique
-- The application uses the same rules in src/lib/slug.ts.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  parent_id uuid references public.categories (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_normalized check (
    name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
    and char_length(name) between 1 and 120
  ),
  constraint categories_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 120
  ),
  constraint categories_description_length check (
    description is null or char_length(description) <= 1000
  ),
  constraint categories_sort_order_range check (sort_order between 0 and 1000),
  constraint categories_parent_not_self check (parent_id is null or parent_id <> id)
);

create unique index categories_slug_key on public.categories (slug);
create unique index categories_name_key on public.categories (lower(name));
create index categories_parent_sort_idx on public.categories (parent_id, sort_order);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_name_normalized check (
    name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
    and char_length(name) between 1 and 80
  ),
  constraint tags_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 80
  ),
  constraint tags_description_length check (
    description is null or char_length(description) <= 1000
  )
);

create unique index tags_slug_key on public.tags (slug);
create unique index tags_name_key on public.tags (lower(name));

-- A post belongs to at most one category. The column stays nullable so an
-- uncategorized draft can exist; the publish boundary (and the CHECK below)
-- requires a category before a post can be published.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  excerpt text,
  category_id uuid references public.categories (id) on delete restrict,
  status public.post_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_title_normalized check (
    title = btrim(regexp_replace(title, '\s+', ' ', 'g'))
    and char_length(title) between 1 and 200
  ),
  constraint posts_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) <= 200
  ),
  constraint posts_excerpt_length check (
    excerpt is null
    or (excerpt = btrim(excerpt) and char_length(excerpt) between 1 and 500)
  ),
  constraint posts_revision_positive check (revision >= 1),
  -- Not NOT NULL: drafts may be uncategorized, publishing may not.
  constraint posts_published_requires_category check (
    status <> 'published' or category_id is not null
  ),
  -- Publication time and publication state stay consistent.
  constraint posts_published_at_matches_status check (
    (status = 'published') = (published_at is not null)
  )
);

create unique index posts_slug_key on public.posts (slug);
create index posts_category_id_idx on public.posts (category_id);
create index posts_created_by_idx on public.posts (created_by, status);
create index posts_published_listing_idx
  on public.posts (published_at desc)
  where status = 'published';
create index posts_category_published_idx
  on public.posts (category_id, published_at desc)
  where status = 'published';

create table public.post_authors (
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete restrict,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (post_id, author_id),
  constraint post_authors_sort_order_range check (sort_order between 0 and 999)
);

create index post_authors_author_id_idx on public.post_authors (author_id);

create unique index post_authors_post_sort_order_key
  on public.post_authors (post_id, sort_order);

create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create index post_tags_tag_id_idx on public.post_tags (tag_id);

create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

create trigger tags_set_updated_at
before update on public.tags
for each row
execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

-- Prevent category cycles on insert and on move. A self-reference is not
-- enough: the loop walks every ancestor, so longer cycles fail too. The
-- transaction-scoped advisory lock serializes concurrent moves so two
-- transactions cannot each observe an acyclic snapshot and create a cycle.
create or replace function public.prevent_category_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  walk uuid;
  next_parent uuid;
  depth integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.categories'));

  if new.parent_id = new.id then
    raise exception 'A category cannot be its own parent' using errcode = '23514';
  end if;

  walk := new.parent_id;

  while walk is not null loop
    depth := depth + 1;

    if depth > 100 then
      raise exception 'Category hierarchy cannot be deeper than 100 levels'
        using errcode = '23514';
    end if;

    if walk = new.id then
      raise exception 'Category hierarchy cannot contain a cycle'
        using errcode = '23514';
    end if;

    select categories.parent_id
    into next_parent
    from public.categories
    where categories.id = walk;

    walk := next_parent;
    next_parent := null;
  end loop;

  return new;
end;
$$;

create trigger categories_prevent_cycle
before insert or update of parent_id on public.categories
for each row
execute function public.prevent_category_cycle();

-- Authorization helpers. The visibility rule lives in one function so the
-- public post policy, the relation policies, and future read paths cannot
-- drift apart.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.editorial_members
    where profile_id = auth.uid()
      and deactivated_at is null
  );
$$;

create or replace function public.can_view_post(p_post_id uuid)
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
        posts.status = 'published'
        or public.is_editor()
        or (posts.created_by = auth.uid() and public.is_active_member())
      )
  );
$$;

alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.posts enable row level security;
alter table public.post_authors enable row level security;
alter table public.post_tags enable row level security;

revoke all on table public.categories from anon, authenticated;
revoke all on table public.tags from anon, authenticated;
revoke all on table public.posts from anon, authenticated;
revoke all on table public.post_authors from anon, authenticated;
revoke all on table public.post_tags from anon, authenticated;

-- The authors table keeps its admin-only write grants from Phase 2, but public
-- reads are limited to the public identity columns. user_id (the link to an
-- Auth account) is deliberately not granted to clients; an admin path for it
-- arrives with author management in Phase 4.
revoke select on table public.authors from anon, authenticated;
grant select (id, name, slug, bio, created_at, updated_at)
  on table public.authors to anon, authenticated;

grant select on table public.categories to anon, authenticated;
grant select on table public.tags to anon, authenticated;
grant select on table public.posts to anon, authenticated;
grant select on table public.post_authors to anon, authenticated;
grant select on table public.post_tags to anon, authenticated;

grant execute on function public.can_view_post(uuid) to anon, authenticated;
grant execute on function public.is_active_member() to anon, authenticated;

-- Taxonomy is public metadata. Draft posts do not make their taxonomy private.
create policy categories_select_public
on public.categories
for select
to anon, authenticated
using (true);

create policy tags_select_public
on public.tags
for select
to anon, authenticated
using (true);

create policy posts_select_visible
on public.posts
for select
to anon, authenticated
using (public.can_view_post(id));

create policy post_authors_select_visible
on public.post_authors
for select
to anon, authenticated
using (public.can_view_post(post_id));

create policy post_tags_select_visible
on public.post_tags
for select
to anon, authenticated
using (public.can_view_post(post_id));

-- An author identity is public once it is credited on a visible post. The
-- admin policy from Phase 2 stays in place and is permissive, so admins still
-- read every row.
create policy authors_select_credited
on public.authors
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.post_authors
    where post_authors.author_id = authors.id
      and public.can_view_post(post_authors.post_id)
  )
);
