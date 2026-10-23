-- Author identity administration (admin only).
--
-- Admins create, rename, re-slug, describe, link, unlink, and delete author
-- identities. Direct client writes on authors close; every write goes through
-- the security-definer RPCs below, which re-check admin membership, compare the
-- loaded updated_at to reject stale forms (40001), record an audit entry, and
-- consume one author.write rate-limit event.
--
-- Decisions (user, 2026-10-23):
--   * Changing an author slug records the old slug as a redirect, the same
--     one-hop model as posts, categories, and tags.
--   * An author credited on any post (draft or published) cannot be deleted.
--     Credits are removed in the post editor first, so a published post never
--     silently loses its byline.
--   * An author may link only to an active editorial member's account. A link
--     is identity bookkeeping: it grants no editorial access, and edit rights
--     still come from editorial_members and posts.created_by. A link survives
--     deactivation and is cleared when the account is deleted (on delete set
--     null), so the public byline stays.
--
-- authors.user_id stays unreadable for clients; admins read links through
-- list_author_account_links().

-- 1. Constraints -------------------------------------------------------------

-- Slugs had a format check only. Match the category limit so redirect rows and
-- form validation share one bound.
alter table public.authors
  add constraint authors_slug_length check (char_length(slug) <= 120);

-- 2. Slug redirects ----------------------------------------------------------

create table public.author_slug_redirects (
  old_slug text primary key,
  author_id uuid not null references public.authors (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint author_slug_redirects_slug_format check (
    old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(old_slug) <= 120
  )
);

create index author_slug_redirects_author_id_idx
  on public.author_slug_redirects (author_id);

alter table public.author_slug_redirects enable row level security;

revoke all on table public.author_slug_redirects from anon, authenticated;
grant select on table public.author_slug_redirects to anon, authenticated;

-- An author is public only while credited on a visible post, so a redirect is
-- visible only when its author row is. The subquery runs with the caller's
-- authors policies.
create policy author_slug_redirects_select_visible_author
on public.author_slug_redirects
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.authors
    where authors.id = author_slug_redirects.author_id
  )
);

create or replace function public.maintain_author_slug_redirects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.author_slug_redirects
    where author_slug_redirects.old_slug = new.slug
      and author_slug_redirects.author_id <> new.id
  ) then
    raise exception 'Slug already in use by an author redirect'
      using errcode = '23505';
  end if;

  delete from public.author_slug_redirects
  where author_slug_redirects.old_slug = new.slug
    and author_slug_redirects.author_id = new.id;

  if tg_op = 'UPDATE' and old.slug <> new.slug then
    insert into public.author_slug_redirects (old_slug, author_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set author_id = excluded.author_id,
          created_at = now();
  end if;

  return new;
end;
$$;

create trigger authors_maintain_slug_redirects
after insert or update of slug on public.authors
for each row
execute function public.maintain_author_slug_redirects();

-- 3. Close direct writes -----------------------------------------------------

drop policy authors_insert_admin on public.authors;
drop policy authors_update_admin on public.authors;
drop policy authors_delete_admin on public.authors;

revoke insert, update, delete on table public.authors from anon, authenticated;

-- 4. Administration RPCs -----------------------------------------------------
--
-- Input is normalized by the Server Action (src/lib/slug.ts); the table CHECK
-- constraints and unique indexes are the final authority. author.write allows
-- 60 changes per admin per 10 minutes.

create or replace function public.require_author_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_admin_actor();
begin
  perform public.consume_rate_limit('author.write', 60, interval '10 minutes');
  return actor;
end;
$$;

-- A new link must point at an active editorial member. Keeping an existing
-- link (unchanged profile id) is allowed after the member was deactivated.
create or replace function public.assert_author_account_link(
  p_profile_id uuid,
  p_current_profile_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_profile_id is null or p_profile_id is not distinct from p_current_profile_id then
    return;
  end if;

  if not exists (
    select 1
    from public.editorial_members
    where profile_id = p_profile_id
      and deactivated_at is null
  ) then
    raise exception 'Linked account must be an active editorial member'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_author(
  p_name text,
  p_slug text,
  p_bio text,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_author_admin();
  v_id uuid;
begin
  perform public.assert_author_account_link(p_profile_id, null);

  insert into public.authors (name, slug, bio, user_id)
  values (p_name, p_slug, p_bio, p_profile_id)
  returning id into v_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    'author.created',
    p_profile_id,
    jsonb_build_object('author_id', v_id, 'name', p_name, 'slug', p_slug)
  );

  return v_id;
end;
$$;

create or replace function public.update_author(
  p_author_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_slug text,
  p_bio text,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.require_author_admin();
  v_current public.authors%rowtype;
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

  perform public.assert_author_account_link(p_profile_id, v_current.user_id);

  update public.authors
  set name = p_name,
      slug = p_slug,
      bio = p_bio,
      user_id = p_profile_id
  where id = p_author_id;

  insert into public.editorial_audit_log (
    actor_profile_id,
    action,
    target_profile_id,
    details
  )
  values (
    actor,
    'author.updated',
    coalesce(p_profile_id, v_current.user_id),
    jsonb_build_object(
      'author_id', p_author_id,
      'name', p_name,
      'slug', p_slug,
      'previous_slug', v_current.slug,
      'profile_id', p_profile_id,
      'previous_profile_id', v_current.user_id
    )
  );
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

  -- post_authors.author_id is on delete restrict as well; this check gives a
  -- clear error before the foreign key does. A credit added concurrently still
  -- hits the restrict.
  select count(*)
  into v_credit_count
  from public.post_authors
  where author_id = p_author_id;

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

-- Admin-only read of the account links behind the author list. Reads spend no
-- rate-limit events.
create or replace function public.list_author_account_links()
returns table (author_id uuid, profile_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_actor();

  return query
  select authors.id, authors.user_id
  from public.authors
  where authors.user_id is not null;
end;
$$;

revoke all on function public.maintain_author_slug_redirects()
  from public, anon, authenticated;
revoke all on function public.require_author_admin()
  from public, anon, authenticated;
revoke all on function public.assert_author_account_link(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.create_author(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.update_author(uuid, timestamptz, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_author(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.list_author_account_links()
  from public, anon, authenticated;

grant execute on function public.create_author(text, text, text, uuid)
  to authenticated;
grant execute on function public.update_author(uuid, timestamptz, text, text, text, uuid)
  to authenticated;
grant execute on function public.delete_author(uuid, timestamptz)
  to authenticated;
grant execute on function public.list_author_account_links()
  to authenticated;
