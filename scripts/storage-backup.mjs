// Copies every Storage bucket and object into a local directory:
//
//   node scripts/storage-backup.mjs <dir> [--local]
//
// <dir>/manifest.json lists buckets (id, public, limits) and objects (bucket,
// path, content type, cache control, size, SHA-256). Object bytes are stored
// under <dir>/objects/<bucket>/<path>. Database dumps do not contain these
// bytes; see docs/backup-and-restore.md.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { positionalArgument, resolveStorageEnvironment } from "./storage-env.mjs";

const target = path.resolve(positionalArgument(process.argv));
const { url, secretKey } = resolveStorageEnvironment(process.argv);
const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listObjects(bucket, prefix = "") {
  const objects = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });

    if (error) throw error;

    for (const entry of data) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have no id; recurse into them.
      if (entry.id === null) objects.push(...(await listObjects(bucket, entryPath)));
      else objects.push({ path: entryPath, metadata: entry.metadata ?? {} });
    }

    if (data.length < 1000) return objects;
  }
}

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;

const manifest = { createdAt: new Date().toISOString(), buckets: [], objects: [] };

for (const bucket of buckets) {
  manifest.buckets.push({
    id: bucket.id,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit ?? null,
    allowedMimeTypes: bucket.allowed_mime_types ?? null,
  });

  for (const object of await listObjects(bucket.id)) {
    const { data, error } = await supabase.storage.from(bucket.id).download(object.path);
    if (error) throw error;

    const bytes = Buffer.from(await data.arrayBuffer());
    const file = path.join(target, "objects", bucket.id, object.path);

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);

    manifest.objects.push({
      bucket: bucket.id,
      path: object.path,
      contentType: object.metadata.mimetype ?? data.type ?? "application/octet-stream",
      cacheControl: object.metadata.cacheControl ?? null,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Backed up ${manifest.objects.length} objects from ${manifest.buckets.length} buckets to ${target}.`,
);
