# Backup and restore runbook

A complete backup of jet-blog has two parts that must be taken together:

1. **Postgres**: Auth users and sessions (`auth` schema) and application data
   (`public` schema: profiles, membership, audit log, posts, taxonomy, credits,
   redirects, media rows, rate-limit events). The schema itself is rebuilt from
   `supabase/migrations/`.
2. **Storage bytes**: the image files in the `media` bucket. A database dump
   contains at most the `storage.objects` metadata rows, never the bytes.

`public.media.object_path` equals the media id and post bodies reference media
ids, so a restore is consistent only when both parts come from the same moment.
Take the Storage backup right after the database dump. An image uploaded in
between becomes an object without a media row (harmless); an image deleted in
between becomes a media row without bytes, which the consistency checks below
catch. Avoid media deletions during a backup.

Never run these commands against a hosted project without an explicit,
reviewed decision. The restore steps replace data.

## Tools

- Supabase CLI 2.121.0 (`supabase db dump`, `supabase db reset`).
- `scripts/storage-backup.mjs` and `scripts/storage-restore.mjs`
  (`npm run backup:storage -- <dir>`, `npm run restore:storage -- <dir>`).
  They use the Storage API with the secret key, list every bucket (including
  nested folders), write a `manifest.json` with bucket settings and a SHA-256
  per object, never overwrite an existing object on restore, and exit non-zero
  when any object is missing or differs.
- Credentials: `--local` reads the local stack from `supabase status`. For a
  hosted project set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the shell
  environment (not as arguments). Store backup directories outside the
  repository; they contain user data and are never committed.

## Local backup

```bash
mkdir -p ~/jet-blog-backups/$(date +%Y%m%d-%H%M)
cd ~/jet-blog-backups/<timestamp>
supabase db dump --local --data-only --schema auth,public -f data.sql --workdir <repo>
node <repo>/scripts/storage-backup.mjs storage --local
```

`--schema auth,public` keeps Storage tables out of the dump: buckets come from
the migrations and object rows are recreated by the Storage restore. The CLI
dump disables triggers during restore (`session_replication_role = replica`),
so rate-limit and slug-redirect triggers do not rewrite restored rows.

## Local restore

```bash
# Rebuild the schema from migrations and load the data dump instead of the seed.
supabase db reset --local --sql-paths ~/jet-blog-backups/<timestamp>/data.sql
node scripts/storage-restore.mjs ~/jet-blog-backups/<timestamp>/storage --local
```

`supabase db query` cannot run a multi-statement dump and `psql` is not part of
the native local stack; `db reset --sql-paths` runs the dump through the seed
runner after the migrations. Restart `next start` afterwards (or wait for the
5-minute ISR fallback) so cached public pages do not show pre-restore content.

## Hosted backup and restore (Supabase platform)

Follow the official guide,
[Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
(checked 2026-10-23), with one change: exclude `storage.objects` from the data
dump, because the Storage restore script recreates those rows from the files.

```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.objects" -x "storage.buckets_vectors" -x "storage.vector_indexes"
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/storage-backup.mjs storage
```

Restore into an empty project with `psql --single-transaction --variable
ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET
session_replication_role = replica' --file data.sql --dbname "$DB_URL"`, then run
`storage-restore.mjs` against the new project. Platform backups (daily backups
and point-in-time recovery, depending on the plan) cover Postgres only; they do
not replace the Storage copy. Hosting and the production project are not
decided yet (D5), so the schedule, retention, and storage location of hosted
backups remain open launch tasks.

## Consistency checks

Run before the backup and after the restore and compare the output:

```sql
select
  (select count(*) from auth.users) as users,
  (select count(*) from public.editorial_members) as members,
  (select count(*) from public.posts) as posts,
  (select count(*) from public.posts where status = 'published') as published,
  (select count(*) from public.post_slug_redirects) as redirects,
  (select count(*) from public.media) as media,
  (select count(*) from storage.objects) as objects,
  (select md5(string_agg(id::text || slug || status || revision || md5(body::text), ',' order by id)) from public.posts) as posts_fingerprint,
  (select md5(string_agg(id::text || object_path || size_bytes, ',' order by id)) from public.media) as media_fingerprint,
  (select md5(string_agg(post_id::text || author_id || sort_order, ',' order by post_id, sort_order)) from public.post_authors) as credits_fingerprint;
```

Every `public.media` row needs a Storage object with the same path:

```sql
select media.id
from public.media
left join storage.objects
  on objects.bucket_id = media.bucket_id and objects.name = media.object_path
where objects.id is null;
```

An empty result is required. Objects without a media row are leftovers of
failed uploads; they are harmless and can be removed later through the Storage
API (never by SQL: `storage.protect_delete` blocks direct deletes).

Then open a published post with an image on `next start`, sign in with an
existing editorial account, and run `npm run test:smoke`.

## Drill log

### 2026-10-23 — local, Supabase CLI 2.121.0 native runtime

Data: 4 Auth users, 4 editorial members, 4 posts (all published), 1 slug
redirect, 1 media row with its 61,134-byte PNG used in a published post body.

1. `supabase db dump --local --data-only --schema auth,public -f data.sql`
   (2 s, 236 KB) and `storage-backup.mjs --local` (1 object, 1 bucket).
2. `supabase db reset --local --no-seed`: every count dropped to 0.
3. First restore attempt with `supabase db query --local -f data.sql` failed:
   "cannot insert multiple commands into a prepared statement". The runbook now
   uses `db reset --sql-paths` instead.
4. `supabase db reset --local --sql-paths data.sql` (9 s) and
   `storage-restore.mjs --local`: "Restored 1 objects, 0 already present,
   0 failed".
5. Result: the consistency query matched the pre-backup output exactly (all
   counts and the post, media, and credit fingerprints). The public image's
   SHA-256 equalled the manifest, `/_next/image` served it with 200, both
   synthetic editorial accounts signed in with their passwords, and an existing
   browser session stayed valid (refresh tokens are part of `auth`).

Recovery time for this size: under 15 seconds of commands. Not covered: a
hosted project (none exists yet), large media volumes, and point-in-time
recovery.
