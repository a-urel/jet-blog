F1 [major] Local restore
claim: `db reset --sql-paths restore/before-data.sql --sql-paths data.sql` loads the dump "instead of the seed", and the drill must prove the bytes came from the backup.
evidence: `supabase/config.toml` `[storage.buckets.media]` sets `objects_path = "./seeds/media"`, so `db reset` uploads the nine seed images to the `media` bucket on every reset (seed.sql "Media library samples" comment confirms); the runbook never mentions this, and the 2026-11-14 drill had only 3 media rows, so it predates the seed library.
fix: State whether bucket seeding runs under `--sql-paths`, and if so how the seed objects affect the Storage restore, the `storage.objects(stable cols)` fingerprint and the "bytes from the backup" proof; re-drill.

F2 [minor] Hosted backup and restore (Supabase platform)
claim: "Bucket settings come from the migrations."
evidence: The hosted restore runs `roles.sql`, `schema.sql` and `data.sql` through `psql` and never runs `supabase/migrations/`; the data dump excludes only `storage.objects`, `storage.buckets_vectors` and `storage.vector_indexes`, so bucket rows arrive from `data.sql`.
fix: Say that on the hosted path bucket rows come from the data dump, and that `manifest.json` is compared against them.

F3 [minor] Backup and restore runbook (intro, part 3 "Storage ownership")
claim: The owners backup records `storage.objects.owner_id` "for every object".
evidence: `scripts/storage-owners.mjs` `export` selects `from storage.objects where owner_id is not null`, so ownerless objects (secret-key uploads, seed media with `uploaded_by` null) are not listed.
fix: Say "every owned object" and note that ownerless objects are intentionally absent from `owners.json`.

F4 [minor] Local restore
claim: "Restart `next start` afterwards (or wait for the 5-minute ISR fallback) so cached public pages do not show pre-restore content."
evidence: ROADMAP "Where to resume" says a stale ISR page referring to removed data requires clearing `.next/cache/fetch-cache` before `next build`; the Data Cache persists on disk across a restart. The 300-second fallback is confirmed by `export const revalidate = 300` in `src/app/[locale]/page.tsx` and the post page.
fix: Replace "restart" with "clear `.next/cache/fetch-cache` and rebuild, or wait out the 300-second revalidate".

F5 [minor] Backup and restore runbook (intro, part 1 "Postgres data")
claim: The `public` schema inventory lists profiles, membership, audit log, working copies, snapshots, versions, taxonomy, credits, slug redirects, media, comments, reports, bookmarks and rate-limit events.
evidence: Migrations also create `site_settings` (`20261025120000_site_settings.sql`), `pages`, `page_slug_redirects`, `navigation_menus`, `navigation_items` (`20261026100000_pages_navigation.sql`) and `auth_rate_limit_events` (`20261023140000_reader_accounts.sql`); the runbook itself relies on `navigation_menus` later.
fix: Either complete the list or replace it with "every table in `public`" so the inventory cannot go stale.

F6 [hunch] Consistency checks
claim: Leftover objects must be removed through the Storage API, "never by SQL: `storage.protect_delete` blocks direct deletes".
evidence: not checked; no `protect_delete` function or trigger exists in `supabase/migrations/`, the README repeats the claim about the local Storage schema, and hosted Storage was not verified.
fix: Cite where the trigger was observed (local Storage schema version) or soften to "the Storage schema may block direct deletes".

VERDICT: revise — seed media bucket upload on `db reset` is unaddressed; hosted bucket-source and owner-scope statements need correction.
