-- Phase 20: search runs only through the application server.
--
-- search_published_posts() was executable by anon and authenticated, so any
-- client could call it directly through the Data API (/rest/v1/rpc) and skip
-- the per-IP limit that /search applies before every query
-- (consume_auth_rate_limit, action search.query). The function returns only
-- published content, so this was a load problem, not a disclosure.
--
-- Revoking execute from the client roles leaves one caller: the Next.js server
-- with the secret key (service_role), which consumes the rate limit first. The
-- visibility rule stays inside the function (its explicit status =
-- 'published' filter as SECURITY DEFINER), so the caller's key does not widen
-- what a search can return. Cards are still read with the anonymous key under
-- RLS. An in-database per-caller limit was not chosen: PostgREST only offers
-- the same spoofable X-Forwarded-For header, and a global limit would let one
-- client starve every reader.

revoke execute on function public.search_published_posts(text, text, integer, integer)
  from anon, authenticated;

grant execute on function public.search_published_posts(text, text, integer, integer)
  to service_role;
