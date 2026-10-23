import { execFileSync } from "node:child_process";

// Resolves the Supabase API URL and secret key for the Storage backup scripts.
// --local reads them from `supabase status`; otherwise SUPABASE_URL and
// SUPABASE_SECRET_KEY must be set in the environment (never pass the key as an
// argument, so it stays out of shell history and process lists).
export function resolveStorageEnvironment(argv) {
  if (argv.includes("--local")) {
    const status = JSON.parse(
      execFileSync("supabase", ["status", "--env"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );

    return { url: status.API_URL, secretKey: status.SECRET_KEY };
  }

  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    console.error(
      "Set SUPABASE_URL and SUPABASE_SECRET_KEY, or pass --local for the local stack.",
    );
    process.exit(1);
  }

  return { url, secretKey };
}

export function positionalArgument(argv) {
  const value = argv.slice(2).find((argument) => !argument.startsWith("--"));

  if (!value) {
    console.error("Pass the backup directory as an argument.");
    process.exit(1);
  }

  return value;
}
