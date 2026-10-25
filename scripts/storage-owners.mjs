// Saves and reapplies Storage object ownership:
//
//   node scripts/storage-owners.mjs export <dir> [--local]
//   node scripts/storage-owners.mjs apply <dir> [--local]
//
// The Storage API neither returns nor accepts an object's owner, so objects
// re-uploaded by storage-restore.mjs with the secret key have no owner_id. The
// avatar and media policies use owner_id (uploaders list and remove their own
// unattached objects, attach their own uploads), so a restore must put it back.
// export writes <dir>/owners.json from storage.objects; apply sets owner_id on
// the restored objects with the same bucket and path. Both run through
// `supabase db query`: --local for the local stack, otherwise SUPABASE_DB_URL
// from the environment (never pass the connection string as an argument).
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [command, directory] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));

if (!["export", "apply"].includes(command) || !directory) {
  console.error("Usage: node scripts/storage-owners.mjs export|apply <dir> [--local]");
  process.exit(1);
}

function target() {
  if (process.argv.includes("--local")) return ["--local"];

  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) {
    console.error("Set SUPABASE_DB_URL, or pass --local for the local stack.");
    process.exit(1);
  }

  return ["--db-url", dbUrl];
}

function query(sql) {
  const output = execFileSync(
    "supabase",
    ["db", "query", ...target(), "--output-format", "json", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 },
  );

  return JSON.parse(output).rows ?? [];
}

const file = path.join(path.resolve(directory), "owners.json");

if (command === "export") {
  const owners = query(
    `select bucket_id, name, owner_id
     from storage.objects
     where owner_id is not null
     order by bucket_id, name`,
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(owners, null, 2)}\n`);
  console.log(`Saved the owners of ${owners.length} objects to ${file}.`);
} else {
  const owners = JSON.parse(await readFile(file, "utf8"));
  const json = JSON.stringify(owners);

  if (json.includes("$owners$")) {
    console.error("owners.json contains the SQL quoting tag; refusing to apply it.");
    process.exit(1);
  }

  // owner (uuid) is deprecated but still kept in sync by Storage itself.
  const [result] = query(
    `with source as (
       select * from jsonb_to_recordset($owners$${json}$owners$::jsonb)
         as owners(bucket_id text, name text, owner_id text)
     ), updated as (
       update storage.objects
       set owner_id = source.owner_id,
           owner = case
             when source.owner_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then source.owner_id::uuid
           end
       from source
       where objects.bucket_id = source.bucket_id
         and objects.name = source.name
       returning objects.id
     )
     select (select count(*) from source) as expected,
            (select count(*) from updated) as updated`,
  );

  console.log(`Set the owner of ${result.updated} of ${result.expected} objects.`);

  if (Number(result.updated) !== Number(result.expected)) {
    console.error("Some objects are missing; run storage-restore.mjs first.");
    process.exit(1);
  }
}
