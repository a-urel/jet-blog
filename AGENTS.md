# AGENTS.md

## Purpose and working style

Build an extensible, multi-author blog using Next.js and Supabase. Deliver small, working increments. Do not turn this into a general-purpose CMS or a social network.

- Discuss requirements and report progress in Turkish. Use English for code, identifiers, and technical documentation.
- Inspect the repository and existing instructions before changing code. Preserve established conventions.
- Implement the requested task through validation; do not stop at a plan.
- Make reasonable, reversible implementation choices. Ask only when an unresolved product decision materially changes scope, permissions, or the data model.
- Do not invent requirements. Distinguish confirmed decisions from provisional defaults below.
- Consult current official documentation for version-sensitive APIs. Never assume a remembered Next.js, Supabase, or Tiptap API is current.
- Do not rewrite unrelated code, add speculative abstractions, or introduce dependencies without a concrete need.

## Confirmed decisions

- Next.js and Supabase are the selected stack.
- Use one Git repository for the Next.js application and Supabase infrastructure definitions. Keep AGENTS.md and package.json at the repository root, application code in src/, and Supabase config, migrations, seed data, and optional Edge Functions in supabase/. Do not create separate frontend/backend repositories or a workspace monorepo toolchain without a concrete requirement. Commit application changes and their related migrations together. The hosted Supabase project remains an external service; database contents, uploaded files, and real credentials do not belong in Git.
- shadcn/ui is required for the application UI, including the administration panel and reusable public-facing controls.
- Support light and dark mode from the first increment, automatically following the operating system/browser preference (prefers-color-scheme), including changes while the application is open. Do not add a theme selector, manual override, or persisted theme preference.
- A post can have multiple credited authors, with an explicit display order.
- A post belongs to one category. Categories may be hierarchical.
- A post can have multiple tags.
- Uploaded media and database content are separate resources.
- The architecture must allow incremental extension.

## Provisional defaults

These are implementation recommendations, not previously approved product requirements. Use them for reversible scaffolding; confirm before implementing dependent permission rules or publication workflows.

- One publication, multiple authors; independent user-created blogs are outside the initial scope.
- TypeScript, Next.js App Router, and a single application for public pages and administration.
- Tiptap with JSON content, image upload, and a YouTube extension.
- Public published posts; no paid or private posts initially.
- Invite-only editorial accounts; reader accounts are a separate concern.
- Initial roles and publishing permissions remain to be decided. Author credits must not implicitly grant edit access.
- Draft/review/publish/archive transitions, shared editing permissions, and editing of already-published posts remain to be decided.
- Start with SEO and sharing. Likes and comments can follow as separate increments.
- Language, brand, domain, visual design, and hosting provider remain open. Do not hardcode sample branding into application logic.

## Architecture

- Prefer a modular monolith. Keep presentation, feature logic, and database access understandable and separate where useful.
- Use shadcn/ui components as the UI foundation. Reuse and customize the generated components; do not introduce a competing component library such as MUI, Ant Design, or Chakra UI. Preserve accessible behavior and use consistent Tailwind CSS styles and design tokens. Bespoke components are appropriate when shadcn/ui does not cover a requirement. Integrate Tiptap with this design system rather than replacing the selected editor.
- Apply semantic light/dark design tokens throughout public pages, administration, Tiptap, dialogs, forms, code blocks, and loading/error states. Avoid hardcoded light-only colors. Prefer CSS-driven system theme detection where practical; if a theme library is needed, use system-only behavior. Prevent incorrect-theme flashes and hydration mismatches without delaying the entire application until client mount. Verify readability, focus indicators, and contrast in both system themes.
- Organize around features such as posts, taxonomy, media, and editorial access. Avoid generic repository frameworks or microservices.
- Use Server Components for public reading where appropriate; use Client Components for interactive editing.
- Centralize important mutations such as publishing, invitations, and permission changes. Validate input and authorization on the server.
- Do not add another backend service when Next.js server functionality or Supabase already meets the requirement.
- Use the repository's existing package manager and lockfile. On a new project, select one and use it consistently.
- Pin compatible dependency versions; commit the lockfile. Do not upgrade unrelated packages during feature work.

## Data model and migrations

- Use stable UUID identifiers. Slugs are mutable URL identifiers, never foreign keys.
- Store timestamps with time zones. Define publication timestamps separately from creation/update timestamps.
- Express integrity with foreign keys, unique constraints, CHECK constraints, and transactions where appropriate.
- Track every schema, function, index, and RLS change in versioned Supabase migrations. Do not leave dashboard-only changes undocumented.
- Keep development seed data synthetic and separate from production data.
- Add indexes for actual query patterns, including foreign-key joins and published-post listings; avoid speculative indexing.

### Posts and authors

- Keep creator identity, credited authorship, and editing/publishing permissions distinct.
- Model author credits through post_authors(post_id, author_id, sort_order), unique on (post_id, author_id).
- Author profiles may optionally link to an authenticated user; allow guest author credits without creating login accounts.
- Do not assume all credited authors may edit, or all editors must be credited authors.
- Store editor content as JSONB with an explicit content_version. Validate supported node types and attributes at write boundaries.
- Keep title, slug, excerpt, cover media reference, and SEO metadata outside the editor document.
- If concurrent editing is enabled, detect stale updates using an atomic revision comparison. Do not silently overwrite another editor's changes.
- If unpublished revisions of live posts are required, separate working content from the published snapshot. Never expose unapproved draft edits through public queries or caches.

### Categories and tags

- posts.category_id represents the single category. Do not add a post_categories join table or a primary-category flag.
- categories: id, name, slug, description, parent_id, sort_order.
- Prevent category cycles on the server/database, including during moves. A self-reference CHECK alone does not prevent longer cycles.
- Attach a post to its selected category only. Parent archive pages may include descendants through hierarchy queries.
- Make `posts.category_id` nullable at the database level and enforce the category requirement in the server-side publish mutation (not via `NOT NULL`).
- tags: id, name, slug, description; post_tags has a unique (post_id, tag_id) pair.
- Define a consistent normalization policy to prevent accidental duplicate tags and slug collisions.
- Use category-independent post URLs, for example /yazi/[slug]. Record redirects when published URLs change.
- Define deletion/reassignment behavior before implementing category deletion; never cascade-delete posts accidentally.

### Media

- Store binary files in Supabase Storage and references/metadata in a media table.
- Retain bucket/object path, uploader, MIME type, and size; generate delivery URLs rather than treating expiring signed URLs as permanent identifiers.
- Store contextual alt text/captions with the image occurrence when appropriate.
- Choose public/private buckets intentionally. Public buckets do not protect unpublished media merely because a post is a draft.
- Validate uploads server-side; restrict types and sizes. Avoid arbitrary HTML/SVG execution.
- Do not delete an object still referenced by another post or revision.
- Store YouTube references as structured content nodes; do not upload YouTube video files. Allowlist supported embed providers and render responsive embeds.

## Security

- Enable and explicitly define RLS on application tables exposed through Supabase. Configure Storage policies too.
- Anonymous users may read only publicly published content, including through joins, search, API routes, author pages, and taxonomy archives.
- Users must not grant themselves roles, impersonate authors, or modify other users' content without explicit permission.
- Use the current official Supabase SSR authentication pattern. Verify identity on the server; do not trust a client-provided user ID or unverified session payload.
- Keep secret/service-role keys server-only. Normal user operations should preserve user-scoped authorization; do not bypass RLS as a shortcut.
- Never put credentials in code, logs, fixtures, or commits. Provide a placeholder-only .env.example.
- Render editor content through controlled nodes. Sanitize any accepted HTML and validate link/embed URL schemes.
- Rate-limit abuse-prone write operations when introduced, especially invitations, comments, and uploads.
- Do not perform destructive production migrations, deploy publicly, or send invitations/messages without task authorization.

## Rendering, SEO, and caching

- Public post bodies must be available as server-rendered or prerendered HTML, independent of loading the editor bundle.
- Keep the editor and read-only renderer aligned on supported document nodes. Provide a controlled fallback for unsupported content versions.
- Supply metadata, canonical URLs, Open Graph previews, sitemap, robots configuration, and Article structured data for public posts.
- Keep drafts, previews, admin pages, and unauthorized content out of public caches and discovery feeds.
- Invalidate affected post, listing, taxonomy, author, and sitemap caches after relevant publication changes. Make cache behavior explicit for the installed Next.js version.
- A post listed under several tags still has one canonical post URL.
- Share via copy-link and provider share links initially; avoid unnecessary social API integrations.
- Prefer responsive images/embeds and accessible, keyboard-usable controls.

## Extension boundaries

- Keep likes, comments, subscriptions, and notifications as separate features instead of growing the posts table into a catch-all.
- When likes are added, enforce one like per (post_id, user_id) at the database level.
- When comments are added, decide moderation, visibility, deletion, and rate limits before enabling public writes.
- Keep slow external side effects out of core database transactions. Introduce durable jobs, retries, and idempotency when email or similar features require them.
- Do not implement real-time collaborative editing, multi-publication tenancy, billing, AI writing, or a plugin system without an explicit request.

## Validation and delivery

- Add meaningful tests for authorization, publication visibility, taxonomy cycles, and stale-update protection when those behaviors are implemented.
- Test access as anonymous, authorized, and unauthorized users. A service-role-only test does not validate RLS.
- Run the applicable lint, typecheck, tests, and production build using actual repository scripts. Do not claim unrun checks passed.
- Verify one complete user journey per increment, including an error/denied-access path where relevant.
- Use migrations that work on a clean development database; test upgrade behavior when existing data is affected.
- Keep changes small and reviewable. Do not commit or push unless requested or authorized by repository instructions.
- Report what changed, checks run, remaining limitations, and the next concrete step in concise Turkish.
- Before public launch, document and exercise restoration of both database and Storage data. A database export alone is not a complete backup.

## Suggested first vertical slice

1. Inspect/bootstrap the project and document setup commands.
2. Establish authentication and migrations. Before writing RLS or publishing policies, ask the user to confirm the initial role set (e.g. admin/editor/author) and who may publish; if the user has already answered in the task, proceed without asking.
3. Create and save a draft with category, tags, and ordered author credits.
4. Add Tiptap editing, image upload, and YouTube embedding incrementally.
5. Publish and display a post publicly with metadata and correct visibility.
6. Verify unauthorized access, caching, and update behavior before expanding scope.

Do not implement this entire list in one task. Complete the currently requested slice and leave the repository working.
