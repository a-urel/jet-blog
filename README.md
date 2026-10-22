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

Open http://localhost:3000. No environment variables or Supabase instance are
required for the public sample pages.

Try `/yazi/kucuk-adimlarla-baslamak`, follow the back link, and visit an unknown
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
| `SUPABASE_SECRET_KEY` | Server-only secret key used by the invitation action and admin client. Required for `/admin/uyeler`. |
| `NEXT_PUBLIC_SITE_URL` | Public application origin used in invitation redirects. It must match the Supabase Auth site URL and redirect allowlist. Local default: `http://localhost:3000`. |

Restart the development server after changing these values. `NEXT_PUBLIC_*`
values are included in the browser bundle at build time. Never put a secret or
service-role key in them. Real environment files are ignored by Git.

For the local stack, use `API_URL` and `PUBLISHABLE_KEY` from `supabase status`.
Use `SECRET_KEY` for `SUPABASE_SECRET_KEY`; do not use the legacy service-role
key in browser code. Hosted projects should use the server-only secret key from
the project's API settings. The secret key must never be exposed through a
`NEXT_PUBLIC_*` variable, a Client Component, logs, or committed files.

The public sample pages work without these variables. The sign-in page shows a
configuration notice, and `/admin` redirects to it, when Supabase is not
configured. Invalid URLs still fail loudly rather than being silently ignored.

## Authentication and editorial membership

Editorial access is invite-only. There is no public sign-up route and the local
Supabase configuration disables new sign-ups. Sign-in uses email and password
through Supabase Auth. Public reader accounts are planned for Phase 11; they will
not grant editorial access, and an authenticated user without an active
editorial membership is treated as a reader.

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

- `/giris` signs in an existing user and redirects signed-in visitors to
  `/admin`.
- `/admin` is a protected layout. The server verifies the session on every
  request with `supabase.auth.getClaims()`, loads the current membership, and
  denies users without an active grant. Missing or invalid sessions are
  redirected to `/giris`. Signing out clears the cookies and returns to the
  sign-in page.
- `/admin/uyeler` is the admin-only member list. Invite, role-change, and
  activation Server Actions re-check the caller and use database RPCs for the
  write plus its audit entry.
- `/admin/posts` is the editorial content surface. Authors see their own drafts,
  editors and admins see every post, and edit links follow the same permission
  rule the mutation RPC enforces. `/admin/posts/[id]/onizleme` is a
  members-only, `noindex`, dynamically rendered preview.
- `/auth/confirm` handles the fragment returned by Supabase's invite link,
  applies the session, and forwards to `/giris/parola`. The invitee sets a
  password before continuing to `/admin`.
- `src/proxy.ts` refreshes expired Auth tokens and copies refreshed cookies to
  both the Server Components and the browser response. Proxy matchers cover
  `/admin` and `/giris`, so public pages do not pay for session checks.
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
User** (local email confirmations are disabled by default). Then open the SQL
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
Verify the result and then sign in at `/giris`:

```sql
select auth.users.email, editorial_members.role, editorial_members.deactivated_at
from public.editorial_members
join auth.users on auth.users.id = editorial_members.profile_id;
```

This is a local/hosted bootstrap operation, not seed data or a public route. Do
not commit real credentials. Once signed in, invite additional admins through
`/admin/uyeler`; do not bootstrap every account manually.

Deleting an Auth user cascades to its profile and membership. The last-admin
trigger blocks role demotion and deactivation, not Auth-user deletion, so ensure
another active admin exists before deleting an account.

The local configuration disables new registrations at the project level while
keeping the email provider enabled so existing users can sign in with a
password. Restart the stack after changing `supabase/config.toml` so the local
Auth service picks up the change. Self-service reader sign-up belongs to a later
phase.

### Invitations and local email

An admin invites by email at `/admin/uyeler`, choosing a role and an optional
display name. A new email receives Supabase's invite email; an existing Auth
user is granted membership without a new invite. The invitee follows the link
to `/auth/confirm`, sets a password at `/giris/parola`, and then sees the
role-appropriate admin overview.

Local emails are captured by Mailpit; use the `Mailpit` URL from
`supabase status` rather than expecting a real inbox. The local Auth configuration
allows 30 invitation emails per hour and requires passwords of at least 8
characters. The application also limits an admin to 20 invitation attempts per
hour. The experimental local stack cannot serve custom email templates in this
setup, so invitations use Supabase's default template; configure SMTP and an
email template before a hosted launch.

## Content schema and taxonomy

Phase 3 adds the content tables, but public pages still read
`features/posts/sample-data.ts`; the database-backed pages arrive in Phase 8.

- `categories` is hierarchical through `parent_id`. A trigger rejects
  self-parenting and longer cycles on insert and move, and a transaction-scoped
  advisory lock serializes concurrent moves. Deleting a category is restricted
  while children or posts reference it; posts are never cascade-deleted.
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
  `updated_at` is available for a "Güncellendi" label in Phase 8.
- RLS: anonymous visitors and signed-in readers see only published posts, their
  credits, tags, and credited author identities. Editors read every post and
  relation. Authors read their own drafts and their relations. Categories and
  tags are public metadata. Clients have no direct write grants; draft-authoring
  writes go through the centralized Phase 4 RPCs.
- `authors.user_id` stays internal: clients can select only the public identity
  columns (`id`, `name`, `slug`, `bio`, timestamps). Active editorial members get
  an additional select policy over those columns so they can build author
  credits, but the account link remains unavailable. Author administration is a
  deferred follow-up and will need an explicit server-side path to change it.

`supabase db reset` reloads `supabase/seeds/seed.sql`: three synthetic published
posts that mirror the sample slugs, one draft, categories, tags, and guest author
profiles. Seeds never create Auth users or credentials, and they are separate
from production data.

## Draft authoring

Phase 4 adds the editorial metadata surface at `/admin/posts`:

- `/admin/posts` lists the posts the signed-in member may read. Authors see their
  own drafts; editors and admins see every draft and published post. Edit links
  appear only for rows the member may change; the database repeats the check.
- `/admin/posts/yeni` creates a draft with title, slug, excerpt, category, tags,
  and ordered author credits. An empty slug is derived from the title.
- `/admin/posts/[id]` reopens a post. Authors may edit only drafts they created;
  editors and admins may edit any draft or published post. A credit grants no
  edit access, and a published post is read-only for authors.
- `/admin/posts/[id]/onizleme` is a read-only members-only preview. It uses
  `force-dynamic`, sends `noindex`, and is not linked from public routes. A draft
  remains absent from `/yazi/[slug]` and public listings.
- Taxonomy and author records come from the seed. Their administration screens
  are a deferred follow-up, not part of Phase 4.

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

## Structure and sample content

```text
src/
  app/
    admin/                # Protected editorial shell and member administration
    admin/uyeler/         # Admin-only member list and actions
    admin/posts/          # Draft list, create, edit, and members-only preview
    auth/confirm/         # Invite fragment/session confirmation
    giris/                # Invite-only sign-in
    giris/parola/         # Set-password step for invited users
    yazi/[slug]/          # Public sample post page
  components/ui/          # Generated shadcn/ui controls
  features/
    auth/                 # Sign-in, invite confirmation, password actions
    members/              # Invite, role, and activation Server Actions
    posts/
      admin/              # Draft data, validation, permissions, form, actions
      components/         # Shared post presentation
      data.ts             # Explicit sample data access boundary
      sample-data.ts      # Synthetic posts, ordered credits, taxonomy
      types.ts            # Read-only view models, not database definitions
  lib/
    auth/
      editorial.ts        # Request-scoped membership and role helpers
      session.ts          # Server-verified session helper
      session.test.ts     # Mocked-cookie unit tests
    slug.ts               # Shared slug and name normalization
    slug.test.ts          # Turkish transliteration and normalization tests
    supabase/
      admin.ts            # Server-only secret-key client
      content-rls.rls.test.ts    # Content and taxonomy RLS tests
      draft-authoring.rls.test.ts # Draft RPC and revision-conflict tests
      editorial-rls.rls.test.ts # Membership and audit RLS tests
  proxy.ts                # Next.js 16 token refresh (formerly middleware)
supabase/
  config.toml             # Local auth config, sign-ups disabled, seeds enabled
  migrations/             # Versioned schema, RLS, functions, and triggers
  seeds/seed.sql          # Synthetic taxonomy and posts, never production data
scripts/
  run-rls-tests.mjs       # Loads local Supabase env and runs integration tests
vitest.config.mts         # Unit test configuration
vitest.rls.config.mts     # RLS integration test configuration
```

Pages import `features/posts/data.ts`, not the fixtures directly. Replace this
boundary with authorized public queries in Phase 8; sample content is never a
fallback for failed database requests. Posts have stable sample UUIDs, ordered
author credits, one category (with a parent reference), and multiple tags. The
database schema now mirrors that shape, and the development seed reuses the same
stable UUIDs and slugs. Taxonomy archives, database-backed post pages, and
publishing mutations are still later phases.

The sample body is plain structured text rendered by React, **not** a Tiptap
document or arbitrary HTML. Tiptap, image uploads to Supabase Storage, and
YouTube embeds remain selected for later increments; their packages, buckets,
and workflows are intentionally not added yet.

Turkish sample copy and generic labels are provisional, not a brand or language
decision. Sample pages are prerendered at build time, including their body text,
with no Supabase requests or editor bundle. They have title/description metadata
and `noindex, nofollow`. Production canonical URLs, sharing, sitemap, and Article
structured data require the real publication/domain and are deferred.

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
The application sample pages do not need the CLI or a database.
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
replacement, metadata validation, and the editorial author-read policy. Seeding
is enabled: `supabase/seeds/seed.sql` loads synthetic taxonomy and posts, never
production data. Storage policies, buckets, media, publishing mutations, and
public database reads are still later phases. Create future migrations with
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

## Next increment

Phases 1–4 are implemented: authentication, editorial membership with
invitations and RLS, the content schema with taxonomy, credits, and public read
rules, and draft authoring with metadata forms and a members-only preview. Public
pages still use the sample fixtures. See [ROADMAP.md](./ROADMAP.md) for the
ordered increments and their decision gates.

Phase 5 adds the Tiptap editor and a shared safe read-only renderer: JSONB body
with `content_version`, a node/attribute allowlist, write-boundary validation,
and server-rendered content without the editor bundle. Verify current
Tiptap/React 19 compatibility before adding packages. Taxonomy and author
identity administration remain explicit follow-up increments; do not widen Phase
5 to include them. Answer D4 before media work in Phase 6 and D5 before Phase 8
finalizes canonical URLs and the sitemap. Author credits must remain separate
from edit and publish permissions.