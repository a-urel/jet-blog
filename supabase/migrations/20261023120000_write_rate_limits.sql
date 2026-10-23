-- Phase 10: per-member rate limits for abuse-prone content writes.
--
-- Limits are enforced by BEFORE triggers on the written tables, so every write
-- path is covered: the authoring and publication RPCs, and any future RPC that
-- writes posts or deletes media. The Server Actions only map the error.
--
-- Rules (per signed-in actor, sliding window):
--   post.create       30 per hour         insert into posts
--   post.update      120 per 10 minutes   edit of title, slug, body, etc.
--   post.publication  30 per hour         publish and unpublish combined
--   media.delete      60 per 10 minutes   delete from media
--
-- Uploads keep their Storage insert-policy limit (20 per 10 minutes, Phase 6)
-- and invitations keep their audit-log limit in the Server Action (20 per hour,
-- Phase 2), because the invitation itself is sent by the Auth admin API.
--
-- Writes without an Auth user (service role: migrations, seeds, maintenance
-- scripts) are not limited. A rejected write raises SQLSTATE PT429, which
-- PostgREST answers with HTTP 429. Rejected and rolled-back writes are not
-- counted, because the event row is part of the same transaction.

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),
  constraint rate_limit_events_action_format check (
    action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
  )
);

create index rate_limit_events_actor_action_idx
  on public.rate_limit_events (actor_id, action, created_at desc);

-- Internal bookkeeping: no client role may read or write it.
alter table public.rate_limit_events enable row level security;
revoke all on table public.rate_limit_events from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_action text,
  p_max_events integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  v_count integer;
begin
  if actor is null then
    return;
  end if;

  -- Serialize concurrent writes of the same actor and action so two parallel
  -- requests cannot both pass a count taken before either one is recorded.
  perform pg_advisory_xact_lock(
    hashtextextended('rate_limit:' || actor::text || ':' || p_action, 0)
  );

  -- Events older than the window no longer matter for this rule.
  delete from public.rate_limit_events
  where rate_limit_events.actor_id = actor
    and rate_limit_events.action = p_action
    and rate_limit_events.created_at <= now() - p_window;

  select count(*)
  into v_count
  from public.rate_limit_events
  where rate_limit_events.actor_id = actor
    and rate_limit_events.action = p_action;

  if v_count >= p_max_events then
    raise exception 'Rate limit exceeded for %', p_action
      using errcode = 'PT429',
            hint = format('At most %s per %s.', p_max_events, p_window);
  end if;

  insert into public.rate_limit_events (actor_id, action)
  values (actor, p_action);
end;
$$;

create or replace function public.enforce_post_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger posts_enforce_write_rate_limit
before insert or update on public.posts
for each row
execute function public.enforce_post_write_rate_limit();

create or replace function public.enforce_media_delete_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('media.delete', 60, interval '10 minutes');
  return old;
end;
$$;

create trigger media_enforce_delete_rate_limit
before delete on public.media
for each row
execute function public.enforce_media_delete_rate_limit();

revoke all on function public.consume_rate_limit(text, integer, interval)
  from public, anon, authenticated;
revoke all on function public.enforce_post_write_rate_limit()
  from public, anon, authenticated;
revoke all on function public.enforce_media_delete_rate_limit()
  from public, anon, authenticated;
