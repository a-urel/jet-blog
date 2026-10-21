# jet-blog

A small multi-author blog scaffold in one Git repository: Next.js App Router,
TypeScript, shadcn/ui, and Supabase infrastructure.

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
required for the sample pages.

Try `/yazi/kucuk-adimlarla-baslamak`, follow the back link, and visit an unknown
post slug to see the 404 page.

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

`typecheck` generates Next.js route types before checking TypeScript, so it also
works before the first build. `npm start` serves the production build.

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

Debug configurations use http://127.0.0.1:3107 and bind the server to loopback.
Stop any existing development server for this project before starting a
full-stack or server-side session to avoid port and `.next/dev` lock conflicts.
For client-only debugging, first run
`npm run dev -- --hostname 127.0.0.1 --port 3107`.
Stop a full-stack session with `Shift+F5`; its browser debug session stops with
the server. For the server-side debug terminal, use `Ctrl+C` to stop the server.

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

When you are ready to use Supabase, copy the placeholder file:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL from Supabase's Connect dialog, or the local CLI output. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable API key for that project. |

Restart the development server after changing these values. `NEXT_PUBLIC_*`
values are included in the browser bundle at build time. Never put a secret or
service-role key in them. Real environment files are ignored by Git.

The public-only browser and server client factories in `src/lib/supabase/`
validate configuration **when called**, not when imported. Calling them without
configuration throws an explicit error; the sample pages never call them.
The server client uses the publishable key, does not bypass RLS, and does not
carry a signed-in user's identity. Session persistence, OAuth detection, and
token refresh are deliberately disabled in both clients.

**Authentication is not implemented.** Before adding signed-in operations,
replace/extend these public-only factories with the official `@supabase/ssr`
cookie-based clients and the Next.js Proxy token-refresh integration. Do not use
the anonymous server factory for user authorization.

## Structure and sample content

```text
src/
  app/                    # Server-rendered home, /yazi/[slug], and 404
  components/ui/          # Generated shadcn/ui controls
  features/posts/
    components/           # Shared post presentation
    data.ts               # Explicit sample data access boundary
    sample-data.ts        # Synthetic posts, ordered credits, taxonomy
    types.ts              # Read-only view models, not database definitions
  lib/supabase/           # Lazy public-only browser/server clients
supabase/
  config.toml             # Generated with Supabase CLI 2.121.0
  migrations/             # Reserved for future versioned migrations
  seeds/                  # Reserved for future synthetic database seeds
```

Pages import `features/posts/data.ts`, not the fixtures directly. Replace this
boundary with authorized public queries in a later slice; sample content is
never a fallback for failed database requests. Posts have stable sample UUIDs,
ordered author credits, one category (with a parent reference), and multiple
tags. No taxonomy archive or editorial permission model is implemented.

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
and Button are generated components. Add only components needed by a feature:

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

To configure the application clients, copy only `API_URL` and `PUBLISHABLE_KEY`
from `supabase status` into the corresponding `NEXT_PUBLIC_*` variables described
above. Do not export the full status environment into a client-facing file: it
also contains secret and service-role keys. Restart Next.js after configuring it.

No application tables, SQL functions, RLS/Storage policies, buckets, login flow,
or publishing permissions exist. Seeding is disabled until actual seed files
are introduced. Create future migrations with `supabase migration new <name>`
and keep all related changes in this repository. Add optional Edge Functions
only when there is a concrete need.

## Documentation checked for this setup

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
  and [App Router page API](https://nextjs.org/docs/app/api-reference/file-conventions/page)
  for Next.js 16.4.2 and React 19.3.0.
- [shadcn/ui Next.js setup](https://ui.shadcn.com/docs/installation/next),
  [theming](https://ui.shadcn.com/docs/theming), and CLI 4.22.1 help.
- [Tailwind dark mode](https://tailwindcss.com/docs/dark-mode) for Tailwind 4.3.3.
- [Supabase JS initialization](https://supabase.com/docs/reference/javascript/initializing)
  for supabase-js 2.118.0, [SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
  [changelog](https://supabase.com/changelog), and CLI 2.121.0 help.

## Next increment

Confirm editorial roles, who can publish, shared editing, and updates to live
posts **before** implementing authentication, schema migrations, or permission
policies. Author credits must remain separate from edit/publish permissions.