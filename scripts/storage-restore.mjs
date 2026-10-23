// Restores a directory written by storage-backup.mjs:
//
//   node scripts/storage-restore.mjs <dir> [--local]
//
// Missing buckets are created with their recorded settings (buckets created by
// migrations already exist). Objects are uploaded without overwriting; an
// object that already exists is verified by checksum instead. Exits non-zero
// if any object is missing or differs afterwards.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { positionalArgument, resolveStorageEnvironment } from "./storage-env.mjs";

const source = path.resolve(positionalArgument(process.argv));
const { url, secretKey } = resolveStorageEnvironment(process.argv);
const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));

const { data: existing, error: listError } = await supabase.storage.listBuckets();
if (listError) throw listError;

const existingIds = new Set(existing.map((bucket) => bucket.id));

for (const bucket of manifest.buckets) {
  if (existingIds.has(bucket.id)) continue;

  const { error } = await supabase.storage.createBucket(bucket.id, {
    public: bucket.public,
    fileSizeLimit: bucket.fileSizeLimit ?? undefined,
    allowedMimeTypes: bucket.allowedMimeTypes ?? undefined,
  });

  if (error) throw error;
  console.log(`Created bucket ${bucket.id}.`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

let uploaded = 0;
let unchanged = 0;
const failures = [];

for (const object of manifest.objects) {
  const bytes = await readFile(path.join(source, "objects", object.bucket, object.path));

  if (sha256(bytes) !== object.sha256) {
    failures.push(`${object.bucket}/${object.path}: backup file does not match manifest`);
    continue;
  }

  const storage = supabase.storage.from(object.bucket);
  const { error } = await storage.upload(object.path, bytes, {
    contentType: object.contentType,
    cacheControl: object.cacheControl?.replace(/^max-age=/, "") ?? undefined,
    upsert: false,
  });

  if (!error) {
    uploaded += 1;
    continue;
  }

  // Already present (for example a partial earlier restore): verify it.
  const { data, error: downloadError } = await storage.download(object.path);

  if (downloadError) {
    failures.push(`${object.bucket}/${object.path}: ${error.message}`);
  } else if (sha256(Buffer.from(await data.arrayBuffer())) !== object.sha256) {
    failures.push(`${object.bucket}/${object.path}: existing object differs`);
  } else {
    unchanged += 1;
  }
}

console.log(
  `Restored ${uploaded} objects, ${unchanged} already present, ${failures.length} failed.`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
