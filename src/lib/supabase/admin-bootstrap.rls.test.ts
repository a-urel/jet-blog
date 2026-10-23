import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error(
    "RLS test environment is missing. Run `npm run test:rls` instead of `npm test`.",
  );
}

const password = "Correct-Horse-1";
const runId = crypto.randomUUID().slice(0, 8);
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-bootstrap-admin-${runId}@example.com`,
  candidate: `rls-bootstrap-candidate-${runId}@example.com`,
  unconfirmed: `rls-bootstrap-unconfirmed-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(key: UserKey): Promise<SupabaseClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({ email: emails[key], password });
  if (error) throw error;
  return client;
}

// The success path needs a database without any active admin, which the shared
// test database never is. This runs the scenario inside one SQL statement that
// always aborts: it removes every admin, calls the function, checks the result,
// and raises a marker exception, so the transaction rolls back and no other
// test or local data is affected. The marker (or the real error) is returned.
function runRolledBack(body: string): string {
  const sql = `do $$
declare
  v_role text;
  v_action text;
begin
  -- DELETE bypasses the last-admin guard, which only covers role changes and
  -- deactivation; the whole block is rolled back below.
  delete from public.editorial_members where role = 'admin';
${body}
end $$;`;

  try {
    execFileSync("supabase", ["db", "query", "--local", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string };
    return `${output.stdout ?? ""}${output.stderr ?? ""}`;
  }

  throw new Error("The rolled-back scenario did not abort.");
}

beforeAll(async () => {
  for (const key of Object.keys(emails) as UserKey[]) {
    const { data, error } = await service.auth.admin.createUser({
      email: emails[key],
      password,
      email_confirm: key !== "unconfirmed",
    });

    if (error) throw error;
    userIds[key] = data.user.id;
  }

  // Guarantees that an active admin exists for the refusal tests, whatever
  // else is in the local database.
  const { error } = await service
    .from("editorial_members")
    .insert({ profile_id: userIds.admin, role: "admin" });

  if (error) throw error;
});

afterAll(async () => {
  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("bootstrap_first_admin", () => {
  it("is not executable by anonymous visitors", async () => {
    const { error } = await anonymousClient().rpc("bootstrap_first_admin", {
      p_profile_id: userIds.candidate,
    });

    expect(error).not.toBeNull();
  });

  it("is not executable by signed-in users, including admins", async () => {
    for (const key of ["candidate", "admin"] as const) {
      const client = await signInAs(key);
      const { error } = await client.rpc("bootstrap_first_admin", {
        p_profile_id: userIds.candidate,
      });

      expect(error).not.toBeNull();
    }
  });

  it("refuses while an active admin exists", async () => {
    const { error } = await service.rpc("bootstrap_first_admin", {
      p_profile_id: userIds.candidate,
      p_invited: false,
    });

    expect(error?.code).toBe("42710");

    const { data } = await service
      .from("editorial_members")
      .select("role")
      .eq("profile_id", userIds.candidate);

    expect(data).toEqual([]);
  });

  it("grants admin and records the audit entry when no active admin exists", () => {
    const output = runRolledBack(`
  perform public.bootstrap_first_admin('${userIds.candidate}', true);

  select role into v_role
  from public.editorial_members
  where profile_id = '${userIds.candidate}' and deactivated_at is null;

  select action into v_action
  from public.editorial_audit_log
  where target_profile_id = '${userIds.candidate}'
    and actor_profile_id is null
    and details = '{"invited": true}'::jsonb
  order by id desc
  limit 1;

  raise exception 'bootstrap-result:%:%', v_role, v_action;`);

    expect(output).toContain("bootstrap-result:admin:member.bootstrap_admin");
  });

  it("refuses an unconfirmed self-registered account even without an admin", () => {
    const output = runRolledBack(`
  perform public.bootstrap_first_admin('${userIds.unconfirmed}', false);
  raise exception 'bootstrap-result:granted';`);

    expect(output).toContain("Editorial membership requires a confirmed account");
    expect(output).not.toContain("bootstrap-result:granted");
  });

  it("refuses a missing profile", () => {
    const output = runRolledBack(`
  perform public.bootstrap_first_admin('00000000-0000-4000-8000-000000000000', false);
  raise exception 'bootstrap-result:granted';`);

    expect(output).toContain("Profile not found");
  });

  it("leaves the existing admin untouched after the rolled-back scenarios", async () => {
    const { data } = await service
      .from("editorial_members")
      .select("role, deactivated_at")
      .eq("profile_id", userIds.admin)
      .single();

    expect(data).toEqual({ role: "admin", deactivated_at: null });
  });
});
