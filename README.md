# jet-blog

A small multi-author blog scaffold in one Git repository: Next.js App Router,
TypeScript, shadcn/ui, Supabase infrastructure, and invite-only editorial
membership.

## Requirements

- Node.js 22 or newer (Node.js 24 LTS recommended).
- npm; use the committed `package-lock.json` rather than another package manager.
- Optional local Supabase: CLI 2.121.0. The experimental native runtime needs
  no Docker on Apple silicon with macOS 14+ or supported Linux systems.
  Other platforms need a Docker-compatible container engine.

## Run locally

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Without environment variables the public pages
render an empty listing; start the local Supabase stack and configure
`.env.local` (below) to read the seeded published posts.

Try `/posts/kucuk-adimlarla-baslamak`, follow the back link, and visit an unknown
post slug to see the 404 page. The protected `/admin` area needs a configured
Supabase project and a local user; see [Authentication and admin](#authentication-and-admin).

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`typecheck` generates Next.js route types before checking TypeScript, so it also
works before the first build. `npm test` runs the Vitest unit tests; it does not
need a Supabase instance. `npm start` serves the production build.

`npm run test:smoke` checks a running server (see
[Launch readiness](#launch-readiness-phase-10)).

`npm run test:rls` runs the local-Supabase RLS integration suite. Start the local
stack first; the runner reads `supabase status`. The suite creates and removes
synthetic auth users, posts, taxonomy, credits, and audit rows, and temporarily
pauses other active admins so the last-admin test is deterministic. It also
exercises the draft-authoring RPCs as author, editor, and admin. It restores
those admins and removes its own rows; seeded content stays in place. Run it only
against the local stack, never a hosted or production project.

After pulling a migration that changes the schema, apply it to a clean local
database with `supabase db reset`. That command deletes local application data
and then reloads the synthetic seed described in
[Content schema and taxonomy](#content-schema-and-taxonomy).

### Debug with VS Code

The committed `.vscode/launch.json` provides three configurations:

- **Next.js: debug full stack** (default): starts the development server with
  the Node.js inspector and launches Chrome when the server is ready.
- **Next.js: debug server-side**: starts the development server in a debug
  terminal without launching a browser.
- **Next.js: debug client-side**: launches Chrome against an already running
  development server; it does not start the server.

Open **Run and Debug** (`Cmd+Shift+D` on macOS or `Ctrl+Shift+D` on Windows/Linux),
select a configuration, set a breakpoint, and press `F5`. The full-stack
configuration requires Google Chrome to be installed.

The full-stack and server-side configurations run the `Supabase: start local
stack` task before starting Next.js. This starts the local native Supabase stack
when needed and leaves it running when the debug session ends. Run
`Supabase: show local status` or `Supabase: stop local stack` from **Terminal >
Run Task** to inspect or stop it.

Debug configurations use http://127.0.0.1:3107 and bind the server to loopback.
Stop any existing development server for this project before starting a
full-stack or server-side session to avoid port and `.next/dev` lock conflicts.
For client-only debugging, first run
`npm run dev -- --hostname 127.0.0.1 --port 3107`.
Stop a full-stack session with `Shift+F5`; its browser debug session stops with
the server. For the server-side debug terminal, use `Ctrl+C` to stop the server.
Invitation redirects use `NEXT_PUBLIC_SITE_URL`; when debugging on port 3107,
update it and the Supabase Auth site URL/redirect allowlist to match.

### Current dependency warnings

`npm audit --omit=dev` reports no production dependency advisories at setup time.
The full audit reports nine high-severity development-tool dependency entries
rooted in `braces` through the Next.js ESLint configuration and the shadcn CLI.
The CLI is a development dependency because its generated stylesheet is imported
by the UI setup. There is no patched compatible upstream version at setup time;
do not use `npm audit fix --force` to downgrade the framework tooling.

ESLint 9.39.5 is pinned because current lint-plugin peer ranges do not all accept
ESLint 10; npm marks ESLint 9 as deprecated. Recheck these upstream constraints
when updating the toolchain. All direct dependencies are pinned, and `.npmrc`
keeps future npm installs exact by default.

## Environment variables

Copy the placeholder file when you want to use Supabase:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL from Supabase's Connect dialog, or the local CLI output. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable API key for that project. |
| `SUPABASE_SECRET_KEY` | Server-only secret key used by the invitation action and admin client. Required for `/admin/members`. |
| `NEXT_PUBLIC_SITE_URL` | Public application origin used in invitation redirects and as `metadataBase` for canonical, Open Graph, JSON-LD, share-link, sitemap, robots, and feed URLs. It must match the Supabase Auth site URL and redirect allowlist. Without it the site is `noindex`, `robots.txt` disallows everything, the sitemap is empty, `/feed.xml` and the archive feeds answer 404 with no discovery link, and share controls are hidden. Local default: `http://localhost:3000`. Provisional until D5 picks the real domain. |
| `NEXT_PUBLIC_SITE_NAME` | Optional publication name for titles, `og:site_name`, and the JSON-LD publisher. Defaults to the provisional `Yazılar`; the brand (D5) is still open. |

Restart the development server after changing these values. `NEXT_PUBLIC_*`
values are included in the browser bundle at build time. Never put a secret or
service-role key in them. Real environment files are ignored by Git.

For the local stack, use `API_URL` and `PUBLISHABLE_KEY` from `supabase status`.
Use `SECRET_KEY` for `SUPABASE_SECRET_KEY`; do not use the legacy service-role
key in browser code. Hosted projects should use the server-only secret key from
the project's API settings. The secret key must never be exposed through a
`NEXT_PUBLIC_*` variable, a Client Component, logs, or committed files.

The public pages build and render an empty listing without these variables. The sign-in page shows a
configuration notice, and `/admin` redirects to it, when Supabase is not
configured. Invalid URLs still fail loudly rather than being silently ignored.

## Authentication and editorial membership

Editorial access is invite-only. Since Phase 11 anyone may create a reader
account at `/signup` (see [Reader accounts](#reader-accounts-phase-11)); a reader
account never grants editorial access, and an authenticated user without an
active editorial membership is treated as a reader. Sign-in uses email and
password through Supabase Auth for both.

### Roles

| Role | Capabilities |
| --- | --- |
| `admin` | Highest role and a superset of `editor`. Manages members, roles, invitations, and (in later phases) categories and tags. Multiple admins are allowed. |
| `editor` | Creates, edits, and publishes any post and assigns existing taxonomy. Cannot manage members or taxonomy. |
| `author` | Creates and edits their own drafts. Cannot publish or manage members. |

Membership lives in `editorial_members`, not in a profile flag. Deactivation keeps
the row and its history; the member is treated as a non-member on the next
request and can be reactivated. Author credits will remain separate from edit and
publish permissions.

### Routes and request checks

- `/login` signs in an existing user (reader or editorial member) and sends
  active members to `/admin` and everyone else to `/account`.
- `/admin` is a protected layout. The server verifies the session on every
  request with `supabase.auth.getClaims()`, loads the current membership, and
  denies users without an active grant. Missing or invalid sessions are
  redirected to `/login?next=<admin path>` (Phase 20); after sign-in an active
  member returns there, anyone else goes to `/account`. Signing out clears the
  cookies and returns to the sign-in page.
- `/admin/members` is the admin-only member list. Invite, role-change, and
  activation Server Actions re-check the caller and use database RPCs for the
  write plus its audit entry.
- `/admin/posts` is the editorial content surface. Authors see their own drafts,
  editors and admins see every post, and edit links follow the same permission
  rule the mutation RPC enforces. `/admin/posts/[id]/preview` is a
  members-only, `noindex`, dynamically rendered preview.
- `/auth/confirm` handles the fragment returned by Supabase's invite link,
  applies the session, and forwards to `/login/password`. The invitee sets a
  password before continuing to `/admin`.
- `src/proxy.ts` refreshes expired Auth tokens and copies refreshed cookies to
  both the Server Components and the browser response. Since Phase 22 it runs
  on every page to pick the interface locale, but the session check still
  runs only for `/admin`, `/account`, `/login`, and `/signup`, so public pages
  do not pay for it. It keeps the editorial (`/admin`) and reader (`/account`)
  route groups separate and only redirects signed-out visitors of either to
  `/login?next=` with the requested path and query; editorial access is
  decided by the admin layout, never by Proxy.
- Admin and invitation routes send `noindex, nofollow`.
- The sign-in form uses a Server Action. Error messages stay generic so the form
  does not reveal whether an email exists.

### Server clients and write boundaries

`src/lib/supabase/` has separate clients:

| Factory | Session | Use |
| --- | --- | --- |
| `createPublicServerSupabaseClient` | Anonymous | Public database reads that must never carry a user session. |
| `createServerSupabaseClient` | Cookie-backed | Server Components, Server Actions, and session verification. Create one per request. |
| `createPublicBrowserSupabaseClient` (and the `createBrowserSupabaseClient` alias) | Anonymous | Public-only browser reads. |
| `createBrowserAuthSupabaseClient` | Cookie-backed | Signed-in browser interactions. |
| `createAdminSupabaseClient` | Secret key | Invitations and Auth admin lookup after the caller has been verified as an admin. Server-only. |

The anonymous server factory must not be used to authorize a user. A normal
request path must not use the secret-key client to bypass RLS. Membership and
audit writes are not granted directly to authenticated clients; the
security-definer RPCs re-check admin access, enforce the last-admin rule, and
write the audit row in the same transaction. Direct reads are constrained by
RLS.

### Bootstrap the first admin

Editorial access is invite-only, so a fresh project has nobody who can send the
first invitation. The first admin is granted once, out of band, with a
server-only command:

```bash
npm run admin:bootstrap -- --local --email you@example.com
```

`--local` reads the API URL and secret key from `supabase status` and uses
`http://localhost:3000` for the invite link. For a hosted project, set
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_SITE_URL` in the shell
(never pass the key as an argument) and omit `--local`; `--site-url <origin>`
overrides the invite origin.

- If the email has no account, Supabase sends an invite. The invitee opens it,
  sets a password at `/login/password`, and lands in `/admin` as admin. Locally
  the email arrives in Mailpit.
- If the email already has a confirmed account (for example a reader), that
  account becomes admin without an email. An unconfirmed self-service account is
  refused until its address is confirmed, so nobody can pre-register an email
  they do not own and inherit admin.
- The command refuses while any active admin exists. It cannot add admins later
  and re-running it is harmless; invite further admins at `/admin/members`.

The command calls `public.bootstrap_first_admin`
(`supabase/migrations/20261024100000_admin_bootstrap.sql`), which only
`service_role` may execute. The function takes an advisory lock, re-checks that
no active admin exists, grants the membership, and writes a
`member.bootstrap_admin` audit entry with no actor. The confirmed-account
trigger still applies. There is deliberately no "first user becomes admin"
rule: with public reader sign-up enabled, whoever registered first on a fresh
deployment would own the site, and the rule would re-arm after a reset or a
restore without admins.

If the command cannot be used (for example more than 10,000 Auth users to
search), the same grant works from the SQL Editor as the table owner, for a
confirmed account only:

```sql
insert into public.editorial_members (profile_id, role)
select profiles.id, 'admin'
from public.profiles
join auth.users on auth.users.id = profiles.id
where lower(auth.users.email) = lower('you@example.com')
on conflict (profile_id) do update
set role = 'admin', deactivated_at = null;
```

This is an operator action, not seed data or a public route. Do not commit real
credentials.

Deleting an Auth user cascades to its profile and membership. The last-admin
trigger blocks role demotion and deactivation, not Auth-user deletion, so ensure
another active admin exists before deleting an account from Studio. The
`/account` deletion flow refuses active admins (see
[Reader accounts](#reader-accounts-phase-11)).

Restart the stack after changing `supabase/config.toml` so the local Auth
service picks up the change.

### Invitations and local email

An admin invites by email at `/admin/members`, choosing a role and an optional
display name. A new email receives Supabase's invite email; an existing Auth
user is granted membership without a new invite. The invitee follows the link
to `/auth/confirm`, sets a password at `/login/password`, and then sees the
role-appropriate admin overview.

Local emails are captured by Mailpit; use the `Mailpit` URL from
`supabase status` rather than expecting a real inbox. The local Auth configuration
allows 30 invitation emails per hour and requires passwords of at least 8
characters. The application also limits an admin to 20 invitation attempts per
hour. The experimental local stack cannot serve custom email templates in this
setup, so invitations use Supabase's default template; configure SMTP and an
email template before a hosted launch.

## Content schema and taxonomy

Phase 3 adds the content tables. Public pages read them since Phase 8 (see
[Publishing and public reading](#publishing-and-public-reading)).

- `categories` is hierarchical through `parent_id`. A trigger rejects
  self-parenting and longer cycles on insert and move, and a transaction-scoped
  advisory lock serializes concurrent moves. Foreign keys restrict deleting a
  category while children or posts reference it; posts are never
  cascade-deleted. The admin delete RPC moves them first (see
  [Taxonomy administration](#taxonomy-administration)).
- `posts.category_id` stays nullable at the database level. Drafts may be
  uncategorized; a CHECK constraint requires a category, and a publication
  timestamp, before `status = 'published'`.
- `tags`, `post_tags`, and `post_authors` model the many-to-many relations.
  Credits store an explicit `sort_order`; `(post_id, author_id)` and
  `(post_id, sort_order)` are unique.
- Names are trimmed and white-space collapsed, and unique case-insensitively.
  Slugs are lower-case ASCII kebab-case and globally unique. `src/lib/slug.ts`
  implements the same rules for server mutations, including Turkish
  transliteration.
- Workflow (D2a): `draft` to `published` only. `published_at` exists exactly when
  the post is published. Review and archived states remain later increments.
- Concurrency (D3, revised 2026-10-25): an integer `revision` on the working
  copy. The Phase 4 update RPC compares the submitted revision with the stored
  one and rejects a stale form instead of overwriting newer changes. Since
  Phase 26 a published post also has a separate published snapshot, so edits
  stay private until an editor republishes; see
  [Published snapshots](#published-snapshots-phase-26).
- RLS: since Phase 26 anonymous visitors and signed-in readers read only the
  published snapshot tables and credited author identities; the working copy
  (`posts`, `post_authors`, `post_tags`) is members-only. Editors read every
  post and relation. Authors read their own posts and their relations.
  Categories and tags are public metadata. Clients have no direct write grants;
  authoring writes go through the centralized RPCs.
- `authors.user_id` stays internal: clients can select only the public identity
  columns (`id`, `name`, `slug`, `bio`, timestamps). Active editorial members get
  an additional select policy over those columns so they can build author
  credits, but the account link remains unavailable. Admins change it only
  through the author administration RPCs (see
  [Author identity administration](#author-identity-administration)).

`supabase db reset` reloads `supabase/seeds/seed.sql`: three synthetic published
posts, one uncategorized draft, categories, tags, and guest author
profiles. Seeds never create Auth users or credentials, and they are separate
from production data.

## Draft authoring

Phase 4 adds the editorial metadata surface at `/admin/posts`:

- `/admin/posts` lists the posts the signed-in member may read. Authors see their
  own drafts; editors and admins see every draft and published post. Edit links
  appear only for rows the member may change; the database repeats the check.
- `/admin/posts/new` creates a draft with title, slug, excerpt, category, tags,
  and ordered author credits. An empty slug is derived from the title.
- `/admin/posts/[id]` reopens a post. Authors may edit only posts they created
  (drafts, and since Phase 26 the working copy of their published posts);
  editors and admins may edit any post. A credit grants no edit access.
- `/admin/posts/[id]/preview` is a read-only members-only preview. It uses
  `force-dynamic`, sends `noindex`, and is not linked from public routes. A draft
  remains absent from `/posts/[slug]` and public listings.
- Taxonomy and author records came from the seed in Phase 4. Their
  administration screens arrived later as separate increments
  ([taxonomy](#taxonomy-administration),
  [authors](#author-identity-administration)).

Writes use the security-definer RPCs in
`supabase/migrations/20261022170000_draft_authoring.sql`. `create_draft_post`
and `update_post_metadata` re-check active editorial membership and per-post
authorization, validate metadata and relations, detect slug conflicts, replace
tags and credits in one transaction, and increment `revision`. Only
`authenticated` may execute them; anonymous clients and direct table writes stay
denied.

The edit form submits the revision it loaded. If another save happened in the
meantime, `update_post_metadata` raises a serialization-style conflict
(`40001`), the form keeps the user's input, and the page shows a recoverable
message instead of overwriting the newer version. Credits must be unique, refer
to real author profiles, and use a contiguous `0..n-1` order. A draft may still
have zero credits until a later workflow decides otherwise.

Server Actions live in `features/posts/admin/actions.ts`; shared validation is in
`features/posts/admin/validation.ts`; RLS-scoped reads are in
`features/posts/admin/data.ts`. Unit tests cover validation and permissions, and
`src/lib/supabase/draft-authoring.rls.test.ts` covers the
anonymous/reader/author/editor/admin matrix, conflicts, and invalid relations.

## Post language

Each post is written in one language, stored in `posts.language` as a
canonical BCP 47 tag (Phase 21; Phases 14–20 allowed only `tr`, `en`, `de`).
The default is `tr`. Post languages are independent of the interface
languages: `src/lib/interface-locales.ts` holds the separate, fixed interface
set (`tr`, `en`, `de`) chosen per reader since Phase 22 (see
[Interface localization](#interface-localization-phase-22)). Every post is
shown in every interface language.

- **Accepted grammar.** A pragmatic subset of BCP 47 in canonical casing:
  language (2–3 lowercase letters), an optional script (4 letters, first
  uppercase), and an optional region (2 uppercase letters or 3 digits), at
  most 12 characters: `fr`, `fil`, `pt-BR`, `zh-Hant`, `zh-Hant-TW`,
  `es-419`. Variants, extensions, private use, grandfathered tags, and the
  special codes `und`, `mis`, `mul`, `zxx` are rejected.
- **Canonical values.** `canonicalizePostLanguage()`
  (`src/features/posts/language.ts`) trims the input, applies
  `Intl.getCanonicalLocales` (case and CLDR aliases: `pt-br` → `pt-BR`,
  `iw` → `he`, `fra` → `fr`), then checks the shape. The database checks the
  same grammar with `public.is_post_language_tag()` in the `posts_language_check`
  CHECK constraint (`23514`) and in `assert_post_language()`, which
  `create_draft_post` and `update_post_metadata` call (`22023`, "Invalid
  language"); their signatures did not change. The database does not know CLDR
  aliases, so it accepts a well-formed alias such as `iw` written directly;
  the application never sends one. `src/features/posts/language-fixtures.ts`
  is shared by the unit tests and the RLS suite, so the two grammars cannot
  drift silently.
- **Admin picker.** "Yazının dili" is a shadcn/ui combobox (`Popover` +
  `Command`, `cmdk`): a searchable list of common languages with Turkish names
  from `Intl.DisplayNames` and the code beside each name, plus free entry of
  any valid tag ("Dil kodu" group; an invalid tag shows a hint and cannot be
  chosen). The value is submitted through a hidden input and validated again
  on the server. It also sets `lang` on the title, excerpt, cover alt text,
  and editor.
- **Public output.** Public post pages, listing cards, search results, and the
  member preview set `lang` to the tag on the title, excerpt, and body only;
  `<html lang="tr">` and the interface stay Turkish. Article JSON-LD
  `inLanguage` and the Atom entry `xml:lang` use the tag; the feed element's
  `xml:lang` is the interface default. Open Graph `og:locale` is derived with
  `Intl.Locale(tag).maximize()` as `language_REGION` (`fr` → `fr_FR`,
  `zh-Hant` → `zh_TW`, `es-419` → `es_ES` by retrying without the numeric
  region) and omitted when no territory is known. The member preview badge
  shows "Fransızca (fr)".

Translations are not linked to each other, and the interface is not
localized; both are separate increments.

## Post cover image

A post may have one optional cover image. The reference and its alt text live
on the post (`posts.cover_media_id`, `posts.cover_alt`), outside the editor
document, because a description belongs to this occurrence of the file.
Migration: `20261024140000_post_cover_image.sql`.

- **Authoring.** The post form's "Kapak görseli" field chooses an image from
  the media library or uploads a new one through the Phase 6 upload action, and
  has a 16:9 preview, alt text, and a remove control. `create_draft_post` and
  `update_post_metadata` take required `p_cover_media_id` and `p_cover_alt`
  parameters (pass `null` for no cover). They lock the media row and refuse
  unknown or non-image media (`22023`); alt text without a cover, over 300
  characters, or with control characters is refused too.
- **Publishing.** Drafts may keep a cover without alt text. `publish_post`
  refuses a cover without alt text (`23514`), and a published post keeps that
  rule on later saves; the CHECK constraint `posts_published_cover_requires_alt`
  backs it up.
- **Deletion.** `posts.cover_media_id` references `public.media` with
  `on delete restrict`, and `delete_media` treats a cover like a body image
  reference (`23503`), so `/admin/media` refuses to delete a cover in use.
- **Rendering.** The post page header, listing cards, and the member preview
  render the cover with `next/image` in a fixed 16:9 box (`object-cover`), so
  no layout shift occurs and readers never need the media row, which stays
  members-only. The post page preloads it as the likely LCP image. Cards use an
  empty alt because the linked title next to it names the post.
- **SEO.** With a cover, Open Graph gets `images` (absolute media URL plus alt)
  and Twitter switches to `summary_large_image`; Article JSON-LD gets `image`.
  Without a cover the post shares the site-wide generated image (Phase 20,
  [Polish pack](#polish-pack-phase-20)); only without a cover *and* without
  `NEXT_PUBLIC_SITE_URL` does the card stay text-only.
  The image URL is on the Supabase media origin, which the CSP `img-src`
  already allows.

Tests: `features/posts/admin/validation.test.ts`, `features/seo/metadata.test.ts`,
`features/seo/json-ld.test.ts`, and `features/posts/mapping.test.ts` cover input
validation and output; `src/lib/supabase/post-cover.rls.test.ts` covers the
anonymous/reader/author/editor/admin matrix, unknown, unregistered, and
non-image media, alt rules, publishing, public reads, and deletion protection.

## Post body editor and renderer

Phase 5 stores the post body as a Tiptap/ProseMirror JSON document in
`posts.body` (JSONB) with an explicit `posts.content_version` (currently `1`).
Title, slug, excerpt, and taxonomy stay outside the document.

- **One allowlist.** `src/features/posts/content/schema.ts` defines the supported
  nodes (`paragraph`, `heading` levels 2–4, `bulletList`, `orderedList`,
  `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `image`, `youtube`,
  `hardBreak`, `text`), marks (`bold`, `italic`, `strike`, `code`, `link`),
  attribute keys, parent/child rules, a 200,000-character size limit, and a
  nesting limit. Unknown nodes, marks, or attribute keys are rejected, not
  dropped. Images are described in [Media uploads](#media-uploads) and videos
  in [YouTube embeds](#youtube-embeds).
- **Safe links.** Only `http(s)://`, `mailto:`, site-relative `/…`, and in-page
  `#…` hrefs are accepted. `javascript:`, `data:`, protocol-relative `//host`,
  backslash paths, whitespace, and control characters are rejected. The renderer
  adds `rel="noopener noreferrer nofollow"` to external links; `target` and `rel`
  are never stored.
- **Editor.** `features/posts/admin/components/post-body-editor.tsx` is a Client
  Component (`immediatelyRender: false`) configured by
  `features/posts/content/editor-extensions.ts` (StarterKit with underline
  disabled). Its toolbar follows the WAI-ARIA toolbar pattern: Tab enters and
  leaves it once; arrow keys, Home, and End move between buttons. Markdown input
  rules such as `## ` also work. The form submits the document as a hidden
  `body` field.
- **Write boundary.** The Server Action normalizes Tiptap's `getJSON()` output
  (it drops editor-only link and list defaults) and validates it strictly.
  `create_draft_post` and `update_post_metadata` take `p_body` and
  `p_content_version` and re-validate with `public.post_body_error`, a PL/pgSQL
  mirror of the allowlist (latest definition in
  `supabase/migrations/20261022200000_post_body_youtube.sql`). A `posts_body_valid` CHECK constraint applies the
  same function, so service-role scripts and seeds cannot store an invalid
  version-1 document either. Unsupported versions raise `22023`.
- **Renderer.** `features/posts/components/post-body.tsx` maps validated nodes to
  React elements and imports no Tiptap code. It re-validates every document and
  shows a controlled fallback for an invalid document or an unsupported
  `content_version`. The member preview and `/posts/[slug]` use it, and both
  editor and renderer share the `.post-body` typography in `globals.css`.
- **Unsupported versions in the editor.** The edit page refuses to open a body
  whose version or shape it cannot represent, so a save cannot silently drop
  content.

`features/posts/content/fixtures.ts` holds shared valid and invalid documents.
`schema.test.ts` runs them through the TypeScript validator,
`editor-extensions.test.ts` checks that the Tiptap schema defines exactly the
allowlisted nodes and marks and round-trips every valid fixture,
`post-body.test.tsx` checks rendered HTML and fallbacks, and
`src/lib/supabase/post-body.rls.test.ts` sends the same fixtures to the database
RPCs. A fixture accepted in one place and rejected in another means the
allowlists have drifted.

## Media uploads

Phase 6 adds image uploads. Decision D4 (answered 2026-10-22) chose one public
Storage bucket with UUID object paths and server-side validation.

- **Tradeoff.** The `media` bucket is public. Anyone who knows an object URL can
  fetch it, including images used only by drafts. Object paths are random UUIDs
  and are not listed publicly, but they are not secret once shared. Revisit
  before launch if unpublished images must stay private.
- **Storage and metadata.** `supabase/migrations/20261022190000_media.sql`
  creates the bucket (5 MiB limit, JPEG/PNG/WebP/GIF only) and `public.media`
  with bucket, object path, uploader, MIME type, size, dimensions, and
  timestamps. The object path equals the media id. Members read media rows;
  readers and anonymous visitors do not. Clients have no write grants on
  `public.media`.
- **Upload flow.** The editor's image button opens a panel that asks for a file,
  alt text (or an explicit "decorative" flag), and an optional caption.
  `features/media/actions.ts` `uploadMediaAction` checks membership, reads the
  bytes, and identifies the format from the file signature
  (`features/media/validation.ts`); the declared type and file name are ignored,
  so SVG, HTML, and renamed files are rejected. It uploads with the user's
  session so Storage policies apply, then calls `register_media`, which re-reads
  type and size from Storage metadata and requires the caller to own the object.
  If registration fails, the object is removed. The Server Action body limit is
  raised to 6 MB in `next.config.ts` for this upload.
- **Storage policies.** Inserts into the `media` bucket require an active
  editorial member, a lowercase UUID path (no folders or extensions), and fewer
  than 20 uploads by that member in the last ten minutes
  (`public.media_upload_allowed`). There is no update policy, so objects cannot
  be overwritten. Deletes are allowed only for objects without a media row, by
  their uploader or an editor/admin.
- **Image node.** `{ type: "image", attrs: { mediaId, width, height, alt,
  caption?, decorative? } }`. Alt text and caption belong to the occurrence, not
  the media row. Alt text is required (1–300 characters) unless `decorative:
  true`, which requires empty alt text. URLs are never stored; the renderer and
  editor derive them from the media id (`features/media/url.ts`). The authoring
  RPCs reject bodies that reference unknown media and take a key-share lock on
  each referenced row.
- **Delivery.** `PostBody` renders a `<figure>` with `next/image`, intrinsic
  width/height, `sizes`, and an optional `<figcaption>`. `next.config.ts` allows
  only the public media path of the configured Supabase host. The local stack is
  on a loopback address, so `images.dangerouslyAllowLocalIP` is enabled only
  when `NEXT_PUBLIC_SUPABASE_URL` is loopback.
- **Deletion.** `/admin/media` lists uploads. `delete_media` refuses media that
  any post body or post cover references (`23503`), then the Storage object is removed with
  the user's session. Authors delete only their own uploads; editors and admins
  delete any unused upload. The reference scan reads every post body; add an
  index only if the media library grows enough to need one.
- **Known limits.** Uploads that are never inserted or whose post is never saved
  stay in the library until someone deletes them. Direct service-role writes to
  `posts.body` bypass the media existence check; the CHECK constraint still
  validates their shape. If the Storage delete after `delete_media` fails, the
  page reports it and the unregistered object can be removed later.

Tests: `features/media/validation.test.ts` covers signature and dimension
parsing, size, and SVG rejection. Shared fixtures add valid and invalid image
nodes. `src/lib/supabase/media.rls.test.ts` covers the bucket configuration,
anonymous/reader/author/editor/admin uploads, path and type restrictions,
overwrite denial, the rate limit, registration ownership, media row visibility,
public delivery, unknown-media rejection, and reference-aware deletion.

## YouTube embeds

Phase 7 adds a `youtube` block node. YouTube is the only allowlisted embed
provider; arbitrary iframes and HTML are never accepted.

- **Stored shape.** `{ type: "youtube", attrs: { videoId, title, start? } }`.
  `videoId` is exactly 11 characters of `[A-Za-z0-9_-]`; `title` is required
  (1–200 code points, no control characters) and labels the iframe for screen
  readers; `start` is optional whole seconds (1–86,400). URLs are never stored.
  `supabase/migrations/20261022200000_post_body_youtube.sql` mirrors the rules
  in `public.post_body_node_error`.
- **URL parsing.** `features/posts/content/youtube.ts` `parseYouTubeUrl`
  accepts only `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, and
  `youtube.com/embed/` on `youtube.com`, `www.youtube.com`, `m.youtube.com`, and
  `youtu.be` over http(s). Other hosts (including lookalikes), other schemes
  such as `javascript:`, credentials, ports, extra path segments, duplicate `v`
  parameters, quotes, angle brackets, whitespace, and malformed ids are
  rejected. A `t`/`start` offset (`90`, `90s`, `1m30s`, `1h2m3s`) is kept; an
  unparseable or out-of-range offset is dropped.
- **Editor.** The toolbar's video button opens a panel for the URL and the
  title; an invalid URL shows an inline error. Selecting a video and pressing
  the button again edits or removes it. `PostYouTube` in
  `editor-extensions.ts` is a custom atom node, not the Tiptap YouTube
  extension: pasted `<iframe>` tags match no parse rule and are dropped. In the
  editor the iframe ignores pointer events so a click selects the node.
- **Rendering.** Editor and renderer both output
  `figure.post-video > div.post-video-frame > iframe` with a 16:9
  `aspect-video` wrapper, `src=https://www.youtube-nocookie.com/embed/<id>`
  (plus `?start=`), the stored `title`, `loading="lazy"`,
  `allow="encrypted-media; fullscreen; picture-in-picture"`,
  `referrerpolicy="strict-origin-when-cross-origin"`, and
  `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups
  allow-popups-to-escape-sandbox"`. The player refuses requests without a
  referrer (error 153), so the origin is sent; playback works under this
  sandbox.
- **CSP.** The application sets no Content-Security-Policy yet. When one is
  added (Phase 10), `frame-src` must allow `https://www.youtube-nocookie.com`.

Tests: `youtube.test.ts` runs shared valid and invalid URL fixtures through the
parser; the shared body fixtures add valid videos and invalid nodes (URLs or
`javascript:` as id, malformed ids, extra `src`/`provider`/`html` attributes,
bad titles and start values, iframe nodes) that run in TypeScript, the Tiptap
schema, the renderer, and the database.

## Publishing and public reading

Phase 8 moves public pages to the database. Decision D5 is answered
provisionally: `NEXT_PUBLIC_SITE_URL`, Turkish copy, and generic labels stay
until launch; taxonomy and author identity administration follow Phase 8.

- **Mutations.** `public.publish_post(post_id, expected_revision)` and
  `public.unpublish_post(post_id, expected_revision)` in
  `supabase/migrations/20261023100000_publishing.sql` are security-definer RPCs.
  Only active editors and admins may call them successfully (`42501` for
  authors, readers, and deactivated members; anonymous calls have no grant).
  Both lock the row and reuse the revision compare-and-swap (`40001` on a stale
  revision) and bump `revision`. Publishing requires a draft (`55000`
  otherwise), a category (`23514`), and a body that passes `assert_post_body`
  (allowlist plus existing media rows); it sets `published_at` to the
  transaction time. Unpublishing requires a published post, returns it to
  `draft`, and clears `published_at`. Server Actions `publishPostAction` and
  `unpublishPostAction` in `features/posts/admin/actions.ts` check the role
  first, call the RPCs with the user's session, and redirect with
  `?status=published|unpublished` or `?error=<key>` (copy in
  `features/posts/admin/publication.ts`).
- **Admin controls.** The admin post page shows a "Yayın durumu" card with
  Publish/Unpublish only to editors and admins (`canPublishPosts`). Since
  Phase 20 both ask for confirmation in a shadcn `AlertDialog`
  (`PublicationControl`). Publishing uses the last saved revision, not unsaved
  form edits.
- **"Güncellendi".** Publishing sets `updated_at` and `published_at` to the
  same transaction time, so `PostMeta` shows "Güncellendi" only when
  `updated_at > published_at`. Since Phase 26 these are the snapshot's times,
  so the label appears after a republish, not after a private save.
- **Slug redirects.** `public.post_slug_redirects(old_slug, post_id)` records
  the old slug when a *published* post's public slug changes (since Phase 26
  on republish, trigger `published_posts_maintain_slug_redirects`, so every
  write path is covered). Redirects
  store the post id, so `/posts/<old>` answers one `308` to the current
  `/posts/<slug>`; chains cannot form. A post may take back its own old slug
  (the redirect is removed); another post cannot claim a slug that still
  redirects (`23505`, "Bu slug zaten kullanılıyor"). RLS shows a redirect only
  while its post is visible, so an unpublished post's old URLs return 404. Slug
  changes made while a post is a draft record nothing.
- **Public queries.** `features/posts/data.ts` uses the anonymous server client
  only (no cookies), so RLS returns published rows and their credits, tags, and
  redirects; an explicit `status = 'published'` filter is defense in depth.
  `features/posts/mapping.ts` maps rows to the public read model and drops rows
  without a category or publication time. Failed queries throw rather than
  caching an empty page or a 404.
- **Caching (Next.js 16.4.2, without Cache Components).** `/` and
  `/posts/[slug]` export `revalidate = 300`; `generateStaticParams` prerenders
  published slugs at build time, and later posts render on first request
  (ISR). supabase-js reads go through `fetch`, which Next stores in the Data
  Cache for these routes, so the public client tags them `public-posts`. Every
  publish, unpublish, and post update calls `updateTag("public-posts")` (the
  next request waits for fresh rows) plus `revalidatePath("/")` and
  `revalidatePath("/posts/[slug]", "page")`. `revalidatePath` alone left the
  listing stale in production testing, which is why the tag exists. The
  300-second interval is only a fallback for out-of-band database changes.
  Drafts never reach these caches: the routes read anonymously, and
  `/admin/**` (including `/admin/posts/[id]/preview`, `force-dynamic`) renders
  per request with `private, no-store`. Local dev (`next dev`) never caches;
  verify cache behavior with `npm run build && npm run start`.
- **Canonical URL.** Post metadata sets `alternates.canonical` to
  `/posts/<slug>`, resolved against `NEXT_PUBLIC_SITE_URL`; category and tag
  never appear in the post URL. Phase 9 adds the rest of the SEO surface.

Tests: `publishing.rls.test.ts` covers anonymous, reader, author, editor, and
admin calls (denied publish/unpublish, publish without category, stale
revision, double publish/unpublish, drafts and their relations absent from
public reads, publish timestamps, redirect resolution in one hop, slug
reservation and reclaiming, no redirects for draft renames, hidden redirects
after unpublish, and closed direct writes). `mapping.test.ts`,
`publication.test.ts`, `permissions.test.ts`, and `site-url.test.ts` cover the
mapping, "Güncellendi" rule, error keys, publish permission, and site URL
parsing.

## Published snapshots (Phase 26)

Decision D3 was revised on 2026-10-25: a published post keeps a private
working copy and a separate published snapshot. Everything a reader sees waits
for an editor or admin to republish: title, slug, excerpt, body (JSONB and
`content_version`), cover image and alt text, language, category, tags, and
ordered author credits. Migration:
`supabase/migrations/20261025100000_published_snapshots.sql`.

- **Tables.** `posts`, `post_authors`, and `post_tags` are the working copy.
  `published_posts` (one row per published post, keyed by `post_id`),
  `published_post_authors`, and `published_post_tags` are the snapshot; they
  exist only while the post is published and carry the search vector, the
  listing indexes, and the publication times (`published_at` kept across
  republishes, `updated_at` set by each republish). `post_versions` stores one
  immutable row per publish and republish: version number, publisher
  (`published_by`), time, and the full snapshot as JSON. No history list or
  restore interface yet; the data is kept for a later increment.
- **RLS.** The working copy is members-only: editors and admins read every
  post, authors their own. `anon` has no select grant on the working-copy
  tables; a signed-in reader gets no rows. The snapshot tables are public
  (they hold published content only). `post_versions` is readable by editors
  and admins and cannot be changed or deleted by anyone, the secret key
  included (trigger); only the cascade of a deleted post and the `set null` of
  a deleted publisher run. An author identity is public only while credited in
  a snapshot. Comment and bookmark policies check the snapshot.
- **Mutations.** `update_post_metadata` changes only the working copy (same
  revision compare-and-swap). An author may now edit the working copy of an
  own published post; a credit still grants nothing. `publish_post` (draft →
  published) writes the snapshot and version 1 (or the next number after an
  unpublish). `republish_post(post_id, expected_revision)` copies the working
  copy over the snapshot and appends a version; editors and admins only
  (`42501` for authors), compare-and-swap on the revision (`40001`), published
  posts only (`55000`), the publish checks (category, body, cover alt), and the
  `post.publication` rate limit. The revision is compared but not bumped.
  `discard_post_changes(post_id, expected_revision)` resets the working copy to
  the snapshot for whoever may edit the post and bumps the revision.
  `unpublish_post` deletes the snapshot; versions stay. The change flag is the
  computed field `has_unpublished_changes` on `posts` (working and published
  content documents compared as JSON).
- **Slugs.** A working-copy slug change is private. On republish the
  snapshot's slug changes and the old public slug starts redirecting. A
  working copy cannot take a slug that is another post's published slug or
  redirect (`23505`), so a republish cannot collide.
- **Public reads.** Pages, archives, feeds, the sitemap, search
  (`search_published_posts` reads `published_posts`), JSON-LD/Open Graph,
  bylines, the saved list, and comment invalidation read the snapshot only.
  `publicPostSummaryColumns` aliases `post_id` as `id` and the snapshot
  relations as `post_authors`/`post_tags`, so the mapping is unchanged.
  Bookmarks and slug redirects reach the snapshot through the PostgREST
  computed relationship `published_post`.
- **Admin.** The post list and page show an "unpublished changes" badge. The
  publication card offers "Değişiklikleri yayımla" (republish, editors and
  admins) and "Değişiklikleri at" (discard, anyone who may edit the post),
  each behind the existing `AlertDialog` confirmation, next to Unpublish. An
  author editing an own live post sees that changes wait for an editor. The
  member preview shows the working copy; "Genel sayfayı aç" links the
  published slug.
- **Caching.** `features/posts/cache.ts`: a save (`working-copy-saved`) never
  expires public caches; publish, republish (`post-republished`), discard
  (`post-changes-discarded`), and unpublish expire `public-posts` and every
  public route pattern.
- **Taxonomy, authors, media.** Deleting a category moves both copies;
  deleting a tag detaches it from both; an author credited in either copy
  cannot be deleted; media used by either copy cannot be deleted. Versions do
  not block media deletion (history; restoring has to cope with removed media).
- **Upgrade path.** The migration backfills a snapshot and version 1
  (publisher unknown, `null`) for every post published at upgrade time, with
  its current content and times, through `sync_published_post(post_id)`
  (service-role only). The seed calls the same function after inserting its
  published samples. Verified on a stack at Phase 25 with the seed plus a
  published post renamed before the upgrade: content, credits, tags, times,
  and the redirect were identical afterwards.

Tests: `published-snapshots.rls.test.ts` covers anonymous, reader, author,
other author, editor, and admin access (working copy closed to anonymous
callers and readers, saved edits absent from pages, archives, author lookup,
and search, own-author edits of a live post, denied republish and unpublish,
stale republish, republish of a draft, slug reservation, version 2 with the
redirect, immutable editor-only versions, closed snapshot writes, discard with
revision checks, unpublish keeping versions, and the backfill function). The
existing suites read public content from the snapshot.

## SEO, sharing, and archives

Phase 9 makes published content discoverable and shareable. Nothing in it
needs a migration: archives reuse the Phase 3 RLS policies and indexes.

- **Post metadata.** `features/seo/metadata.ts` builds title, description,
  canonical `/posts/<slug>`, Open Graph (`article` with published/modified
  time, authors in credit order, section, tags, the post language's locale,
  site name, and the cover image or the site-wide default image), and a
  Twitter card (`summary_large_image` whenever an image is declared, otherwise
  `summary`; see [Post cover image](#post-cover-image) and
  [Polish pack](#polish-pack-phase-20)). Paths stay
  relative; the root layout's `metadataBase` makes them absolute.
- **Article JSON-LD.** `features/seo/json-ld.ts` renders a schema.org
  `BlogPosting` with `headline`, `description`, `datePublished`,
  `dateModified`, ordered `author` persons linking to their archives,
  `articleSection`, `keywords`, `publisher`, and `mainEntityOfPage`. The
  serializer escapes `<`, `>`, `&`, U+2028, and U+2029, so content cannot close
  the `<script>` element; URLs are omitted without a site origin.
- **Archives.** `/categories/[slug]` lists the category and every descendant
  (`features/taxonomy/hierarchy.ts` walks the tree from the public category
  table), with a parent trail and links to children that have posts.
  `/tags/[slug]` and `/authors/[slug]` filter through a second, aliased
  `!inner` embed so each card still shows all of its tags and credits. RLS
  shows an author only while they are credited on a published post. Unknown
  slugs and archives without a published post return 404 with `noindex`. All
  archive cards link to the canonical post URL.
- **Sitemap and robots.** `app/sitemap.ts` lists `/`, the current slug of every
  published post, and non-empty archives, with `lastModified` from
  `updated_at`. Inputs come from the anonymous client, so drafts, previews, and
  redirected old slugs never appear. `app/robots.ts` allows `/`, disallows
  `/admin`, `/login`, and `/auth`, and links the sitemap.
- **Indexing.** Public pages send `index, follow` once `NEXT_PUBLIC_SITE_URL` is
  set. Admin (including previews), sign-in, invitation, and every 404 (unknown
  or unpublished posts and empty archives) send `noindex`.
- **Sharing.** `features/sharing/` renders a copy-link button (shadcn/ui
  `Button`, `role="status"` announcement, a pre-selected read-only field when
  the Clipboard API is denied) and plain provider links for X, Facebook,
  LinkedIn, WhatsApp, and e-mail. Both use the server-provided canonical URL,
  never `window.location`, so query strings are not shared; external links use
  `noopener noreferrer`. No social SDKs or APIs are loaded.
- **Caching.** Archives and the sitemap export `revalidate = 300`, prerender
  non-empty archives through `generateStaticParams`, and read through the same
  `public-posts` tagged client. Every publish, unpublish, and post update
  (including slug changes and edits of published posts) calls
  `updateTag("public-posts")` and revalidates `/`, `/posts/[slug]`,
  `/categories/[slug]`, `/tags/[slug]`, `/authors/[slug]`, their later pages
  (see [Public listing pagination](#public-listing-pagination)),
  `/sitemap.xml`, `/feed.xml`, and the archive feeds. Taxonomy and author administration apply the same invalidation; only
  out-of-band database changes wait for the 5-minute fallback. Phase 10 moved this list into
  `features/posts/cache.ts` (see [Launch readiness](#launch-readiness-phase-10)).

Tests: `archives.rls.test.ts` runs the real query builders
(`features/posts/queries.ts`) as anonymous, reader, and editor clients:
category archives include descendants and exclude drafts and unpublished
posts, tag and author archives exclude drafts, draft-only authors stay hidden,
`authors.user_id` stays unreadable, and sitemap input lists only current slugs
of published posts and non-empty archives. Unit tests cover metadata, JSON-LD
(including hostile titles), sitemap and robots output, share links, archive
derivation, and the category hierarchy helpers.

## Syndication feed

`/feed.xml` is an Atom 1.0 (RFC 4287) feed of the 20 newest published posts
(`feedPostLimit`), built by `features/seo/feed.ts` and served by the Route
Handler `app/feed.xml/route.ts` as `application/atom+xml`.

- **Input.** `listLatestPublishedPosts` reads through the anonymous,
  `public-posts` tagged client with `selectLatestPublishedPosts` (published
  only, `published_at desc, id desc`), so drafts, previews, and member-only
  data never reach the builder.
- **Entries.** `id` is `urn:uuid:<post id>`, so a slug change does not make
  readers show the post again; `link` is the canonical `/posts/<slug>`;
  `published`/`updated` come from `published_at`/`updated_at`; authors appear
  in credit order with their archive URL; the category and each tag are
  `category` elements whose `scheme` is the archive base URL; the excerpt is a
  `type="text"` summary; `xml:lang` comes from `posts.language` (the feed
  itself is `tr`). A cover adds Media RSS `media:thumbnail` and `media:content`
  with the alt text as `media:description`.
- **No full content.** The body renderer outputs React with optimized image
  URLs and video iframes; a text summary keeps every value plain, escaped text
  and readers follow the link for the article.
- **Escaping and URLs.** Every text and attribute value goes through
  `escapeXml` (`&`, `<`, `>`, quotes; `]]>` cannot survive) after characters
  XML 1.0 cannot represent are removed. Site URLs are absolute from
  `NEXT_PUBLIC_SITE_URL`; the cover URL is kept only when it is absolute
  HTTP(S). Without a site URL the route answers 404, matching the empty
  sitemap and `robots.txt` (JSON-LD omits its URLs instead).
- **Discovery.** The root layout and every page that sets a canonical URL
  (`canonicalAlternates` in `features/seo/metadata.ts`) emit
  `<link rel="alternate" type="application/atom+xml" href="/feed.xml">`;
  page alternates replace the layout's because metadata merges shallowly.
  The footer shows an "Atom akışı" link. `robots.txt` and the CSP do not
  affect it.
- **Caching.** `revalidate = 300` makes it an ISR route like the sitemap;
  `/feed.xml` is in the invalidation map (`features/posts/cache.ts`), so
  publish, unpublish, edits of published posts (including slug changes),
  and taxonomy or author administration regenerate it on the next request.

Tests: `features/seo/feed.test.ts` parses the output with a strict XML parser
(`@xmldom/xmldom`, dev only) and covers hostile titles and names (`<`, `&`,
quotes, `]]>`, CDATA and closing-tag injection), invalid XML characters,
order, stable ids across a slug change, `xml:lang`, RFC 3339 times, credit
order, categories and tags, absolute-only URLs, the cover, and the empty feed.
`archives.rls.test.ts` builds the feed from anonymous, reader, and editor
reads and checks that drafts and unpublished posts never appear (drafts would
sort first for an editor without the status filter). The smoke test checks
the discovery link, status, content type, and public cacheability.

### Archive feeds (Phase 23)

Each category, tag, and author archive has its own Atom feed next to its
first page: `/categories/<slug>/feed.xml` (posts of the category and all of
its descendants, like the archive page), `/tags/<slug>/feed.xml`, and
`/authors/<slug>/feed.xml`. The Route Handlers live in
`app/{categories,tags,authors}/[slug]/feed.xml/route.ts`, outside the
`[locale]` segment like `/feed.xml` (the proxy skips paths with an
extension), and share `features/seo/archive-feed.ts`.

- **Input.** `findArchiveFeed` (`features/posts/data.ts`) resolves the
  subject with the archive's own lookup and reads the same archive query with
  `feedPostLimit` (20) instead of a page range: published posts only, newest
  first, anonymous `public-posts` tagged client.
- **Status.** An unknown slug, or an archive without a published post,
  answers 404; an old category, tag, or author slug redirects (308) to the
  current feed; no site URL answers 404 like the site feed.
- **Output.** `buildAtomFeed` with a channel: the feed `id` and self link are
  the feed URL, the HTML alternate is the archive page, entries are identical
  to the site feed's. The title is the archive title in the default interface
  language plus the site name ("Yazılım kategorisi | Yazılar"; author feeds
  use the author's name), matching the feed's `xml:lang="tr"`.
- **Discovery.** Every page of an archive lists its own feed first and the
  site feed second in `alternates.types` (`buildArchiveMetadata` with
  `feed`), and the archive header links "Bu arşivin Atom akışı" when a site
  URL is set. Feeds are not in the sitemap.
- **Caching.** `revalidate = 300` with `generateStaticParams` over non-empty
  archives (unknown slugs render on demand). The invalidation map lists
  `/categories/[slug]/feed.xml`, `/tags/[slug]/feed.xml`, and
  `/authors/[slug]/feed.xml` with type `layout`: Next.js tags a Route
  Handler's entry with `<route>/route` and per-segment `layout` tags, never
  `<route>/page`, so a `page` invalidation would miss it.

Tests: `feed.test.ts` covers the archive channel (id, self and HTML links,
title escaping, entries identical to the site feed) and discovery order;
`metadata.test.ts` the archive discovery links on later pages and without a
site URL; `cache.test.ts` the feed patterns; `archives.rls.test.ts` runs the
limited archive queries as anonymous and editor clients (published only,
newest first, limit honored).

## Public listing pagination

The home listing and the category, tag, and author archives show
`postsPerPage` (9) posts per page; the first card spans both grid columns, so
an odd size fills the grid. No migration was needed.

- **URLs.** Page 1 stays at the listing's own URL (`/`, `/tags/<slug>`, ...);
  later pages live at `<listing>/page/<n>` (`/page/2`,
  `/categories/<slug>/page/3`). `/page/1` URLs answer a permanent redirect to
  the listing from `next.config.ts` `redirects()` before anything renders (a
  redirect thrown while rendering an ISR page sent its `Location` header twice
  on the first, uncached response). Invalid numbers (`0`, `02`, `abc`, more
  than six digits) and pages past the end return 404 with `noindex`; an empty
  home listing still renders page 1 with its empty state. Old archive slugs
  redirect to the same page of the current slug.
- **Why paths, not `?page=`.** In Next.js 16 `searchParams` is a request-time
  API that opts a page into dynamic rendering, so every listing request would
  render on the server and skip ISR. Path segments keep each page an ISR route:
  `generateStaticParams` prerenders pages 2..n of every listing (archive post
  counts come from `derivePublicArchives`), and other page numbers render on
  first request and are cached like the rest.
- **Order and reads.** `features/posts/queries.ts` orders by `published_at`
  descending with `id` descending as a tiebreaker, so posts published in the
  same instant keep one order and never repeat or vanish between pages, and
  counts matching rows (`count: "exact"`). `features/posts/data.ts` reads one
  page with `range()`; PostgREST's `PGRST103` (range past the end) maps to 404,
  not an error. The category archive reads only `category_id` of the subtree's
  published posts to decide which child categories to link on every page. The
  sitemap and archive discovery (`generateStaticParams`) still read the summary
  of every published post; the sitemap lists posts and archives, never page
  URLs.
- **Metadata.** Each page is its own canonical URL; later pages add
  "— Sayfa n" to the title. Pointing later pages at page 1 would hide the
  posts listed only there. No `rel="prev"`/`rel="next"`: the Metadata API has
  no field for it and major search engines ignore it.
- **Controls.** `features/posts/components/post-pagination.tsx` uses the
  shadcn/ui `pagination` component (rendered with `next/link`, Turkish labels,
  `aria-current="page"` on the current page, an ellipsis for long gaps). The
  first page has no "Önceki" and the last no "Sonraki" link rather than a
  disabled one. Plain links keep the pages shared ISR output and usable
  without JavaScript.
- **Caching.** `revalidatePath("/tags/[slug]", "page")` does not cover the
  nested `/tags/[slug]/page/[page]`, so the invalidation map in
  `features/posts/cache.ts` lists `/page/[page]` and each
  `<archive>/page/[page]` pattern too. Every publish, unpublish, and published
  post update regenerates all pages of all listings: one post shifts every later
  page, and a cached 404 past the end may become a page (or the reverse).

Tests: `pagination.test.ts` covers page parsing, bounds, paths, the prerender
params, the pagination items, and the page-1 redirects; `metadata.test.ts`
covers per-page canonical URLs and titles; `cache.test.ts` the later-page
invalidation. `archives.rls.test.ts` pages a tag and a category archive as
anonymous and reader clients (stable order for posts with equal
`published_at`, drafts not counted even for an editor, a short last page,
`PGRST103` past the end, an empty draft-only tag). The smoke test checks the
home canonical URL, the `/page/1` redirect, `/page/2` when it exists, and 404
with `noindex` for `/page/0`, `/page/02`, `/page/not-a-number`, `/page/99999`,
and a missing tag's page 2.

## Full-text search (Phase 19)

`/search?q=...` searches published posts with Postgres full-text search.
Migration `20261024180000_post_search.sql`; code in `src/features/search/` and
`src/app/search/`.

- **Search document.** `posts.search_vector` is a stored generated column
  (`post_search_document()`): the title (weight A), the excerpt (B), and the
  text of every Tiptap text node (C, `post_body_search_text()`; link targets,
  image alt text and captions, and YouTube titles are attributes and are not
  searched). Each part is indexed twice: with the post language's stemming
  configuration (from `posts.language`, see Languages below) and with
  `search_folded`, a `simple` copy behind the `unaccent` dictionary (no
  stemming, no stop words). A language without a stemmer is indexed once,
  with `search_folded` only. Typographic apostrophes (U+2019) are indexed and
  parsed as ASCII ones, so "élégance" finds "l’élégance" (Phase 21). Folding makes "kucuk" find "küçük", "isik"
  find "IŞIK", and "Strasse" find "Straße"; it also fixes Turkish dotted and
  dotless i, which the database locale lowercases to `i` in both cases.
  Stemming makes "kitap" find "kitapları", "runs" find "running", and "Haus"
  find "Häuser".
- **Languages (Phase 21).** `post_search_config()` maps a tag's primary
  subtag through `post_search_config_map()` to a built-in Snowball
  configuration of PostgreSQL 17 (`select cfgname from pg_ts_config where
  cfgnamespace = 'pg_catalog'::regnamespace`): `ar` arabic, `hy` armenian,
  `eu` basque, `ca` catalan, `da` danish, `nl` dutch, `en` english, `fi`
  finnish, `fr` french, `de` german, `el` greek, `hi` hindi, `hu` hungarian,
  `id` indonesian, `ga` irish, `it` italian, `lt` lithuanian, `ne` nepali,
  `no`/`nb`/`nn` norwegian, `pt` portuguese, `ro` romanian, `ru` russian, `sr`
  serbian, `es` spanish, `sv` swedish, `ta` tamil, `tr` turkish, `yi` yiddish
  (`simple` is not listed). Script and region do not change stemming
  (`pt-BR` → portuguese). Any other language (`ja`, `zh-Hant`, `ko`, `uk`,
  `pl`, …) uses `search_folded` alone: accent-folded words, no stemming and no
  word segmentation, so Chinese and Japanese text without spaces is indexed as
  one word per run. The migration regenerated every stored vector with `ALTER
  COLUMN … SET EXPRESSION` (PostgreSQL 17 table rewrite, no row triggers).
- **Index.** A partial GIN index on `search_vector` where `status =
  'published'`. Since Phase 21 every query is matched with one row-independent
  prefilter, `search_vector @@ v_any` (the folded query ORed with the query of
  every mapped configuration), which the index serves; each row is then
  checked against its own configuration's query. With 20,000 synthetic
  published posts (fr, en, tr, ja) and the plpgsql-style generic plan
  (`plan_cache_mode = force_generic_plan`), `EXPLAIN ANALYZE` showed a
  `Bitmap Index Scan on posts_search_vector_idx` (`Index Cond: search_vector
  @@ $2`) under a hash join with the 29 configurations, for `maison` and for
  `日本` with the `ja` filter. Phase 19 measurement: with 5,000 synthetic posts, a selective query used a
  `BitmapOr` of three bitmap index scans on `posts_search_vector_idx`
  (0.08 ms); a term in a third of the rows used a sequential scan, as it
  should. GIN cost estimates come from statistics that `VACUUM` refreshes, so
  a freshly created index on a tiny table can look expensive until then.
- **Function.** `search_published_posts(p_query, p_language, p_limit,
  p_offset)` is `SECURITY DEFINER` with `status = 'published'` as its
  visibility rule. Since Phase 20 only `service_role` may execute it
  (`20261024200000_search_server_only.sql`); see Rate limit below. Under RLS the planner
  cannot use the GIN index (the `@@` operator is not leakproof, so it may not
  run before the `posts_select_visible` policy), and every published row would
  be scanned and checked with `can_view_post()`. The explicit filter is also
  stricter than RLS for members: an author never finds their own drafts and an
  editor never finds any draft. Ranking (`ts_rank`, length-normalized), the
  total (`count(*) over ()`), and highlighting run only over rows that passed
  the filter, so no draft text reaches a rank, a count, or a snippet. A post
  matches through its own language's query only (stemmed query OR folded
  query), so a German stem cannot match a Turkish post. Order: rank,
  then `published_at` and `id` descending.
- **Input.** User text goes to `websearch_to_tsquery`, which never raises a
  syntax error: quoted phrases, `or`, and `-exclusion` work, and anything else
  is words. The application trims it, collapses whitespace and control
  characters, and requires 2–200 characters; the function refuses more than
  200 characters, a language that is not a valid tag, a page size outside 1–50, and an
  offset outside 0–1000 (`22023`). Results come 10 per page (`?page=`, at most
  page 101); punctuation-only input returns nothing. An excluded term
  (`-word`) is excluded per branch, so a word excluded in its stemmed form can
  still match through its exact folded form, and stop words of the post
  language still match through the folded branch.
- **Highlights without HTML.** `ts_headline` does not escape markup, so the
  function uses U+0002/U+0003 as start and stop markers and strips those
  characters from the source text first. Titles are highlighted in full, the
  snippet as up to two fragments of the excerpt and body; the two
  configurations' passes are nested, so inflected and accent-folded matches
  are both marked. `parseHighlight()` turns the result into text segments that
  render as React text inside `<mark>`; there is no `dangerouslySetInnerHTML`.
  A title highlight that does not spell the published title exactly falls back
  to the plain title.
  When a post matches only through a mix of stemmed and folded lexemes (the
  Turkish stemmer turns "ekran" into `ekra` but "ekranlarda" into `ekran`),
  neither pass can mark it and the snippet shows the opening words unmarked.
- **Reads.** The server calls the function with the secret key (the only
  caller allowed to execute it), then reads the result cards
  (`publicPostSummaryColumns`) through the anonymous client, so RLS filters
  what is displayed as well. Both reads use `cache: "no-store"`. The key does
  not widen the result: the function's own published filter decides it.
- **Rate limit.** Before each real query (not the empty, too-short, too-long,
  or invalid-page states) the server records one `search.query` event in
  `consume_auth_rate_limit` with the secret key: 30 per IP per minute, keyed by
  the SHA-256 digest of the first `X-Forwarded-For` entry (or `X-Real-IP`).
  Requests without either share one bucket. It fails closed ("Arama şu anda
  kullanılamıyor") without `SUPABASE_SECRET_KEY`. The same caveat as the Auth
  limits applies: behind a proxy that does not overwrite `X-Forwarded-For`,
  a client can send a new address on every request and is effectively
  unlimited, so confirm the header handling with the host (D5). Clients cannot
  bypass the limit through the Data API: `anon` and `authenticated` lost
  `execute` on the function in Phase 20 (`42501`, HTTP 401/403). Plain table
  reads of published posts stay public as before; they use the B-tree indexes,
  not the full-text ranking that made direct search calls the expensive path.
- **Route and caching.** `/search` is dynamic (`searchParams`, request
  headers): `Cache-Control: private, no-store`, never prerendered or
  ISR-cached, `noindex, nofollow`, and not in the sitemap. The header form is
  a static `next/form` GET form, so every public page stays prerendered, and
  is hidden on `/search`, which has its own form. The language filter has no
  control for now; any valid tag still works as `?language=`, an invalid one
  means all languages.
  Nothing in the invalidation map (`features/posts/cache.ts`) changed: the
  generated column updates in the same statement as every post write, and
  search reads are never cached, so the next search after a publish, edit, or
  unpublish already sees it.

Tests: `query.test.ts` and `results.test.ts` cover query normalization, code
point length, page and language parsing, URLs, highlight parsing (markup as
text, nested and stray markers), rank order, missing cards, and the title
fallback. `search.rls.test.ts` (39 tests, local stack) covers the
anonymous/reader/author/editor/admin matrix (since Phase 20 every client role
is refused with `42501`; through the server caller a draft is never found, not
even when its author can read it directly; totals and snippets never include
draft text; an unpublished post drops out), Turkish, English, German, and
French stemming and folding, the Japanese fallback (indexed once), an author's
French draft that stays hidden, title-over-body ranking, the language filter,
highlighting, injection-like input (SQL fragments, markup, tsquery operators,
unbalanced quotes, marker characters), the input and paging limits, stable
paging with a constant total, and the rate limit (client calls refused, 31st
search per IP refused with `PT429`, separate budgets per IP, no email subject).
The smoke test checks the header form, `/search` states (empty, too short, no
result), `noindex` and `private` caching, that the newest post is found from
its slug's first word, that every linked result answers 200, that the seed
draft is not found, and that the sitemap does not list `/search`.

## Polish pack (Phase 20)

Small follow-ups shipped together. One migration
(`20261024200000_search_server_only.sql`); no new dependency (the shadcn
`alert-dialog` component uses the existing `radix-ui` package).

- **Publish/unpublish confirmation.** `PublicationControl`
  (`features/posts/admin/components/publication-control.tsx`) wraps the
  existing form in a shadcn `AlertDialog` with Turkish copy from
  `publicationConfirmation()`. The form still carries the rendered revision,
  so `publish_post`/`unpublish_post` refuse a change made after the page loaded
  (`?error=conflict`). The dialog is portaled outside the form, so the confirm
  button submits it with `requestSubmit()`. Radix traps focus, starts on
  "Vazgeç", closes on Escape, and returns focus to the trigger.
- **Moderation feedback and paging.** After hiding, restoring, or deleting a
  comment, `ModerationActions` replaces the URL with `?status=<new status>`,
  shown through `QueryStatus` like the other admin pages; the next action
  drops the old status first. The queue reads 20 rows per page with an exact
  count (`selectModerationQueue`, ordered by `created_at` then `id`, so pages
  never overlap) and `?page=` links like `/search` (the route is dynamic, so a
  query parameter costs no caching). A page past the end (for example after
  deleting the last row of the last page) redirects to the new last page and
  keeps the status; PostgREST answers such an offset with 416 and no count, so
  the data boundary reads page 1 for the total.
- **Back/Forward guard.** Next.js 16 has no API to block history navigation:
  `<Link onNavigate>` covers only link clicks, and the App Router restores
  pages from its own `popstate` listener. `useUnsavedChangesWarning` therefore
  also listens to the Navigation API's `navigate` event and cancels a
  same-document `traverse` after a declined `confirm()`; a cancelled traversal
  never changes the entry, so `popstate` does not fire and the form stays.
  Limits: browsers without the Navigation API (older Firefox and Safari) keep
  only the link and `beforeunload` guards; a traversal is cancelable only once
  per user activation, so a second Back press without interacting in between
  leaves; cross-document traversals fall back to the browser's `beforeunload`
  prompt.
- **Admin return path.** `/admin/*` redirects signed-out visitors to
  `/login?next=<path and query>` (Proxy, plus the page-level fallbacks of
  `/admin/comments` and `/admin/members`). `safeReturnPath` accepts admin
  paths now; `returnPathForMember` drops them for anyone without an active
  membership, who lands on `/account` instead of the access-denied view.
  External, protocol-relative, backslash, and control-character values are
  still refused, so there is no open redirect.
- **Avatars.** Listing cards (home and archives) pass `withAvatars` to
  `PostMeta`; search results and the saved list keep a text byline. The admin
  author list shows each author's avatar. Article JSON-LD adds `image` (the
  absolute Storage URL) to each `Person` with an avatar.
- **Default social image.** `src/app/opengraph-image.tsx` renders a
  1200×630 PNG with `next/og` (site name and host, bundled Geist font, fixed
  colors) once at build time: it reads no data and no request-time API, so it
  is a static route. The home page gets it through the file convention.
  Pages that set their own `openGraph` object replace the inherited one, so
  `buildPostMetadata` (posts without a cover) and `buildArchiveMetadata`
  (category, tag, and author archives) declare it explicitly through
  `defaultSocialImage()`. Twitter uses `summary_large_image` wherever an image
  is declared. Without `NEXT_PUBLIC_SITE_URL` no default image is declared (no
  absolute URL), and those cards stay `summary`. A site name change needs a
  rebuild.
- **Search RPC lockdown.** See [Full-text search](#full-text-search-phase-19):
  the function is executable by `service_role` only, and the server calls it
  after the per-IP limit. An in-database limit was rejected because PostgREST
  only offers the same spoofable `X-Forwarded-For`, and a global limit would
  let one client starve every reader.

Tests: unit tests for the dialog copy, moderation URLs, page parsing and
status messages, `historyNavigationLeavesPage`, admin return paths
(`returnPathForMember`, normalized `/admin` paths), the default image and
large card for posts and archives, and the author `image` in JSON-LD. RLS:
search execution refused for every client role and the server caller's
visibility rule (`search.rls.test.ts`); moderation queue pages without
overlap, a stable exact count, the past-the-end answer, the reported filter,
and an empty queue for non-moderators (`comments.rls.test.ts`). The smoke test
checks `/admin` and `/admin/comments?filter=hidden` redirect with `?next=`, an
external `next` is ignored, `/opengraph-image` is a PNG, the home page and
the first post declare an absolute `og:image` with `summary_large_image`, and
(with `SMOKE_SUPABASE_URL` and `SMOKE_SUPABASE_PUBLISHABLE_KEY`) that a direct
`rpc/search_published_posts` call with the publishable key is refused.

## Interface localization (Phase 22)

The interface (navigation, pages, forms, validation and Server Action
messages, dialogs, empty/error/loading states, metadata titles and
descriptions, admin) is available in Turkish, English, and German, with
Turkish as the default. Post content is not translated, and every post is
listed in every interface language. New dependency: `next-intl` 4.14.9
(declares Next.js 16 support; its plugin only aliases the request
configuration here, message extraction is not used). The shadcn
`dropdown-menu` component was added for the switcher.

- **Locale in a cookie, never in the URL.** `src/proxy.ts` runs on every page
  request (not on `_next`, files with an extension such as `feed.xml`,
  `sitemap.xml`, and `robots.txt`, the `/auth/callback` and `/auth/recovery`
  Route Handlers, or `/opengraph-image`). It resolves the locale from the
  `locale` cookie, then `Accept-Language` (quality-ordered, primary subtag),
  then `tr`, and rewrites the request to the internal segment:
  `/posts/a` renders `src/app/[locale]/posts/[slug]` with `locale=en`. An
  invalid cookie value falls back silently. Internal paths are not public: a
  request for `/en/posts/a` is rewritten to `/<locale>/en/posts/a`, which the
  `[locale]/[...rest]` catch-all answers with the localized 404. Supabase
  session refresh still runs only for `/admin`, `/account`, `/login`, and
  `/signup`.
- **Static per locale.** The root layout lives in `src/app/[locale]/layout.tsx`
  and returns every locale from `generateStaticParams`, so each public ISR
  page is prerendered three times. Pages read the locale through the
  `next/root-params` getter (Next.js 16.3+), not `cookies()`, so they stay
  static. `src/i18n/request.ts` gives next-intl that root parameter; Server
  Actions and Route Handlers cannot read root parameters, so they read the
  `x-interface-locale` request header that the proxy always overwrites.
  Validation errors from a Server Action therefore come back in the reader's
  language.
- **URLs stay locale-free.** Links, redirects, canonical URLs, Open Graph
  URLs, the sitemap, the feed, slug redirects, and `?next=` paths are written
  without a locale. `<html lang>` follows the interface locale; post content
  keeps its own `lang`, `og:locale`, and JSON-LD `inLanguage`. Listings and
  archives declare the interface locale's `og:locale` (`tr_TR`, `en_US`,
  `de_DE`).
- **Cache invalidation covers every locale.** `revalidatePath` must name the
  internal route. `publicCacheInvalidation` (`src/features/posts/cache.ts`)
  returns `[locale]` route patterns (`/[locale]/posts/[slug]`, `"page"`; the
  home listing is `/[locale]`, `"page"`), so one call regenerates the tr, en,
  and de copies; `sitemap.xml` and `feed.xml` stay literal, and the archive
  feed patterns (`/tags/[slug]/feed.xml`) are revalidated as `layout`. Concrete paths
  (one post's comments, admin pages) go through `revalidateLocalizedPath`
  (`src/lib/revalidate.ts`), which revalidates each locale's path or, with a
  type, the `[locale]` pattern.
- **Messages.** One JSON catalog per locale and namespace in
  `src/messages/<locale>/` (`common`, `posts`, `archives`, `search`,
  `sharing`, `comments`, `bookmarks`, `auth`, `account`, `avatars`, and the
  `admin*` namespaces), registered in `src/i18n/catalogs.ts`. Turkish is the
  source: `src/i18n/app-config.d.ts` types every key and ICU argument against
  it, and the other locales must have the same shape. Counts use ICU plurals.
  Pure modules (validation, password policy, comment model) return message
  keys; the action or component translates them. Client Components get every
  non-admin namespace from the root layout; the admin layout adds the admin
  namespaces for its subtree only, so public pages do not ship admin copy.
- **Formatting.** Dates use named formats (`src/i18n/formats.ts`) in the
  interface language and the publication time zone (Europe/Istanbul), so a
  prerendered date never differs from the client. Post language names
  (`Intl.DisplayNames`) and file sizes follow the interface locale.
- **Switcher.** `LanguageSwitcher` (shadcn `DropdownMenu` with radio items;
  endonyms with their own `lang`) sits in the public header and the admin
  sidebar. Choosing a language writes `locale=<tr|en|de>; Path=/;
  Max-Age=31536000; SameSite=Lax` (plus `Secure` on HTTPS) and calls
  `router.refresh()`; the URL does not change and the choice survives reloads.
  The cookie is strictly functional (it only selects the interface language,
  holds no identifier, and is not used for analytics), so it falls under the
  ePrivacy "strictly necessary" exemption and needs no consent banner. The
  switcher needs JavaScript; without it, the `Accept-Language` negotiation
  still applies.
- **Shared caches: no `Vary` header.** The same URL renders differently per
  locale cookie and `Accept-Language`, yet public pages keep
  `Cache-Control: s-maxage=300, stale-while-revalidate`. Next.js 16 sets
  `Vary` itself on every App Router page response (`res.setHeader("Vary",
  …)` with its RSC headers in `app-page-runtime`), overwriting a value from
  the proxy or `next.config.ts` `headers()`; both were tried. `next start`
  alone is correct (it rewrites before its ISR cache), but a CDN or reverse
  proxy that caches HTML by URL would serve the first locale it saw to
  everyone. Before putting one in front, key its cache on the `locale` cookie
  and `Accept-Language` (or add `Vary: Cookie, Accept-Language` at the edge,
  accepting that `Vary: Cookie` also splits by session cookies), or do not
  cache HTML at the edge. See the hosting checklist.
- **Left as is.** The provisional site name (`NEXT_PUBLIC_SITE_NAME`,
  default "Yazılar") is a brand, not copy. Supabase Auth email templates
  (invitation, confirmation, recovery) are configured in Supabase, not in this
  repository, and stay in their current language for now. The Atom feed,
  sitemap, and the site-wide social image are locale-free and use the default
  locale where they need any text. `global-error.tsx` (rendered without the
  root layout) inlines its five strings per locale and picks the locale from
  the cookie and browser languages.

Tests: `src/i18n/catalogs.test.ts` checks that every locale has exactly the
Turkish keys, no empty message, the same ICU arguments and tags, and that every
message formats without an ICU error. `src/lib/interface-locales.test.ts`
covers cookie and `Accept-Language` resolution (qualities, regional ranges,
`q=0`, wildcards, malformed and invalid values); `localized-paths.test.ts`
and `cache.test.ts` cover the per-locale invalidation targets. The smoke test
requests `/` and the newest post with `Cookie: locale=en`, `locale=de`, an
invalid cookie, and `Accept-Language: de-AT`, and checks `<html lang>`, a
translated string, the unchanged canonical URL, public cacheability, an ISR
cache hit per locale, and that internal `/en/...` paths are 404s while
the anonymous default stays Turkish.

## Toast notifications (Phase 24)

Short confirmations after a user action appear as toasts from shadcn/ui's
Sonner component (`src/components/ui/sonner.tsx`, `sonner` 2.0.8, added with
`npx shadcn@4.22.1 add sonner`).

- **One Toaster.** The root layout `src/app/[locale]/layout.tsx` mounts the
  only `<Toaster />`; the admin layout is nested inside it, and a second
  Toaster would render every toast twice. The Toaster is a client island
  without request data, so public pages stay SSG/ISR.
- **System theme only.** The shadcn template reads the theme from
  `next-themes`; this project has no theme selector, so the component passes
  `theme="system"` and `next-themes` is not installed. Sonner follows
  `prefers-color-scheme`, including changes while the page is open, and the
  toast colors come from the `--popover`, `--popover-foreground`, and
  `--border` tokens.
- **Policy.** A toast confirms a transient success. Errors stay inline: a
  `FormAlert` (`role="alert"`) tied to its form or field, or the small
  status line next to a bookmark or comment action. Persistent outcomes that
  replace a form (sign-up and password-reset "check your email") stay inline
  too.
- **Where.** Bookmark saved/removed (one toast per post; toggling again
  replaces it), comment published and deleted, avatar uploaded and removed,
  display name saved, member invited, and every admin save that redirects
  with `?status=` (posts, media, comments moderation, categories, tags,
  authors, members). `QueryStatusToast`
  (`src/components/status/query-status.tsx`) shows the server-resolved
  message once and removes `?status=` from the URL, so a reload does not
  repeat it.
- **Accessibility.** Toasts render inside Sonner's `<section
  aria-live="polite" aria-relevant="additions text">`, which is prerendered
  before any toast exists and labelled with `common.layout.notifications`
  (Sonner appends its `alt+T` shortcut). Toasts never take focus; `alt+T`
  moves focus to them on demand. `src/components/ui/sonner.test.tsx` checks
  the prerendered live region.
- **Strings.** Toast text comes from the existing next-intl catalogs; Phase
  23 adds `common.layout.notifications` and `comments.itemActions.deleted`.

## Static pages and navigation (Phase 28)

Admin-managed pages (About, contact, legal texts such as the KVKK
"aydınlatma metni", privacy/GDPR notice, terms, imprint, cookie policy) and
the header and footer menus. Decisions (user, 2026-10-25): one deployment per
customer (single tenant), one version of each page (the text is not
translated per interface language), several pages, legal texts first.

- **Separate resource.** `pages` (migration
  `20261026100000_pages_navigation.sql`) has its own UUID id, title, mutable
  slug, optional meta description, `kind` (`privacy`, `terms`, `imprint`,
  `cookies`, `other`), Tiptap JSON body with `content_version`, status
  (`draft`/`published`), `published_at`, `created_at`, `updated_at`, and a
  `revision`. No category, tags, credits, cover, language, comments, or
  bookmarks. Pages never appear in post listings, archives, feeds, or search
  (those read `published_posts`); they do appear in the sitemap.
- **Same body rules as posts.** The `pages_body_valid` CHECK and the RPCs use
  `post_body_error`/`assert_post_body`, so the editor
  (`PostBodyEditor`), the read-only renderer (`PostBody`), and the database
  share one node allowlist. Images in a page body keep their media: a
  `before delete` trigger on `media` refuses (`23503`) while any page
  references it, for every delete path, without redefining `delete_media`.
- **One copy, no snapshot.** Unlike posts since Phase 26, pages keep a single
  copy: only editors and admins write pages (no author review step) and legal
  texts change rarely and deliberately, so a save of a published page is
  public at once. The edit form says so for a published page, and the public
  page shows the change as its "last updated" date (`updated_at`, formatted in
  the publication time zone). Revisit with a snapshot if pages ever need
  review before going live.
- **Roles (D1 fit).** Editors and admins create, edit, publish, unpublish,
  and delete pages and edit the menus (`require_page_editor()`); authors and
  readers have no page access; anonymous visitors and readers read published
  pages only (RLS `pages_select_published_or_editor`; `created_by` is not
  granted to client roles). Every write is a security-definer RPC
  (`create_page`, `update_page`, `publish_page`, `unpublish_page`,
  `delete_page`, `save_navigation`) with a revision compare-and-swap (`40001`
  on a stale form) and a per-actor rate limit (`page.write` 120/hour,
  `navigation.write` 30/10 min). Only drafts can be deleted, and not while a
  menu links them.
- **Legal kinds.** At most one published page per legal kind (partial unique
  index `pages_published_kind_key`); publishing a second privacy page, or
  retyping a published page into a taken kind, answers "a published page of
  this type already exists". Drafts of the same kind may coexist, so a
  replacement can be prepared and swapped (unpublish old, publish new).
- **Slugs.** Public URL `/pages/[slug]` (prefixed, so page slugs never
  collide with other routes). Changing the slug of a published page records
  `page_slug_redirects` (one-hop, by page id, hidden while the page is
  unpublished), and the route answers 308 to the current slug.
- **Navigation.** `navigation_menus` (`header`, `footer`, each with a
  revision) and `navigation_items` (ordered; a page reference by id, rendered
  with its current slug and title unless a label is set, or an `https://` URL
  with a required label, checked by a CHECK constraint, the RPC, and again
  when rendering). Items that link a draft page are hidden from the public by
  RLS. While the footer menu is empty, the footer lists the published legal
  pages automatically (privacy, terms, imprint, cookies). Header and footer
  links are server-rendered in the root layout
  (`src/features/pages/components/site-header-nav.tsx`,
  `site-footer-links.tsx`); a menu read failure renders empty menus instead
  of failing every page.
- **Legal hooks.** The published privacy page is linked from the reader
  sign-up form and the comment form (`LegalNotice`) and from the footer. The
  notice is informational, not a consent checkbox: KVKK article 10 and GDPR
  articles 13/14 require informing people, and processing that an account or
  a comment needs rests on the service the person asks for, not on consent. A
  checkbox would suggest consent is the legal basis and is not added. Without
  a published privacy page nothing is shown.
- **Admin.** `/admin/pages` (list), `/admin/pages/new`, `/admin/pages/[id]`
  (form, publish/unpublish/delete behind AlertDialogs, toasts on success,
  inline errors, conflict notice with "open current version"), and
  `/admin/navigation` (both menus: add page or external link, reorder,
  remove, save). Strings live in the `pages` (public) and `adminPages`
  catalogs in tr, en, and de.
- **Caching.** See `src/features/pages/cache.ts` (next to
  `src/features/posts/cache.ts`). Page reads use `publicPagesCacheTag`.
  Publishing, unpublishing, or saving a published page expires the tag and
  revalidates the root layout pattern `/[locale]` as a layout (header and
  footer are on every page, every locale) plus `sitemap.xml`; a menu save
  does the same without the sitemap; draft saves and deletes touch no public
  cache. `/pages/[slug]` is SSG/ISR (`revalidate = 300` fallback).
- **Samples.** The seed adds an About page, a published sample privacy/KVKK
  page, sample terms, and a draft imprint, plus a header link to About. Every
  legal sample says "ÖRNEK METİN — hukuki tavsiye değildir"; replace it with
  text reviewed for your deployment before launch.

### Cookies and consent banners

The application sets only strictly necessary cookies: the Supabase Auth
session cookies (sign-in) and `locale` (the interface language the visitor
chose). No analytics, advertising, or third-party cookies are set; YouTube
embeds use `youtube-nocookie.com` and load only with the post. Strictly
necessary cookies are exempt from consent under the ePrivacy rules that GDPR
deployments follow, and the KVKK guidance on cookies takes the same line, so
there is no cookie banner. Describe these cookies in the privacy or cookie
page. A banner (with prior consent and an equally easy "reject") becomes
necessary as soon as a deployment adds non-essential cookies or similar
storage: analytics (including self-hosted analytics that set identifiers),
marketing pixels, embedded third-party widgets that set cookies, or A/B
testing.

## Structure and sample content

```text
src/
  app/
    admin/                # Protected editorial shell and member administration
    admin/media/          # Media library with reference-aware deletion
    admin/members/        # Admin-only member list and actions
    admin/categories/     # Admin-only category tree, create, edit, move, delete
    admin/tags/           # Admin-only tags, create, edit, delete
    admin/comments/       # Editor/admin comment moderation queue
    admin/posts/          # Draft list, create, edit, and members-only preview
    account/              # Reader account: display name, sign-out, deletion
    account/password/     # Change or recover the password (signed in)
    account/saved/        # Private saved-posts list (dynamic, noindex)
    auth/confirm/         # Invite fragment/session confirmation
    auth/callback/        # Sign-up confirmation (PKCE code exchange)
    auth/recovery/        # Password recovery (PKCE code exchange)
    login/                # Sign-in for readers and editorial members
    login/password/       # Set-password step for invited users
    login/reset/          # Password reset request
    signup/               # Self-service reader sign-up
    page.tsx, home-listing.tsx # Home listing (page 1) and its shared view
    page/[page]/          # Later home listing pages
    posts/[slug]/         # Public post page (ISR) with slug redirects
    categories/[slug]/    # Category archive including descendants (+ page/[page])
    tags/[slug]/          # Tag archive (+ page/[page])
    authors/[slug]/       # Author archive (+ page/[page])
    sitemap.ts, robots.ts # Published-content sitemap and crawler rules
    feed.xml/route.ts     # Atom feed of the newest published posts (ISR)
    {categories,tags,authors}/[slug]/feed.xml/route.ts # Archive Atom feeds (ISR)
    search/               # Dynamic, noindex full-text search page
  components/ui/          # Generated shadcn/ui controls
  features/
    account/              # Display name and account deletion actions
    auth/                 # Sign-in, sign-up, reset, password policy, Auth rate limits, return paths
    bookmarks/            # Bookmark action, saved-list query, browser-side toggle state
    comments/             # Comment actions, queries, cache tags, section and moderation UI
    media/                # Upload validation, upload/delete actions, URLs
    members/              # Invite, role, and activation Server Actions
    seo/                  # Metadata, Article JSON-LD, sitemap, robots, and Atom feed builders
    sharing/              # Copy link and provider share links
    taxonomy/             # Hierarchy and tree helpers, admin data, validation, actions
    search/               # Search input parsing, highlights, rate limit, data, form and results
    posts/
      admin/              # Draft data, validation, permissions, form, editor, actions
      components/         # Shared post presentation and read-only body renderer
      content/            # Body allowlist, editor extensions, shared fixtures
      admin/publication.ts  # Publication error keys and copy
      archives.ts         # Public paths and archive derivation
      cache.ts            # Data Cache tag for public post reads
      data.ts             # Anonymous, RLS-filtered public queries
      pagination.ts       # Page size, page URLs, parsing, page-1 redirects
      queries.ts          # Query builders shared with the RLS tests
      mapping.ts          # Row-to-read-model mapping, "Güncellendi" rule
      types.ts            # Public read models, not database definitions
  lib/
    auth/
      editorial.ts        # Request-scoped membership and role helpers
      session.ts          # Server-verified session helper
      session.test.ts     # Mocked-cookie unit tests
    site-url.ts           # NEXT_PUBLIC_SITE_URL parsing
    slug.ts               # Shared slug and name normalization
    slug.test.ts          # Turkish transliteration and normalization tests
    supabase/
      admin.ts            # Server-only secret-key client
      content-rls.rls.test.ts    # Content and taxonomy RLS tests
      draft-authoring.rls.test.ts # Draft RPC and revision-conflict tests
      post-body.rls.test.ts       # Body allowlist and visibility tests
      media.rls.test.ts           # Media table, Storage policy, deletion tests
      publishing.rls.test.ts      # Publish/unpublish, public reads, redirects
      archives.rls.test.ts        # Archives, sitemap, and feed input by role
      editorial-rls.rls.test.ts # Membership and audit RLS tests
      admin-bootstrap.rls.test.ts # First-admin RPC: grants, refusal, rollback
      reader-accounts.rls.test.ts # Self-service reader matrix, deletion, limits
      bookmarks.rls.test.ts       # Bookmark isolation, drafts, saved list, deletion
      comments.rls.test.ts        # Comments, reports, moderation, limits, anonymization
      taxonomy-admin.rls.test.ts  # Taxonomy RPCs, moves, redirects, deletion
    app-origin.ts         # Origin for Auth email redirects
  proxy.ts                # Next.js 16 token refresh (formerly middleware)
supabase/
  config.toml             # Local auth config, reader sign-up, seeds enabled
  migrations/             # Versioned schema, RLS, functions, and triggers
  seeds/seed.sql          # Synthetic taxonomy and posts, never production data
scripts/
  admin-bootstrap.mjs     # One-time first-admin grant (npm run admin:bootstrap)
  admin-bootstrap-core.mjs # Bootstrap logic, unit tested with a fake client
  run-rls-tests.mjs       # Loads local Supabase env and runs integration tests
vitest.config.mts         # Unit test configuration
vitest.rls.config.mts     # RLS integration test configuration
```

Public pages import `features/posts/data.ts`, which reads published rows from
the database; there is no fixture fallback. The development seed provides three
published posts with stable UUIDs, ordered author credits, one category (with a
parent reference), multiple tags, and version-1 bodies, plus one uncategorized
draft that cannot be published until a category is saved. Seed content is
synthetic and contains no images or videos.

Route paths and query parameters are English (`/login`, `/admin/members`,
`/posts/[slug]`, `?status=updated`, `?error=category`) regardless of the
interface language. Turkish copy and generic labels are provisional, not a
brand or language decision (D5). Published pages are server-rendered HTML with
no editor bundle. Phase 9 metadata, structured data, archives, and the
sitemap are described above.

## UI and system theme

`components.json` configures shadcn/ui (Radix Nova, neutral tokens). Card, Badge,
Button, Input, Label, Textarea, and Checkbox are generated components. Add only
components needed by a feature:

```bash
npx shadcn@4.22.1 add <component>
```

`src/app/globals.css` uses semantic shadcn tokens. Dark tokens live under
`@media (prefers-color-scheme: dark)`; Tailwind's `dark:` variant also follows
the system preference. There is no theme selector, local storage override, theme
provider, or mount delay. System changes apply immediately through CSS, including
before hydration. System fonts avoid external font requests during builds.
Keep this media-query behavior when adding components or regenerating theme CSS.

## Supabase workspace

Configuration was generated with the official CLI; no hosted project is linked.
Without the CLI or a database the public pages build and render empty.
The config enables the experimental stack backend (`[experimental] stack = true`)
and leaves endpoint ports unset so another local project can keep its own ports.
With Supabase CLI 2.121.0 installed, run from the repository root:

```bash
supabase start --runtime native
supabase status
supabase stop
```

The native runtime runs services as host processes, not containers. First start
downloads and verifies the service archives. Postgres starts immediately; other
services start on their first request and may sleep when idle. This is expected.
Use `supabase start --runtime native --eager` after stopping the stack if every
enabled service must start immediately and remain active.

Use `supabase status` to find this stack's API, Studio, Mailpit, database URLs,
and local keys; do not assume the standard 54321–54323 ports. Assigned ports
persist across restarts. Endpoints bind to loopback. Local data lives under
`~/.supabase/stacks/`, and downloaded artifacts under `~/.supabase/cache/stack/`.
`supabase stop` preserves data; `supabase stack destroy` deletes the selected
stack's data. Stack identity includes the repository path and Git branch, so
switching branches selects a separate local stack.

For Docker instead, use `supabase start --runtime docker` when creating a new
stack. An existing stack keeps its original runtime; the CLI does not convert its
data. Native mode and the stack commands are experimental, so keep the CLI version
consistent and consult the official
[runtime guide](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)
before upgrading.

To configure the application clients, copy `API_URL`, `PUBLISHABLE_KEY`, and
`SECRET_KEY` from `supabase status` into `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Set
`NEXT_PUBLIC_SITE_URL` to the same origin as Auth's `site_url`. Do not export the
full status environment into a client-facing file: it also contains secret and
service-role keys. Restart Next.js after configuring it.

The local config enables reader sign-up with email confirmation (Phase 11);
editorial access still comes only from invitations. Create the first admin with
`npm run admin:bootstrap` as described in
[Bootstrap the first admin](#bootstrap-the-first-admin).
The Phase 2 migration creates `profiles`, `editorial_members`, `authors`, and the
audit log, with triggers, RPCs, and RLS. The Phase 3 migration adds `categories`,
`tags`, `posts`, `post_authors`, and `post_tags` with normalization checks,
category cycle protection, indexes, and public read policies. The Phase 4
migration adds the draft-authoring RPCs, revision compare-and-swap, relation
replacement, metadata validation, and the editorial author-read policy. The
Phase 5 migration adds post bodies. The Phase 6 migrations add the `media`
bucket, Storage policies, `public.media`, the media RPCs, and the image node.
The Phase 7 migration adds the `youtube` node to the body validator. The Phase
8 migration adds the publish/unpublish RPCs and slug redirects. The Phase 10
migration adds the write rate limits.
Seeding is enabled: `supabase/seeds/seed.sql` loads synthetic taxonomy and
posts, never production data. Create future migrations with
`supabase migration new <name>` and keep all related changes in this repository.
Add optional Edge Functions only when there is a concrete need.

If you change the local application host or port, update `site_url`,
`additional_redirect_urls` in `supabase/config.toml`, and
`NEXT_PUBLIC_SITE_URL`, then restart the stack and Next.js. The invite redirect
must be allowlisted or Supabase falls back to the site URL and the acceptance
page will not receive the fragment.

## Documentation checked for this setup

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation),
  [App Router page API](https://nextjs.org/docs/app/api-reference/file-conventions/page),
  and the bundled Next.js 16.4.2 [Proxy](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md)
  documentation.
- [shadcn/ui Next.js setup](https://ui.shadcn.com/docs/installation/next),
  [theming](https://ui.shadcn.com/docs/theming), and CLI 4.22.1 help.
- [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode) for Tailwind 4.3.3.
- [Supabase JS initialization](https://supabase.com/docs/reference/javascript/initializing)
  for supabase-js 2.118.0, [SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
  for `@supabase/ssr` 0.12.7, [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
  [invite users](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
  [changelog](https://supabase.com/changelog), and CLI 2.121.0 help.
- Tiptap 3.32.0 package metadata (React 19 peer ranges) and the installed
  `@tiptap/react`, `@tiptap/starter-kit`, and `@tiptap/extension-link` type
  definitions for `immediatelyRender`, `useEditorState`, and link
  `isAllowedUri`.
- Bundled Next.js 16.4.2 docs for [caching without Cache Components](node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md),
  [ISR](node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md),
  [`revalidatePath`](node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md),
  [`updateTag`](node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md),
  and [`generateStaticParams`](node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-static-params.md).
- Bundled Next.js 16.4.2 docs for [metadata and OG images](node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md),
  [`generateMetadata`](node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md),
  [JSON-LD](node_modules/next/dist/docs/01-app/02-guides/json-ld.md),
  [`sitemap`](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md),
  and [`robots`](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md)
  (both are cached Route Handlers unless they use request-time APIs), and
  [Route Handlers](node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md)
  with [`route.ts` segment config](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md)
  (`GET` is uncached unless configured; `revalidate` makes it ISR) for the feed.
- Bundled Next.js 16.4.2 docs for the [Image component](node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md)
  (`remotePatterns`, `maximumResponseBody`, `dangerouslyAllowLocalIP`) and
  [`serverActions.bodySizeLimit`](node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md);
  Supabase [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
  The local Storage schema blocks direct SQL deletes from `storage.objects`
  (`storage.protect_delete`), so objects are removed through the Storage API.
- Bundled Next.js 16.4.2 docs for [how revalidation works](node_modules/next/dist/docs/01-app/02-guides/how-revalidation-works.md)
  (tags are per instance without a shared cache handler),
  [`error.js`](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md)
  (`retry`, `global-error`), [`loading.js`](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md),
  and the [Content Security Policy guide](node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
  (nonces force dynamic rendering; static CSP without nonces); Supabase
  [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
  (checked 2026-10-23) and CLI 2.121.0 `db dump`/`db reset` help.
- Phase 11: Supabase [password-based auth](https://supabase.com/docs/guides/auth/passwords)
  (checked 2026-10-23: SSR confirmation and recovery through `token_hash`
  templates and `verifyOtp`), and the installed `@supabase/auth-js` 2.118.0
  reference for `signUp` (obfuscated user only with email and phone
  confirmations on), `resetPasswordForEmail`, and `exchangeCodeForSession`
  (`sb_flow_id`); bundled Next.js docs for
  [authentication and Proxy optimistic checks](node_modules/next/dist/docs/01-app/02-guides/authentication.md).

## Launch readiness (Phase 10)

Phase 10 hardens the editorial MVP. Hosting, the production domain, and the
brand stay open (D5, confirmed provisional on 2026-10-23): nothing here deploys
or creates hosted resources.

- **Cache invalidation map.** `features/posts/cache.ts` names each kind of
  public content change and returns what it expires; Server Actions apply it
  with `updateTag` before `revalidatePath`. Publish, unpublish, and (since
  Phase 26) republish and discard of a published post (title, slug with its
  redirect, excerpt, body including images and YouTube nodes, category, tags,
  credits) expire the `public-posts`
  Data Cache tag and revalidate `/`, `/posts/[slug]`, `/categories/[slug]`,
  `/tags/[slug]`, `/authors/[slug]`, the later listing pages under
  `.../page/[page]`, `/sitemap.xml`, `/feed.xml`, and the archive feeds. Saving a draft no
  longer touches public caches; since Phase 26 neither does saving a
  published post's working copy. Media upload and deletion change nothing public:
  deletion is refused while a body references the image. Future taxonomy and
  author administration must call the same map with `taxonomy-changed` or
  `author-changed`. One tag is deliberate: every post card embeds taxonomy and
  credits, and the listing, archives, and sitemap change with any published
  post, so per-post tags would not save a regeneration. With several server
  instances, tag expiry is local unless a shared cache handler is configured;
  see the hosting checklist below.
- **Concurrency.** Every content mutation (`update_post_metadata`,
  `publish_post`, `unpublish_post`) compares `revision` atomically under a row
  lock; `create_draft_post` has nothing to compare. A rejected save keeps the
  user's title, slug, excerpt, category, tags, credits, and Tiptap body: React
  resets uncontrolled fields after a form action, so the action returns the
  submitted values as the new defaults, and category, tags, credits, and the
  body are client state.
- **Rate limits.** Migration `20261023120000_write_rate_limits.sql` adds
  `public.rate_limit_events` (RLS on, no client grants) and BEFORE triggers on
  `posts` and `media`, so every write path is limited per signed-in actor:
  30 new posts per hour, 120 edits per 10 minutes, 30 publish/unpublish changes
  per hour, 60 media deletions per 10 minutes. A denied write raises `PT429`
  (HTTP 429) and rolls back; the UI says so and keeps the form input. Uploads
  keep the Storage policy limit (20 per 10 minutes) and invitations the
  audit-log limit (20 per hour). Service-role maintenance writes are not
  limited. Since Phase 11, sign-up, sign-in, and password reset also have
  application limits (see [Reader accounts](#reader-accounts-phase-11)); token
  endpoints use Supabase Auth's own limits (`[auth.rate_limit]` in
  `supabase/config.toml`; configure the hosted project to match).
- **Loading, empty, and error states.** `app/error.tsx` (inside the root
  layout, with retry and the error digest), `app/global-error.tsx`,
  `app/admin/error.tsx`, `app/admin/not-found.tsx`, and an `app/admin/loading.tsx`
  skeleton, all on shadcn/ui tokens for both system themes. Public ISR routes
  deliberately have no `loading.tsx`: their HTML is prerendered, and a streaming
  boundary could send the status before `notFound()` or a slug redirect. Empty
  states already existed for the home listing and the admin lists. A public
  page whose cache was just expired returns the error page (500) while Supabase
  is unreachable; `retry()` recovers once it is back.
- **Security headers.** `next.config.ts` sends the headers from
  `lib/security-headers.ts` on every route and disables `X-Powered-By`. The CSP
  is static, because nonces would force dynamic rendering of the ISR pages:
  `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` only in
  development), images and `connect-src` from the Supabase origin, `frame-src`
  only `https://www.youtube-nocookie.com`, `object-src 'none'`,
  `frame-ancestors 'none'`, and `upgrade-insecure-requests` unless Supabase is
  on loopback. Also `nosniff`, `strict-origin-when-cross-origin` (YouTube needs
  the origin as referrer), `X-Frame-Options: DENY`, and a restrictive
  `Permissions-Policy`. HSTS belongs to the TLS-terminating host.
- **Secrets review.** `.env.example` holds placeholders only; real env files are
  ignored. `SUPABASE_SECRET_KEY` is read only in `lib/supabase/env.ts` and used
  only by `lib/supabase/admin.ts` (`server-only`) for invitations and member
  e-mails; the production build output contains neither the key nor its name
  in `.next/static`. Normal user operations use the user's session and RLS.
- **Backups.** [docs/backup-and-restore.md](./docs/backup-and-restore.md)
  covers Postgres, Storage bytes, and Storage object ownership, local and
  hosted, with consistency checks and the drill log
  (`npm run backup:storage`, `npm run backup:storage-owners`, and their
  `restore:` counterparts). Full local drill on 2026-10-25: a disposable
  worktree stack with synthetic users, published snapshots, working copies,
  versions, media, avatars, comments, and bookmarks was dumped, destroyed, and
  restored in about 10 seconds of commands; every `auth` and `public` table
  matched by count and content hash, schema and role dumps were identical,
  9/9 objects matched their SHA-256, every user signed in, public pages served
  the published snapshot with images and avatars, and `npm run test:rls`
  (554) passed on the restored stack. The hosted path is not drilled yet.
- **Smoke test.** `npm run test:smoke` (`SMOKE_BASE_URL`, default
  `http://localhost:3000`) checks a running server anonymously: listing and
  first post render with JSON-LD, unknown post and tag URLs return `noindex`
  404s, listing pagination behaves (`/page/1` redirects, `/page/2` renders
  with its own canonical URL when it exists, invalid and out-of-range pages
  are `noindex` 404s), `/admin` redirects to `/login?next=/admin`, the
  site-wide `/opengraph-image` is a PNG declared as `og:image`, `robots.txt` and
  `sitemap.xml` are public-only, the home page links `/feed.xml`, which is a
  public, cacheable Atom feed listing the newest post (or a 404 without a
  discovery link when no site URL is set), and every response has the
  security headers without eval. Optional `SMOKE_SUPABASE_URL` and
  `SMOKE_SUPABASE_PUBLISHABLE_KEY` add a check that clients cannot call
  `search_published_posts` directly.

Hosting checklist (open until D5 is decided): after the first deploy, create
the first admin with `npm run admin:bootstrap` (see
[Bootstrap the first admin](#bootstrap-the-first-admin)); set `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_SITE_NAME` before the production build, add the origin to the
Supabase Auth site URL and redirect allowlist, keep `SUPABASE_SECRET_KEY` in
the host's server-only secrets, enable HSTS at the edge, configure a shared
cache handler or a single instance so `updateTag` reaches every instance,
review the hosted Auth rate limits and SMTP, apply the reader-account Auth
settings (confirm email and confirm phone on, `letters_digits` password rule,
the `/auth/callback` and `/auth/recovery` redirect URLs, production SMTP, and
reviewed Turkish confirmation and recovery templates using the `token_hash`
links; Auth emails are not localized per interface language), make sure the
CDN or proxy in front of the app keys cached HTML on the `locale` cookie and
`Accept-Language` (Next.js sends no such `Vary`; a cache keyed by URL alone
would serve one interface language to every reader, so add the cache key or
`Vary` at the edge, or do not cache HTML there),
schedule database, Storage, and Storage-owner
backups (platform backups and PITR cover Postgres only; draft images stay
public by URL by decision, D4), repeat the backup drill against the hosted
project (keys, Auth settings, SMTP, and redirect URLs are not part of any
backup; see the runbook), and run
`npm run test:smoke` against the deployment.

Tests: `launch-readiness.rls.test.ts` runs two simultaneous saves from the same
revision (exactly one wins, the other gets `40001`), a stale publish after a
concurrent edit, the publication and creation limits (the 31st call gets HTTP
429 and changes nothing, limits are per actor and per action, service-role
writes are exempt), and the final anonymous/reader/author/editor/admin matrix:
post visibility, closed direct writes to content tables, hidden rate-limit
bookkeeping, draft editing, publishing, and membership reads. Unit tests cover
the invalidation map, security headers, and the new error keys.

## Reader accounts (Phase 11)

Reader accounts are optional: public reading stays anonymous. A reader account
is the identity later reader features (bookmarks, comments) will attach to.

- **Reader state is derived.** `supabase/config.toml` enables sign-up with
  required email confirmation. Sign-up creates an Auth user and, through the
  Phase 2 trigger, a `profiles` row with the submitted display name, and
  nothing else: no `editorial_members` row, author link, or audit entry. There
  is no `reader` role value and no self-service path to editorial access; RLS
  and every RPC treat an authenticated non-member like a reader. User metadata
  is never read for authorization (a sign-up that submits `role: "admin"` gets
  nothing).
- **Unconfirmed accounts cannot become members.** Anyone can register an email
  they do not own, and an admin invitation of an existing email grants
  membership to that account. A trigger
  (`editorial_members_require_confirmed_account`) therefore requires a confirmed
  or Auth-invited account before a membership becomes active, and
  `/admin/members` explains the refusal.
- **Routes.** `/signup` (display name, email, password), `/login` (readers and
  members), `/login/reset` (reset request), `/auth/callback` (sign-up
  confirmation), `/auth/recovery` (reset link), `/account` (a profile card
  with the picture and display name first, then password change, sign-out,
  deletion), and `/account/password`. All are dynamic and `noindex`. The
  public header links to `/account` with a generic icon in the prerendered
  HTML; after hydration `AccountNavLink` reads the visitor's own profile in
  the browser (RLS: own row) and shows their avatar or initials, so public
  pages stay prerendered. It reloads on navigation and on the
  `avatarChangedEvent` the avatar form dispatches after a successful upload
  or removal.
- **Email links.** `/auth/callback` and `/auth/recovery` accept two link
  shapes and always redirect to fixed paths (no open redirect).
  `?token_hash=…&type=…` is Supabase's documented SSR pattern: the route calls
  `verifyOtp` (only `signup`/`email` on the callback, only `recovery` on the
  recovery route) and works in any browser. It needs custom email templates
  (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` and
  `{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`);
  configure them for the hosted project. The local native stack cannot serve
  custom templates, so locally the default template's `?code=…` (PKCE) link is
  used: the sign-up and reset Server Actions run `@supabase/ssr` with the PKCE
  flow, which stores the code verifier in a cookie, and the route exchanges the
  code. That link must be opened in the same browser; otherwise the callback
  shows a neutral message (Supabase has already confirmed the email). Both
  callback URLs are on the redirect allowlist.
- **Password policy.** At least 8 characters with a letter and a digit
  (`minimum_password_length = 8`, `password_requirements = "letters_digits"`),
  mirrored in `features/auth/password-policy.ts` for Turkish messages, with a
  72-byte maximum (bcrypt). Invite and recovery password forms use the same
  rule.
- **No account enumeration.** Sign-up answers identically for new and
  registered emails: Supabase returns an obfuscated user only when both email
  and phone confirmations are on (SMS itself stays disabled), and the action
  maps `user_already_exists` to the same message as a safety net. Password
  reset always returns the same message, whatever Supabase answers. Sign-in
  reveals "not confirmed" only after a correct password.
- **Rate limits.** Migration `20261023140000_reader_accounts.sql` adds
  `public.auth_rate_limit_events` and `consume_auth_rate_limit`, the Phase 10
  sliding-window mechanism keyed by SHA-256 digests of the normalized email and
  the client IP (raw values are never stored). Every attempt counts. Sign-up: 3
  per email and 10 per IP per hour; sign-in (also the password check before
  account deletion): 10 per email and 30 per IP per 10 minutes; password reset:
  3 per email and 10 per IP per hour. Only the server's secret-key client may
  call the function, so nobody can spend another person's budget directly; the
  flows fail closed without `SUPABASE_SECRET_KEY`. The client IP comes from the
  first `X-Forwarded-For` entry, which is trustworthy only behind a proxy that
  overwrites it; confirm this for the chosen host (D5) and add CAPTCHA
  (`[auth.captcha]`) if abuse appears.
- **Account deletion.** `/account` asks for the current password (checked with
  a stateless client and the sign-in limit) and a confirmation. The action
  calls `prepare_own_account_deletion()` as the user, then deletes the Auth user
  with the admin API using the session's user id, and clears the cookies.
  Deletion cascades to `profiles`, `editorial_members`, and rate-limit rows;
  `posts.created_by`, `media.uploaded_by`, `authors.user_id`, and audit
  references become null, so authored posts, credits, and media stay. Active
  admins are refused (another admin must change the role or deactivate the
  membership first), which also keeps at least one active admin; editors,
  authors, and deactivated members may delete their account and get a
  `member.account_deletion` audit entry. Since Phase 12 the preflight also
  deletes the user's bookmarks, and since Phase 13 it anonymizes their
  comments inside `prepare_own_account_deletion()`, before the Auth user is
  deleted (see "Comments (Phase 13)").
- **Identity boundary.** No reader action accepts a user id, role, or email for
  authorization; `features/account/form-fields.test.ts` pins the accepted form
  fields.

Tests: `reader-accounts.rls.test.ts` signs readers up through the public Auth
API and covers profile-only sign-up (with role-like metadata), the session-less
response before confirmation, `email_not_confirmed` only with the right
password, the unconfirmed-membership guard (RPC and secret key), the reader
denial matrix (membership RPCs, direct writes, drafts, media upload, register
and delete, create/update/publish/unpublish, other profiles, rate-limit
bookkeeping), identical reset responses, the Auth rate-limit rules, and
deletion (only the caller's data, active admin refused, an editor's posts and
credit kept). Unit tests cover the password policy, display-name validation,
rate-limit subjects, and the form-field allowlist.

Before launch: production SMTP, Turkish confirmation and recovery templates
with `token_hash` links,
`max_frequency` and Auth rate limits for the hosted project, and the hosted
Auth settings listed in the hosting checklist above.

## Taxonomy administration

Admins manage categories at `/admin/categories` and tags at `/admin/tags` (D1);
editors and authors only assign existing ones and see a denial on these pages.
Migration `20261023160000_taxonomy_administration.sql` adds the write path.

- **RPCs only.** `create_category`, `update_category`, `delete_category`,
  `create_tag`, `update_tag`, and `delete_tag` are security-definer functions
  that re-check an active admin (`require_admin_actor`), write an
  `editorial_audit_log` entry, and consume one `taxonomy.write` rate-limit
  event (60 per admin per 10 minutes, the Phase 10 mechanism). Clients still
  have no direct write grants on taxonomy tables. Server Actions in
  `features/taxonomy/actions.ts` normalize input with `src/lib/slug.ts` (an
  empty slug is derived from the name) and map errors to Turkish messages; the
  table constraints remain the final authority.
- **Stale forms.** Update and delete RPCs take the `updated_at` value the form
  loaded and reject a mismatch (`40001`), so two admins cannot silently
  overwrite each other.
- **Moves.** Changing the parent moves the whole subtree. The parent select
  hides the category and its descendants, and the existing
  `prevent_category_cycle` trigger rejects any cycle (`23514`).
- **Slug redirects.** `category_slug_redirects` and `tag_slug_redirects` record
  old slugs on every slug change, with the same one-hop rules as posts: another
  category or tag cannot take a redirected slug, and a record may take its own
  old slug back. They are publicly readable; `/categories/[slug]` and
  `/tags/[slug]` answer an old slug with a permanent redirect.
- **Deleting a category** (decision 2026-10-23): when posts use it, the admin
  must pick a target category. The RPC moves the posts to the target, moves
  child categories up to the deleted category's parent, points the deleted
  slug and its older redirects at the target, and deletes the row, all in one
  transaction. An unused category can be deleted without a target (its URL
  then returns 404) or with one (its URL redirects).
- **Deleting a tag** (decision 2026-10-23): the tag is removed from every post
  and deleted; its archive URL returns 404. The confirmation names the number
  of affected posts.
- **Affected posts.** Moved or detached posts get `revision + 1`, so an
  editor's open form hits the normal conflict instead of saving a removed
  category or tag, and a new `updated_at` (published posts show
  "Güncellendi"). These bulk updates do not spend the per-row `post.update`
  limit: the RPC sets a transaction-local flag that the post rate-limit trigger
  honors, and clients cannot set it.
- **Caches.** Every successful change applies
  `invalidatePublicContent("taxonomy-changed")` (`features/posts/invalidate.ts`,
  now shared with the post actions), which expires `public-posts` and
  revalidates the listing, post, archive routes, and the sitemap.

Tests: `taxonomy-admin.rls.test.ts` covers the denial of every RPC for
anonymous, reader, author, and editor callers, closed direct writes (including
the redirect tables), duplicate names and slugs, stale forms, subtree moves and
cycle rejection, public redirects with takeover protection and reclaim,
deletion with and without a target (posts, children, redirects, revisions,
audit), a 130-post reassignment without post write-limit events, tag removal
from posts, and the `taxonomy.write` limit. Unit tests cover input validation
and the tree helpers.

## Author identity administration

Admins manage author identities at `/admin/authors`; editors and authors see a
denial and keep crediting existing authors in the post editor. Migration
`20261023180000_author_administration.sql` adds the write path.

- **RPCs only.** `create_author`, `update_author`, and `delete_author` are
  security-definer functions that re-check an active admin, write an
  `editorial_audit_log` entry, and consume one `author.write` rate-limit event
  (60 per admin per 10 minutes). The Phase 2 direct insert/update/delete grants
  and policies on `authors` are removed, admins included. Server Actions in
  `features/authors/actions.ts` normalize input (an empty slug is derived from
  the name) and map errors to Turkish messages. Names may repeat; slugs are
  unique and now limited to 120 characters.
- **Stale forms.** Update and delete take the loaded `updated_at` and reject a
  mismatch (`40001`).
- **Slug redirects** (decision 2026-10-23). `author_slug_redirects` records old
  slugs with the same one-hop rules as posts and taxonomy. A redirect row is
  readable only while its author is (credited on a visible post), so it cannot
  reveal an uncredited author. `/authors/[slug]` answers an old slug with a
  permanent redirect.
- **Deleting** (decision 2026-10-23). An author credited on any post, draft or
  published, cannot be deleted (`23503`); the page hides the delete form and
  says to remove the credits in the post editor first. Deleting an uncredited
  author drops its redirects.
- **Account links** (decision 2026-10-23). An author may link to one account,
  and only to an active editorial member; readers cannot be linked. The link
  grants nothing: edit and publish rights still come from `editorial_members`
  and `posts.created_by`. A link survives deactivation (the form keeps offering
  the current account) and is cleared when the account is deleted, so the
  byline stays. `authors.user_id` remains column-unreadable; admins read links
  through the admin-only `list_author_account_links()` RPC.
- **Caches.** Every change applies `invalidatePublicContent("author-changed")`.

Tests: `author-admin.rls.test.ts` covers the denial of every RPC for
anonymous, reader, author, and editor callers, closed direct writes for admins
too, the hidden `user_id` column, duplicate slugs, stale forms, redirects that
stay hidden until the author is public plus takeover protection and reclaim,
blocked deletion of a credited author, deletion with redirects and audit, link
rules (readers, deactivated members, unknown ids, one author per account), and
the `author.write` limit. Unit tests cover input validation and the account
choices offered by the form.

## Profile pictures (avatars)

Accounts and public author identities have separate avatars. Migration:
`20261024160000_avatars.sql`; code in `src/features/avatars/`.

- **Whose avatar.** Every account holder (reader or editorial member) sets
  their own picture at `/account` ("Profil fotoğrafı"); it is stored in
  `profiles.avatar_id` and shows next to their comments. Admins set an author
  identity's picture at `/admin/authors/[id]` ("Yazar fotoğrafı"); it is stored
  in `authors.avatar_id` and shows in the post byline, the listing cards, the
  admin author list, the author archive header, and as the `Person` `image` in
  Article JSON-LD (Phase 20). Guest authors get one the same way. An author never falls back to its
  linked account's picture, because equal pictures would reveal the link that
  `authors.user_id` keeps private.
- **Storage.** One public `avatars` bucket, separate from post media (2 MiB,
  JPEG/PNG/WebP only, no GIF or SVG). Objects are named `profiles/<uuid>` or
  `authors/<uuid>` with a fresh UUID per upload, so URLs name no user or author
  and objects are never overwritten. Storage policies: any signed-in account
  may upload under `profiles/`, only active admins under `authors/`; ten
  uploads per user per ten minutes; profile objects are visible to and
  removable by their uploader only, author objects by admins only; an object
  in use cannot be deleted by anyone. Anonymous visitors only fetch public URLs.
- **Validation.** `uploadAvatarObject` identifies the format from the file
  signature (the declared type and name are ignored), and requires 16–4096
  pixel edges. The RPCs re-read type and size from Storage metadata and require
  the caller to own the object. No server-side resizing: the crop dialog
  already uploads a square, and `next/image` still delivers a square, cropped
  (`object-cover`) rendition of any non-square object at the displayed size.
- **Writes.** `set_own_avatar(p_avatar_id)` (any signed-in user, own profile
  only, `avatar.update` limit of 10 per hour; `null` removes) and
  `set_author_avatar(p_author_id, p_expected_updated_at, p_avatar_id)` (active
  admins, `author.write` limit, stale-form check, audit entries
  `author.avatar_set`/`author.avatar_removed`) return the detached avatar,
  which the Server Action deletes right away. `profiles.avatar_id` has no
  client update grant. Deleting an author removes its avatar object too.
- **Comments follow the live avatar.** Unlike the display-name snapshot, a
  comment shows the commenter's current picture: replacing or removing an
  avatar deletes the old object, so a snapshot would point at a missing file,
  and a reader who removes their picture expects it gone from public pages.
  `comments.avatar_id` is a denormalized copy (set by the insert trigger, kept
  in sync by `set_own_avatar`, cleared by anonymization), so public reads never
  touch `profiles`. `set_own_avatar` returns the posts the user commented on;
  the action expires those posts' comment tags and revalidates their paths, so
  post pages stay ISR.
- **Account deletion.** `prepare_own_account_deletion()` also clears the
  profile avatar (comment avatars go with anonymization); the action then lists
  and removes every `profiles/` object the user owns, including uploads that
  were never attached, before deleting the Auth user. An Auth user deleted out
  of band (without the preflight) can leave an orphan object; it is unlisted and
  can be removed through the Storage API.
- **Cropping (Phase 25).** Choosing a file opens a shadcn/ui dialog with a
  square crop area and a circular preview: drag or arrow keys (Shift for
  larger steps) move the picture; the slider, its buttons, the mouse wheel,
  or `+`/`-` zoom (1–4×). The browser decodes the file through `<img>` (EXIF
  orientation applied; GIFs keep their first frame), downscales the working
  copy to a 2048 px longest edge, and exports the crop at 512×512 (smaller
  crops at their own size) as WebP, or JPEG where WebP encoding is not
  supported. The result goes through the same upload Server Action, so the
  server checks above stay authoritative. Files over 25 MB or that cannot be
  decoded show a localized error before anything is uploaded. Code:
  `crop.ts` (pure math), `crop-image.ts` (decode/export),
  `components/avatar-crop-dialog.tsx`.
- **UI.** The shadcn/ui `avatar` component with an initials fallback (Turkish
  case mapping) and the muted/border tokens of both system themes. Avatars next
  to a visible name are decorative (`alt=""`, initials `aria-hidden`); the
  previews on `/account` and the admin author page are labelled. Images load
  after hydration (Radix), so a missing object shows initials instead of a
  broken image. The CSP already allowed the Supabase origin and `'self'`
  (the image optimizer); `next.config.ts` adds the bucket path to
  `images.remotePatterns`.
- **Caches.** An author avatar change is an `author-changed` public content
  change (`features/posts/cache.ts`). Own avatar changes invalidate only the
  affected post pages (`features/comments/cache.ts`).

Tests: `features/avatars/avatars.test.ts`,
`features/avatars/crop.test.ts`, and
`features/avatars/components/identity-avatar.test.tsx` cover signature, type,
size, and dimension validation, initials, URLs, fallback markup, and the crop
math (zoom limits, clamping, panning, downscaling, output size);
`src/lib/supabase/avatars.rls.test.ts` covers the bucket config, uploads by
role and path (anonymous/reader/author/editor/admin, admin-only author
avatars, malformed paths, SVG/GIF/HTML, oversize, overwrite), the upload and
change rate limits, own-object listing, attaching own vs others' uploads,
closed direct column writes, replacement and removal cleanup, comment avatar
sync and forged inserts, author avatars by role with stale forms, public reads
without the account link, audit entries, and account-deletion cleanup.

## Bookmarks (Phase 12)

Signed-in users (readers and editorial members alike) can save published posts
to a private list at `/account/saved`. Bookmarks are private by decision D6:
there is no public bookmark or like count, and nobody else, admins included,
can read another user's rows. Migration `20261023200000_bookmarks.sql` adds:

- **Table.** `bookmarks(id, user_id, post_id, created_at)` with
  `unique (user_id, post_id)`. `user_id` defaults to `auth.uid()` and references
  `profiles` with `ON DELETE CASCADE` (profiles cascade from `auth.users`);
  `post_id` references `posts` with `ON DELETE CASCADE`, so a post removal
  leaves no orphans (no UI deletes posts yet). Unpublishing keeps the row: the
  saved list hides the post and shows it again if it is republished. Indexes:
  the unique pair (state lookups), `(user_id, created_at desc)` (the list), and
  `post_id` (the cascade).
- **RLS.** `authenticated` may select and delete only rows where
  `user_id = auth.uid()`, and insert only as itself and only for a post whose
  status is `published` right now. The status check is explicit because
  editorial members can read drafts through the posts policy. There is no
  update grant and no anonymous grant.
- **Rate limit.** A `BEFORE INSERT` trigger consumes `bookmark.create`
  (60 per user per 10 minutes, Phase 10 mechanism, HTTP 429). Deletes are not
  limited: each needs an earlier insert, and account deletion may remove any
  number of rows.
- **Account deletion.** `prepare_own_account_deletion()` now deletes the
  caller's bookmarks in its transaction; the profile cascade is the safety net.

Application:

- **Toggle.** `BookmarkToggle` (shadcn/ui `Button`, `aria-pressed`, constant
  accessible name, the post title as screen-reader text on cards, a polite
  live region for the result) appears on `/posts/[slug]`, on every post card
  (home and archives), and on the saved list. It updates optimistically and
  settles on the answer of `setBookmarkAction(postId, saved)`, an idempotent
  Server Action that takes the user from the verified session and only a
  post id from the client. A draft, a missing post, or a rate limit restores
  the previous state with a message. A signed-out click (or an expired
  session) goes to `/login?next=<current path>`.
- **Return paths.** `/login` accepts `?next=` only through `safeReturnPath`
  (same-origin absolute paths; no protocol-relative, backslash, or
  control-character input; never `/login`, `/signup`, `/auth`, or `/api`).
  Sign-in, an already-signed-in visit to `/login`, and the Proxy's signed-out
  redirect for `/account/*` and (since Phase 20) `/admin/*` use it; an `/admin`
  path counts only for an active editorial member (`returnPathForMember`).
- **Caching choice.** Public pages stay shared ISR output: the server renders
  every toggle as "not saved", and `BookmarkProvider` reads the signed-in
  user's rows for the posts on screen in the browser after hydration (one
  query per page through the cookie-backed browser client, authorized by RLS).
  This follows the Next.js guidance to read request-specific data on the
  client when a route must stay static (`keeping-pages-static.md`); a
  server-side read would need cookies and make `/posts/[slug]` and the
  listings dynamic. The Server Action revalidates nothing, so a toggle never
  re-renders or expires public output. `next build` still lists `/` as static
  and `/posts/[slug]` and the archives as SSG with a 5-minute revalidate;
  `npm run test:smoke` checks that `/` is not marked private.
- **Saved list.** `/account/saved` reads through the session cookie, so it is
  dynamic (`Cache-Control: no-store`) and inherits `noindex` from the account
  layout. The query (`features/bookmarks/queries.ts`) embeds posts as an inner
  join filtered to `published`, so a post unpublished after it was saved
  disappears without its title or body reaching the page. It has empty and
  error states, and `/account` links to it.

Tests: `bookmarks.rls.test.ts` covers one bookmark per pair, two readers
saving the same post independently, user isolation on read and delete, an
insert in another user's name, no updates, drafts refused for readers,
editors, and admins, a nonexistent post, anonymous denial, the
`bookmark.create` limit, the saved list order, an unpublished post vanishing
from the reader's and an editor's list without leaking, the post and account
cascades, and the deletion preflight. The Phase 10 role matrix gains a
bookmark row for anonymous, reader, author, editor, and admin. Unit tests cover
`safeReturnPath`, the action's error mapping, saved-row mapping, and a guard
that the action never takes a user id from the client.

## Comments (Phase 13)

Signed-in users with a display name comment on published posts. Comments are
flat (no replies), plain text, and post-moderated by decision D6: a comment is
public as soon as it is submitted, signed-in readers report it, and editors
and admins hide (reversible) or soft-delete it at `/admin/comments`. Reports
never hide a comment on their own; there is no auto-hide threshold. Migration
`20261023220000_comments.sql` adds:

- **Tables.** `comments(id, post_id, user_id, display_name, body, status,
  created_at, updated_at)` with `status in ('visible','hidden','deleted')`
  and a body CHECK of 1–2000 characters that must already be trimmed.
  `post_id` cascades from `posts`; `user_id` defaults to `auth.uid()` and
  references `profiles` with `ON DELETE SET NULL`. `comment_reports(id,
  comment_id, reporter_id, reason, created_at)` with `unique (comment_id,
  reporter_id)` and `reason in ('spam','abuse','off_topic','other')`; it
  cascades from the comment and from the reporter's profile. Indexes: a
  partial `(post_id, created_at) where status = 'visible'` (the public list),
  `(status, created_at desc)` (the queue), `(user_id, post_id, created_at
  desc)` (own comments, the duplicate guard, anonymization), and
  `comment_reports(reporter_id)`.
- **Column grants.** Clients can never select `comments.user_id` or
  `comment_reports.reporter_id`, so public listings cannot link comments to
  accounts and reporter identity stays private, even from moderators (the
  queue shows reasons and counts). Inserts are granted on `(post_id, body)`
  and `(comment_id, reason)` only; there is no update grant (no editing, and
  status only changes through the RPC).
- **RLS.** Comments: everyone selects `visible` rows of `published` posts;
  the author also selects their own rows in any status; editors and admins
  (`is_editor()`) select every row. Insert only as `auth.uid()`, with status
  `visible`, for a post that is published now (explicit status check, because
  members can read drafts). Delete only one's own row (a hard delete; its
  reports go with it). Reports: insert only as the reporter, for a comment
  that `is_reportable_comment()` says is visible, on a published post, and
  not the caller's own; the reporter reads their own reports, moderators read
  all. Anonymous visitors cannot write either table.
- **Insert trigger.** `prepare_comment_insert()` copies the display name from
  the author's profile into `display_name` (clients cannot choose it; a
  profile without a display name fails with `23502`), consumes
  `comment.create` (10 per user per hour, Phase 10 mechanism, `PT429`), and
  refuses the same body on the same post by the same author within ten
  minutes (`PT409`, a basic double-submit and paste-spam guard). Reports
  consume `comment.report` (20 per user per hour). The snapshot is not
  updated when the author later renames themselves.
- **Moderation.** `moderate_comment(comment_id, status)` (security definer,
  `is_editor()` only, `42501` otherwise) allows `visible ↔ hidden` and
  `visible | hidden → deleted`; a soft-deleted comment cannot change again
  (`23514`). Each change writes `comment.hide`, `comment.restore`, or
  `comment.delete` to `editorial_audit_log` and returns the post id and slug
  for cache invalidation.
- **Own comments.** `list_own_comment_ids(post_id)` returns the caller's
  visible comment ids on one post, so the browser can offer delete instead of
  report without exposing `user_id`.
- **Account deletion.** `prepare_own_account_deletion()` now also sets
  `user_id = null` on the caller's comments after removing bookmarks. A
  `BEFORE UPDATE OF user_id` trigger replaces the snapshot with the neutral
  label "Silinmiş kullanıcı" whenever `user_id` becomes null, so the
  `ON DELETE SET NULL` safety net anonymizes too. Bodies are kept; the
  caller's reports go with the profile cascade.

Application (`src/features/comments/`):

- **Rendering and caching.** Visible comments and their count are
  server-rendered into the ISR post page (`/posts/[slug]`, still SSG with a
  5-minute fallback), read through the anonymous client, and HTML-escaped
  plain text with preserved line breaks. Their Data Cache entries carry
  `post-comments:<postId>` and `public-comments` (`comments/cache.ts`).
  Creating, deleting, hiding, restoring, or soft-deleting a comment calls
  `updateTag("post-comments:<postId>")` (read-your-own-writes, Server Actions
  only) and `revalidatePath("/posts/<slug>")`, so only that post's page is
  regenerated; no listing, archive, or the sitemap shows comments. Account
  deletion calls `updateTag("public-comments")` and revalidates the
  `/posts/[slug]` pattern, because anonymization may touch any post. Reports
  change no public output and revalidate only `/admin/comments`.
- **Per-visitor controls.** `CommentViewerProvider` loads the visitor's state
  after hydration through the cookie-backed browser client (session, whether
  the profile has a display name, own comment ids, own reports), like the
  bookmark toggle, so nothing user-specific enters the shared page.
  Anonymous visitors get a sign-in link with `?next=`; a reader without a
  display name gets a link to `/account`.
- **Actions.** `createCommentAction`, `deleteOwnCommentAction`,
  `reportCommentAction`, and `moderateCommentAction` take the user from the
  verified session and only ids, the body, a reason code, or a status from
  the client. The body is normalized before insert (line endings, control
  characters, blank-line runs, trim, 2000 code points). Errors map to Turkish
  messages (`comments/model.ts`).
- **UI.** shadcn/ui `Textarea`, `Button`, `RadioGroup` (added for report
  reasons), `Badge`, and `Card`; delete and soft-delete ask for a second
  click; status messages use live regions. `/admin/comments` (dynamic,
  noindex via the admin layout) has `reported`, `visible`, `hidden`, and
  `deleted` filters (`?filter=`), newest first, 20 per page (`?page=`, Phase
  20); hide, restore, and delete report success through `?status=`; authors
  and readers get the access-denied view and no navigation link.

Tests: `comments.rls.test.ts` covers immediate visibility under the profile
name, anonymous denial, impersonation through `user_id`, `display_name`, or
`status`, drafts and missing posts refused for every role, the display-name
requirement, length and trim limits, the duplicate guard, the
`comment.create` and `comment.report` limits, `user_id` and `reporter_id`
never selectable, own-id listing, owner-only delete, no editing, one report
per reader, no reports on own or hidden comments, report privacy, reported
comments staying visible, moderation denied to anonymous, readers, and
authors, editor hide/restore with audit entries, admin soft delete being
final, moderators reading every status, unpublished posts hiding their
comments, and anonymization by the preflight and by the `ON DELETE SET NULL`
safety net. The Phase 10 role matrix gains a comment row. Unit tests cover
body normalization, input guards, error mapping, row mapping, and cache tags;
`npm run test:smoke` checks that post pages include the server-rendered
comment section, stay publicly cacheable, and that `/admin/comments`
redirects anonymous visitors to sign-in.

## Next increment

Phases 1–19 are implemented: authentication, editorial membership with
invitations and RLS, the content schema with taxonomy, credits, and public read
rules, draft authoring with metadata forms and a members-only preview, the
Tiptap body editor with a shared allowlist and a safe server-rendered renderer,
validated image uploads with reference-aware deletion, allowlisted YouTube
embeds, publishing with database-backed public pages, explicit ISR and cache
invalidation, and slug redirects, SEO metadata, Article JSON-LD, sitemap,
robots, sharing, and category/tag/author archives, and launch readiness (cache
invalidation map, conflict handling, write rate limits, error and loading
states, security headers, backup runbook, smoke test), self-service reader
accounts (Phase 11), taxonomy administration, author identity
administration, private bookmarks (Phase 12), post-moderated comments
(Phase 13), per-post language (Phase 14), public listing pagination
(Phase 15), post cover images (Phase 16), the Atom feed (Phase 17) and its
per-archive feeds (Phase 23),
profile pictures (Phase 18), full-text search (Phase 19), and the Phase 20
polish pack (publication confirmation, moderation feedback and paging, a
Back/Forward guard, admin return paths, more avatars, a default social image,
and a server-only search function). See
[ROADMAP.md](./ROADMAP.md) for the ordered increments and their decision gates.

Phase 21 opened post languages to any BCP 47 tag, and Phase 22 added the
Turkish, English, and German interface (cookie-selected, locale-free URLs).
Phase 24 replaced inline success messages with Sonner toasts.
Phase 25 added square avatar cropping before upload.
Phase 28 added admin-managed static pages (legal texts first) and the header
and footer menus.
Phase 26 separated a published post's working copy from its published
snapshot (republish, discard, immutable published versions).
All planned phases (1–26) are implemented; see ROADMAP.md for the open
gates. A new body node still changes the TypeScript allowlist, the database mirror, the fixtures, the editor, and the renderer
together. Author credits must remain separate from edit and publish
permissions. Launch itself still needs the D5 hosting, domain, and brand
decisions.
