import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
  adminA: `rls-admin-a-${runId}@example.com`,
  adminB: `rls-admin-b-${runId}@example.com`,
  editor: `rls-editor-${runId}@example.com`,
  author: `rls-author-${runId}@example.com`,
  reader: `rls-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ids = {} as Record<UserKey, string>;
const pausedOtherAdmins: {
  profile_id: string;
  deactivated_at: string | null;
}[] = [];

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(key: UserKey): Promise<SupabaseClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({
    email: emails[key],
    password,
  });

  if (error) throw error;

  return client;
}

async function resetMemberships() {
  const knownIds = Object.values(ids).filter(Boolean);

  if (knownIds.length === 0) return;

  await admin
    .from("editorial_members")
    .delete()
    .eq("profile_id", ids.reader);

  const { error } = await admin.from("editorial_members").upsert([
    { profile_id: ids.adminA, role: "admin", deactivated_at: null },
    { profile_id: ids.adminB, role: "admin", deactivated_at: null },
    { profile_id: ids.editor, role: "editor", deactivated_at: null },
    { profile_id: ids.author, role: "author", deactivated_at: null },
  ]);

  if (error) throw error;
}

beforeAll(async () => {
  for (const key of Object.keys(emails) as UserKey[]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emails[key],
      password,
      email_confirm: true,
    });

    if (error) throw error;
    ids[key] = data.user.id;
  }

  await resetMemberships();

  // The last-admin trigger is global. Temporarily pause any other active admin
  // so the last-admin test is deterministic, then restore them in afterAll.
  const testIds = Object.values(ids);
  const { data: otherAdmins } = await admin
    .from("editorial_members")
    .select("profile_id, deactivated_at")
    .eq("role", "admin")
    .is("deactivated_at", null)
    .not("profile_id", "in", `(${testIds.join(",")})`);

  for (const otherAdmin of otherAdmins ?? []) {
    const { error } = await admin
      .from("editorial_members")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("profile_id", otherAdmin.profile_id);

    if (!error) {
      pausedOtherAdmins.push({
        profile_id: otherAdmin.profile_id,
        deactivated_at: otherAdmin.deactivated_at,
      });
    }
  }
});

afterEach(async () => {
  await resetMemberships();
});

afterAll(async () => {
  for (const pausedAdmin of pausedOtherAdmins) {
    await admin
      .from("editorial_members")
      .update({ deactivated_at: pausedAdmin.deactivated_at })
      .eq("profile_id", pausedAdmin.profile_id);
  }

  const knownIds = Object.values(ids).filter(Boolean);

  if (knownIds.length > 0) {
    await admin
      .from("editorial_audit_log")
      .delete()
      .in("actor_profile_id", knownIds);
    await admin
      .from("editorial_audit_log")
      .delete()
      .in("target_profile_id", knownIds);
  }

  for (const id of knownIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("editorial RLS", () => {
  it("creates a profile for every auth user", async () => {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .in("id", Object.values(ids));

    expect(error).toBeNull();
    expect(data).toHaveLength(5);
  });

  it("denies anonymous reads on editorial tables", async () => {
    const anon = anonymousClient();

    const profiles = await anon.from("profiles").select("id");
    const members = await anon.from("editorial_members").select("profile_id");
    const audit = await anon.from("editorial_audit_log").select("id");

    expect(profiles.data ?? []).toHaveLength(0);
    expect(members.data ?? []).toHaveLength(0);
    expect(audit.data ?? []).toHaveLength(0);
  });

  it("lets a reader read only their own profile and no membership", async () => {
    const reader = await signInAs("reader");

    const profiles = await reader.from("profiles").select("id");
    const members = await reader.from("editorial_members").select("profile_id");

    expect(profiles.data?.map((row) => row.id)).toEqual([ids.reader]);
    expect(members.data ?? []).toHaveLength(0);
  });

  it("blocks a reader from granting themselves a role", async () => {
    const reader = await signInAs("reader");

    const directInsert = await reader
      .from("editorial_members")
      .insert({ profile_id: ids.reader, role: "admin" });

    expect(directInsert.error).not.toBeNull();

    const rpc = await reader.rpc("grant_editorial_membership", {
      p_profile_id: ids.reader,
      p_role: "admin",
      p_invited: false,
    });

    expect(rpc.error).not.toBeNull();

    const members = await reader.from("editorial_members").select("profile_id");
    expect(members.data ?? []).toHaveLength(0);
  });

  it("lets an author read only their own membership and blocks role changes", async () => {
    const author = await signInAs("author");

    const members = await author
      .from("editorial_members")
      .select("profile_id, role");

    expect(members.data).toEqual([
      { profile_id: ids.author, role: "author" },
    ]);

    const update = await author
      .from("editorial_members")
      .update({ role: "admin" })
      .eq("profile_id", ids.author);

    expect(Boolean(update.error) || (update.data ?? []).length === 0).toBe(true);

    const rpc = await author.rpc("change_editorial_role", {
      p_profile_id: ids.author,
      p_role: "admin",
    });

    expect(rpc.error).not.toBeNull();
  });

  it("blocks an editor from member administration", async () => {
    const editor = await signInAs("editor");

    const members = await editor
      .from("editorial_members")
      .select("profile_id");

    expect(members.data).toHaveLength(1);

    const insert = await editor
      .from("editorial_members")
      .insert({ profile_id: ids.reader, role: "author" });

    expect(insert.error).not.toBeNull();

    const audit = await editor.from("editorial_audit_log").insert({
      actor_profile_id: ids.editor,
      action: "member.invite",
    });

    expect(audit.error).not.toBeNull();

    const grant = await editor.rpc("grant_editorial_membership", {
      p_profile_id: ids.reader,
      p_role: "author",
      p_invited: false,
    });

    expect(grant.error).not.toBeNull();
  });

  it("lets an admin list members and change a role with an audit entry", async () => {
    const adminClient = await signInAs("adminA");

    const members = await adminClient
      .from("editorial_members")
      .select("profile_id, role");

    expect((members.data ?? []).length).toBeGreaterThanOrEqual(4);

    const change = await adminClient.rpc("change_editorial_role", {
      p_profile_id: ids.author,
      p_role: "editor",
    });

    expect(change.error).toBeNull();

    const { data: after } = await admin
      .from("editorial_members")
      .select("role")
      .eq("profile_id", ids.author)
      .single();

    expect(after?.role).toBe("editor");

    const { data: auditRows } = await admin
      .from("editorial_audit_log")
      .select("action")
      .eq("target_profile_id", ids.author)
      .eq("action", "member.role_changed");

    expect(auditRows?.length).toBeGreaterThanOrEqual(1);
  });

  it("does not expose direct membership writes to the admin client", async () => {
    const adminClient = await signInAs("adminA");

    const insert = await adminClient
      .from("editorial_members")
      .insert({ profile_id: ids.reader, role: "author" });
    const update = await adminClient
      .from("editorial_members")
      .update({ role: "editor" })
      .eq("profile_id", ids.author);
    const remove = await adminClient
      .from("editorial_members")
      .delete()
      .eq("profile_id", ids.author);

    expect(insert.error).not.toBeNull();
    expect(update.error).not.toBeNull();
    expect(remove.error).not.toBeNull();
  });

  it("lets an admin grant an existing user without a new invite", async () => {
    const adminClient = await signInAs("adminA");

    const grant = await adminClient.rpc("grant_editorial_membership", {
      p_profile_id: ids.reader,
      p_role: "author",
      p_invited: false,
    });

    expect(grant.error).toBeNull();

    const { data: membership } = await admin
      .from("editorial_members")
      .select("role")
      .eq("profile_id", ids.reader)
      .single();

    expect(membership?.role).toBe("author");

    const { data: auditRows } = await admin
      .from("editorial_audit_log")
      .select("action")
      .eq("target_profile_id", ids.reader)
      .eq("action", "member.granted_existing");

    expect(auditRows?.length).toBeGreaterThanOrEqual(1);
  });

  it("allows multiple admins", async () => {
    const adminClient = await signInAs("adminA");

    const change = await adminClient.rpc("change_editorial_role", {
      p_profile_id: ids.adminB,
      p_role: "editor",
    });

    expect(change.error).toBeNull();

    const { data } = await admin
      .from("editorial_members")
      .select("role")
      .eq("profile_id", ids.adminB)
      .single();

    expect(data?.role).toBe("editor");
  });

  it("blocks demoting or deactivating the last active admin", async () => {
    await admin
      .from("editorial_members")
      .update({ role: "editor" })
      .eq("profile_id", ids.adminB);

    const adminClient = await signInAs("adminA");

    const directDemote = await adminClient
      .from("editorial_members")
      .update({ role: "editor" })
      .eq("profile_id", ids.adminA);

    expect(directDemote.error).not.toBeNull();

    const { data: roleAfter } = await admin
      .from("editorial_members")
      .select("role")
      .eq("profile_id", ids.adminA)
      .single();

    expect(roleAfter?.role).toBe("admin");

    const directDeactivate = await adminClient
      .from("editorial_members")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("profile_id", ids.adminA);

    expect(directDeactivate.error).not.toBeNull();

    const { data: statusAfter } = await admin
      .from("editorial_members")
      .select("deactivated_at")
      .eq("profile_id", ids.adminA)
      .single();

    expect(statusAfter?.deactivated_at).toBeNull();

    // The database trigger also protects service-role and SQL changes.
    const serviceDemote = await admin
      .from("editorial_members")
      .update({ role: "editor" })
      .eq("profile_id", ids.adminA);

    expect(serviceDemote.error).not.toBeNull();

    const serviceDeactivate = await admin
      .from("editorial_members")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("profile_id", ids.adminA);

    expect(serviceDeactivate.error).not.toBeNull();
  });

  it("denies a deactivated admin the admin surface", async () => {
    await admin
      .from("editorial_members")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("profile_id", ids.adminB);

    const adminClient = await signInAs("adminB");

    const members = await adminClient
      .from("editorial_members")
      .select("profile_id");

    expect(members.data).toHaveLength(1);

    const grant = await adminClient.rpc("grant_editorial_membership", {
      p_profile_id: ids.reader,
      p_role: "author",
      p_invited: false,
    });

    expect(grant.error).not.toBeNull();
  });

  it("limits audit reads and writes to admins", async () => {
    const adminClient = await signInAs("adminA");
    const adminAudit = await adminClient
      .from("editorial_audit_log")
      .select("id");

    expect(adminAudit.error).toBeNull();

    const editor = await signInAs("editor");
    const editorAudit = await editor
      .from("editorial_audit_log")
      .select("id");

    expect(editorAudit.data ?? []).toHaveLength(0);

    const editorInsert = await editor.rpc("record_editorial_audit", {
      p_action: "member.invite_failed",
      p_target_email: "blocked@example.com",
    });

    expect(editorInsert.error).not.toBeNull();
  });
});
