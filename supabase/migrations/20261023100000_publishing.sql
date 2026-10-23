-- Phase 8: publishing, unpublishing, and slug redirects.
--
-- Workflow (D2): draft -> published, and published -> draft through
-- unpublish. Only editors and admins (D1) publish or unpublish; authors never
-- do. Both transitions are security-definer RPCs that reuse the revision
-- compare-and-swap from update_post_metadata (D3), so a stale admin page cannot
-- publish or unpublish a post that changed after it was loaded.
--
-- published_at is set by the publish RPC only. It is independent of
-- created_at/updated_at: the publish update bumps updated_at to the same
-- transaction timestamp, so "updated after publication" means
-- updated_at > published_at.

-- Old published slugs keep working. A redirect stores the post id, not the
-- target slug, so it always resolves to the post's current slug in a single
-- hop and chains cannot form.
create table public.post_slug_redirects (
  old_slug text primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_slug_redirects_slug_format check (
    old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(old_slug) <= 200
  )
);

create index post_slug_redirects_post_id_idx
  on public.post_slug_redirects (post_id);

-- Slug ownership across posts and redirects:
--   * a post may take back one of its own old slugs (the redirect is removed)
--   * a post may not take a slug that still redirects to another post, so a
--     shared URL never silently starts pointing somewhere else
--   * changing the slug of a published post records the old slug
-- The trigger runs for every write path, including service-role scripts.
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
  ) then
    raise exception 'Slug already in use' using errcode = '23505';
  end if;

  delete from public.post_slug_redirects
  where post_slug_redirects.old_slug = new.slug
    and post_slug_redirects.post_id = new.id;

  if tg_op = 'UPDATE'
    and old.slug <> new.slug
    and old.status = 'published'
  then
    insert into public.post_slug_redirects (old_slug, post_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set post_id = excluded.post_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger posts_maintain_slug_redirects
after insert or update of slug on public.posts
for each row
execute function public.maintain_post_slug_redirects();

alter table public.post_slug_redirects enable row level security;

revoke all on table public.post_slug_redirects from anon, authenticated;
grant select on table public.post_slug_redirects to anon, authenticated;

-- A redirect is visible exactly when its post is visible, so an unpublished
-- post's old URLs return 404 for the public.
create policy post_slug_redirects_select_visible
on public.post_slug_redirects
for select
to anon, authenticated
using (public.can_view_post(post_id));

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

  if v_post.category_id is null then
    raise exception 'Published post requires a category' using errcode = '23514';
  end if;

  perform public.assert_post_body(v_post.body, v_post.content_version);

  update public.posts
  set status = 'published',
      published_at = v_published_at,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  return query
  select p_post_id, v_post.revision + 1, v_post.slug, v_published_at;
end;
$$;

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

  update public.posts
  set status = 'draft',
      published_at = null,
      revision = v_post.revision + 1
  where posts.id = p_post_id;

  return query select p_post_id, v_post.revision + 1, v_post.slug;
end;
$$;

revoke all on function public.maintain_post_slug_redirects()
  from public, anon, authenticated;
revoke all on function public.publish_post(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.unpublish_post(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.publish_post(uuid, integer) to authenticated;
grant execute on function public.unpublish_post(uuid, integer) to authenticated;
