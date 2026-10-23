// Grants the first admin of a fresh project:
//
//   npm run admin:bootstrap -- --email you@example.com [--local] [--site-url <origin>]
//
// It refuses while any active admin exists; later admins are invited at
// /admin/members. Without --local, SUPABASE_URL and SUPABASE_SECRET_KEY must
// be set in the environment, and NEXT_PUBLIC_SITE_URL (or --site-url) is used
// for the invite link. With --local, the values come from `supabase status`
// and the site defaults to http://localhost:3000.
import { createClient } from "@supabase/supabase-js";

import { BootstrapError, bootstrapFirstAdmin } from "./admin-bootstrap-core.mjs";
import { resolveStorageEnvironment } from "./storage-env.mjs";

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index !== -1) return argv[index + 1];

  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

const argv = process.argv.slice(2);

if (argv.includes("--help")) {
  console.log(
    "Usage: npm run admin:bootstrap -- --email <address> [--local] [--site-url <origin>]",
  );
  process.exit(0);
}

const { url, secretKey } = resolveStorageEnvironment(process.argv);
const local = argv.includes("--local");
const siteUrl =
  optionValue(argv, "--site-url") ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  (local ? "http://localhost:3000" : undefined);

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  const result = await bootstrapFirstAdmin({
    supabase,
    email: optionValue(argv, "--email"),
    siteUrl,
  });

  console.log(
    result.invited
      ? `Invited ${result.email} as the first admin. They set a password from the invite email, then sign in at /login.`
      : `Granted admin to the existing account ${result.email}. Sign in at /login.`,
  );
} catch (error) {
  if (error instanceof BootstrapError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(`Bootstrap failed: ${error?.message ?? error}`);
  process.exit(1);
}
