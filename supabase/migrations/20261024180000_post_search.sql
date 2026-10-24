-- Phase 19: full-text search over published posts.
--
-- 1. A stored, generated tsvector on posts: title (weight A), excerpt (B), and
--    the text nodes of the Tiptap body (C). Each part is indexed twice: once
--    with the post language's stemming configuration (turkish, english,
--    german) and once with an accent-folded, unstemmed configuration
--    (search_folded), so "kucuk" finds "küçük" and "isik" finds "Işık".
-- 2. A partial GIN index over published rows, the only rows search reads.
-- 3. search_published_posts(): a SECURITY DEFINER function that parses user
--    input with websearch_to_tsquery, filters status = 'published' itself,
--    ranks with ts_rank, and returns highlighted title and snippet text with
--    control-character markers instead of HTML.
-- 4. A per-IP search rate limit in the existing hashed-subject mechanism
--    (consume_auth_rate_limit), called by the server before each search.

-- 1. Text search configurations and the search document --------------------

create extension if not exists unaccent with schema extensions;

-- Accent-folded words without stemming or stop words. Folding happens before
-- lowercasing, so Turkish İ and ı both become i. The database locale lowercases
-- I to i (not ı), so the language branch alone would miss "ışık" for "IŞIK";
-- the folded branch matches both.
create text search configuration public.search_folded (copy = pg_catalog.simple);

alter text search configuration public.search_folded
  alter mapping for hword, hword_part, word
  with extensions.unaccent, pg_catalog.simple;

-- Stemming configuration for a post language. Mirrors the allowed set in
-- src/features/posts/language.ts and posts_language_check; an unknown value
-- falls back to Turkish, the default language.
create function public.post_search_config(p_language text)
returns regconfig
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_language
    when 'en' then 'pg_catalog.english'::regconfig
    when 'de' then 'pg_catalog.german'::regconfig
    else 'pg_catalog.turkish'::regconfig
  end;
$$;

-- The text of every Tiptap text node, in document order. Node attributes
-- (link targets, image alt text and captions, YouTube titles) are not
-- searched. Strict mode keeps the recursive descent from visiting array
-- elements twice.
create function public.post_body_search_text(p_body jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(node #>> '{}', ' '), '')
  from jsonb_path_query(
    coalesce(p_body, '{}'::jsonb),
    'strict $.** ? (@.type == "text").text'
  ) as nodes (node);
$$;

-- Pure functions without data access: they keep the default execute grants,
-- because the generated column evaluates them for whichever role writes posts.
create function public.post_search_document(
  p_language text,
  p_title text,
  p_excerpt text,
  p_body jsonb
)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    setweight(pg_catalog.to_tsvector(public.post_search_config(p_language), coalesce(p_title, '')), 'A')
    || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, coalesce(p_title, '')), 'A')
    || setweight(pg_catalog.to_tsvector(public.post_search_config(p_language), coalesce(p_excerpt, '')), 'B')
    || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, coalesce(p_excerpt, '')), 'B')
    || setweight(pg_catalog.to_tsvector(public.post_search_config(p_language), public.post_body_search_text(p_body)), 'C')
    || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, public.post_body_search_text(p_body)), 'C');
$$;

-- Stored, so ranking reads no JSON at query time. Adding it rewrites posts
-- once; every later insert or update recomputes it from the same row.
alter table public.posts
  add column search_vector tsvector
  generated always as (
    public.post_search_document(language, title, excerpt, body)
  ) stored;

-- Search reads published rows only (search_published_posts), so the partial
-- index skips drafts entirely.
create index posts_search_vector_idx
  on public.posts using gin (search_vector)
  where status = 'published';

-- 2. Search function ------------------------------------------------------

-- Number of highlight start markers (U+0002) in a ts_headline result.
create function public.search_marker_count(p_text text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select char_length(p_text) - char_length(replace(p_text, chr(2), ''));
$$;
--
-- SECURITY DEFINER, with status = 'published' as the visibility rule. Under
-- RLS the planner cannot use the GIN index: the @@ operator is not
-- leakproof, so it may not run before the posts_select_visible policy, and
-- every published row would be scanned and checked with can_view_post().
-- The owner bypasses RLS, so the index applies. The filter is stricter than
-- the policy for every caller (an author's own drafts are excluded too), and
-- ranking, counting, and highlighting run only over rows that passed it, so
-- no draft text reaches a rank, a total, or a snippet. The function returns
-- ids and highlights only; the application reads the cards through the
-- anonymous client, so RLS still filters what is displayed.
--
-- Input: at most 200 characters, parsed by websearch_to_tsquery (quoted
-- phrases, "or", and -exclusion; never raises a syntax error). Each language
-- branch ORs its stemmed query with the accent-folded one, and a post is
-- matched only by the branch of its own language, so a German stem cannot
-- match a Turkish post by accident.
--
-- Output: one page in rank order (ties: newer publication first, then id),
-- the total match count, and the title and a snippet from ts_headline. The
-- markers are U+0002 (start) and U+0003 (end); those characters are removed
-- from the source text first, so every marker is one ts_headline inserted.
-- A word matched by both configurations carries nested markers.
-- The application renders the segments as text; no HTML is produced or
-- trusted (ts_headline does not escape markup).
create function public.search_published_posts(
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
  v_folded tsquery;
  v_tr tsquery;
  v_en tsquery;
  v_de tsquery;
  v_markers constant text := chr(2) || chr(3);
  v_options constant text :=
    'StartSel=' || chr(2) || ', StopSel=' || chr(3);
begin
  if p_query is null or char_length(p_query) > 200 then
    raise exception 'Search query must be at most 200 characters'
      using errcode = '22023';
  end if;

  if p_language is not null and p_language not in ('tr', 'en', 'de') then
    raise exception 'Unsupported search language %', p_language
      using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 1000 then
    raise exception 'Search page out of range'
      using errcode = '22023';
  end if;

  v_folded := pg_catalog.websearch_to_tsquery('public.search_folded'::regconfig, p_query);
  v_tr := pg_catalog.websearch_to_tsquery('pg_catalog.turkish'::regconfig, p_query) || v_folded;
  v_en := pg_catalog.websearch_to_tsquery('pg_catalog.english'::regconfig, p_query) || v_folded;
  v_de := pg_catalog.websearch_to_tsquery('pg_catalog.german'::regconfig, p_query) || v_folded;

  -- Punctuation only: nothing to match.
  if pg_catalog.numnode(v_folded) = 0 then
    return;
  end if;

  return query
  with matches as (
    select
      posts.id,
      posts.language,
      posts.title,
      posts.excerpt,
      posts.body,
      posts.published_at,
      posts.search_vector,
      case posts.language
        when 'en' then v_en
        when 'de' then v_de
        else v_tr
      end as query
    from public.posts
    where posts.status = 'published'
      and (p_language is null or posts.language = p_language)
      and (
        (posts.language = 'tr' and posts.search_vector @@ v_tr)
        or (posts.language = 'en' and posts.search_vector @@ v_en)
        or (posts.language = 'de' and posts.search_vector @@ v_de)
      )
  ),
  ranked as (
    select
      matches.*,
      -- Normalization 1 divides by 1 + log(document length), so a long body
      -- does not outrank a title match by repetition alone.
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
  -- The stemmed configuration marks inflected forms ("adımla" for "adım"),
  -- the folded one accent-insensitive forms ("küçük" for "kucuk"). The second
  -- pass marks over the first one's output, so a word can carry two marker
  -- pairs; the application reads nested markers as one highlight. Titles
  -- are highlighted in full; for the snippet, each configuration picks its
  -- own fragments and the one with more marked words wins (stemmed on a tie).
  cross join lateral (
    select
      pg_catalog.ts_headline(
        'public.search_folded'::regconfig,
        pg_catalog.ts_headline(
          public.post_search_config(page.language), source.title_text, page.query,
          v_options || ', HighlightAll=true'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as title_highlight,
      pg_catalog.ts_headline(
        'public.search_folded'::regconfig,
        pg_catalog.ts_headline(
          public.post_search_config(page.language), source.document_text, page.query,
          v_options || ', MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter=" … "'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as snippet_stemmed,
      pg_catalog.ts_headline(
        public.post_search_config(page.language),
        pg_catalog.ts_headline(
          'public.search_folded'::regconfig, source.document_text, page.query,
          v_options || ', MaxFragments=2, MaxWords=24, MinWords=8, FragmentDelimiter=" … "'
        ),
        page.query,
        v_options || ', HighlightAll=true'
      ) as snippet_folded
  ) as candidates
  -- A post can match through lexemes of both branches at once (the folded
  -- "kucuk" plus the stemmed "ekran" from "ekranlarda"), which neither
  -- headline pass recognizes alone. The snippet then falls back to the
  -- opening words of the excerpt and body, unmarked.
  cross join lateral (
    select
      candidates.title_highlight,
      case
        when greatest(
          public.search_marker_count(candidates.snippet_folded),
          public.search_marker_count(candidates.snippet_stemmed)
        ) = 0
          then pg_catalog.ts_headline(
            public.post_search_config(page.language), source.document_text, page.query,
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

revoke all on function public.search_published_posts(text, text, integer, integer) from public;
grant execute on function public.search_published_posts(text, text, integer, integer)
  to anon, authenticated, service_role;

-- 3. Search rate limit ----------------------------------------------------
--
-- Same table and function as the Phase 11 Auth limits: the server hashes the
-- client IP (first X-Forwarded-For entry) and calls this with the secret key
-- before every search. Rule: search.query, ip 30 per minute. Searches carry
-- no email subject. The function stays callable by service_role only, so a
-- client cannot exhaust another address's budget; a client calling
-- search_published_posts directly through the Data API bypasses this limit,
-- as it can already read every published post directly.

alter table public.auth_rate_limit_events
  drop constraint auth_rate_limit_events_action_check;

alter table public.auth_rate_limit_events
  add constraint auth_rate_limit_events_action_check check (
    action in ('auth.sign_up', 'auth.sign_in', 'auth.password_reset', 'search.query')
  );

create or replace function public.consume_auth_rate_limit(
  p_action text,
  p_email_hash text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_max integer;
  v_ip_max integer;
  v_window interval;
  v_subject record;
  v_count integer;
begin
  case p_action
    when 'auth.sign_up' then
      v_email_max := 3; v_ip_max := 10; v_window := interval '1 hour';
    when 'auth.sign_in' then
      v_email_max := 10; v_ip_max := 30; v_window := interval '10 minutes';
    when 'auth.password_reset' then
      v_email_max := 3; v_ip_max := 10; v_window := interval '1 hour';
    when 'search.query' then
      if p_email_hash is not null then
        raise exception 'search.query is limited by IP only'
          using errcode = '22023';
      end if;
      v_ip_max := 30; v_window := interval '1 minute';
    else
      raise exception 'Unknown auth rate-limit action %', p_action
        using errcode = '22023';
  end case;

  -- Check every subject before recording any, so a rejected attempt is not
  -- counted against the other subject.
  for v_subject in
    select kind, hash, max_events
    from (values
      ('email', p_email_hash, v_email_max),
      ('ip', p_ip_hash, v_ip_max)
    ) as subjects (kind, hash, max_events)
    where hash is not null
    order by kind
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'auth_rate_limit:' || p_action || ':' || v_subject.kind || ':' || v_subject.hash,
        0
      )
    );

    delete from public.auth_rate_limit_events
    where auth_rate_limit_events.action = p_action
      and auth_rate_limit_events.subject_kind = v_subject.kind
      and auth_rate_limit_events.subject_hash = v_subject.hash
      and auth_rate_limit_events.created_at <= now() - v_window;

    select count(*)
    into v_count
    from public.auth_rate_limit_events
    where auth_rate_limit_events.action = p_action
      and auth_rate_limit_events.subject_kind = v_subject.kind
      and auth_rate_limit_events.subject_hash = v_subject.hash;

    if v_count >= v_subject.max_events then
      raise exception 'Rate limit exceeded for %', p_action
        using errcode = 'PT429',
              hint = format('At most %s per %s.', v_subject.max_events, v_window);
    end if;
  end loop;

  insert into public.auth_rate_limit_events (action, subject_kind, subject_hash)
  select p_action, kind, hash
  from (values ('email', p_email_hash), ('ip', p_ip_hash)) as subjects (kind, hash)
  where hash is not null;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, text)
  to service_role;
