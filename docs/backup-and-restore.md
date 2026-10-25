# Backup and restore runbook

A complete backup of jet-blog has three parts that must be taken together:

1. **Postgres data**: Auth users, identities, sessions, and refresh tokens
   (`auth` schema) and application data (`public` schema: profiles,
   membership, audit log, working copies (`posts`, `post_authors`,
   `post_tags`), published snapshots (`published_posts`,
   `published_post_authors`, `published_post_tags`), immutable
   `post_versions`, taxonomy, credits, slug redirects, media rows, comments,
   reports, bookmarks, rate-limit events). The schema itself is rebuilt from
   `supabase/migrations/`, which also create both Storage buckets.
2. **Storage bytes**: the image files in the `media` bucket and the profile
   and author pictures in the `avatars` bucket (`npm run backup:storage`
   copies every bucket). A database dump contains at most the
   `storage.objects` metadata rows, never the bytes.
3. **Storage ownership**: `storage.objects.owner_id` for every object
   (`npm run backup:storage-owners`). The Storage API neither returns nor
   accepts an owner, so objects re-uploaded with the secret key have none, and
   the avatar and media policies use it: without it an uploader can no longer
   list or remove their own unattached uploads or attach an upload made before
   the backup.

`public.media.object_path` equals the media id and post bodies reference media
ids, so a restore is consistent only when all parts come from the same moment.
Take the Storage backup right after the database dump. An image uploaded in
between becomes an object without a media row (harmless); an image deleted in
between becomes a media row without bytes, which the consistency checks below
catch. Avoid media deletions during a backup.

Backup directories contain e-mail addresses, password hashes, refresh tokens,
and every unpublished draft. Create them with `umask 077`, keep them outside
the repository, encrypt them at rest, and never commit them.

Never run these commands against a hosted project without an explicit,
reviewed decision. The restore steps replace data.

## Tools

- Supabase CLI 2.121.0 (`supabase db dump`, `supabase db reset`,
  `supabase db query`, `supabase stack destroy`).
- `scripts/storage-backup.mjs` and `scripts/storage-restore.mjs`
  (`npm run backup:storage -- <dir>`, `npm run restore:storage -- <dir>`).
  They use the Storage API with the secret key, list every bucket (including
  nested folders), write a `manifest.json` with bucket settings and a SHA-256
  per object, never overwrite an existing object on restore, and exit non-zero
  when any object is missing or differs.
- `scripts/storage-owners.mjs` (`npm run backup:storage-owners -- <dir>`,
  `npm run restore:storage-owners -- <dir>`). `export` writes
  `<dir>/owners.json` (bucket, path, owner) from `storage.objects`; `apply`
  sets `owner_id` on the restored objects and exits non-zero unless every
  listed object was found. It runs through `supabase db query`.
- Credentials: `--local` reads the local stack from `supabase status`. For a
  hosted project set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Storage
  scripts) and `SUPABASE_DB_URL` (owners script) in the shell environment, not
  as arguments.

## Local backup

```bash
umask 077
BACKUP=~/jet-blog-backups/$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP"
cd <repo>
supabase db dump --local --data-only --schema auth,public -f "$BACKUP/data.sql"
npm run backup:storage -- "$BACKUP/storage" --local
npm run backup:storage-owners -- "$BACKUP/storage" --local
# Optional, for comparing after the restore:
supabase db dump --local -f "$BACKUP/schema.sql"
supabase db dump --local --role-only -f "$BACKUP/roles.sql"
```

`--schema auth,public` keeps Storage tables out of the dump: buckets come from
the migrations and object rows are recreated by the Storage restore. The CLI
dump disables triggers during restore (`session_replication_role = replica`),
so rate-limit, slug-redirect, and `post_versions` immutability triggers do not
reject or rewrite restored rows. pg_dump warns about circular foreign keys on
`categories` (`parent_id`); the same replica setting makes that harmless.

## Local restore

```bash
# Rebuild the schema from migrations and load the data dump instead of the seed.
supabase db reset --local --sql-paths "$BACKUP/data.sql"
npm run restore:storage -- "$BACKUP/storage" --local
npm run restore:storage-owners -- "$BACKUP/storage" --local
```

`supabase db query` cannot run a multi-statement dump and `psql` is not part of
the native local stack; `db reset --sql-paths` runs the dump through the seed
runner after the migrations (pass an absolute path or one relative to the
repository). The owners step must run after the Storage restore. Restart
`next start` afterwards (or wait for the 5-minute ISR fallback) so cached
public pages do not show pre-restore content.

To rehearse a total loss of the local stack (only ever on a disposable
worktree stack, never on a stack that holds real accounts):

```bash
supabase stack list                        # pick the id whose project_root is this worktree
supabase stack destroy --stack-id <id> --yes
rm -rf supabase/.temp/stack-uploads/<id>   # destroy keeps the uploaded files here
supabase start --runtime native            # fresh stack with the seed
# then the three restore commands above
```

`stack destroy` prints "Storage upload files will be preserved": the bytes
stay under `supabase/.temp/stack-uploads/<stack-id>/`. Delete that directory,
or a drill cannot prove that the bytes came from the backup. The recreated
stack gets the same id, ports, and local keys, so `.env.local` stays valid.

## Hosted backup and restore (Supabase platform)

Follow the official guide,
[Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
(checked 2026-10-23), with one change: exclude `storage.objects` from the data
dump, because the Storage restore script recreates those rows from the files
and the owners script puts the owners back.

```bash
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.objects" -x "storage.buckets_vectors" -x "storage.vector_indexes"
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/storage-backup.mjs storage
SUPABASE_DB_URL=... node scripts/storage-owners.mjs export storage
```

Restore into an empty project with `psql --single-transaction --variable
ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET
session_replication_role = replica' --file data.sql --dbname "$DB_URL"`, then run
`storage-restore.mjs` and `storage-owners.mjs apply` against the new project.
This hosted path is not drilled yet (no hosted project exists, D5).

What a hosted project needs beyond these commands:

- **Platform backups cover Postgres only.** Daily backups and point-in-time
  recovery (depending on the plan) never include Storage bytes. Schedule the
  Storage and owners backups separately, right after a database dump, and
  decide retention and an off-platform storage location.
- **Keys and secrets are not in any backup.** The publishable and secret API
  keys, JWT signing keys, and the database password belong to the project.
  Restoring into a new project means new values in the host's environment
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`) and a rebuild, because the public values are inlined
  at build time and the image allowlist is derived from the Supabase URL.
- **Auth settings are project configuration, not data.** Reapply the site URL
  and redirect allowlist (`/auth/callback`, `/auth/recovery`), sign-up and
  confirmation settings, the password rule, Auth rate limits, production SMTP,
  and the Turkish `token_hash` e-mail templates (see the README hosting
  checklist). Local values live in `supabase/config.toml` and do not apply to
  a hosted project.
- **Sessions come back with the data.** Refresh tokens are rows in `auth`, so
  a restore revives every session that existed at backup time, including ones
  revoked later. If a compromise caused the restore, sign everyone out after
  it. Whether sessions survive a move to a project with different JWT keys was
  not tested.
- **Bucket settings come from the migrations.** Compare them with
  `manifest.json` after the restore (public flag, size limit, MIME allowlist).
- The project uses no Vault secrets, cron jobs, or Edge Functions today; add
  them to this list when that changes.

## Consistency checks

Run the fingerprint query before the backup and after the restore (before
anyone signs in, which adds sessions and audit rows) and compare the output.
It counts and hashes every table in `auth`, `public`, and `storage`:

```sql
select t.table_schema || '.' || t.table_name as tbl,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text::int as rows,
  (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) as h from %I.%I x', '|', '', t.table_schema, t.table_name), false, true, '')))[1]::text as hash
from information_schema.tables t
where t.table_schema in ('auth', 'public', 'storage') and t.table_type = 'BASE TABLE'
union all
select 'storage.objects(stable cols)', count(*)::int,
  md5(coalesce(string_agg(bucket_id || '/' || name || ':' || coalesce(owner_id, '-') || ':' || (metadata->>'size') || ':' || (metadata->>'mimetype'), '|' order by bucket_id, name), ''))
from storage.objects
order by 1;
```

`supabase db query --local -o json -f fingerprint.sql > before.json` runs it.
Every `auth` and `public` row must match. `storage.buckets`,
`storage.migrations`, and `storage.objects` keep their counts but differ in
hash (new timestamps, object ids, and versions); the
`storage.objects(stable cols)` row (bucket, path, owner, size, type) must
match.

Every `public.media` row needs a Storage object with the same path:

```sql
select media.id
from public.media
left join storage.objects
  on objects.bucket_id = media.bucket_id and objects.name = media.object_path
where objects.id is null;
```

Every avatar reference needs its object too:

```sql
select 'profiles/' || avatar_id from public.profiles where avatar_id is not null
union all
select 'authors/' || avatar_id from public.authors where avatar_id is not null
except
select name from storage.objects where bucket_id = 'avatars';
```

An empty result is required. Objects without a media row are leftovers of
failed uploads; they are harmless and can be removed later through the Storage
API (never by SQL: `storage.protect_delete` blocks direct deletes).

Then, on `next start`: open a published post with a cover and inline images
(images and avatars through `/_next/image` return 200), open a post with
unpublished working-copy changes and confirm the page shows the published
snapshot, sign in with an existing account, and run `npm run test:smoke` and
`npm run test:rls`.

## Drill log

### 2026-10-25 — full local drill on a disposable worktree stack, CLI 2.121.0 native runtime

Stack: the `claude/backup-drill` worktree's own managed stack (the main
checkout's stack was not touched). Synthetic state on top of the seed: 4 Auth
users with one password (admin, editor, author, reader; 3 editorial members),
7 posts (5 published), a published post with a cover and two inline images
republished once (versions 1 and 2), a published post whose author saved
unpublished working-copy changes with an extra image, a draft, 5 media rows,
3 avatars attached (two profiles, one guest author) plus one unattached reader
upload, 3 comments, 2 bookmarks, 6 `post_versions`, 5 `published_posts`, 16
rate-limit events, and a reader refresh token saved before the dump. Storage:
9 objects, 6.4 MB.

1. Backup (about 3.5 s in total): `db dump --role-only` 1.1 s, `db dump`
   (schema) 0.6 s, `db dump --data-only --schema auth,public` 0.5 s (50 KB),
   `storage-backup.mjs` 0.5 s (9 objects, 2 buckets), `storage-owners.mjs
   export` 0.4 s (9 owners).
2. Destroy: `supabase stack destroy` 0.9 s; it kept 14 upload files under
   `supabase/.temp/stack-uploads/<id>`, which were deleted (gotcha above).
3. Fresh stack: `supabase start --runtime native` 4.3 s (migrations and seed;
   0 Auth users).
4. Restore (about 6 s): `db reset --sql-paths data.sql` 4.0 s,
   `storage-restore.mjs` 1.7 s ("Restored 9 objects, 0 already present,
   0 failed"), `storage-owners.mjs apply` 0.35 s ("Set the owner of 9 of 9
   objects").
5. Results:
   - Fingerprints: 58 of 61 table rows identical (every `auth` and `public`
     table, counts and content hashes); `storage.buckets`, `storage.migrations`,
     and `storage.objects` matched in count with the expected hash difference;
     the stable-columns row (path, owner, size, type) matched. Schema and role
     dumps after the restore were byte-identical to the backup.
   - Storage: 9/9 objects matched their SHA-256 through the API and 9/9
     through anonymous public URLs. A control upload with the secret key got
     `owner_id = null`, which is why the owners step exists.
   - Auth: 4/4 users signed in with the original password, a wrong password
     was rejected, and the pre-backup refresh token still refreshed.
   - Visibility: anonymous reads of `posts` and `post_versions` failed with
     `42501`, the reader saw 0 working copies, the draft was absent, and the
     anonymous snapshot of the edited post had the published title without
     the working-copy text. The author still saw the working copy with
     `has_unpublished_changes = true`, the editor saw versions 1 and 2.
   - Reader data: 2 bookmarks and the own comment were readable; the reader
     listed both own avatar objects and removed the unattached one (only
     possible with the restored `owner_id`); a new media upload and
     `register_media` by the author succeeded.
   - `next start` on the restored stack: the published post returned 200 with
     its cover, both inline images, and author and commenter avatars, all 200
     through `/_next/image`; the edited post rendered the published snapshot
     (no working-copy text); the draft URL returned 404.
   - `npm run test:smoke`: every check passed except
     `/search?language=fr_FR`, a known failure unrelated to backups (the
     check expects a language option hidden since commit b2166ed).
   - `npm run test:rls` on the restored stack: 19 files, 554 tests passed
     (35 s).

Recovery time for this size: about 10 seconds of commands from a destroyed
stack to a verified restore (plus a production build to serve it). Not
covered: a hosted project, a new project with different keys, large media
volumes, and point-in-time recovery.

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
