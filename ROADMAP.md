# Roadmap

Last updated: 2026-10-24 (Phase 22 interface localization, on `claude/ui-localization-6a5870`)

`AGENTS.md` is the normative source for architecture, security, and delivery
rules. This document turns those rules into ordered, reviewable increments. It
does not add requirements on its own.

## How to read this roadmap

- Each phase is one reviewable delivery with a working repository at the end.
- A phase ships only when its demo journey and denied-access path are verified.
- Decision gates block dependent work. Do not implement RLS, invitations, or
  publishing policies before the related gate is answered.
- Scope grows by adding phases, not by widening an active phase.
- Sizes are relative (S/M/L), not time estimates.

## Current baseline (Phases 1–22, complete)

- Next.js 16.4.2 App Router, React 19.3.0, TypeScript, Tailwind 4.3.3,
  shadcn/ui, system-only light/dark theme.
- Database-backed home, `/posts/[slug]`, and 404 (Phase 8). Public reads use the
  anonymous client and RLS; bodies render through the shared `PostBody`
  renderer. Sample fixtures are removed.
- Supabase config, native local stack, migrations/seeds folders, and anonymous
  public-only clients.
- Email/password sign-in at `/login`, a server-verified protected `/admin`
  layout, sign-out, and Next.js 16 Proxy token refresh. Editorial access is
  invite-only; since Phase 11, public sign-up creates reader accounts only.
- Phase 2 profiles, editorial membership, public author identities, audit log,
  last-admin protection, RLS helpers, invite acceptance/set-password routes, and
  admin member administration at `/admin/members`.
- Membership and audit writes go through centralized security-definer RPCs;
  authenticated clients have no direct write grants on those tables.
- Phase 3 categories, tags, posts, ordered credits, and post-tag relations with
  unique normalization, category-cycle prevention, revision-ready posts, public
  read policies, and a synthetic seed.
- Phase 4 draft authoring at `/admin/posts`: list, create, edit, and a
  members-only preview. Metadata covers title, slug, excerpt, category, tags, and
  ordered author credits. Writes go through security-definer RPCs that
  re-check authorization, validate input, replace relations atomically, and
  reject stale revisions. Authors edit only their own drafts; editors and admins
  edit any draft or published post.
- Phase 5 body editing: `posts.body` JSONB with `content_version`, a Tiptap
  editor in the post form, one shared node/mark/attribute allowlist enforced by
  the Server Action, the authoring RPCs, and a CHECK constraint, and a read-only
  renderer without Tiptap code shared by the preview and public pages.
- Phase 6 media: one public `media` bucket (D4) with UUID object paths, a
  `public.media` table, Storage policies for members-only uploads, a per-member
  upload rate limit, signature-based server validation (no SVG), an `image` body
  node with occurrence alt text and caption, `next/image` delivery, and
  reference-aware deletion at `/admin/media`.
- Phase 7 embeds: a `youtube` body node storing only an 11-character video id,
  a required accessible title, and an optional start offset; a strict URL
  parser for youtube.com watch/shorts/embed and youtu.be links; a toolbar panel
  in the editor; and a sandboxed, lazy, 16:9 iframe on
  `www.youtube-nocookie.com` shared by the editor node view and the renderer.
- Phase 8 publishing: `publish_post`/`unpublish_post` security-definer RPCs
  (editors and admins only, revision compare-and-swap, category and body
  checks, separate `published_at`), admin Publish/Unpublish controls, ISR public
  pages with tagged Data Cache reads and explicit invalidation, one-hop slug
  redirects, "Güncellendi" after post-publication edits, and canonical post
  URLs from `NEXT_PUBLIC_SITE_URL`.
- Phase 9 SEO and sharing: post metadata (canonical, Open Graph `article`,
  Twitter summary), escaped Article (`BlogPosting`) JSON-LD with ordered
  authors, `sitemap.xml` and `robots.txt` from published content and the site
  URL, category (with descendants), tag, and author archives at
  `/categories/[slug]`, `/tags/[slug]`, and `/authors/[slug]`, a copy-link
  button and provider share links, `noindex` on admin, previews, sign-in, and
  every 404, and archive/sitemap invalidation in the existing `public-posts`
  tag flow. No migration was needed.
- Phase 10 launch readiness: an explicit public cache invalidation map
  (`features/posts/cache.ts`; draft saves no longer expire public caches),
  conflict UI that keeps every form field and the Tiptap body, per-actor write
  rate limits enforced by database triggers (HTTP 429), error, not-found, and
  loading states for public and admin routes, a static CSP and baseline
  security headers compatible with ISR, YouTube nocookie, and the media origin,
  a secrets review, a Postgres + Storage backup runbook with an exercised local
  drill (`docs/backup-and-restore.md`), and an anonymous smoke test
  (`npm run test:smoke`).
- Phase 11 reader accounts: public sign-up at `/signup` with required email
  confirmation (display name collected at sign-up), PKCE and `token_hash`
  email callbacks (`/auth/callback`, `/auth/recovery`), password reset at
  `/login/reset` without account enumeration, a letters-and-digits password
  policy, `/account` (display name, password change, sign-out, deletion),
  hashed per-email/per-IP rate limits on sign-up, sign-in, and reset, a guard
  that keeps unconfirmed self-service accounts out of editorial membership, and
  account deletion through `prepare_own_account_deletion()` plus the Auth admin
  API (active admins refused; authored content kept). Reader state stays
  derived from the absence of an editorial grant.
- Taxonomy administration (deferred follow-up 1 of 2): admin-only
  `/admin/categories` and `/admin/tags` with create, edit, move, and delete
  through audited, rate-limited security-definer RPCs, `updated_at`
  stale-form protection, public slug redirects for categories and tags,
  category deletion that moves posts to a chosen target, and tag deletion that
  removes the tag from its posts.
- Author identity administration (deferred follow-up 2 of 2): admin-only
  `/admin/authors` with create, rename, re-slug, describe, link, and delete
  through audited, rate-limited security-definer RPCs, author slug redirects,
  deletion refused while an author is credited, and account links limited to
  active editorial members (a link grants no access).
- Phase 12 bookmarks: a private `bookmarks` table (unique per user and post,
  cascades from profiles and posts, inserts only for published posts, own rows
  only for every role, a `bookmark.create` rate limit), removal in
  `prepare_own_account_deletion()`, an optimistic `aria-pressed` toggle on the
  post page and cards whose state loads in the browser so public pages stay
  ISR, safe `?next=` return paths on sign-in, and a dynamic, `noindex`
  `/account/saved` list filtered to published posts.
- Phase 13 comments: flat, plain-text `comments` (display-name snapshot from
  the profile, 2000-character limit, `visible`/`hidden`/`deleted`) and
  `comment_reports` (one per reader and comment, reason code). Post-moderation:
  visible on submit, reports never auto-hide, editors and admins hide, restore,
  or soft-delete through the audited `moderate_comment()` RPC at
  `/admin/comments`; owners hard-delete their own comment; no editing.
  `user_id` and `reporter_id` are not client-selectable. Per-user
  `comment.create` (10/hour) and `comment.report` (20/hour) limits and a
  ten-minute duplicate guard. Account deletion anonymizes comments (preflight
  plus an `ON DELETE SET NULL` trigger), keeping bodies. Visible comments are
  server-rendered in the ISR post page under per-post cache tags; comment
  changes expire only that post's tag and path.
- Phase 14 post language: `posts.language` (`tr`, `en`, `de`; default and
  backfill `tr`) with a CHECK constraint and a required `p_language` on
  `create_draft_post`/`update_post_metadata`. The post form has a language
  select that also marks the title, excerpt, and editor with `lang`. Public
  and preview pages mark the title, excerpt, and body (not the Turkish
  interface), listing cards mark their title and excerpt, Open Graph uses the
  matching locale (`tr_TR`, `en_US`, `de_DE`), and JSON-LD `inLanguage` the
  language code. Translations are not linked; interface localization is a
  separate concern.
- Phase 15 listing pagination: the home listing and the category, tag, and
  author archives render one page at a time at path-based ISR routes
  (`<listing>/page/<n>`, page 1 at the listing URL, `/page/1` redirects),
  ordered by `published_at desc, id desc`, with self-canonical pages,
  `noindex` 404s for invalid or out-of-range pages, accessible shadcn/ui
  controls, and invalidation of every listing page on public changes. No
  migration.
- Phase 16 post cover image: optional `posts.cover_media_id` (FK to
  `public.media`, `on delete restrict`) and occurrence alt text
  `posts.cover_alt`, required `p_cover_media_id`/`p_cover_alt` parameters on
  both authoring RPCs (registered image media only, row lock like body images),
  alt text required by `publish_post` and a CHECK constraint once published,
  and cover-aware `delete_media`. The post form chooses or uploads a cover with
  preview, alt text, and remove. The post header, listing cards, and member
  preview render it in a 16:9 `next/image` box; Open Graph `images`, Twitter
  `summary_large_image`, and JSON-LD `image` use its absolute media URL.
- Phase 17 syndication feed: an Atom 1.0 feed at `/feed.xml` (ISR Route
  Handler, `revalidate = 300`, in the invalidation map) of the 20 newest
  published posts from the anonymous client: `urn:uuid` entry ids, canonical
  links, published/updated times, authors in credit order, category and tags,
  the excerpt as a text summary, per-entry `xml:lang`, and the cover as Media
  RSS. Discovery through `alternates.types` on every page and a footer link.
  404 without `NEXT_PUBLIC_SITE_URL`. No migration.
- Phase 18 profile pictures: a public `avatars` bucket separate from media
  (2 MiB, JPEG/PNG/WebP, `profiles/<uuid>` and `authors/<uuid>` object
  names), `profiles.avatar_id` set by the account holder at `/account`
  through `set_own_avatar()`, `authors.avatar_id` set by admins at
  `/admin/authors/[id]` through `set_author_avatar()`, Storage policies for
  own-only profile objects and admin-only author objects with an upload rate
  limit, detached objects deleted on replace, remove, author deletion, and
  account deletion, comment avatars that follow the live profile picture
  (denormalized `comments.avatar_id`, cleared by anonymization), and the
  shadcn/ui avatar with an initials fallback in the post byline, the author
  archive header, and comments.
- Phase 19 full-text search: a stored generated `posts.search_vector` (title
  A, excerpt B, Tiptap text nodes C) indexed with the post language's
  stemming configuration and an `unaccent`-folded `simple` configuration, a
  partial GIN index over published rows, the `SECURITY DEFINER`
  `search_published_posts()` (explicit `status = 'published'`,
  `websearch_to_tsquery`, `ts_rank`, stable order, 200-character cap,
  control-character highlight markers instead of HTML), a dynamic `noindex`
  `/search?q=` page with a header search form, an optional language filter,
  `?page=` paging, and a per-IP `search.query` rate limit (30 per minute) in
  `consume_auth_rate_limit`.
- Phase 20 polish pack: shadcn `AlertDialog` confirmation for publish and
  unpublish (revision compare-and-swap unchanged), `?status=` feedback and
  20-row `?page=` paging on `/admin/comments`, a Navigation API Back/Forward
  guard for unsaved post forms, `/login?next=` for `/admin/*` (honored only
  for active members), author avatars on listing cards, the admin author list,
  and in Article JSON-LD, a build-time `opengraph-image` used as the default
  social image with `summary_large_image`, and `search_published_posts()`
  executable by `service_role` only (migration
  `20261024200000_search_server_only.sql`).
- Phase 21 open post languages: `posts.language` accepts any canonical BCP 47
  tag in a documented subset (language, optional script and region), checked
  by `is_post_language_tag()` in the CHECK constraint and
  `assert_post_language()` and by `canonicalizePostLanguage()`
  (`Intl.getCanonicalLocales`) in the application, with shared parity
  fixtures. Search maps the primary subtag to one of 28 built-in Snowball
  configurations or falls back to `search_folded`, matches through one
  GIN-served prefilter, and regenerated the stored vectors. The admin
  language field is a shadcn combobox with `Intl.DisplayNames` names and free
  entry; `og:locale` comes from `Intl.Locale().maximize()`. A separate
  interface-locale list (`tr`, `en`, `de`) waits for Phase 22. Migration
  `20261024220000_open_post_languages.sql`.
- Phase 22 interface localization: the whole interface (public, auth,
  account, comments, admin, metadata, Server Action messages) in Turkish
  (default), English, and German with `next-intl` 4.14.9. The locale comes
  from the `locale` cookie, then `Accept-Language`, then `tr`; `src/proxy.ts`
  rewrites every page to the internal `src/app/[locale]` segment, so URLs stay
  locale-free and each public page is prerendered once per locale. Pages read
  the locale through `next/root-params`; Server Actions through a proxy-set
  header. Cache invalidation targets `[locale]` route patterns. No migration.
- 681 unit tests and 531 local-Supabase RLS tests as of Phase 21 (including the language parity suite, the feed input
  and XML escaping tests, the comment
  suite and matrix row, the bookmark suite and matrix row, the author and taxonomy
  administration suites, the Phase 11
  self-signed-up reader matrix and the Phase 10
  concurrent-save, rate-limit, and final anonymous/reader/author/editor/admin
  matrix tests) cover archive and sitemap
  visibility by role, metadata and JSON-LD, share links, and publishing by role,
  publish without category, stale revisions, draft absence from public reads,
  slug redirects and reservation, public row mapping, YouTube URL parsing
  (invalid and lookalike hosts, `javascript:` and markup input, malformed ids),
  youtube-node parity across TypeScript, Tiptap, the renderer, and the
  database, media upload
  validation, Storage policies by role, the upload rate limit, media
  registration and visibility, reference-aware deletion, image-node parity, body allowlist parity
  (TypeScript, Tiptap schema, renderer, and database share fixtures), unsafe
  links, unsupported versions, and body visibility in addition to session, role,
  deactivation, last-admin, direct-write boundaries, published/draft visibility,
  post relations, taxonomy normalization, category cycles, referential
  restrictions, draft creation/update by role, slug conflicts, relation
  validation, and stale-revision rejection. Lint, typecheck, tests, and the
  production build pass. Browser journeys covered invite, Mailpit acceptance,
  password setup, role-specific admin UI, denied member administration, role
  change, deactivation, denied access, draft creation/editing, a stale-form
  conflict, preview, draft exclusion from public routes, and author isolation.

Known gaps: the cover is cropped to 16:9 everywhere with no focal point, and
the site-wide social image is generic (site name and host only, rebuilt only
with the build) and is not declared without `NEXT_PUBLIC_SITE_URL`; Open Graph image URLs point at the original upload on the media
origin (no 1200×630 rendition) and omit width/height, because readers cannot
read media rows. The site
name and origin are provisional (D5), so canonical/sitemap URLs point at
whatever `NEXT_PUBLIC_SITE_URL` holds. Public listings are paginated (Phase
15), but the sitemap and archive discovery for `generateStaticParams` still
read every published post's summary, and the category archive reads the
category ids of all posts in its subtree (fine at the current size; revisit
with a slimmer query or sitemap index if the post count grows large).
Draft media is fetchable by URL (D4 tradeoff). Cache
invalidation stays route-wide by design (Phase 10 documents why per-post tags
would not save regenerations). Hosting, domain, and brand (D5) are still open,
so no hosted backup schedule, HSTS, or multi-instance cache handler exists yet. A slug
changed while a post is unpublished records no redirect, so a URL that was
public before an unpublish/rename/republish cycle returns 404. A deleted tag's
archive URL returns 404 by decision, as does a deleted author's. A credited
author cannot be deleted until the credits are removed post by post (no bulk
reassignment by decision). Bookmark toggles render as "not saved" until the
browser read finishes after hydration (a short delay for signed-in users, by
design to keep public pages cached), and a bookmark of a later-unpublished
post keeps its row, so its owner can still see that post id through the API
(never its content). Comment controls (delete, report, the form) likewise
appear only after the browser read; a comment's display name is a snapshot and
does not follow later profile renames; an owner's delete is a hard delete, so
its reports disappear with it. Avatars are not cropped interactively (the
center of a non-square upload shows), search results and the saved list keep a
text-only byline, and an Auth user deleted out of band (without the account
page) can leave an unlisted orphan object in the `avatars` bucket. The unsaved
form guard covers Back/Forward only where the Navigation API exists and the
traversal is cancelable (once per user activation; older Firefox and Safari
fall back to the link and `beforeunload` guards). The search function is
server-only, but plain Data API reads of published rows stay public by design.

## Where to resume (session handoff)

Phase 22 (interface localization, no migration) was developed on
`claude/ui-localization-6a5870` in its own worktree and is not committed or
merged yet. New dependency: `next-intl` 4.14.9 (its lockfile entries include
the optional message-extraction toolchain, `@swc/core` and `@parcel/watcher`,
which this project does not use); shadcn `dropdown-menu` added.

- Last verified (Phase 22, on its branch): `npm run lint`, `npm run
  typecheck`, `npm test` (728 tests, including the catalog parity,
  ICU, client-message, locale negotiation, and per-locale invalidation
  suites), `npm run test:rls` (531 tests), `npm run build` (every public
  route SSG/ISR per locale: `/tr`, `/en`, `/de`, and each post, category,
  tag, and author page three times), and `npm run test:smoke` against
  `next start` on port 3100 with the optional direct-RPC check, on the
  worktree's own local stack. Browser journey on `next start`: a browser
  with English `Accept-Language` got English on first visit; switching to
  Deutsch on `/posts/birlikte-yazmak` kept the URL, set `<html lang="de">`
  while the post body kept `lang="tr"`, and survived a reload and a client
  navigation home; anonymous `/admin` redirected to a German sign-in page,
  where a wrong password returned the German Server Action error; after
  sign-in the admin sidebar switcher changed to English, an empty title
  returned "Title is required." from the save action, and saving a new title
  on the published post regenerated the tr, en, and de copies of the post and
  the home listing (`x-nextjs-cache` MISS then HIT per locale). Synthetic data
  was removed and the stack reset.

Phase 21 (open post languages, `20261024220000_open_post_languages.sql`) was
developed on `claude/open-post-languages-e547c6` in its own worktree and is
not committed or merged yet. New dependency: `cmdk` 1.1.1 (shadcn `command`;
`popover`, `dialog`, and `input-group` were added by the shadcn CLI with it).

- Last verified (Phase 21, on its branch): `npm run lint`, `npm run
  typecheck`, `npm test` (681 tests), `npm run test:rls` (531
  tests, including the new language parity suite and the extended search
  suite), `npm run build`, and `npm run test:smoke` against `next start` on
  port 3261 with the optional direct-RPC check, on the worktree's own local
  stack. Upgrade path: the stack was reset to Phase 20, a published row got a
  typographic apostrophe ("l’entrée", not found), and `supabase migration up`
  regenerated it (found); untouched rows kept identical vectors. `EXPLAIN
  ANALYZE` with 20,000 synthetic rows (rolled back) showed the GIN bitmap
  index scan. Browser journey on `next start` with a synthetic editor: the
  combobox opened with Enter, "fransız" filtered to "Fransızca fr", Enter
  chose it and set `lang="fr"` on title, excerpt, and editor, focus returned
  to the trigger; `en_US` showed the hint with no option, `GSW` offered `gsw`;
  a hidden input tampered to `fr_FR` was refused by the server with the field
  error and `aria-invalid`; the draft (404 publicly, not in search) showed
  "Fransızca (fr)" in the preview; after publishing, the post page carried
  `lang="fr"`, `og:locale` `fr_FR`, JSON-LD `inLanguage` `fr`, the feed entry
  `xml:lang="fr"` (feed element `tr`), and `/search` found it for `maison`,
  `élégance`, and `facades` and with `?language=fr`. Light and dark both
  checked; no console errors. Synthetic data was removed and the stack reset.

Phase 20 (polish pack, `20261024200000_search_server_only.sql`) was developed
on `claude/polish-pack-8aba77` in its own worktree and is not committed or
merged yet.

- Last verified (Phase 20, on its branch): `npm run lint`, `npm run
  typecheck`, `npm test` (607 tests), `npm run test:rls` (461 tests; the
  search suite now 39, the comment suite gained 4 queue tests), `npm run
  build` (`/opengraph-image` static, `/` still static), and `npm run
  test:smoke` against `next start` on port 3247 with the optional direct-RPC
  check, on the worktree's own local stack (twenty migrations; a final
  `supabase db reset` of that stack applied them cleanly and RLS passed again
  afterwards). A browser journey on `next start` with a synthetic admin and
  reader: `/admin/comments?filter=reported` sent the signed-out visitor to
  `/login?next=…` and back after sign-in; hiding, restoring, and deleting
  comments showed "Yorum gizlendi…", "Yorum yeniden gösteriliyor.", and
  "Yorum silindi."; 23 synthetic comments paged 20 + 3 and `?page=5` landed
  on page 2 with the status kept; the publish dialog opened from the keyboard,
  started on "Vazgeç", closed on Escape, and Tab + Enter confirmed (the seed
  draft was refused with `?error=category`); unpublishing with a revision
  bumped behind the page's back gave `?error=conflict`, and with the current
  revision unpublished and republished; a dirty title plus `history.back()`
  fired one cancelable `traverse` navigate event, the declined prompt kept the
  page and the edit, an accepted prompt went back to `/admin/posts` (the pane
  has no Back shortcut on macOS, so the traversal came from `history.back()`
  after a click); the home cards and the admin author list showed an author
  avatar and the post JSON-LD carried its `image`; posts without a cover,
  archives, and the home page declared an absolute `og:image` with
  `summary_large_image` and `/opengraph-image` rendered "Yazılar" with the
  dotless ı; a reader signing in with `next=/admin/posts` landed on
  `/account`. The pane was hidden during the journey, so the dialog was
  verified through the DOM rather than screenshots. Synthetic accounts,
  comments, and the avatar object were removed and the stack reset.

Phase 19 (full-text search, `20261024180000_post_search.sql`) was developed on
`claude/full-text-search` in its own worktree and is on `main` (`62849a9`).

- Last verified (Phase 19, on its branch): `npm run lint`, `npm run
  typecheck`, `npm test` (582 tests), `npm run test:rls` (459 tests, 41 in the
  new search suite), `npm run build` (`/search` dynamic, `/` still static),
  and `npm run test:smoke` (against `next start` on port 3241) pass on the
  worktree's own local stack after a clean `supabase db reset` (nineteen
  migrations). `EXPLAIN ANALYZE` with 5,000 synthetic posts showed a
  `BitmapOr` of bitmap index scans on `posts_search_vector_idx` as the
  function owner, and a scan of the listing index with a per-row
  `can_view_post()` filter as `anon` under RLS, which is why the function is
  `SECURITY DEFINER`; the synthetic rows were removed by the reset. A browser
  journey on `next start`: the header form searched "kucuk adim" and found
  "İyi bir başlangıç, küçük bir adımla mümkün" with "küçük" and "adımla"
  marked; "hazırlanan taslak" and "Kategorisi olmayan örnek" (the seed
  draft's title and excerpt words) and a nonsense word showed the no-result
  state; "x" showed the too-short state; a phrase query with the Türkçe
  filter worked at mobile width in the light theme with a visible focus ring.
  32 quick requests from one client got "Çok fazla arama yapıldı" while a
  request with another `X-Forwarded-For` still got results (the spoofing
  caveat below).

Phases 17 (Atom feed, no migration; developed on `claude/rss-feed-8973c3`)
and 18 (profile pictures, `20261024160000_avatars.sql`; developed on
`claude/profile-pictures-0e5f66`) were built in parallel and merged into
`main` together on 2026-10-24.

- Last verified (after merging Phases 17 and 18 into `main`): `npm run lint`,
  `npm run typecheck`, `npm test` (565 tests), `npm run test:rls` (418
  tests), `npm run build`, and `npm run test:smoke` (against `next start` on
  port 3100) pass. Migrations were applied with `supabase migration up`, not
  a reset, so the local admin account stayed. The merge needed one fix: the
  feed test's author fixtures gained the new `avatarId` field.

- Last verified (Phase 17, before the merge): `npm run lint`, `npm run typecheck`, `npm test`
  (549 tests), `npm run test:rls` (377 tests), `npm run build` (`/feed.xml`
  prerendered with a 5-minute revalidate), and `npm run test:smoke` against
  `next start` on port 3217 pass on the worktree's own local stack. The feed
  parsed with `xmllint`, served `application/atom+xml` with `s-maxage=300`,
  and the discovery link appeared on the home, post, tag, author, and 404
  pages. As a synthetic admin, publishing the seed draft (category set,
  language English) put it first in the next anonymous `/feed.xml` response
  with `xml:lang="en"`; unpublishing removed it on the next request. The
  admin account was deleted and the draft restored afterwards. Removing the
  status filter from the feed query made the editor case of the RLS test fail.

Phases 1–13, taxonomy and author identity administration, and the fixes from
the all-roles browser test (`59771bc`) are on `origin/main`. On 2026-10-24
followed, on `main` only: the first-admin bootstrap command (`npm run
admin:bootstrap`, migration `20261024100000_admin_bootstrap.sql`), Phase 14
(post language, `20261024120000_post_language.sql`), Phase 15 (public listing
pagination, no migration; developed on `claude/public-pagination-2ed447`), and
Phase 16 (post cover image, `20261024140000_post_cover_image.sql`; developed
on `claude/post-cover-image-5be40a`). Phases 15 and 16 were built in parallel
and merged into `main` together, and `main` was pushed with them. Commit only
on request. Do not push without an explicit request.

- Last verified (Phase 15, before the merge): `npm run lint`, `npm run typecheck`, `npm test`
  (512 tests), `npm run test:rls` (353 tests), `npm run build`, and
  `npm run test:smoke` (against `next start` on a free port) pass. No
  `supabase db reset` was run (it would remove the local admin account); the
  journey used 20 synthetic `pg-synth-` posts, a tag, an author, and an editor
  account that were deleted afterwards. The build prerendered `/page/2..3` and
  each archive's later pages. In the browser: home page 1 ended and page 2
  started without overlap; tag page 3 was the last (no "Sonraki"), keyboard
  focus was visible in the dark theme, Enter on "1" opened the archive URL,
  `/tags/<slug>/page/4` was a `noindex` 404, and `/categories/uretim/page/2`
  kept its child-category links. After the editor unpublished one synthetic
  post, the next anonymous requests for the already cached `/page/3` and the
  tag, author, and category later pages showed the shifted posts and totals.

- Last verified (Phase 18, on its branch before the merge): `npm run lint`, `npm run typecheck`, `npm test`
  (546 tests), `npm run test:rls` (415 tests, 41 in the new avatar suite),
  `npm run build`, and `npm run test:smoke` (against `next start` on port
  3100) pass after a clean `supabase db reset` of the worktree's own stack
  (eighteen migrations). A browser journey on `next start` with synthetic
  accounts: a reader uploaded a picture at `/account` and commented on
  `/posts/birlikte-yazmak`; the anonymous page showed the avatar; after the
  reader replaced it (PNG to WebP), the next anonymous request
  (`x-nextjs-cache: HIT`) carried the new id and the old object returned 404;
  an SVG renamed to `.png` was refused ("Yalnızca JPEG, PNG ve WebP…"). An
  editor got the "Yazar yönetimi kapalı" view at `/admin/authors`. An admin set
  a JPEG avatar for `deniz-ornek`; the archive header (80 px) and the post
  byline showed it in light and dark themes, then "Fotoğrafı kaldır" restored
  the initials and deleted the object. The reader then deleted the account:
  the avatar object was gone and the comment showed "Silinmiş kullanıcı"
  without an avatar. Synthetic accounts were deleted and the stack reset
  afterwards. The pane cannot pick files, so uploads were driven with a
  canvas-generated `File` set on the input.

- Last verified (Phase 16, before the merge): `npm run lint`, `npm run typecheck`, `npm test`
  (502 tests), `npm run test:rls` (368 tests), `npm run build`, and
  `npm run test:smoke` (against `next start` on port 3217) pass on a fresh
  local stack with all seventeen migrations. A browser journey as an admin
  chose a 1200×630 library image as the cover of the seed draft and saved it
  without alt text; Publish was refused ("Kapak görseli için alternatif
  metin…", `?error=cover`); after adding alt text it published. The anonymous
  post page (`x-nextjs-cache: HIT`) served the cover with its alt text,
  `og:image` and `og:image:alt`, `twitter:card` `summary_large_image`, and
  JSON-LD `image`; the home card showed it in a reserved 16:9 box (light and
  dark, mobile width); the member preview showed it; deleting the media at
  `/admin/media` was refused (`?error=in-use`). The unsaved-changes prompt
  fired after choosing a cover and typing alt text. The upload button in the
  cover field reuses `uploadMediaAction` and was not clicked in the browser
  (the pane cannot pick files); RLS tests cover the upload path.

- Last verified (Phase 14): `npm run lint`, `npm run typecheck`, `npm test`
  (484 tests), `npm run test:rls` (347 tests), `npm run build`, and
  `npm run test:smoke` pass after a clean `supabase db reset` (sixteen
  migrations). A browser journey on `next start` switched a published post to
  English as an editor; the next anonymous request (`x-nextjs-cache: HIT`)
  served `lang="en"` on the title, excerpt, and body, `og:locale` `en_US`, and
  `inLanguage` `en`, and the home card carried `lang="en"`. Unsupported
  languages are rejected by validation, the RPCs (`22023`), and the CHECK
  constraint (`23514`).

- First admin: there is no "first user becomes admin" rule. After a reset or a
  fresh deploy run `npm run admin:bootstrap -- --local --email <you>` (or the
  hosted variant in the README); it refuses while an active admin exists.

- Last verified (Phase 13): `npm run lint`, `npm run typecheck`, `npm test`
  (443 tests), `npm run test:rls` (339 tests), `npm run build`, and
  `npm run test:smoke` (against `next start`) pass after a clean
  `supabase db reset` (fourteen migrations). The build still lists
  `/posts/[slug]` as SSG with ISR; `/admin/comments` is dynamic. A browser
  journey on `next start` covered: reader A commented on
  `/posts/birlikte-yazmak` and saw it at once (the anonymous HTML had it
  too); reader B reported it with a reason and it stayed public; B and an
  author got the access-denied view at `/admin/comments` (no nav link); an
  editor hid it from the "Bildirilen" queue, the anonymous page then showed
  "Henüz yorum yok" while still served from the ISR cache (`x-nextjs-cache:
  HIT`), and it appeared under "Gizlenen"; dark and light themes were
  readable.
- Local database: the final `supabase db reset` applied all fourteen
  migrations and the seed and removed earlier local Auth users. Four synthetic
  journey accounts (`demo-okur-a`, `demo-okur-b`, `demo-editor`,
  `demo-yazar` at example.com) and one hidden comment were created afterwards;
  the next reset removes them. If a stale ISR page refers to a post the reset removed,
  clear `.next/cache/fetch-cache` before `next build`.
- Key files: comments:
  `supabase/migrations/20261023220000_comments.sql`, `src/features/comments/`
  (`actions.ts`, `cache.ts`, `data.ts`, `model.ts`, `queries.ts`, components),
  `src/app/admin/comments/`, `src/app/posts/[slug]/page.tsx`, and
  `src/lib/supabase/comments.rls.test.ts`. Bookmarks:
  `supabase/migrations/20261023200000_bookmarks.sql`, `src/features/bookmarks/`
  (`actions.ts`, `queries.ts`, `data.ts`, `result.ts`, components),
  `src/features/auth/return-path.ts`, `src/app/account/saved/`,
  `src/features/posts/components/post-list.tsx`, `src/app/posts/[slug]/page.tsx`,
  and `src/lib/supabase/bookmarks.rls.test.ts`. Author administration:
  `supabase/migrations/20261023180000_author_administration.sql`,
  `src/features/authors/`, and `src/app/admin/authors/`. Taxonomy
  administration: `supabase/migrations/20261023160000_taxonomy_administration.sql`,
  `src/features/taxonomy/`, and `src/app/admin/{categories,tags}/`. Phase 11:
  `supabase/migrations/20261023140000_reader_accounts.sql`,
  `src/features/auth/`, and `src/features/account/`. Phase 10:
  `supabase/migrations/20261023120000_write_rate_limits.sql`,
  `src/features/posts/cache.ts`, and `docs/backup-and-restore.md`. Earlier
  phases: the other migrations and `*.rls.test.ts` files.
- Next slice: none planned. Every phase in the table is done; the remaining
  work is the D5 launch gate (and D4 if draft media must stay private).
- Open gates: D5 remains provisional (hosting deferred, no production domain,
  `NEXT_PUBLIC_SITE_NAME` default "Yazılar"). Launch needs those decisions plus
  the README hosting checklist. Revisit D4 before public launch if draft images
  must stay private.

## Deferred administration follow-ups

Phase 4 needed category, tag, and author records to attach to a draft and
proceeded with the seeded taxonomy and authors. On 2026-10-23 the user chose to
ship both administration surfaces as separate increments after Phase 8 (Phase 8
used the seeded records). Later the same day the user asked for Phases 9, 10,
and then 11 (reader accounts) first; both increments now follow Phase 11
(Phases 9–11 also use the seeded records):

- **Taxonomy administration (admin). Done 2026-10-23.** D1 gives admins
  create, rename, move, and delete for categories and tags. Decisions taken
  with the user on 2026-10-23: deleting a category that posts use requires a
  target category (posts move there, children move up to the deleted
  category's parent, the old URL redirects to the target); deleting a tag
  removes it from its posts and its URL returns 404; category and tag slug
  changes record redirects like posts. See the README "Taxonomy
  administration" section.
- **Author identity administration (admin). Done 2026-10-23.** Admins
  create, rename, re-slug, describe, link, and delete author identities
  through RPCs; `authors.user_id` stays client-unreadable. Decisions taken with
  the user on 2026-10-23: an author slug change records a redirect like
  taxonomy; an author credited on any post cannot be deleted; an author may
  link only to an active editorial member's account, and the link grants no
  access. See the README "Author identity administration" section.

Neither belongs to Phase 5 or 6. Add them as explicit increments rather than
widening an active phase silently.

## Decision gates

| ID | Decision | Blocks | Default / decision | Status |
| --- | --- | --- | --- | --- |
| D1 | Editorial role set and who may publish | Phase 2 onward, RLS everywhere | `admin` is the highest role and a superset of `editor`. Multiple admins are allowed. Admin manages members, roles, invitations, categories, and tags. Editor creates, edits, and publishes any post and assigns existing taxonomy, but cannot manage categories/tags or invite members. Author creates and edits own drafts but cannot publish. Reader membership is open to everyone; editorial/writer access is invite-only and granted by an admin. Reader accounts are planned (Phases 11–13) but are not editorial roles; see below | **Answered 2026-10-22** |
| D2 | Workflow states and editing live posts | Phases 3, 8 | `draft` → `published` only; `review`/`archived` later; editors may edit published posts and `updated_at` is shown | **Answered 2026-10-22** |
| D3 | Concurrency and revisions | Phases 3–5, 8 | One working copy with atomic revision comparison; no published snapshot initially; preview route for members | **Answered 2026-10-22** |
| D4 | Media bucket visibility | Phase 6 | One public bucket, UUID object paths, app-level validation; document that draft media is fetchable by URL; revisit before launch | **Answered 2026-10-22** |
| D5 | Language, brand, domain, hosting | Phases 8–10, launch | Keep provisional Turkish copy and generic labels; `NEXT_PUBLIC_SITE_URL` already exists for invitation redirects; finalize it for canonical/sitemap and decide hosting before launch | **Provisional 2026-10-23**: accepted for Phases 8–10 (canonical, sitemap, and share URLs from `NEXT_PUBLIC_SITE_URL`; site name from `NEXT_PUBLIC_SITE_NAME`, default "Yazılar"); for Phase 10 the user deferred hosting, has no production domain yet, and keeps the name provisional. Interface language decided 2026-10-24: tr (default), en, de by cookie (Phase 22). Blocks launch only |
| D6 | Reader accounts, bookmarks, and comments | Phases 11–13 | Private bookmarks only; reader accounts with email + password; post-moderation with reader reports and editor hide/delete; account deletion removes bookmarks and anonymizes comments. No public like counts, OAuth, or magic links initially | **Answered 2026-10-22** |

D1, D2, D3, D4, and D6 were answered on 2026-10-22 and no longer block their
phases. D5 was accepted provisionally on 2026-10-23 for Phases 8–10; the real
domain, brand, and hosting remain open and block the public launch.

### Answered decisions

- **D1 (2026-10-22):** `admin` is the highest role and a superset of `editor`.
  Multiple admins are allowed. Admin manages members, roles, invitations,
  categories, and tags. Editor creates, edits, and publishes any post and assigns
  existing taxonomy, but cannot manage categories/tags or invite members. Author
  creates and edits own drafts but cannot publish. Reader membership is open to
  everyone; editorial/writer access is invite-only and granted by an admin. The
  first admin is bootstrapped out of band with no public route: originally
  through Studio/SQL, since 2026-10-24 with the service-role-only
  `npm run admin:bootstrap` command.
- **D2 (2026-10-22):** Workflow starts with `draft` → `published` only.
  `review` and `archived` remain later increments. Editors and admins may edit
  published posts directly; `updated_at` is shown on the public post when it is
  newer than `published_at`.
- **D3 (2026-10-22):** One working copy with an integer `revision` and atomic
  compare-and-swap updates. No published snapshot initially; publishing changes
  status and `published_at`, and later edits change the live content. A
  members-only preview route is planned in Phase 4.
- **D4 (2026-10-22):** One public `media` bucket with UUID object paths and
  server-side validation. Draft images are fetchable by anyone who has their
  URL; this is documented and revisited before launch.
- **D6 (2026-10-22):** Reader accounts use email + password. Bookmarks are
  private and have no public count. Comments are published immediately and
  moderated afterward through reader reports plus editor hide/delete. On account
  deletion, bookmarks are removed and comments are anonymized. OAuth, magic
  links, and public likes remain deferred.

### Reader identity is an account, not an editorial role

Public reading stays anonymous and requires no account. Reader accounts are
optional and become necessary when a reader-facing feature needs stable identity:
bookmarks, comments, subscriptions, personalized lists, or private content.
Bookmarks and comments are now planned in Phases 11–13; until then, reading is
anonymous. When Phase 11 opens, anyone may create a reader account; doing so
never creates an editorial grant. Editorial/writer access remains invite-only.

Identity and editorial permission remain separate:

- Every authenticated user gets a `profiles` row.
- Editorial access is a separate grant in `editorial_members`, never a profile
  flag. An authenticated user without that grant is a reader: public reading plus
  reader-owned actions, and no admin, draft, or publish capability.
- The `reader` label is derived (no editorial grant → reader), not stored as a
  fourth value in the editorial role enum. If reporting needs it, expose a
  read-only view that derives it. This keeps one source of truth for editorial
  permissions and avoids default-row or self-escalation problems.
- Public RLS targets both `anon` and `authenticated` for published content.
  Signing in does not change access to published content; it only enables rows
  owned by that user.
- Reader capabilities stay action-scoped: a bookmark is a private row owned by
  the user, and a comment is public until reported or hidden by an editor. Neither
  grants editorial access.

If the product later needs a stored reader role for reasons beyond permission
checks (for example, audience segmentation or billing), that becomes a separate
account-attribute decision, not a widening of the editorial role enum.

## Increment overview

| Phase | Increment | Outcome | Depends on | Size |
| --- | --- | --- | --- | --- |
| 0 | Baseline | Static sample blog, tooling, Supabase config | — | Done |
| 1 | Auth foundation | Invite-only sign-in, protected admin, server-verified session | — | Done |
| 2 | Editorial membership | Roles, invitations, RLS helpers, member admin | Phase 1, D1 | Done |
| 3 | Content schema | Posts, taxonomy, credits, public read rules, integrity | Phase 2, D2, D3 | Done |
| 4 | Draft authoring | Admin list/form, category, tags, ordered credits, validation | Phase 3 | Done |
| 5 | Editor | Tiptap JSON, content versioning, safe renderer | Phase 4, D3 | Done |
| 6 | Media | Upload, media table, image node, alt text | Phase 5, D4 | Done |
| 7 | Embeds | Allowlisted YouTube node, responsive render | Phase 5 | Done |
| 8 | Publishing | Publish mutation, DB-backed public pages, slug redirects | Phases 3–5, optional 6, D2, D5 | Done |
| 9 | Discovery | SEO, OG, JSON-LD, sitemap, archives, share link | Phase 8, D5 | Done |
| 10 | Launch readiness | Cache invalidation, conflict handling, rate limits, backups | Phase 9 | Done |
| 11 | Reader accounts | Optional reader sign-up, profile, account management | Phase 2, Phase 8, D6 | Done |
| 12 | Bookmarks | Private saved posts with strict per-user isolation | Phase 8, 11 | Done |
| 13 | Comments | Flat, post-moderated comments with reports and rate limits | Phase 8, 11 | Done |
| 14 | Post language | Per-post language (tr, en, de) in form, markup, OG, JSON-LD | Phase 9 | Done |
| 15 | Listing pagination | Path-based ISR pages for home and archives, stable order | Phase 9, 10 | Done |
| 16 | Post cover image | Optional cover with alt text in header, cards, OG/Twitter, JSON-LD | Phases 6, 9 | Done |
| 17 | Syndication feed | Atom feed of the newest published posts with discovery link | Phases 9, 10, 14, 16 | Done |
| 18 | Profile pictures | Own account avatars, admin-set author avatars, avatars in bylines, archives, and comments | Phases 6, 11, 13, author administration | Done |
| 19 | Full-text search | Language-aware, accent-insensitive search over published posts with highlights, paging, and a per-IP rate limit | Phases 5, 10, 11, 14 | Done |
| 20 | Polish pack | Publication confirmation, moderation feedback and paging, Back/Forward guard, admin return path, more avatars, default social image, server-only search | Phases 8, 13, 18, 19 | Done |
| 21 | Open post languages | Any canonical BCP 47 post language, searchable combobox, language-aware search for every language, derived `og:locale` | Phases 14, 19 | Done |
| 22 | Interface localization | tr/en/de interface with a cookie, proxy rewrite, and next-intl | Phase 21 | Done |

Phases 11–13 were planned after the editorial MVP launch and do not block
Phases 1–10. The user asked for Phase 11 before the deferred administration
increments; Phase 12 followed both of them, and Phase 13 completed the reader
branch.

Dependencies are transitive even where the table lists only the direct blocker.
Phase 7 is optional for publishing; Phase 6 becomes required only when cover
images or in-body images are part of the launch scope.

## Dependency model

"Independent" means each phase is a self-contained, reviewable delivery that
leaves the repository working. It does not mean the phases can be implemented in
any order.

Hard spine:

```text
0 → 1 → 2 → 3 → 4 → 5 → 8 → 9 → 10
```

- Phases 1–5 build one chain: session → roles → schema → draft metadata → editor.
  Skipping or reordering them breaks the permission or data model that the next
  phase assumes.
- Phase 8 is the first phase that changes the public site from sample data to the
  database. It needs Phases 2, 3, 4, and 5. Phase 6 is required only if cover or
  in-body images are in launch scope; Phase 7 is optional and does not block
  publishing.
- Phases 9 and 10 harden the public launch. They cannot be skipped before a
  public launch, but cache design, CI, backup documentation, and rate-limit
  utilities can be prepared earlier without closing the phase.

Reader branch:

```text
2 → 11 → 12
      └→ 13        (both also need Phase 8)
8 ─────→ 11
```

- Phase 11 needs authentication and profiles from Phases 1–2, plus published
  posts from Phase 8 for bookmarks and comments to target.
- Phases 12 and 13 are independent of each other and can be built in parallel or
  swapped. Both depend on Phase 11.
- Starting Phase 11 before Phase 8 is technically possible but adds an unused
  public account surface; it is not recommended.

Parallelizable work:

- Phase 6 (media) and Phase 7 (YouTube) after Phase 5.
- Phase 12 (bookmarks) and Phase 13 (comments) after Phase 11.
- Test harness setup (Phase 2), rate-limit utilities, backup/restore
  documentation, and CI can be prepared before their phases close.

What cannot be done independently:

- Running Phase 3 RLS without the roles and helpers from Phase 2.
- Building Phase 4 forms without the tables from Phase 3.
- Adding image nodes (Phase 6) before the editor and allowlist (Phase 5).
- Publishing from the database (Phase 8) before drafts, content, and
  authorization exist.
- Adding bookmarks or comments (Phases 12–13) before reader identity (Phase 11)
  and published posts (Phase 8).
- Skipping Phase 10 and expecting correct caches, conflict handling, and
  recoverable operations at launch.

## Phase details

### Phase 1 — Authentication foundation

Goal: editors can sign in without public registration, and the server verifies
identity on every protected request.

Status: complete on 2026-10-22. Verified with lint, typecheck, 8 unit tests, the
production build, and a browser journey covering denied anonymous `/admin`
access, sign-in, a wrong-password error, and sign-out. `/admin` proves
authentication only; membership and authorization remain in Phase 2.

Scope:

- Add `@supabase/ssr` and cookie-based browser/server clients alongside the
  existing anonymous public client.
- Add the Next.js Proxy token-refresh integration. Verify the file convention
  and API in `node_modules/next/dist/docs/` for this Next.js version first.
- `/login` sign-in page, sign-out action, protected `/admin` layout, and
  redirects for unauthenticated users.
- Minimal signed-in shell that follows the existing design tokens.
- Document how to create the first user locally (Supabase Studio or CLI).

Security and tests:

- No public sign-up route. No service-role key in request paths.
- Verify anonymous access to `/admin` is denied and a signed-in user reaches it.
- Unit-test the server session helper with mocked cookies.

Demo: sign in, open `/admin`, sign out, confirm the redirect. Exit when lint,
typecheck, and build pass and the session is verified server-side.

### Phase 2 — Editorial membership, roles, invitations

Goal: roles and membership are stored, enforced, and impossible to self-escalate.

Status: complete on 2026-10-22. Verified with lint, typecheck, 8 unit tests, 13
local-Supabase RLS tests, the production build, and a browser journey covering
invite, Mailpit acceptance, password setup, role-specific admin UI, denied
member administration, role change, deactivation, and denied access after
deactivation. The RLS suite removes its own synthetic rows.

Scope:

- Migrations: `profiles` for every authenticated user (one row per user,
  display name, timestamps), editorial membership (profile reference, role,
  timestamps), and a public `authors` identity table with a nullable, unique
  user link. Guest author credits must not require login accounts.
- `profiles.id` references `auth.users` with `ON DELETE CASCADE` so reader-owned
  rows added in later phases have one lifecycle anchor. Self-service reader
  sign-up still belongs to Phase 11; accounts here stay invite-only.
- Editorial access stays a grant in `editorial_members`; the absence of a grant
  is what makes an authenticated user a reader. Do not add a stored `reader`
  value to the editorial role enum.
- SQL helper functions for `is_admin()` / `is_editor()` used by later policies.
- Invite-only flow: admin invites by email through a server action using a
  server-only admin client; rate-limit and audit the action; no open signup.
- Configure the Auth site URL and redirect allowlist for the invite acceptance
  route.
- Document a local-only bootstrap for the first admin (Studio/SQL); no public
  bootstrap route, default admin, or seeded production credential.
- Add a placeholder server-only secret-key variable and a server-only admin
  client for invitations; never expose that key to the browser.
- Minimal member administration (list, invite, change role, deactivate).
- Extend the Vitest setup with a local-Supabase RLS test setup.

Security and tests:

- RLS on membership tables. Users cannot grant themselves or others roles.
- Test anonymous, authenticated non-member (reader), author, editor, and admin
  access to each operation.
- An authenticated user without membership gets public read access only and is
  denied every admin operation.
- Test that deactivation and role changes take effect on the next request.

Demo: admin invites someone, the invitee signs in, sees role-appropriate UI, and
an author cannot open member administration. Exit when the RLS matrix passes.

#### Phase 2 implementation notes

D1 is answered. These defaults are adopted for Phase 2; reopen only if
implementation reveals a conflict. Editorial accounts remain invite-only in this
phase; public reader sign-up belongs to Phase 11.

1. **Role matrix.** Answered: `admin` is the highest role and a superset of
   `editor`. Multiple admins are allowed. Admin and editor create/edit/publish
   any post; author creates/edits only their own drafts and cannot publish. Only
   admin lists members, invites, changes roles, and deactivates. An admin may
   grant the `admin` role with an explicit confirmation and an audit record.
2. **Taxonomy.** Answered: only admin creates, renames, moves, or deletes
   categories and tags. Editors and authors may assign existing taxonomy to a
   post. Editors cannot invite members.
3. **Invite acceptance.** Implemented: an admin invite creates the Auth user and
   membership, and the Supabase invite email sends the invitee to
   `/auth/confirm`, which applies the fragment session and forwards to
   `/login/password`. No one can sign in before setting a password. Verified
   locally with project sign-ups disabled. Local email goes to Mailpit; hosted
   invitations need SMTP configuration and an email-template review.
4. **Existing users.** Recommended: an admin can grant a role to an existing
   authenticated user by email. Re-invite and revoke-invite UI are deferred;
   deactivation covers revocation.
5. **Deactivation.** Recommended: keep the membership row with a deactivation
   timestamp; do not delete the Auth user or future author credits. A deactivated
   member is denied on the next request and can be reactivated.
6. **Last admin.** Recommended: block demoting or deactivating the last active
   admin and block self-deactivation.
7. **Profiles and authors.** Recommended: a database trigger creates one
   `profiles` row per `auth.users` row; display name starts nullable. Editorial
   membership never creates a public `authors` row automatically, and guest
   author credits remain login-free.
8. **Audit and rate limit.** Recommended: a database audit table records actor,
   action, target, role, and timestamp; invitations use a database-backed
   fixed-window limit. No external queue or rate-limit service in this phase.
9. **Member UI scope.** Recommended: one list, invite form, role change, and
   deactivate/reactivate action. No search, pagination, bulk actions, or member
   deletion in Phase 2.
10. **First admin.** Recommended: create the first Auth user in Studio and insert
    one admin membership with documented local SQL; no bootstrap route, default
    admin, or seeded production credential.

Implementation boundaries: authenticated clients have select-only access to
membership and audit tables; all writes go through security-definer RPCs. The
last-admin trigger blocks role demotion and deactivation, including service-role
SQL changes. Deleting an Auth user cascades through profile and membership and is
allowed as an out-of-band operation, so operators must ensure another active
admin exists first. This limitation is documented in the README.

D2 and D3 were answered before Phase 3 and are recorded above.

### Phase 3 — Content schema, taxonomy, and public read rules

Goal: the database expresses the confirmed content model and only published
content is publicly readable.

Status: complete on 2026-10-22. Verified with lint, typecheck, 19 unit tests, 31
local-Supabase RLS tests, `EXPLAIN ANALYZE` on generated data, a clean
`supabase db reset` with seeds, and the production build. Public pages still read
the sample fixtures.

Scope:

- Migrations: `categories` (hierarchical, cycle-safe), `tags`, `posts`
  (single nullable `category_id`, status, `published_at`, timestamps, creator),
  `post_authors` (`sort_order`, unique pair), `post_tags` (unique pair).
- Slug and name normalization policy with functional unique indexes; slug
  generation shared by server mutations.
- Category cycle prevention function/trigger covering moves, not just
  self-reference. Enforce category presence in the publish mutation, not as
  `NOT NULL`.
- Indexes for published listings, slugs, foreign-key joins, and taxonomy pages.
- RLS: anonymous and authenticated non-members read only published posts and
  their public relations; editors read all; authors read their own drafts.
- Indexes and policies review with `EXPLAIN` on realistic queries.
- Optional synthetic development seed, separate from production data.

Security and tests:

- Anonymous cannot see drafts, other authors' drafts, or unpublished relations.
- Category cycles are rejected, including longer cycles and moves.
- Tag/category normalization prevents duplicate name and slug collisions.
- Creating a published post without a category fails at the mutation boundary.

Demo: seed one published and one draft post; anonymous queries return only the
published one. Exit when policies and integrity tests pass on a clean database.

#### Phase 3 implementation notes

- **Workflow (D2a):** `post_status` contains `draft` and `published`.
  `published_at` is non-null exactly when the status is `published`. Unpublishing
  returns a post to `draft`; `review` and `archived` stay deferred.
- **Publication integrity:** `posts.category_id` is nullable. A CHECK constraint
  allows uncategorized drafts and rejects `published` without a category, so the
  rule holds for every write path, not only the future UI. The Phase 8 publish
  mutation still returns a clear validation error.
- **Concurrency (D3):** `posts.revision` starts at 1 and is reserved for the Phase
  4 compare-and-swap update. No snapshot table or published copy exists.
- **Normalization:** category and tag names are whitespace-collapsed and unique
  case-insensitively; slugs are lower-case ASCII kebab-case and globally unique.
  `src/lib/slug.ts` mirrors the database rules, including Turkish transliteration,
  for future server mutations.
- **Category hierarchy:** a trigger walks ancestors on insert and move, rejects
  self-parenting and longer cycles, and caps depth at 100. A transaction-scoped
  advisory lock serializes concurrent moves. Foreign keys use `ON DELETE
  RESTRICT`, so a category, tag, or guest author in use cannot disappear.
- **Visibility:** `can_view_post(uuid)` is the single rule used by post and
  relation policies. Public visitors see published rows, editors see all, and
  authors see their own drafts. `authors.user_id` is not selectable by clients;
  Phase 4 added an editorial-only select policy over the public author columns,
  while changing the account link remains a deferred administration concern.
- **Indexes:** a partial `(published_at desc)` index serves published listings, a
  partial `(category_id, published_at desc)` index serves category archives, and
  credit/tag joins have supporting indexes. `EXPLAIN ANALYZE` on 20k generated
  rows selected both listing indexes; the generating transaction was rolled back.
- **Seed:** `supabase/seeds/seed.sql` runs on `supabase db reset` and mirrors the
  stable sample UUIDs and slugs. It creates no Auth users or credentials.

### Phase 4 — Draft authoring

Goal: an authorized editor can create and reopen a draft with complete metadata.

Status: complete on 2026-10-22. Verified with lint, typecheck, 31 unit tests, 44
local-Supabase RLS tests, the production build, and a browser journey covering
draft creation with category/tags/two ordered credits, reopen and edit, a
stale-form conflict that preserved the newer edit, members-only preview,
draft exclusion from `/posts/[slug]` and the home listing, and an author denied
access to another editor's draft.

Scope:

- `/admin/posts` list plus create/edit forms using shadcn/ui and Server Actions.
- Metadata: title, slug, excerpt, category, tags, ordered author credits.
  Body and cover media come in later phases.
- Consume existing categories, tags, and authors. Taxonomy and author
  administration are tracked in
  [Deferred administration follow-ups](#deferred-administration-follow-ups)
  and were not widened into this phase.
- Server-side validation at the mutation boundary.
- Slug uniqueness handling and explicit conflict errors.
- Atomic revision comparison so a stale form cannot silently overwrite changes.
- Draft preview entry point (read-only, members only) without exposing drafts to
  public queries or caches.

Security and tests:

- Author edits own draft; author cannot edit another author's draft; editor can.
- Invalid category, duplicate slug, duplicate author credit, and out-of-range
  sort order are rejected.
- Stale revision is rejected with a recoverable conflict response.

Demo: create a draft with category, tags, and two ordered credits, reopen it,
edit it, and confirm another author is denied. Exit when the full journey and
denial path pass.

#### Phase 4 implementation notes

- **Mutation boundary:** `20261022170000_draft_authoring.sql` adds
  `create_draft_post` and `update_post_metadata`. Both are security-definer RPCs
  available only to `authenticated`; anonymous clients and direct table writes
  remain denied. Authorization, metadata validation, slug conflict detection,
  relation replacement, and the revision increment run in one transaction.
- **Revision compare-and-swap:** `update_post_metadata` locks the row, compares
  `revision` with the value submitted by the form, rejects a mismatch with
  `40001`, and increments the revision on success. The UI keeps the user's input,
  shows a recoverable conflict message, and offers a reload instead of
  overwriting the newer version.
- **Authorization:** authors may update only posts they created while the post is
  still a draft. Editors and admins may update any draft or published post.
  Being credited as an author grants no edit access. The RPC repeats this check
  even though the UI hides unavailable actions.
- **Validation:** the client form normalizes and validates input for fast
  feedback, but the RPC re-validates title length, slug shape/uniqueness, excerpt
  length, category existence, tag existence/uniqueness, author existence, and
  duplicate credits. Credits carry explicit `sort_order` values and must form a
  contiguous `0..n-1` sequence. Zero credits remain allowed until a later
  workflow decides whether publication requires one.
- **Relations:** `replace_post_relations` deletes and reinserts tags and credits
  in the same transaction, so a failed validation leaves the previous relations
  intact.
- **Author list:** active editorial members may select the public `authors`
  columns to build credits. The column grant still hides `authors.user_id`, so
  the account link never reaches clients.
- **Preview:** `/admin/posts/[id]/preview` sits under the protected admin layout,
  uses `force-dynamic`, sends `noindex`, and reads through the caller's session.
  It is not linked from public routes and is not placed in a public cache.

### Phase 5 — Tiptap editor and safe renderer

Goal: structured content is authored in Tiptap and rendered without the editor
bundle on public pages.

Status: complete on 2026-10-22. Verified with lint, typecheck, 131 unit tests, 87
local-Supabase RLS tests, the production build, a check that the prerendered
public post HTML contains the full body while none of its scripts contain Tiptap
or ProseMirror code, and a browser journey covering formatted editing, a
rejected `javascript:` link in the link form, keyboard toolbar navigation, save
and reload in canonical form, a tampered `javascript:` body rejected by the
server without a revision change, the member preview in dark and light themes,
and anonymous preview access redirected to sign-in.

Scope:

- Add Tiptap packages after checking current compatibility with React 19 and
  this Next.js version.
- Store body as JSONB with `content_version`. Define one shared allowlist of
  supported nodes/attributes/marks used by both editor and renderer.
- Validate documents on write; reject unknown nodes, attributes, and unsafe link
  schemes. Sanitize any accepted HTML.
- Editor integrated with the existing tokens and keyboard-accessible toolbar.
- Read-only renderer shared by preview and public pages, with a controlled
  fallback for unsupported content versions.
- Defer image and YouTube nodes to Phases 6–7.

Security and tests:

- Unknown node types, malformed JSON, `javascript:` links, and unsupported
  versions are rejected or fall back safely.
- Server-rendered output contains the full body without loading the editor.

Demo: write and reload a formatted draft; preview it read-only. Exit when the
renderer and editor share the same allowlist tests.

#### Phase 5 implementation notes

- **Packages:** `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, and
  `@tiptap/starter-kit` 3.32.0, pinned. Their peer ranges accept React 19. Only
  the admin editor imports them; the renderer does not.
- **Storage:** `20261022180000_post_body.sql` adds `posts.body` (JSONB, default
  one empty paragraph) and `posts.content_version` (smallint, default 1). The
  existing table-level select grant and row policies cover both columns, so a
  draft body stays hidden from anonymous readers and other authors.
- **Allowlist:** `features/posts/content/schema.ts` is the TypeScript source;
  `public.post_body_error` and `public.is_safe_post_href` mirror it in PL/pgSQL.
  Tiptap's `getJSON()` output is normalized first (editor-only link
  `target`/`rel` and empty `class`/`title`, `orderedList` `type: null` and
  `start: 1`, `codeBlock` `language: null`), then validated strictly. Stored
  documents use ProseMirror's canonical mark order.
- **Mutation boundary:** the Phase 4 RPC signatures were dropped and recreated
  with `p_body jsonb` and `p_content_version integer`, so PostgREST cannot
  resolve a call that skips body validation. The validation helpers are not
  executable by `anon` or `authenticated`.
- **Defense in depth:** the `posts_body_valid` CHECK constraint validates
  version-1 bodies on every write path. A future content version needs its own
  validator and constraint update; until then the renderer shows a fallback and
  the edit page refuses to open the document.
- **Known limits:** the SQL size check measures `jsonb::text`, which includes
  formatting spaces, so a document very close to 200,000 characters may pass the
  TypeScript check and fail in the database with a generic body error. Unicode
  whitespace classes in link checks may differ slightly between JavaScript and
  the database locale; the renderer re-validates, so a mismatch falls back
  instead of rendering an unchecked link.

### Phase 6 — Media uploads

Goal: images are validated, stored, and rendered accessibly.

Status: complete on 2026-10-22. Verified with lint, typecheck, 199 unit tests,
146 local-Supabase RLS tests, the production build, and a browser journey on the
production server covering a client-side alt-text error, a renamed SVG rejected
by the server signature check, an oversized file rejected, a JPEG uploaded and
inserted with alt text and caption, alt text edited on the selected image, draft
save and reload, the member preview serving the optimized image with
`srcset`/`sizes`, deletion of the referenced image refused, anonymous
`/admin/media` redirected to sign-in, a signed-in non-member denied, and an
author shown no delete control for another member's upload.

Implementation notes:

- `public.media.object_path` equals the media id, so the image node stores only
  the id and URLs are derived. Storage objects are immutable (no update policy).
- `register_media` trusts Storage metadata for type and size and the server for
  dimensions; the server identifies the format from file signatures.
- `delete_media` locks the row and scans post bodies; `assert_post_body` takes a
  key-share lock on referenced media, so a concurrent save and delete cannot
  both succeed.
- Rate limit: 20 uploads per member per ten minutes, enforced in the Storage
  insert policy.
- Follow-ups outside this phase: orphaned uploads are cleaned up manually from
  `/admin/media`; the editor toolbar stays disabled until the editor is first
  focused (pre-existing Phase 5 behavior).

Scope:

- Storage bucket per D4; `media` table with bucket, object path, uploader, MIME
  type, size, dimensions, and timestamps.
- Server-side upload handling with type and size allowlists; no SVG or arbitrary
  HTML execution. Reject unauthorized uploads through Storage policies too.
- Image node in the editor; contextual alt text stored with the occurrence.
- Responsive delivery through the framework image component or a documented
  loader; generate URLs rather than treating signed URLs as identifiers.
- Reference-aware deletion: never remove an object still used by a post.

Security and tests:

- Anonymous upload is denied; oversize and wrong-type uploads are rejected.
- Alt text is required or explicitly marked decorative.
- Deleting unused media is safe; deleting referenced media is refused.

Demo: upload an image, insert it with alt text, preview it, and verify the public
render is responsive. Exit when Storage policies and validation tests pass.

### Phase 7 — YouTube embeds

Goal: supported videos render as structured, responsive embeds.

Status: complete on 2026-10-22. Verified with lint, typecheck, 325 unit tests,
173 local-Supabase RLS tests, a clean `supabase db reset`, the production
build, and a browser journey on the production server: a lookalike-host URL
rejected with an inline error, a `youtu.be` link with `?t=30` inserted with a
title, the draft saved and reloaded with the node intact, the member preview
playing the sandboxed embed from 0:30, a 16:9 frame at desktop and 375 px
widths without horizontal overflow, light and dark themes, and the selected
video reopening the panel in edit mode.

Implementation notes:

- Stored shape: `{ videoId, title, start? }`. The embed URL is derived on
  render; the editor form prefills a canonical watch URL when editing.
- `src/features/posts/content/youtube.ts` holds the parser, the embed URL
  builder, and the shared iframe `allow`, `sandbox`, and `referrerPolicy`
  values. A no-referrer policy breaks the player (error 153), so
  `strict-origin-when-cross-origin` is used.
- Accepted hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, and
  `youtu.be`. `youtube-nocookie.com` input URLs are not accepted. Invalid
  `t`/`start` offsets are dropped rather than rejecting the URL.
- No CSP exists yet; Phase 10 must add `frame-src https://www.youtube-nocookie.com`
  when it introduces one.
- The editor iframe ignores pointer events so clicks select the node; playback
  is checked in the preview.

Scope:

- Allowlisted provider node with strict URL parsing (YouTube watch/short URLs),
  no arbitrary iframe or HTML input.
- Responsive wrapper, accessible title, and privacy-conscious embed domain.
- Renderer parity with the editor.

Tests: invalid hosts, malformed IDs, and script-bearing URLs are rejected.

Demo: insert a valid video and confirm responsive rendering in both themes.

### Phase 8 — Publishing and public reading from the database

Goal: a draft becomes a public, server-rendered post through one controlled
mutation, and sample data is gone.

Status: complete on 2026-10-23. Verified with lint, typecheck, 340 unit tests,
186 local-Supabase RLS tests, a clean `supabase db reset`, the production build
(home and published posts prerendered with a 5-minute ISR fallback), and a
browser journey on the production server (`next start`): anonymous draft URL
404 and member preview redirect to `/login`; an author sees no publish controls
on their own draft; an admin's publish of the uncategorized seed draft fails
with the category message; after saving a category, publish makes the post
appear on `/` and `/posts/<slug>` (cached 404 replaced); editing the live title
shows "Güncellendi" on the public page and the listing; a slug change makes the
old URL answer one `308` to the new slug; unpublish returns both URLs to 404 and
removes the post from the listing; republish restores it with a fresh
publication time.

Implementation notes:

- `publish_post`/`unpublish_post` return `55000` for the wrong starting state,
  `23514` without a category, `40001` for a stale revision, and `42501` for
  non-editors. Both bump `revision`, so stale admin forms conflict afterwards.
- Redirects store `post_id`, so resolution is always one hop. A trigger on
  `posts` records the old slug only for published posts, removes a redirect
  when its own post takes the slug back, and rejects other posts claiming it.
- The first production test showed `revalidatePath` alone leaving the listing
  stale after unpublish: supabase-js `fetch` responses sit in the Data Cache.
  Public reads are now tagged `public-posts` and mutations call `updateTag`
  before `revalidatePath`. Verify cache behavior with `next start`; `next dev`
  never caches.
- Publishing a post sets `updated_at = published_at` (same transaction), which is
  why "Güncellendi" compares strictly greater.

Scope:

- Publish mutation: authorize, require a category, validate content, set
  `published_at` separately from creation/update timestamps, and record the
  `draft` → `published` transition. Unpublishing returns a post to `draft` and
  clears `published_at`; review and archive states remain deferred.
- Replace `sample-data.ts` reads with authorized public queries behind the
  existing data boundary. Keep drafts out of public queries and caches.
- Public listing and post page rendered from the database, with explicit
  prerender/revalidate behavior for this Next.js version.
- Slug change handling: keep old URLs working through a redirects record;
  canonical URL remains category-independent.
- Cached/static previews isolated from public caches.
- Show `updated_at` as "Güncellendi" when it is newer than `published_at`.

Security and tests:

- Anonymous sees only published posts in pages, queries, and API routes.
- Unauthorized publish is denied; publish without category fails.
- Draft is absent from listing, sitemap input, and search/discovery output.
- Old slug redirects to the new one exactly once.

Demo: draft → publish → public page → edit → republish, plus denied anonymous
draft access. Exit when the complete journey is verified end to end.

### Phase 9 — SEO, sharing, and archives

Goal: public content is discoverable and shareable without leaking non-public
content.

Status: complete on 2026-10-23 (done before the taxonomy and author identity
administration increments at the user's request). Verified with lint,
typecheck, 365 unit tests, 204 local-Supabase RLS tests, the production build
(non-empty archives and the sitemap prerendered with a 5-minute fallback), and
a browser journey on `next start`: post head metadata and JSON-LD matched the
post; copy link copied the canonical URL (and showed the selectable fallback
when the Clipboard API was denied); share links carried only the encoded URL
and title with `noopener noreferrer`; category (including a child category's
post), tag, and author archives rendered in light and dark themes with visible
focus rings; `sitemap.xml` and `robots.txt` listed only public URLs; the draft
slug and unknown archive slugs returned 404 with `noindex`; admin, sign-in, and
preview sent `noindex, nofollow`. Unpublishing the only post of a category and
tag turned the post, both archives, and their sitemap entries into 404/absent
and dropped it from the author archive; republishing restored them.

Implementation notes:

- No migration. Categories and tags are public metadata; the archive 404s
  unless at least one published post is listed. Authors are visible only while
  credited on a published post (Phase 3 policy), and `user_id` stays hidden.
- Tag and author archives filter through an aliased `!inner` embed so the
  display embed still returns every tag and credit of the post.
- Query builders live in `features/posts/queries.ts` (no server-only imports)
  so the RLS tests exercise the exact production queries.
- Public pages are indexable only when `NEXT_PUBLIC_SITE_URL` is set; without
  it `robots.txt` disallows everything and the sitemap is empty.
- No Open Graph image: posts have no cover field yet. A generated image or a
  configurable default can follow once the brand (D5) is decided.

Scope:

- Metadata, canonical URLs, Open Graph/Twitter previews, and Article structured
  data for published posts.
- `sitemap.ts` and `robots.ts` driven by published content and the site URL.
- Category archive pages including descendants, plus tag and author archives.
- Copy-link and provider share links; no social APIs.
- `noindex` for previews, admin, and unpublished content.

Tests: sitemap excludes drafts and previews; unpublished slugs return 404;
metadata and JSON-LD match the post; canonical ignores category/tag paths.

Demo: share a post link, inspect preview metadata and sitemap output.

### Phase 10 — Caching, concurrency, and launch readiness

Goal: the system stays correct under concurrent edits and can be operated.

Status: complete on 2026-10-23 (done before the taxonomy and author identity
administration increments at the user's request). D5 stays provisional: the
user deferred hosting, has no production domain, and keeps "Yazılar" as a
provisional name, so this phase documents and prepares but deploys nothing.
Verified with lint, typecheck, 379 unit tests, 239 local-Supabase RLS tests,
the production build, `npm run test:smoke`, and a browser journey on
`next start`: two tabs edited the same published post; the second save showed
the conflict alert and kept its title, excerpt, and Tiptap body while the
database kept the first save; that save refreshed the listing, post, category
and tag archives immediately; publishing the remaining draft turned its 404
into a page and added it to the listing, its category archive, and the
sitemap; with the publication budget exhausted, unpublish showed the
rate-limit message and the post stayed live; with Supabase stopped, an
expired public page showed the error boundary (light and dark) and "Tekrar
dene" recovered it after restart; an unknown admin post showed the admin 404
inside the admin layout; the admin loading skeleton streamed before page
content; uploaded images rendered under the CSP without violations. The local
backup drill (dump, reset, restore of Postgres and Storage) matched every
count, fingerprint, and the image checksum.

Implementation notes:

- `updateTag` only works in Server Actions; route handlers or webhooks that
  change content later must use `revalidateTag(tag, "max")` and the same route
  list.
- Updating a published post expires its cached HTML immediately (`updateTag`
  semantics), so if Supabase is down right after a publish, that route returns
  the error page instead of stale content until Supabase recovers.
- React 19 resets uncontrolled form fields after a form action settles, which
  can revert title, slug, excerpt, and category to the loaded values after a
  rejected save. The action now returns the submitted values as the new
  defaults and the category select is controlled; the browser journey
  confirmed the kept input.
- Rate limits count only successful writes (the event row rolls back with a
  rejected write) and serialize per actor and action with a transaction
  advisory lock.
- `supabase db query` cannot execute a multi-statement dump; local restores use
  `supabase db reset --sql-paths <dump>`.

Scope:

- Explicit cache tags and invalidation on publish, update, taxonomy, and slug
  changes using current Next.js APIs.
- Atomic revision checks on every content mutation, with a clear conflict UI.
- Rate limiting for invitations, uploads, and other abuse-prone writes.
- Loading, empty, and error states for admin and public pages in both themes.
- Backup and restore runbook covering both database and Storage; document an
  exercised drill.
- Secrets and environment review; deployment target decision (D5).
- End-to-end smoke tests and a final anonymous/reader/author/editor/admin RLS
  matrix.

Tests: two concurrent saves surface a conflict instead of overwriting; publish
invalidates listing, post, taxonomy, and sitemap caches; restore drill documented.

### Phase 11 — Reader accounts

Goal: a visitor can create and manage a reader account with email and password
without gaining any editorial access.

Status: complete on 2026-10-23, before the taxonomy and author identity
administration increments at the user's request. Verified with lint,
typecheck, 395 unit tests, 263 local-Supabase RLS tests, the production build,
and the browser journey in the handoff above.

Implementation notes:

- Decisions taken in this phase: the display name is required at sign-up and
  editable on `/account`; `/login` serves readers and members (members land in
  `/admin`, readers in `/account`); an **active admin cannot delete their
  account** (another admin must demote or deactivate first, which also keeps
  the last-admin guarantee), while editors, authors, and deactivated members
  can, keeping their posts, credits, and media (`ON DELETE SET NULL`) with a
  `member.account_deletion` audit entry.
- Enabling public sign-up opened one escalation path: an unconfirmed account
  registered for someone else's email would receive membership when an admin
  invites that email. A trigger now requires a confirmed or Auth-invited
  account before a membership becomes active.
- Supabase hides whether an email is registered on sign-up only when both
  email and phone confirmations are enabled; phone confirmations are on for
  that reason (SMS stays disabled).
- The Phase 10 rate-limit table is keyed by Auth user, so the anonymous Auth
  flows use a sibling table keyed by SHA-256 subject digests, callable only
  with the secret key. Every attempt counts, not only successful ones.
- Supabase documents `token_hash` templates plus `verifyOtp` for SSR. The
  local native stack cannot serve custom templates, so the callbacks accept
  both that shape and the default PKCE `?code=` link; hosted projects need
  the custom templates.
- Account deletion verifies the password with a stateless client, runs
  `prepare_own_account_deletion()` as the user (the Phase 12/13 hook point),
  then calls the Auth admin API with the session's user id.

Scope:

- Public self-service sign-up and sign-in with email + password. Configure email
  confirmation, password reset, a minimum password policy, and redirect URLs.
  No OAuth or magic links in this phase. Verify the current Supabase password
  and email-confirmation guidance before implementing.
- Reuse the `profiles` row created in Phase 2; collect a display name for
  comments at sign-up or on first use. No public reader profile pages initially.
- Account page: display name, password reset entry point, sign-out, and account
  deletion. Account deletion runs through a server-only admin action; `profiles`
  cascades from `auth.users`, bookmarks are removed, and comments are anonymized
  as described in Phase 13.
- Abuse protection: rate limits on sign-up, sign-in, and password reset, plus
  CAPTCHA or equivalent if abuse appears. Production SMTP and email template
  review before public launch.
- Reader state is derived from the absence of an editorial grant. No `reader`
  value in the editorial role enum and no self-service path to editorial access.
- Middleware/Proxy rules keep reader-only routes separate from `/admin`.

Security and tests:

- Sign-up creates a profile and nothing else; email confirmation is required.
- Reader is denied every admin, draft, and publish operation.
- Password reset does not reveal whether an email exists.
- Account deletion removes only the user's own data and applies the documented
  comment policy.
- No endpoint accepts a client-supplied user ID or role.

Demo: a reader signs up with email + password, confirms the address, sets a
display name, is denied `/admin`, resets the password, and deletes the account.
Exit when the reader RLS matrix passes.

### Phase 12 — Bookmarks

Goal: signed-in readers can save published posts privately and revisit them.

Status: complete on 2026-10-23. Verified with lint, typecheck, 429 unit tests,
311 local-Supabase RLS tests, the production build, the smoke test, a clean
`supabase db reset`, and the browser journey in the handoff above.

Implementation notes:

- Any signed-in account may bookmark, editorial members included; RLS keeps
  every account to its own rows, and the insert policy checks `published`
  explicitly because members can read drafts.
- Bookmark state is read in the browser after hydration (`BookmarkProvider`,
  one RLS-scoped query per page), so `/posts/[slug]`, the home page, and the
  archives stay shared ISR output; the Server Action revalidates nothing. See
  the README "Bookmarks (Phase 12)" section for the reasoning.
- Unpublishing keeps the bookmark row and the saved list hides the post;
  deleting a post or an account cascades. The account-deletion preflight now
  removes bookmarks explicitly.
- Only creation is rate-limited (`bookmark.create`, 60 per 10 minutes): every
  delete needs an earlier insert, and the deletion preflight must not hit a
  limit.
- `/login?next=` return paths were added for the signed-out toggle and the
  `/account/*` Proxy redirect, validated by `safeReturnPath`.

Scope:

- `bookmarks` with `(user_id, post_id)` as the unique pair, foreign keys, and
  timestamps. `user_id` references `profiles` with `ON DELETE CASCADE`; a post
  removal cannot leave orphan rows. No hard-delete post UI in this phase.
- Toggle on the post page and cards; a private `/account/saved` list with
  empty and error states. Optimistic UI confirmed by the server.
- RLS: select, insert, and delete only the current user's rows; insert only for
  published posts and only as the authenticated user; anonymous access denied.
- The saved list joins posts and filters to published content, so a post that is
  unpublished later does not leak draft content through a bookmark.
- No public bookmark counts and no public like counts. Public likes remain
  deferred and would need a separate `post_likes` table.
- Account and saved-list routes are `noindex` and never publicly cached.

Tests: one bookmark per pair, user isolation on read/write, draft posts cannot be
bookmarked, unpublished posts disappear from the saved list without leaking,
unauthenticated requests are denied, account deletion cascades.

Demo: two readers bookmark the same post; neither sees the other's list; an
anonymous visitor is redirected to sign in. Exit when the bookmark RLS matrix
passes.

### Phase 13 — Comments

Goal: readers can discuss published posts under post-moderation without exposing
unpublished content or other users' data.

Status: complete on 2026-10-23. Verified with lint, typecheck, 443 unit tests,
339 local-Supabase RLS tests, the production build, the smoke test, a clean
`supabase db reset`, and the browser journey in the handoff above.

Implementation notes:

- Visible comments render server-side inside the ISR post page through the
  anonymous client, tagged `post-comments:<postId>` and `public-comments`.
  Comment Server Actions call `updateTag` for the post's tag and
  `revalidatePath` for its literal path, so a comment change regenerates one
  page; account deletion expires `public-comments` and the `/posts/[slug]`
  pattern. Per-visitor controls load in the browser after hydration.
- The display name is a snapshot copied from the profile by an insert
  trigger; a profile without one cannot comment (`23502`). `user_id` and
  `reporter_id` have no client select grant; the browser learns its own
  comment ids through `list_own_comment_ids()`.
- Owners hard-delete their own comment (RLS delete policy); editors and
  admins soft-delete through `moderate_comment()`, which is final and
  audited. Hide/restore are audited too.
- Readers cannot report their own comment, and only visible comments on
  published posts are reportable.

Scope:

- `comments` with post, author, a stored display-name snapshot, body, status
  (`visible`, `hidden`, `deleted`), and timestamps. Flat threads only; no replies
  in this phase.
- Post-moderation: a submitted comment becomes `visible` immediately. Any signed-in
  reader can report it; editors can hide or delete it from a moderation queue.
  Hidden is reversible; deleted is a soft delete. No auto-hide threshold
  initially, to avoid report-based censorship gaming.
- `comment_reports` with a unique `(comment_id, reporter_id)` pair, a reason, and
  timestamps. A reader can report a comment once and can only see their own
  reports. Reporter identity is never public.
- Plain-text body with a length limit. If limited formatting is allowed, sanitize
  it and reuse the renderer allowlist; never accept arbitrary HTML.
- Submission allowed only on published posts. A reader can delete their own
  comment; there is no comment editing.
- On account deletion, the server action first anonymizes the user's comments
  (`user_id` set to null and display-name snapshot replaced with a neutral label),
  then deletes the auth user. `comments.user_id` references `profiles` with
  `ON DELETE SET NULL` as a safety net. Keep the body so discussions remain
  readable.
- Rate limit per user per hour for comments and reports, plus a basic
  duplicate/spam guard.
- Public pages render only `visible` comments for published posts; counts and
  listings exclude hidden and deleted rows.
- RLS: public select of visible rows for published posts; insert only with the
  authenticated user's ID and `visible` status; owner delete only; status changes
  only through editorial membership; report insert only as the authenticated
  reporter for a visible comment. No service-role use in request paths.
- Invalidate the post page and comment count when a comment is created, hidden,
  restored, or deleted.

Tests: anonymous cannot write or report; a reader cannot impersonate another
author, comment on a draft, or report twice; a new comment is visible immediately;
a reported comment stays visible until an editor hides it; hidden and deleted
comments are invisible publicly; only editors change status; account deletion
anonymizes the comment and keeps the body; rate and length limits hold.

Demo: reader comments, it appears immediately, another reader reports it, an
editor hides it, and it disappears publicly. Unauthorized moderation is denied.
Exit when anonymous, reader, author, editor, and admin paths are verified.

### Phase 14 — Post language

Goal: each post declares the language it is written in, so browsers, screen
readers, and search engines treat it correctly, without translating the
interface or linking translations.

Status: complete on 2026-10-24 (user request: support `en`, `de`, and `tr`).
Verified as recorded in the handoff above.

Implementation notes:

- Level 1 of two: one language per post. Linking translations (a nullable
  translation group plus `hreflang` alternates) can be added later without
  changing `posts.language`. Interface localization (D5) is independent; the
  admin interface stays Turkish for every post language.
- The allowed set lived in `src/features/posts/language.ts` and was mirrored
  by the CHECK constraint and `assert_post_language`. Superseded by Phase 21:
  any canonical BCP 47 tag.
- `<html lang>` stays `tr` for the interface. Only post-authored text carries
  the post language, so Turkish labels, tags, and comments around an English
  post are still announced in Turkish.

Follow-ups, not requested: a language filter on archives and per-language
sitemaps. Language-aware full-text search shipped in Phase 19.

### Phase 15 — Public listing pagination

Goal: the home listing and the category, tag, and author archives read and
render one page of posts at a time, without losing ISR caching.

Status: complete on 2026-10-24 (session request). Verified as recorded in the
handoff above. Details: README "Public listing pagination".

Implementation notes:

- Path-based pages (`<listing>/page/<n>`, page 1 at the listing URL) instead
  of `?page=`, because `searchParams` makes a Next.js 16 page dynamic. Later
  pages prerender through `generateStaticParams`; others render on first
  request and are cached.
- Order is `published_at desc, id desc`; reads use `range()` with an exact
  count. The existing partial `posts_published_listing_idx` still serves the
  order (the tiebreaker only sorts rows with equal `published_at`), so no
  migration was added.
- `/page/1` redirects come from `next.config.ts`, because a redirect thrown
  while rendering an ISR page sent `Location` twice on the first response.
  Existing render-time redirects (old post and archive slugs) likely behave
  the same on their first uncached request (not verified); browsers accept
  identical duplicate values, but recheck on the chosen host.
- Each page is self-canonical; no `rel=prev/next`. The sitemap lists posts and
  archives, not pages.
- Invalidation regenerates every page of every listing on each public change,
  consistent with the route-wide model from Phase 10.

Follow-up, not requested: pagination for the admin comment moderation queue
(still the latest 100 rows per filter).

### Phase 16 — Post cover image

Goal: an optional cover image per post for the article header, listing cards,
Open Graph/Twitter cards, and Article JSON-LD.

Status: complete on 2026-10-24. Verified as recorded in the handoff above.

Implementation notes:

- The reference and alt text stay on `posts`, outside the editor document
  (AGENTS.md). Alt text is per occurrence, so the same media can be a cover in
  one post and a differently described body image in another.
- The cover parameters are required on the authoring RPCs, like
  `p_language`, so an old client cannot clear a cover by omitting them.
- Drafts may save a cover without alt text; publishing requires it
  (`publish_post`, `assert_post_cover`, and the CHECK constraint).
- Readers still cannot read `public.media`. Renderers derive the URL from the
  id and use a fixed 16:9 box, so no dimensions are exposed or copied.

Follow-ups, not requested: a site-wide default social image, a focal point or
per-cover aspect choice, and a 1200×630 Open Graph rendition (for example
through the image optimizer on the site origin) with width/height.

### Phase 17 — Syndication feed

Goal: readers can subscribe to published posts in a feed reader.

Status: complete on 2026-10-24. Verified as recorded in the handoff above.

Decisions:

- **Atom only, no RSS 2.0.** Atom (RFC 4287) has a required, stable entry id
  (the post UUID, so a slug change does not duplicate the entry), separate
  `published` and `updated` times, typed text constructs, and `xml:lang` per
  entry, which carries `posts.language`. Every mainstream reader supports it.
  A second RSS document would duplicate the escaping, cache, and test surface
  for no reader that needs it; add `/rss.xml` only on request.
- **20 entries** (`feedPostLimit`), newest publication first, matching the
  public listing order.
- **Summary, not full content.** The excerpt goes out as `type="text"`. The
  shared renderer produces React with optimized image URLs and iframes;
  rendering it to an HTML string for feeds would need a separate,
  feed-specific serializer to stay safe. Readers follow the canonical link.
- **No site URL → 404.** Entry ids, links, and the self link need absolute
  URLs; this matches the empty sitemap and the disallow-all `robots.txt`.
  The discovery link and footer link are omitted then.
- **Cover image** as Media RSS (`media:thumbnail`, `media:content` with the
  alt text), the de facto image extension for Atom readers.
- Discovery uses `alternates.types`. Metadata merges shallowly, so every page
  that sets a canonical URL repeats the feed link (`canonicalAlternates`).

Follow-ups, not requested: per-category, per-tag, and per-author feeds (the
archive queries exist; each needs a route, a discovery link on its archive,
and invalidation entries), full-content entries through a dedicated safe HTML
serializer, and WebSub pings on publish (an external side effect that would
need a durable job).

### Phase 18 — Profile pictures (avatars)

Goal: account holders and public author identities can have a picture that
appears in bylines, the author archive, and comments.

Status: complete on 2026-10-24 (developed on `claude/profile-pictures-0e5f66`,
migration `20261024160000_avatars.sql`). Verified as recorded in the handoff
above. See the README "Profile pictures (avatars)" section.

Decisions (2026-10-24, recommended defaults accepted in the task):

- **Two avatars, two owners.** Account holders (readers and editorial members)
  set their own `profiles.avatar_id` at `/account`; admins set an author
  identity's `authors.avatar_id` at `/admin/authors`, guests included. An
  author never inherits the linked account's picture: equal pictures would
  reveal `authors.user_id`, which stays unreadable.
- **Separate public bucket.** `avatars` is public (an avatar is public by
  nature) and separate from `media` (D4 covers post media only). Object names
  carry a kind prefix and a fresh UUID, never a user or author id. Profile
  objects are writable and removable by their uploader only, author objects by
  admins only; objects in use cannot be removed. JPEG, PNG, and WebP up to
  2 MiB with 16–4096 pixel edges, checked by signature on the server; ten
  uploads per user per ten minutes in the Storage policy and ten avatar
  changes per hour in `set_own_avatar`.
- **No resizing or crop step.** The original is stored; `next/image` serves a
  square `object-cover` rendition at the displayed size.
- **Comments follow the live avatar** (unlike the display-name snapshot).
  Replacing or removing an avatar deletes the old object, so a snapshot would
  break, and a reader who removes a picture expects it gone. The copy in
  `comments.avatar_id` keeps public reads off `profiles`; `set_own_avatar`
  returns the affected posts so only their ISR pages are invalidated.
  Anonymization clears it, so a deleted account leaves no avatar.
- **Account deletion** clears the profile avatar in the preflight, then the
  action removes every `profiles/` object the user owns (current and never
  attached) before deleting the Auth user.

Follow-ups, not requested: a client-side crop/focal-point step, avatars on
listing cards and the admin author list, Article JSON-LD author `image`, and a
periodic sweep for orphan objects left by out-of-band Auth deletions.

### Phase 19 — Full-text search

Goal: readers can find published posts by words in the title, excerpt, or
body, in the post's own language and without typing Turkish or German
diacritics.

Status: complete on 2026-10-24 (session request), on
`claude/full-text-search`, migration `20261024180000_post_search.sql`.
Verified as recorded in the handoff above. Details: README "Full-text search
(Phase 19)".

Decisions:

- **Postgres full-text search, no external service.** A stored generated
  column keeps the vector in step with every write without triggers and
  without touching the authoring RPCs.
- **Two configurations per post.** The language's Snowball stemmer
  (`turkish`, `english`, `german`) for inflections, plus `search_folded`
  (`unaccent` + `simple`) for diacritic-free input and the Turkish dotted and
  dotless i, which the database locale lowercases to `i`. Each language branch
  ORs both queries and applies only to posts in that language.
- **`SECURITY DEFINER`, explicit published filter.** The `@@` operator is not
  leakproof, so under RLS the GIN index cannot be used; the definer function
  filters `status = 'published'` itself, which is also stricter than RLS for
  members (no own drafts). Cards are still read through the anonymous client.
- **Markers, not HTML.** `ts_headline` output uses U+0002/U+0003, which are
  stripped from the source first; the page renders text segments in `<mark>`.
- **Rate limit in the existing mechanism.** A `search.query` action (30 per IP
  per minute) in `consume_auth_rate_limit`, with the same X-Forwarded-For
  caveat. Requests without an address share one bucket. Direct Data API calls
  bypassed it until Phase 20 made the function server-only.
- **No cache, no invalidation change.** `/search` is dynamic and `noindex`,
  reads with `no-store`, and is not in the sitemap; the invalidation map is
  unchanged because nothing about search is cached.

Known limits: Snowball stems are not always consistent across inflections
(Turkish "ekran" stems to `ekra`, "ekranlarda" to `ekran`); recall is mostly
rescued by the folded branch or a lexeme from the other branch, but then the
snippet may show the opening words without marks. An excluded term (`-word`)
is excluded per branch. Stop words of the post language still match through
the folded branch. Body attributes (image alt text and captions, YouTube
titles, link targets) are not searched.

Follow-ups, not requested: searching image captions and YouTube titles, a
typo-tolerant fallback (`pg_trgm` on titles), and search analytics. Direct
Data API calls were closed in Phase 20.

### Phase 20 — Polish pack

Goal: ship the small follow-ups the user accepted after Phase 19 as one
increment.

Status: complete on 2026-10-24 (session request), on
`claude/polish-pack-8aba77`, migration
`20261024200000_search_server_only.sql`. Verified as recorded in the handoff
above. Details: README "Polish pack (Phase 20)".

Decisions:

- **Confirmation in a portaled AlertDialog, submit with `requestSubmit()`.**
  The form and its revision field stay as they were, so the compare-and-swap
  is unchanged; the dialog only gates the submit.
- **Moderation feedback by URL.** `?status=<new comment status>` through
  `QueryStatus`, like every other admin page, instead of a toast. Paging uses
  `?page=` (the queue is dynamic, like `/search`), 20 per page with an exact
  count and `id` as tie-breaker.
- **Back/Forward through the Navigation API.** The bundled Next.js 16 docs
  offer only `<Link onNavigate>` (link clicks) and nothing for history
  traversal; the App Router listens to `popstate`. Cancelling the `navigate`
  event of a same-document traversal is the only approach that does not push
  sentinel entries into the router's history state. Where it is unavailable
  or not cancelable, the documented fallback is the existing link and
  `beforeunload` guard.
- **Admin return path for members only.** `/admin` paths became valid
  `?next=` values; sign-in honors them only for active members so a reader
  never lands on the access-denied view.
- **Default social image at build time.** `opengraph-image.tsx` reads only
  `NEXT_PUBLIC_*` values and renders once; builders that set `openGraph`
  declare it explicitly because a child `openGraph` replaces the inherited
  file image. No image without a site origin.
- **Search function server-only.** Revoking `execute` from `anon` and
  `authenticated` was chosen over an in-database limit: PostgREST offers only
  the spoofable `X-Forwarded-For`, and a global limit lets one client starve
  everyone. Visibility stays inside the function; the secret key is used only
  for that call, cards are read anonymously under RLS.

Left out on purpose: a toast system, cropping or regenerating avatars, a
per-post generated social image, search on the saved list or a slimmer
byline there, and a Postgres-side limit for plain Data API table reads.

### Phase 21 — Open post languages

Goal: a post can be written in any language, independent of the small set of
interface languages.

Status: complete on 2026-10-24 (user decision: posts in any language,
interface languages tr/en/de separately in Phase 22, all posts shown
regardless of language), on `claude/open-post-languages-e547c6`, migration
`20261024220000_open_post_languages.sql`. Verified as recorded in the handoff
above. Details: README "Post language" and "Full-text search (Phase 19)".

Decisions:

- **A pragmatic BCP 47 subset.** Language, optional script, optional region,
  canonical casing, at most 12 characters; no variants, extensions, private
  use, or `und`/`mis`/`mul`/`zxx`. Enough for every real post language and
  regional variant, small enough to check with one regular expression on both
  sides.
- **Canonicalization in the application, grammar in the database.**
  `Intl.getCanonicalLocales` knows CLDR aliases, Postgres does not; the
  database enforces shape and casing for every writer, the application stores
  only canonical tags. Shared fixtures run in both test suites.
- **RPC signatures unchanged.** `create_draft_post` and
  `update_post_metadata` already call `assert_post_language()`, which was
  replaced in place.
- **Search: configuration by primary subtag, one prefilter.** A
  row-independent OR of every configuration's query keeps the GIN index usable
  (a per-row query alone cannot be an index condition); each row is then
  matched against its own configuration only. Languages without a stemmer use
  `search_folded` alone, indexed once so their ranks are comparable.
  Typographic apostrophes are mapped to ASCII for indexing and parsing,
  because the default parser otherwise keeps French elisions as one word.
- **Combobox from shadcn/ui.** `Popover` + `Command` (new dependency `cmdk`),
  names from `Intl.DisplayNames` in Turkish (the current interface language),
  codes always visible, free entry of valid tags.
- **`og:locale` derived, not tabulated.** `Intl.Locale().maximize()` gives
  the likely territory; numeric regions retry with the language alone; no
  territory means no `og:locale`.
- **Interface locales kept apart.** `src/lib/interface-locales.ts` (`tr`,
  `en`, `de`) is not used for post validation; the feed element's `xml:lang`
  and the default display locale read it.

Known limits: no word segmentation for Chinese, Japanese, or Thai (a run of
letters is one word, so search needs the whole run or spaced text);
diacritic-free input is not stemmed ("etroit" does not find "étroites";
"étroit" and "etroites" do); Snowball stemmers are uneven ("marchions" does
not stem to "march"); highlighting reads the original text, so a word joined
by a typographic apostrophe can match without a marker. Language names come
from the runtime's ICU data, which may differ between Node and a browser for
rare languages (the label then falls back to the code). The search filter
offers the common languages only; other valid tags work through the URL.

Follow-ups, not requested: a filter built
from the languages that actually have published posts; CJK segmentation
(for example `pg_bigm` or an n-gram configuration) if such posts appear.

### Phase 22 — Interface localization

Goal: readers and editors use the interface in Turkish, English, or German
without any change to URLs, caching, or post content.

Status: complete on 2026-10-24 (user decisions: the locale is chosen by a
cookie, not the URL; the admin panel is translated too; every post is shown in
every interface language; interface languages tr, en, de with default tr), on
`claude/ui-localization-6a5870`. Verified as recorded in the handoff above.
Details: README "Interface localization (Phase 22)".

Decisions:

- **Proxy rewrite to an internal `[locale]` segment.** Reading `cookies()`
  in public pages would make them dynamic. The proxy resolves the locale
  (cookie, `Accept-Language`, `tr`) and rewrites to `/<locale>/<path>`, so
  each locale is its own static/ISR entry. Internal `/en/...` URLs are not
  public (they end in the localized 404).
- **`next/root-params` instead of `setRequestLocale`.** Next.js 16.3 exposes
  the root parameter to every Server Component, and next-intl 4.14 deprecates
  `setRequestLocale` in its favor. Server Actions and Route Handlers have no
  root parameters, so they read the `x-interface-locale` header that the
  proxy always overwrites.
- **next-intl without its middleware or routing.** Only the request
  configuration, `getTranslations`/`useTranslations`, formatters, and
  `NextIntlClientProvider` are used; the proxy owns locale resolution.
- **Turkish catalog as the typed source.** One JSON file per locale and
  namespace; the compiler and a parity test keep en/de aligned (keys, no
  empty values, ICU arguments, valid syntax). Pure modules return keys.
- **Client messages by dot path.** Each provider (root, sign-in/account
  layouts, admin layout) passes only what its Client Components read, so
  public pages do not ship sign-in, search, or admin copy in their payload.
- **Invalidation by `[locale]` route pattern.** One `revalidatePath` per
  pattern covers all locales; concrete paths are revalidated per locale.
- **Switcher sets a functional cookie.** `locale`, one year, `SameSite=Lax`,
  `Secure` on HTTPS, no consent banner (strictly necessary preference).
- **No `Vary` header.** Next.js 16 overwrites `Vary` on App Router page
  responses; the hosting checklist requires an edge cache key on the locale
  cookie instead.

Known limits: Supabase Auth email templates are not localized; the switcher
needs JavaScript (first visits still negotiate `Accept-Language`); the admin
shell shows the header switcher and its own sidebar switcher; the feed,
sitemap, and default social image are locale-free (the feed keeps
`xml:lang="tr"`); `global-error.tsx` carries its own five strings per locale;
names in post-card taxonomy lists still sort with Turkish collation; a 404
from `notFound()` renders its body on the client (Next.js answers with its
error shell for every `notFound()` in this app, unchanged from Phase 21; the
status is 404 and `noindex` either way); URLs outside the proxy (files with an
extension, such as `/missing.txt`) get Next.js's built-in 404 page instead of
the localized one.

Follow-ups, not requested: localized Auth email templates per reader
language (needs a stored preference); a no-JavaScript switcher; edge cache
configuration once hosting (D5) is chosen.

## Cross-cutting delivery rules

- Every phase runs `npm run lint`, `npm run typecheck`, tests, and
  `npm run build` with repository scripts. Unrun checks are reported as unrun.
- Every migration works on a clean local database and is tested with existing
  data when it changes behavior.
- Every phase verifies one complete journey plus an error or denied-access path.
- Authorization tests cover anonymous, authenticated non-member (reader),
  authorized, and unauthorized users against RLS, never service-role only.
- Keep changes small; do not upgrade unrelated dependencies or rewrite adjacent
  code.
- Report status, checks, limitations, and the next step in Turkish.

## Deferred beyond this roadmap

Public like counts, OAuth and magic-link sign-in, comment replies and threading,
notifications, subscriptions, personalized feeds, private or paid content,
real-time collaborative editing, multi-publication tenancy, billing, AI writing,
plugin systems, and social API integrations. Each requires a separate, explicit
request and its own moderation/permission design.

Planned, not yet scheduled: **semantic search with `pgvector`.** Phase 19
search is lexical (stemmed and accent-folded `tsvector`), so it finds word
forms but not synonyms or related concepts. The intended follow-up adds post
embeddings in Postgres and combines vector similarity with the existing
`ts_rank` score (hybrid ranking) inside the server-only search function,
keeping the published-only filter and RLS-checked card reads. Open decisions
before implementation: the embedding model and provider (a new external
dependency and cost), what is embedded (title/excerpt/body, chunking of long
bodies), when embeddings are computed (a durable job outside the post write
transaction, with retries), re-embedding on edits and model changes, and the
index type (HNSW or IVFFlat).

## Risks and watch items

- Next.js 16 middleware/proxy and caching conventions differ from earlier
  versions; read the bundled docs before each related phase.
- Local Supabase stack identity is per repository path and branch; switching
  branches selects another stack. Keep CLI versions consistent.
- Vitest now includes a local-Supabase RLS suite. Every new policy and RPC must
  extend the anonymous/reader/author/editor/admin matrix before it is trusted.
- Tiptap is pinned at 3.32.0. Upgrades must rerun the editor-schema parity test,
  because a StarterKit change can add nodes or attributes outside the allowlist.
- Public media is a deliberate tradeoff; revisit before launch if drafts may
  contain sensitive images.
- SEO canonical and sitemap output cannot be finalized before D5.
- RLS mistakes are silent; every policy change needs a negative test.
- The single-working-copy model (D3) makes an edit to a published post live
  immediately. Phase 8/10 must add the `updated_at` label, cache invalidation, and
  a recoverable conflict UI before launch.
- `authors.user_id` is not client-readable. Phase 4 author selection uses the
  public author columns under an editorial-only policy. Future author
  administration must use a server-only path for the account link instead of
  widening the public grant.
- Public sign-up exposes the Auth endpoints to abuse. Application limits
  (Auth flows and, since Phase 19, search, which since Phase 20 has no direct
  Data API path) use the first `X-Forwarded-For`
  entry, which is only trustworthy behind a proxy that overwrites it; without
  one a client can rotate the header and is effectively unlimited. Confirm
  with the host (D5) and add CAPTCHA if abuse appears.
- Reader-generated content adds spam, moderation load, abuse handling, and
  account-deletion obligations. Phases 11–13 must ship with rate limits,
  reporting, and the documented deletion policy. Post-moderation only works with
  an actively reviewed queue.

## Next step

Every phase in the table (through Phase 22, interface localization), both
administration increments, and the first-admin bootstrap command are done. The remaining work is the launch gate: decide D5
(domain, brand, hosting), revisit D4 if draft images must stay private, then
follow the README hosting checklist (bootstrap the first admin with
`npm run admin:bootstrap`, site URL and Auth redirects, reader-account Auth
settings, production SMTP and `token_hash` templates, HSTS, shared cache
handler or single instance, hosted backups, and `npm run test:smoke` against
the deployment).
