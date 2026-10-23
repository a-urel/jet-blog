-- Taxonomy administration (admin only, D1).
--
-- Admins create, rename, re-slug, describe, move, and delete categories and
-- tags. Clients still have no direct write grants on categories, tags, or
-- their relations; every write goes through the security-definer RPCs below,
-- which re-check admin membership, compare the loaded updated_at to reject
-- stale forms (40001), record an audit entry, and consume one rate-limit event.
--
-- Decisions (user, 2026-10-23):
--   * Deleting a category that posts use requires a target category. Its posts
--     move to the target, its child categories move to its parent, and its
--     archive URL (plus older redirects) redirects to the target.
--   * Deleting a tag removes it from every post. Its archive URL returns 404.
--   * Changing a category or tag slug records the old slug as a redirect, the
--     same one-hop model as post_slug_redirects.
--
-- Reassigning or detaching posts bumps each post's revision (so an editor's
-- open form gets the normal conflict instead of re-saving a removed category or
-- tag) and its updated_at (the public "Güncellendi" label is accurate: the
-- post's category or tags changed).

-- 1. Slug redirects ----------------------------------------------------------

create table public.category_slug_redirects (
  old_slug text primary key,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint category_slug_redirects_slug_format check (
    old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(old_slug) <= 120
  )
);

create index category_slug_redirects_category_id_idx
  on public.category_slug_redirects (category_id);

create table public.tag_slug_redirects (
  old_slug text primary key,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint tag_slug_redirects_slug_format check (
    old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(old_slug) <= 80
  )
);

create index tag_slug_redirects_tag_id_idx
  on public.tag_slug_redirects (tag_id);

-- Categories and tags are public metadata, so their redirects are public too.
alter table public.category_slug_redirects enable row level security;
alter table public.tag_slug_redirects enable row level security;

revoke all on table public.category_slug_redirects from anon, authenticated;
revoke all on table public.tag_slug_redirects from anon, authenticated;
grant select on table public.category_slug_redirects to anon, authenticated;
grant select on table public.tag_slug_redirects to anon, authenticated;

create policy category_slug_redirects_select_public
on public.category_slug_redirects
for select
to anon, authenticated
using (true);

create policy tag_slug_redirects_select_public
on public.tag_slug_redirects
for select
to anon, authenticated
using (true);

-- Same slug ownership rules as posts: a category may take back one of its own
-- old slugs, may not take a slug that redirects to another category, and a
-- slug change records the old slug. Runs for every write path.
create or replace function public.maintain_category_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.category_slug_redirects
    where category_slug_redirects.old_slug = new.slug
      and category_slug_redirects.category_id <> new.id
  ) then
    raise exception 'Slug already in use by a category redirect'
      using errcode = '23505';
  end if;

  delete from public.category_slug_redirects
  where category_slug_redirects.old_slug = new.slug
    and category_slug_redirects.category_id = new.id;

  if tg_op = 'UPDATE' and old.slug <> new.slug then
    insert into public.category_slug_redirects (old_slug, category_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set category_id = excluded.category_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger categories_maintain_slug_redirects
after insert or update of slug on public.categories
for each row
execute function public.maintain_category_slug_redirects();

create or replace function public.maintain_tag_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.tag_slug_redirects
    where tag_slug_redirects.old_slug = new.slug
      and tag_slug_redirects.tag_id <> new.id
  ) then
    raise exception 'Slug already in use by a tag redirect'
      using errcode = '23505';
  end if;

  delete from public.tag_slug_redirects
  where tag_slug_redirects.old_slug = new.slug
    and tag_slug_redirects.tag_id = new.id;

  if tg_op = 'UPDATE' and old.slug <> new.slug then
    insert into public.tag_slug_redirects (old_slug, tag_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set tag_id = excluded.tag_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger tags_maintain_slug_redirects
after insert or update of slug on public.tags
for each row
execute function public.maintain_tag_slug_redirects();

-- 2. Post write limits during taxonomy reassignment --------------------------
--
-- Deleting a category or tag updates every affected post in one admin action.
-- The Phase 10 per-row post.update limit (120 per 10 minutes) would reject a
-- large reassignment, so the taxonomy RPCs set a transaction-local flag and
-- consume one taxonomy.write event instead. Clients cannot set the flag: it is
-- only set inside these security-definer functions, and PostgREST exposes no
-- set_config.

create or replace function public.enforce_post_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('jet.taxonomy_reassignment', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.consume_rate_limit('post.create', 30, interval '1 hour');
  elsif new.status is distinct from old.status then
    perform public.consume_rate_limit('post.publication', 30, interval '1 hour');
  else
    perform public.consume_rate_limit('post.update', 120, interval '10 minutes');
  end if;

  return new;
end;
$$;

-- 3. Administration RPCs ----------------------------------------------------
--
-- Input is normalized by the Server Action (src/lib/slug.ts); the table CHECK
-- constraints and unique indexes are the final authority. taxonomy.write allows
-- 60 changes per admin per 10 minutes.

create or replace function public.require_taxonomy_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
begin
  perform public.consume_rate_limit('taxonomy.write', 60, interval '10 minutes');
  return actor;
end;
$$;

create or replace function public.create_category(
  p_name text,
  p_slug text,
  p_description text,
  p_parent_id uuid,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_id uuid;
begin
  if p_parent_id is not null
    and not exists (select 1 from public.categories where id = p_parent_id)
  then
    raise exception 'Invalid parent category' using errcode = '22023';
  end if;

  insert into public.categories (name, slug, description, parent_id, sort_order)
  values (p_name, p_slug, p_description, p_parent_id, coalesce(p_sort_order, 0))
  returning id into v_id;

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'category.created',
    jsonb_build_object('category_id', v_id, 'name', p_name, 'slug', p_slug)
  );

  return v_id;
end;
$$;

create or replace function public.update_category(
  p_category_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_slug text,
  p_description text,
  p_parent_id uuid,
  p_sort_order integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_current public.categories%rowtype;
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

  if p_parent_id is not null
    and not exists (select 1 from public.categories where id = p_parent_id)
  then
    raise exception 'Invalid parent category' using errcode = '22023';
  end if;

  -- prevent_category_cycle rejects a move under the category itself or one of
  -- its descendants (23514).
  update public.categories
  set name = p_name,
      slug = p_slug,
      description = p_description,
      parent_id = p_parent_id,
      sort_order = coalesce(p_sort_order, 0)
  where id = p_category_id;

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'category.updated',
    jsonb_build_object(
      'category_id', p_category_id,
      'name', p_name,
      'slug', p_slug,
      'previous_slug', v_current.slug,
      'parent_id', p_parent_id,
      'previous_parent_id', v_current.parent_id
    )
  );
end;
$$;

-- Returns the number of posts moved to the target category.
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
  from public.posts
  where category_id = p_category_id;

  if v_post_count > 0 and p_target_category_id is null then
    raise exception 'Target category required' using errcode = '22023';
  end if;

  perform set_config('jet.taxonomy_reassignment', 'on', true);

  update public.posts
  set category_id = p_target_category_id,
      revision = revision + 1
  where category_id = p_category_id;

  -- Children keep their place in the tree one level up. A target that was a
  -- descendant stays valid: it simply moves up with its siblings.
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

  -- The freed slug now redirects to the target archive. Inserted after the
  -- delete, so the slug no longer belongs to a live category.
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

create or replace function public.create_tag(
  p_name text,
  p_slug text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_id uuid;
begin
  insert into public.tags (name, slug, description)
  values (p_name, p_slug, p_description)
  returning id into v_id;

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'tag.created',
    jsonb_build_object('tag_id', v_id, 'name', p_name, 'slug', p_slug)
  );

  return v_id;
end;
$$;

create or replace function public.update_tag(
  p_tag_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_slug text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_taxonomy_admin();
  v_current public.tags%rowtype;
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

  update public.tags
  set name = p_name,
      slug = p_slug,
      description = p_description
  where id = p_tag_id;

  insert into public.editorial_audit_log (actor_profile_id, action, details)
  values (
    actor,
    'tag.updated',
    jsonb_build_object(
      'tag_id', p_tag_id,
      'name', p_name,
      'slug', p_slug,
      'previous_slug', v_current.slug
    )
  );
end;
$$;

-- Returns the number of posts the tag was removed from.
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

  update public.posts
  set revision = revision + 1
  where id in (
    select post_tags.post_id
    from public.post_tags
    where post_tags.tag_id = p_tag_id
  );

  get diagnostics v_post_count = row_count;

  delete from public.post_tags where tag_id = p_tag_id;
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

revoke all on function public.maintain_category_slug_redirects()
  from public, anon, authenticated;
revoke all on function public.maintain_tag_slug_redirects()
  from public, anon, authenticated;
revoke all on function public.enforce_post_write_rate_limit()
  from public, anon, authenticated;
revoke all on function public.require_taxonomy_admin()
  from public, anon, authenticated;

revoke all on function public.create_category(text, text, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.update_category(uuid, timestamptz, text, text, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.delete_category(uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.create_tag(text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_tag(uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_tag(uuid, timestamptz)
  from public, anon, authenticated;

grant execute on function public.create_category(text, text, text, uuid, integer)
  to authenticated;
grant execute on function public.update_category(uuid, timestamptz, text, text, text, uuid, integer)
  to authenticated;
grant execute on function public.delete_category(uuid, timestamptz, uuid)
  to authenticated;
grant execute on function public.create_tag(text, text, text)
  to authenticated;
grant execute on function public.update_tag(uuid, timestamptz, text, text, text)
  to authenticated;
grant execute on function public.delete_tag(uuid, timestamptz)
  to authenticated;
