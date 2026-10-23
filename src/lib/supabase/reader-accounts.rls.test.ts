import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { testImages } from "@/features/media/test-images";

// Phase 11: self-service reader accounts. Readers sign up through the public
// Auth API (as the /signup Server Action does), never through the admin API,
// so these tests exercise the same path a visitor uses.

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
  // Self-service accounts.
  reader: `rls-reader-${runId}@example.com`,
  otherReader: `rls-reader-other-${runId}@example.com`,
  unconfirmed: `rls-reader-unconfirmed-${runId}@example.com`,
  deleting: `rls-reader-deleting-${runId}@example.com`,
  // Editorial accounts created by the admin API, as invitations do.
  admin: `rls-reader-admin-${runId}@example.com`,
  editor: `rls-reader-editor-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const createdUserIds: string[] = [];
const createdPostIds: string[] = [];
const createdAuthorIds: string[] = [];

const fixtures = { draft: "", published: "", category: "" };

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(key: UserKey): Promise<SupabaseClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({
    email: emails[key],
    password,
  });

  if (error) throw error;

  return client;
}

async function selfSignUp(key: UserKey, data: Record<string, unknown> = {}) {
  const { data: result, error } = await anonymousClient().auth.signUp({
    email: emails[key],
    password,
    options: { data: { display_name: `Okur ${key}`, ...data } },
  });

  if (error) throw error;
  if (!result.user) throw new Error("Sign-up returned no user");

  userIds[key] = result.user.id;
  createdUserIds.push(result.user.id);

  return result;
}

async function confirmEmail(key: UserKey) {
  const { error } = await service.auth.admin.updateUserById(userIds[key], {
    email_confirm: true,
  });

  if (error) throw error;
}

async function createEditorialUser(key: UserKey) {
  const { data, error } = await service.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
  });

  if (error) throw error;

  userIds[key] = data.user.id;
  createdUserIds.push(data.user.id);
}

function randomHash() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function insertPost(values: Record<string, unknown>) {
  const { data, error } = await service
    .from("posts")
    .insert({
      body: { type: "doc", content: [{ type: "paragraph" }] },
      content_version: 1,
      ...values,
    })
    .select("id")
    .single();

  if (error) throw error;

  createdPostIds.push(data.id);
  return data.id as string;
}

beforeAll(async () => {
  await selfSignUp("reader", { role: "admin", is_admin: true });
  await confirmEmail("reader");
  await selfSignUp("otherReader");
  await confirmEmail("otherReader");
  await selfSignUp("unconfirmed");
  await selfSignUp("deleting");
  await confirmEmail("deleting");

  await createEditorialUser("admin");
  await createEditorialUser("editor");

  const { error: membershipError } = await service
    .from("editorial_members")
    .insert([
      { profile_id: userIds.admin, role: "admin" },
      { profile_id: userIds.editor, role: "editor" },
    ]);

  if (membershipError) throw membershipError;

  const { data: category, error: categoryError } = await service
    .from("categories")
    .select("id")
    .limit(1)
    .single();

  if (categoryError) throw categoryError;
  fixtures.category = category.id;

  fixtures.draft = await insertPost({
    title: `Okur testi taslak ${runId}`,
    slug: `reader-draft-${runId}`,
    created_by: userIds.editor,
  });

  fixtures.published = await insertPost({
    title: `Okur testi yayın ${runId}`,
    slug: `reader-published-${runId}`,
    category_id: fixtures.category,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: userIds.editor,
  });
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await service.from("posts").delete().in("id", createdPostIds);
  }

  if (createdAuthorIds.length > 0) {
    await service.from("authors").delete().in("id", createdAuthorIds);
  }

  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("self-service sign-up", () => {
  it("returns no session until the email is confirmed", async () => {
    const { data, error } = await anonymousClient().auth.signUp({
      email: `rls-reader-session-${runId}@example.com`,
      password,
    });

    expect(error).toBeNull();
    expect(data.session).toBeNull();
    expect(data.user?.email_confirmed_at ?? null).toBeNull();

    if (data.user) createdUserIds.push(data.user.id);
  });

  it("creates a profile and nothing else", async () => {
    const { data: profile } = await service
      .from("profiles")
      .select("id, display_name")
      .eq("id", userIds.reader)
      .single();

    expect(profile).toEqual({
      id: userIds.reader,
      display_name: "Okur reader",
    });

    const { count: memberships } = await service
      .from("editorial_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("profile_id", userIds.reader);
    expect(memberships).toBe(0);

    const { count: authors } = await service
      .from("authors")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userIds.reader);
    expect(authors).toBe(0);

    const { count: auditRows } = await service
      .from("editorial_audit_log")
      .select("id", { count: "exact", head: true })
      .or(`actor_profile_id.eq.${userIds.reader},target_profile_id.eq.${userIds.reader}`);
    expect(auditRows).toBe(0);
  });

  it("ignores role-like user metadata", async () => {
    const reader = await signIn("reader");

    const { data: isAdmin } = await reader.rpc("is_admin");
    const { data: isEditor } = await reader.rpc("is_editor");
    const { data: isMember } = await reader.rpc("is_active_member");

    expect(isAdmin).toBe(false);
    expect(isEditor).toBe(false);
    expect(isMember).toBe(false);
  });

  it("does not create a second account for a registered email", async () => {
    const { data, error } = await anonymousClient().auth.signUp({
      email: emails.reader,
      password: "Another-Pass-2",
    });

    // Supabase returns an obfuscated user instead of an error, so the
    // response does not reveal that the address is registered.
    expect(error).toBeNull();
    expect(data.session).toBeNull();
    expect(data.user?.id).not.toBe(userIds.reader);

    // The original password still works.
    await expect(signIn("reader")).resolves.toBeTruthy();
  });
});

describe("email confirmation", () => {
  it("rejects sign-in before confirmation", async () => {
    const { data, error } = await anonymousClient().auth.signInWithPassword({
      email: emails.unconfirmed,
      password,
    });

    expect(data.session).toBeNull();
    expect(error?.code).toBe("email_not_confirmed");
  });

  it("does not reveal the confirmation state without the password", async () => {
    const { error } = await anonymousClient().auth.signInWithPassword({
      email: emails.unconfirmed,
      password: "Wrong-Pass-9",
    });

    expect(error?.code).toBe("invalid_credentials");
  });

  it("allows sign-in after confirmation", async () => {
    await expect(signIn("otherReader")).resolves.toBeTruthy();
  });

  it("refuses editorial membership for an unconfirmed self-service account", async () => {
    const admin = await signIn("admin");

    const { error: grantError } = await admin.rpc("grant_editorial_membership", {
      p_profile_id: userIds.unconfirmed,
      p_role: "editor",
      p_invited: false,
    });
    expect(grantError?.code).toBe("55000");

    // The trigger also covers secret-key and SQL writes.
    const { error: serviceError } = await service
      .from("editorial_members")
      .insert({ profile_id: userIds.unconfirmed, role: "author" });
    expect(serviceError?.code).toBe("55000");
  });

  it("still lets an admin grant membership to a confirmed account", async () => {
    const admin = await signIn("admin");

    const { error } = await admin.rpc("grant_editorial_membership", {
      p_profile_id: userIds.otherReader,
      p_role: "author",
      p_invited: false,
    });
    expect(error).toBeNull();

    // Return the account to reader state for the remaining tests.
    const { error: deactivateError } = await admin.rpc("set_editorial_active", {
      p_profile_id: userIds.otherReader,
      p_active: false,
    });
    expect(deactivateError).toBeNull();

    const otherReader = await signIn("otherReader");
    const { data: isMember } = await otherReader.rpc("is_active_member");
    expect(isMember).toBe(false);
  });
});

describe("self-signed-up reader is denied editorial operations", () => {
  let reader: SupabaseClient;

  beforeAll(async () => {
    reader = await signIn("reader");
  });

  it("cannot grant, change, or audit editorial membership", async () => {
    const calls = [
      reader.rpc("grant_editorial_membership", {
        p_profile_id: userIds.reader,
        p_role: "admin",
        p_invited: false,
      }),
      reader.rpc("grant_editorial_membership", {
        p_profile_id: userIds.otherReader,
        p_role: "author",
        p_invited: false,
      }),
      reader.rpc("change_editorial_role", {
        p_profile_id: userIds.editor,
        p_role: "author",
      }),
      reader.rpc("set_editorial_active", {
        p_profile_id: userIds.editor,
        p_active: false,
      }),
      reader.rpc("record_editorial_audit", {
        p_action: "member.invite",
        p_target_profile_id: userIds.reader,
      }),
      reader.rpc("require_admin_actor"),
    ];

    for (const { error } of await Promise.all(calls)) {
      expect(error?.code).toBe("42501");
    }
  });

  it("cannot write editorial tables directly", async () => {
    const { error: memberError } = await reader
      .from("editorial_members")
      .insert({ profile_id: userIds.reader, role: "admin" });
    expect(memberError).not.toBeNull();

    const { error: authorError } = await reader
      .from("authors")
      .insert({ name: "Sahte yazar", slug: `fake-author-${runId}`, user_id: userIds.reader });
    expect(authorError).not.toBeNull();

    const { error: postError } = await reader
      .from("posts")
      .insert({ title: "Sahte", slug: `fake-post-${runId}` });
    expect(postError).not.toBeNull();

    const { data: updated } = await reader
      .from("posts")
      .update({ title: "Ele geçirildi" })
      .eq("id", fixtures.published)
      .select("id");
    expect(updated ?? []).toEqual([]);
  });

  it("sees no editorial rows, drafts, or media records", async () => {
    const { data: members } = await reader.from("editorial_members").select("profile_id");
    expect(members).toEqual([]);

    const { data: audit } = await reader.from("editorial_audit_log").select("id");
    expect(audit).toEqual([]);

    const { data: draft } = await reader
      .from("posts")
      .select("id")
      .eq("id", fixtures.draft);
    expect(draft).toEqual([]);

    const { data: published } = await reader
      .from("posts")
      .select("id")
      .eq("id", fixtures.published);
    expect(published).toEqual([{ id: fixtures.published }]);

    const { data: media } = await reader.from("media").select("id");
    expect(media).toEqual([]);
  });

  it("cannot create, edit, or publish posts", async () => {
    const body = { type: "doc", content: [{ type: "paragraph" }] };

    const calls = [
      reader.rpc("create_draft_post", {
        p_title: "Okur taslağı",
        p_slug: `reader-attempt-${runId}`,
        p_excerpt: null,
        p_category_id: fixtures.category,
        p_tag_ids: [],
        p_credits: [],
        p_body: body,
        p_content_version: 1,
      }),
      reader.rpc("update_post_metadata", {
        p_post_id: fixtures.draft,
        p_expected_revision: 1,
        p_title: "Ele geçirildi",
        p_slug: `reader-draft-${runId}`,
        p_excerpt: null,
        p_category_id: fixtures.category,
        p_tag_ids: [],
        p_credits: [],
        p_body: body,
        p_content_version: 1,
      }),
      reader.rpc("publish_post", {
        p_post_id: fixtures.draft,
        p_expected_revision: 1,
      }),
      reader.rpc("unpublish_post", {
        p_post_id: fixtures.published,
        p_expected_revision: 1,
      }),
    ];

    for (const { error } of await Promise.all(calls)) {
      expect(error?.code).toBe("42501");
    }

    const { data: draft } = await service
      .from("posts")
      .select("title, status")
      .eq("id", fixtures.draft)
      .single();
    expect(draft?.status).toBe("draft");
    expect(draft?.title).toBe(`Okur testi taslak ${runId}`);
  });

  it("cannot upload, register, or delete media", async () => {
    const path = crypto.randomUUID();
    const { error: uploadError } = await reader.storage
      .from("media")
      .upload(path, testImages.png, { contentType: "image/png" });
    expect(uploadError).not.toBeNull();

    const { error: registerError } = await reader.rpc("register_media", {
      p_media_id: path,
      p_width: 1,
      p_height: 1,
    });
    expect(registerError).not.toBeNull();

    const { error: deleteError } = await reader.rpc("delete_media", {
      p_media_id: path,
    });
    expect(deleteError).not.toBeNull();
  });

  it("reads and renames only its own profile", async () => {
    const { data: profiles } = await reader.from("profiles").select("id");
    expect(profiles).toEqual([{ id: userIds.reader }]);

    const { data: renamed, error } = await reader
      .from("profiles")
      .update({ display_name: "Yeni Okur Adı" })
      .eq("id", userIds.reader)
      .select("display_name");
    expect(error).toBeNull();
    expect(renamed).toEqual([{ display_name: "Yeni Okur Adı" }]);

    const { data: other } = await reader
      .from("profiles")
      .update({ display_name: "Ele geçirildi" })
      .eq("id", userIds.otherReader)
      .select("id");
    expect(other ?? []).toEqual([]);

    // Only display_name is writable, so a reader cannot move its profile id.
    const { error: idError } = await reader
      .from("profiles")
      .update({ id: userIds.otherReader })
      .eq("id", userIds.reader);
    expect(idError).not.toBeNull();
  });

  it("cannot touch the Auth rate-limit bookkeeping", async () => {
    for (const client of [reader, anonymousClient()]) {
      const { error } = await client.rpc("consume_auth_rate_limit", {
        p_action: "auth.sign_in",
        p_email_hash: randomHash(),
        p_ip_hash: null,
      });
      expect(error).not.toBeNull();

      const { data } = await client.from("auth_rate_limit_events").select("id");
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("password reset", () => {
  it("answers the same for registered and unknown emails", async () => {
    const client = anonymousClient();
    const known = await client.auth.resetPasswordForEmail(emails.otherReader);
    const unknown = await client.auth.resetPasswordForEmail(
      `rls-nobody-${runId}@example.com`,
    );

    expect(known.error).toBeNull();
    expect(unknown.error).toBeNull();
    expect(unknown.data).toEqual(known.data);
  });
});

describe("Auth flow rate limits", () => {
  it("rejects the attempt after the email budget is spent", async () => {
    const emailHash = randomHash();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await service.rpc("consume_auth_rate_limit", {
        p_action: "auth.password_reset",
        p_email_hash: emailHash,
        p_ip_hash: randomHash(),
      });
      expect(error).toBeNull();
    }

    const { error } = await service.rpc("consume_auth_rate_limit", {
      p_action: "auth.password_reset",
      p_email_hash: emailHash,
      p_ip_hash: randomHash(),
    });
    expect(error?.code).toBe("PT429");

    // Another email from a fresh client is unaffected.
    const { error: otherError } = await service.rpc("consume_auth_rate_limit", {
      p_action: "auth.password_reset",
      p_email_hash: randomHash(),
      p_ip_hash: randomHash(),
    });
    expect(otherError).toBeNull();
  });

  it("limits a client IP across different emails", async () => {
    const ipHash = randomHash();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { error } = await service.rpc("consume_auth_rate_limit", {
        p_action: "auth.sign_up",
        p_email_hash: randomHash(),
        p_ip_hash: ipHash,
      });
      expect(error).toBeNull();
    }

    const { error } = await service.rpc("consume_auth_rate_limit", {
      p_action: "auth.sign_up",
      p_email_hash: randomHash(),
      p_ip_hash: ipHash,
    });
    expect(error?.code).toBe("PT429");
  });

  it("rejects unknown actions and malformed subjects", async () => {
    const { error: actionError } = await service.rpc("consume_auth_rate_limit", {
      p_action: "post.create",
      p_email_hash: randomHash(),
      p_ip_hash: null,
    });
    expect(actionError?.code).toBe("22023");

    const { error: hashError } = await service.rpc("consume_auth_rate_limit", {
      p_action: "auth.sign_in",
      p_email_hash: "reader@example.com",
      p_ip_hash: null,
    });
    expect(hashError).not.toBeNull();
  });
});

describe("account deletion", () => {
  it("requires a signed-in caller", async () => {
    const { error } = await anonymousClient().rpc("prepare_own_account_deletion");
    expect(error).not.toBeNull();
  });

  it("removes only the deleting reader's data", async () => {
    const deleting = await signIn("deleting");
    const { error } = await deleting.rpc("prepare_own_account_deletion");
    expect(error).toBeNull();

    // Readers have no editorial membership, so no audit entry is written.
    const { count: auditRows } = await service
      .from("editorial_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("actor_profile_id", userIds.deleting);
    expect(auditRows).toBe(0);

    const { error: deleteError } = await service.auth.admin.deleteUser(
      userIds.deleting,
    );
    expect(deleteError).toBeNull();

    const { data: gone } = await service
      .from("profiles")
      .select("id")
      .eq("id", userIds.deleting);
    expect(gone).toEqual([]);

    const { data: kept } = await service
      .from("profiles")
      .select("id")
      .in("id", [userIds.reader, userIds.otherReader]);
    expect(kept).toHaveLength(2);

  });

  it("blocks an active admin", async () => {
    const admin = await signIn("admin");
    const { error } = await admin.rpc("prepare_own_account_deletion");
    expect(error?.code).toBe("23514");

    const { data: membership } = await service
      .from("editorial_members")
      .select("role, deactivated_at")
      .eq("profile_id", userIds.admin)
      .single();
    expect(membership).toEqual({ role: "admin", deactivated_at: null });
  });

  it("keeps an editor's posts and author credit after deletion", async () => {
    const { data: author, error: authorError } = await service
      .from("authors")
      .insert({
        name: `Silinen Editör ${runId}`,
        slug: `deleted-editor-${runId}`,
        user_id: userIds.editor,
      })
      .select("id")
      .single();
    if (authorError) throw authorError;
    createdAuthorIds.push(author.id);

    const editor = await signIn("editor");
    const { error } = await editor.rpc("prepare_own_account_deletion");
    expect(error).toBeNull();

    const { data: audit } = await service
      .from("editorial_audit_log")
      .select("action, details")
      .eq("actor_profile_id", userIds.editor)
      .eq("action", "member.account_deletion");
    expect(audit).toEqual([
      {
        action: "member.account_deletion",
        details: { role: "editor", deactivated: false },
      },
    ]);

    const { error: deleteError } = await service.auth.admin.deleteUser(
      userIds.editor,
    );
    expect(deleteError).toBeNull();

    const { data: posts } = await service
      .from("posts")
      .select("id, created_by, status")
      .in("id", [fixtures.draft, fixtures.published])
      .order("status");
    expect(posts).toEqual([
      { id: fixtures.draft, created_by: null, status: "draft" },
      { id: fixtures.published, created_by: null, status: "published" },
    ]);

    const { data: keptAuthor } = await service
      .from("authors")
      .select("name, user_id")
      .eq("id", author.id)
      .single();
    expect(keptAuthor).toEqual({ name: `Silinen Editör ${runId}`, user_id: null });

    const { data: membership } = await service
      .from("editorial_members")
      .select("profile_id")
      .eq("profile_id", userIds.editor);
    expect(membership).toEqual([]);
  });
});
