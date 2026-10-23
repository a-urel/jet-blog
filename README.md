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
| `NEXT_PUBLIC_SITE_URL` | Public application origin used in invitation redirects and as `metadataBase` for canonical, Open Graph, JSON-LD, share-link, sitemap, and robots URLs. It must match the Supabase Auth site URL and redirect allowlist. Without it the site is `noindex`, `robots.txt` disallows everything, the sitemap is empty, and share controls are hidden. Local default: `http://localhost:3000`. Provisional until D5 picks the real domain. |
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
  redirected to `/login`. Signing out clears the cookies and returns to the
  sign-in page.
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
  both the Server Components and the browser response. Proxy matchers cover
  `/admin`, `/account`, `/login`, and `/signup`, so public pages do not pay for
  session checks. It keeps the editorial (`/admin`) and reader (`/account`)
  route groups separate and only redirects signed-out visitors of either to
  `/login`; editorial access is decided by the admin layout, never by Proxy.
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

### Bootstrap the first local admin

Start the local stack and read its dynamic URLs:

```bash
supabase start --runtime native
supabase status
```

Open the `Studio` URL from the status output, go to **Authentication > Users**,
and choose **Add user**. Enter an email and password and enable **Auto Confirm
User** (email confirmation is required since Phase 11, and editorial membership
refuses an unconfirmed self-service account). Then open the SQL
Editor and grant the first admin:

```sql
insert into public.editorial_members (profile_id, role)
select profiles.id, 'admin'
from public.profiles
join auth.users on auth.users.id = profiles.id
where lower(auth.users.email) = lower('you@example.com')
on conflict (profile_id) do update
set role = 'admin', deactivated_at = null;
```

Replace the placeholder email. The profile trigger creates the `profiles` row.
Verify the result and then sign in at `/login`:

```sql
select auth.users.email, editorial_members.role, editorial_members.deactivated_at
from public.editorial_members
join auth.users on auth.users.id = editorial_members.profile_id;
```

This is a local/hosted bootstrap operation, not seed data or a public route. Do
not commit real credentials. Once signed in, invite additional admins through
`/admin/members`; do not bootstrap every account manually.

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
- Concurrency (D3): one working copy with an integer `revision`. The Phase 4
  update RPC compares the submitted revision with the stored one and rejects a
  stale form instead of overwriting newer changes. There is no published
  snapshot; an edit to a published post changes public content immediately, and
  `updated_at` drives the "Güncellendi" label added in Phase 8.
- RLS: anonymous visitors and signed-in readers see only published posts, their
  credits, tags, and credited author identities. Editors read every post and
  relation. Authors read their own drafts and their relations. Categories and
  tags are public metadata. Clients have no direct write grants; draft-authoring
  writes go through the centralized Phase 4 RPCs.
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
- `/admin/posts/[id]` reopens a post. Authors may edit only drafts they created;
  editors and admins may edit any draft or published post. A credit grants no
  edit access, and a published post is read-only for authors.
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
  any post body references (`23503`), then the Storage object is removed with
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
  Publish/Unpublish only to editors and admins (`canPublishPosts`). Publishing
  uses the last saved revision, not unsaved form edits.
- **"Güncellendi".** Publishing sets `updated_at` and `published_at` to the
  same transaction time, so `PostMeta` shows "Güncellendi" only when
  `updated_at > published_at`, that is, after an edit to a live post (D3: edits
  to published posts are public immediately).
- **Slug redirects.** `public.post_slug_redirects(old_slug, post_id)` records
  the old slug when a *published* post's slug changes (trigger
  `posts_maintain_slug_redirects`, so every write path is covered). Redirects
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

## SEO, sharing, and archives

Phase 9 makes published content discoverable and shareable. Nothing in it
needs a migration: archives reuse the Phase 3 RLS policies and indexes.

- **Post metadata.** `features/seo/metadata.ts` builds title, description,
  canonical `/posts/<slug>`, Open Graph (`article` with published/modified
  time, authors in credit order, section, tags, `tr_TR`, site name), and a
  text-only Twitter `summary` card (posts have no cover image yet). Paths stay
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
  `/categories/[slug]`, `/tags/[slug]`, `/authors/[slug]`, and `/sitemap.xml`.
  Taxonomy and author administration apply the same invalidation; only
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

## Structure and sample content

```text
src/
  app/
    admin/                # Protected editorial shell and member administration
    admin/media/          # Media library with reference-aware deletion
    admin/members/        # Admin-only member list and actions
    admin/categories/     # Admin-only category tree, create, edit, move, delete
    admin/tags/           # Admin-only tags, create, edit, delete
    admin/posts/          # Draft list, create, edit, and members-only preview
    account/              # Reader account: display name, sign-out, deletion
    account/password/     # Change or recover the password (signed in)
    auth/confirm/         # Invite fragment/session confirmation
    auth/callback/        # Sign-up confirmation (PKCE code exchange)
    auth/recovery/        # Password recovery (PKCE code exchange)
    login/                # Sign-in for readers and editorial members
    login/password/       # Set-password step for invited users
    login/reset/          # Password reset request
    signup/               # Self-service reader sign-up
    posts/[slug]/         # Public post page (ISR) with slug redirects
    categories/[slug]/    # Category archive including descendants
    tags/[slug]/          # Tag archive
    authors/[slug]/       # Author archive
    sitemap.ts, robots.ts # Published-content sitemap and crawler rules
  components/ui/          # Generated shadcn/ui controls
  features/
    account/              # Display name and account deletion actions
    auth/                 # Sign-in, sign-up, reset, password policy, Auth rate limits
    media/                # Upload validation, upload/delete actions, URLs
    members/              # Invite, role, and activation Server Actions
    seo/                  # Metadata, Article JSON-LD, sitemap and robots builders
    sharing/              # Copy link and provider share links
    taxonomy/             # Hierarchy and tree helpers, admin data, validation, actions
    posts/
      admin/              # Draft data, validation, permissions, form, editor, actions
      components/         # Shared post presentation and read-only body renderer
      content/            # Body allowlist, editor extensions, shared fixtures
      admin/publication.ts  # Publication error keys and copy
      archives.ts         # Public paths and archive derivation
      cache.ts            # Data Cache tag for public post reads
      data.ts             # Anonymous, RLS-filtered public queries
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
      archives.rls.test.ts        # Archives and sitemap input by role
      editorial-rls.rls.test.ts # Membership and audit RLS tests
      reader-accounts.rls.test.ts # Self-service reader matrix, deletion, limits
      taxonomy-admin.rls.test.ts  # Taxonomy RPCs, moves, redirects, deletion
    app-origin.ts         # Origin for Auth email redirects
  proxy.ts                # Next.js 16 token refresh (formerly middleware)
supabase/
  config.toml             # Local auth config, reader sign-up, seeds enabled
  migrations/             # Versioned schema, RLS, functions, and triggers
  seeds/seed.sql          # Synthetic taxonomy and posts, never production data
scripts/
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

The local config disables public registrations; the email provider stays enabled
for password sign-in. The first admin must be created through Studio and SQL as
described in [Bootstrap the first local admin](#bootstrap-the-first-local-admin).
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
  (both are cached Route Handlers unless they use request-time APIs).
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
  with `updateTag` before `revalidatePath`. Publish, unpublish, and any save of
  a published post (title, slug with its redirect, excerpt, body including
  images and YouTube nodes, category, tags, credits) expire the `public-posts`
  Data Cache tag and revalidate `/`, `/posts/[slug]`, `/categories/[slug]`,
  `/tags/[slug]`, `/authors/[slug]`, and `/sitemap.xml`. Saving a draft no
  longer touches public caches (the action reads the saved status; if it
  cannot, it invalidates). Media upload and deletion change nothing public:
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
  covers Postgres and Storage, local and hosted, with consistency checks and the
  exercised local drill (dump, reset, restore, identical fingerprints and image
  checksum).
- **Smoke test.** `npm run test:smoke` (`SMOKE_BASE_URL`, default
  `http://localhost:3000`) checks a running server anonymously: listing and
  first post render with JSON-LD, unknown post and tag URLs return `noindex`
  404s, `/admin` redirects to `/login`, `robots.txt` and `sitemap.xml` are
  public-only, and every response has the security headers without eval.

Hosting checklist (open until D5 is decided): set `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_SITE_NAME` before the production build, add the origin to the
Supabase Auth site URL and redirect allowlist, keep `SUPABASE_SECRET_KEY` in
the host's server-only secrets, enable HSTS at the edge, configure a shared
cache handler or a single instance so `updateTag` reaches every instance,
review the hosted Auth rate limits and SMTP, apply the reader-account Auth
settings (confirm email and confirm phone on, `letters_digits` password rule,
the `/auth/callback` and `/auth/recovery` redirect URLs, production SMTP, and
reviewed Turkish confirmation and recovery templates using the `token_hash`
links), schedule database and Storage
backups, revisit D4 (draft images are public by URL), and run
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
  confirmation), `/auth/recovery` (reset link), `/account` (display name,
  password change, sign-out, deletion), and `/account/password`. All are
  dynamic and `noindex`; the public header links to `/account` statically so
  public pages stay prerendered.
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
  `member.account_deletion` audit entry. Phase 12 deletes the user's bookmarks
  and Phase 13 anonymizes their comments inside
  `prepare_own_account_deletion()`, before the Auth user is deleted.
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

## Next increment

Phases 1–11 are implemented: authentication, editorial membership with
invitations and RLS, the content schema with taxonomy, credits, and public read
rules, draft authoring with metadata forms and a members-only preview, the
Tiptap body editor with a shared allowlist and a safe server-rendered renderer,
validated image uploads with reference-aware deletion, allowlisted YouTube
embeds, publishing with database-backed public pages, explicit ISR and cache
invalidation, and slug redirects, SEO metadata, Article JSON-LD, sitemap,
robots, sharing, and category/tag/author archives, and launch readiness (cache
invalidation map, conflict handling, write rate limits, error and loading
states, security headers, backup runbook, smoke test), self-service reader
accounts (Phase 11), taxonomy administration, and author identity
administration. See
[ROADMAP.md](./ROADMAP.md) for the ordered increments and their decision gates.

Next: Phase 12 (bookmarks) per ROADMAP.md. A new body node still changes the TypeScript
allowlist, the database mirror, the fixtures, the editor, and the renderer
together. Author credits must remain separate from edit and publish
permissions. Launch itself still needs the D5 hosting, domain, and brand
decisions.
