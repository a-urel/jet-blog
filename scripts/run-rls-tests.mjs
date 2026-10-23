import { execFileSync, spawnSync } from "node:child_process";

let statusOutput;

try {
  // Ask for JSON explicitly: the CLI prints dotenv lines (KEY='value') by
  // default in an interactive shell and switches to JSON only when it detects
  // an automation or agent environment.
  statusOutput = execFileSync("supabase", ["status", "--env", "--output-format", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch {
  console.error(
    "Local Supabase is not running. Start it with `supabase start --runtime native` before running RLS tests.",
  );
  process.exit(1);
}

let status;

try {
  status = JSON.parse(statusOutput);
} catch {
  console.error(
    "Could not parse `supabase status --env --output-format json` output. Check the Supabase CLI version.",
  );
  process.exit(1);
}

const requiredKeys = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"];
const missingKeys = requiredKeys.filter((key) => !status[key]);

if (missingKeys.length > 0) {
  console.error(
    `Missing local Supabase values: ${missingKeys.join(", ")}.`,
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["vitest", "run", "--config", "vitest.rls.config.mts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SUPABASE_TEST_URL: status.API_URL,
      SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY,
    },
  },
);

process.exit(result.status ?? 1);
