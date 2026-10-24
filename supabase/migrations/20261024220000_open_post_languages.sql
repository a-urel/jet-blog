-- Phase 21: posts in any language.
--
-- posts.language was limited to tr, en, and de. It now holds any well-formed
-- BCP 47 tag in canonical form, decoupled from the interface languages (a
-- separate, small set; see src/lib/interface-locales.ts).
--
-- 1. is_post_language_tag(): the accepted grammar, used by the CHECK
--    constraint, assert_post_language(), and the search filter.
-- 2. post_search_config(): a post language's primary subtag picks the
--    matching built-in text search configuration; any other language uses
--    the accent-folded search_folded configuration alone.
-- 3. Typographic apostrophes are indexed like ASCII ones, so French and
--    Italian elisions (l’élégance, dell’arte) split into words.
-- 4. The stored search_vector is regenerated for existing rows.
-- 5. search_published_posts() matches every language through one GIN-usable
--    prefilter instead of one branch per language.
--
-- The authoring RPC signatures (create_draft_post, update_post_metadata) do
-- not change: they already call assert_post_language().

-- 1. Language tag grammar -------------------------------------------------
--
-- A pragmatic subset of BCP 47 (RFC 5646), in canonical casing:
--
--   language  2-3 lowercase letters      tr, fil
--   script    optional, 4 letters,       zh-Hant, sr-Latn
--             first uppercase
--   region    optional, 2 uppercase      pt-BR, zh-Hant-TW
--             letters or 3 digits        es-419
--
-- Variants, extensions, private use, grandfathered tags, and the special
-- codes und, mis, mul, and zxx are rejected. The longest accepted tag has 12
-- characters. The database checks the grammar and casing; the application
-- (canonicalizePostLanguage in src/features/posts/language.ts) also applies
-- CLDR aliases with Intl.getCanonicalLocales, so "iw" is stored as "he" and
-- "fra" as "fr". The shared fixtures in
-- src/features/posts/language-fixtures.ts keep both sides in step.

create function public.is_post_language_tag(p_language text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    p_language ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'
      and split_part(p_language, '-', 1) not in ('und', 'mis', 'mul', 'zxx'),
    false
  );
$$;

-- A pure function without data access: it keeps the default execute grants,
-- because the CHECK constraint evaluates it for whichever role writes posts.

alter table public.posts
  drop constraint posts_language_check;

alter table public.posts
  add constraint posts_language_check
    check (public.is_post_language_tag(language));

create or replace function public.assert_post_language(p_language text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not public.is_post_language_tag(p_language) then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
end;
$$;

-- 2. Text search configuration per language -------------------------------
--
-- The built-in (Snowball) configurations of PostgreSQL 17, listed with
--   select cfgname from pg_ts_config
--   where cfgnamespace = 'pg_catalog'::regnamespace;
-- keyed by ISO 639-1 primary subtag (Norwegian under no, nb, and nn). The
-- script and region subtags do not change stemming, so pt-BR uses
-- portuguese and sr-Latn serbian (the Serbian stemmer reads Latin and
-- Cyrillic). "simple" is not listed: languages without a stemmer use
-- search_folded, which also folds accents.

create function public.post_search_config_map()
returns table (language_subtag text, config regconfig)
language sql
immutable
parallel safe
set search_path = ''
as $$
  values
    ('ar', 'pg_catalog.arabic'::regconfig),
    ('hy', 'pg_catalog.armenian'::regconfig),
    ('eu', 'pg_catalog.basque'::regconfig),
    ('ca', 'pg_catalog.catalan'::regconfig),
    ('da', 'pg_catalog.danish'::regconfig),
    ('nl', 'pg_catalog.dutch'::regconfig),
    ('en', 'pg_catalog.english'::regconfig),
    ('fi', 'pg_catalog.finnish'::regconfig),
    ('fr', 'pg_catalog.french'::regconfig),
    ('de', 'pg_catalog.german'::regconfig),
    ('el', 'pg_catalog.greek'::regconfig),
    ('hi', 'pg_catalog.hindi'::regconfig),
    ('hu', 'pg_catalog.hungarian'::regconfig),
    ('id', 'pg_catalog.indonesian'::regconfig),
    ('ga', 'pg_catalog.irish'::regconfig),
    ('it', 'pg_catalog.italian'::regconfig),
    ('lt', 'pg_catalog.lithuanian'::regconfig),
    ('ne', 'pg_catalog.nepali'::regconfig),
    ('no', 'pg_catalog.norwegian'::regconfig),
    ('nb', 'pg_catalog.norwegian'::regconfig),
    ('nn', 'pg_catalog.norwegian'::regconfig),
    ('pt', 'pg_catalog.portuguese'::regconfig),
    ('ro', 'pg_catalog.romanian'::regconfig),
    ('ru', 'pg_catalog.russian'::regconfig),
    ('sr', 'pg_catalog.serbian'::regconfig),
    ('es', 'pg_catalog.spanish'::regconfig),
    ('sv', 'pg_catalog.swedish'::regconfig),
    ('ta', 'pg_catalog.tamil'::regconfig),
    ('tr', 'pg_catalog.turkish'::regconfig),
    ('yi', 'pg_catalog.yiddish'::regconfig);
$$;

-- Previously an unknown value fell back to Turkish; the CHECK constraint
-- allowed only tr, en, and de, so no stored row changes configuration.
create or replace function public.post_search_config(p_language text)
returns regconfig
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    (
      select map.config
      from public.post_search_config_map() as map
      where map.language_subtag = split_part(p_language, '-', 1)
    ),
    'public.search_folded'::regconfig
  );
$$;

-- 3. Apostrophes -----------------------------------------------------------
--
-- The default parser splits words at an ASCII apostrophe (l'élégance gives
-- "l" and "élégance") but reads U+2019 as part of the word, so "élégance"
-- would not find l’élégance. Documents and queries are mapped the same way.
-- Highlighting reads the original text, so a word joined by U+2019 can match
-- without a marker; the snippet then falls back to the opening words.
create function public.post_search_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.translate(p_text, '’', '''');
$$;

-- A language without a stemmer would otherwise index the folded words twice
-- and rank its posts higher than a stemmed post with the same text.
create or replace function public.post_search_document(
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
  with source as (
    select
      public.post_search_config(p_language) as config,
      public.post_search_text(coalesce(p_title, '')) as title,
      public.post_search_text(coalesce(p_excerpt, '')) as excerpt,
      public.post_search_text(public.post_body_search_text(p_body)) as body
  )
  select case
    when source.config = 'public.search_folded'::regconfig then
      setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.title), 'A')
      || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.excerpt), 'B')
      || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.body), 'C')
    else
      setweight(pg_catalog.to_tsvector(source.config, source.title), 'A')
      || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.title), 'A')
      || setweight(pg_catalog.to_tsvector(source.config, source.excerpt), 'B')
      || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.excerpt), 'B')
      || setweight(pg_catalog.to_tsvector(source.config, source.body), 'C')
      || setweight(pg_catalog.to_tsvector('public.search_folded'::regconfig, source.body), 'C')
  end
  from source;
$$;

-- 4. Regenerate the stored search document --------------------------------
--
-- Replacing a function does not recompute stored generated values. SET
-- EXPRESSION (PostgreSQL 17) rewrites the table with the same expression,
-- recomputing search_vector for every row and rebuilding its indexes,
-- without firing row triggers (updated_at, slug redirects, rate limits).

alter table public.posts
  alter column search_vector
  set expression as (public.post_search_document(language, title, excerpt, body));

-- 5. Search function ------------------------------------------------------
--
-- Unchanged contract (signature, output, service_role-only grant, published
-- filter as SECURITY DEFINER); see 20261024180000_post_search.sql and
-- 20261024200000_search_server_only.sql.
--
-- Matching: every configuration in post_search_config_map(), plus
-- search_folded, parses the query once. A post matches when its stored
-- vector matches its own configuration's query ORed with the folded one, so
-- a French stem cannot match a Turkish post by accident. The OR of all those
-- queries (v_any) is implied by every per-post query and does not depend on
-- the row, so `search_vector @@ v_any` can use posts_search_vector_idx; the
-- per-language check then runs only on the rows the index returned.
--
-- p_language: any tag accepted by is_post_language_tag(), compared exactly.
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

  -- Punctuation only: nothing to match.
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
      posts.id,
      posts.title,
      posts.excerpt,
      posts.body,
      posts.published_at,
      posts.search_vector,
      configs.config,
      configs.query
    from public.posts
    join configs
      on configs.config = public.post_search_config(posts.language)
    where posts.status = 'published'
      and posts.search_vector @@ v_any
      and posts.search_vector @@ configs.query
      and (p_language is null or posts.language = p_language)
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
  -- Highlighting as in Phase 19: the stemmed and the folded configuration
  -- each mark their forms, the snippet with more marked words wins, and a
  -- post matched only through lexemes of both falls back to the opening
  -- words. For a language without a stemmer both passes use search_folded.
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

-- CREATE OR REPLACE keeps the Phase 20 grants; restate them so this file
-- alone shows who may call the function.
revoke all on function public.search_published_posts(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_published_posts(text, text, integer, integer)
  to service_role;
