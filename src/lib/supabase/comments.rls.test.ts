import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapPublicComments, selectVisibleComments } from "@/features/comments/queries";

// Phase 13: post-moderated comments and reports. Readers sign up through the
// public Auth API, as visitors do; editorial accounts are created by the admin
// API, as invitations do. Every assertion runs with a real user-scoped client;
// the service client only sets up fixtures and inspects rows.

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
  reader: `rls-comment-reader-${runId}@example.com`,
  otherReader: `rls-comment-other-${runId}@example.com`,
  // Reader without a display name.
  nameless: `rls-comment-nameless-${runId}@example.com`,
  // Readers whose comment and report budgets are exhausted on purpose.
  burst: `rls-comment-burst-${runId}@example.com`,
  reportBurst: `rls-comment-report-burst-${runId}@example.com`,
  deleting: `rls-comment-deleting-${runId}@example.com`,
  // Deleted by the Auth admin API without the preflight (safety net only).
  cascading: `rls-comment-cascading-${runId}@example.com`,
  author: `rls-comment-author-${runId}@example.com`,
  editor: `rls-comment-editor-${runId}@example.com`,
  admin: `rls-comment-admin-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const createdUserIds: string[] = [];
const createdPostIds: string[] = [];

const fixtures = {
  category: "",
  published: "",
  // Published, then unpublished by one test.
  unpublishing: "",
  draft: "",
};

const anonymizedName = "Silinmiş kullanıcı";

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

function displayNameFor(key: UserKey): string | undefined {
  return key === "nameless" ? undefined : `Okur ${key} ${runId}`;
}

async function createReader(key: UserKey) {
  const displayName = displayNameFor(key);
  const { data, error } = await anonymousClient().auth.signUp({
    email: emails[key],
    password,
    options: displayName ? { data: { display_name: displayName } } : undefined,
  });

  if (error) throw error;
  if (!data.user) throw new Error("Sign-up returned no user");

  userIds[key] = data.user.id;
  createdUserIds.push(data.user.id);

  const { error: confirmError } = await service.auth.admin.updateUserById(
    data.user.id,
    { email_confirm: true },
  );

  if (confirmError) throw confirmError;
}

async function createEditorialUser(key: UserKey, role: "admin" | "editor" | "author") {
  const { data, error } = await service.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
    user_metadata: { display_name: displayNameFor(key) },
  });

  if (error) throw error;

  userIds[key] = data.user.id;
  createdUserIds.push(data.user.id);

  const { error: membershipError } = await service
    .from("editorial_members")
    .insert({ profile_id: data.user.id, role });

  if (membershipError) throw membershipError;
}

async function insertPost(slug: string, published: boolean) {
  const { data, error } = await service
    .from("posts")
    .insert({
      title: `Yorum testi ${slug}`,
      slug,
      category_id: fixtures.category,
      body: { type: "doc", content: [{ type: "paragraph" }] },
      content_version: 1,
      created_by: userIds.editor,
      ...(published
        ? { status: "published", published_at: new Date().toISOString() }
        : {}),
    })
    .select("id")
    .single();

  if (error) throw error;

  createdPostIds.push(data.id);
  return data.id as string;
}

let bodyCounter = 0;

function uniqueBody(label = "Yorum"): string {
  bodyCounter += 1;
  return `${label} ${runId} #${bodyCounter}`;
}

async function comment(key: UserKey, postId: string, body = uniqueBody()) {
  const { error } = await clients[key].from("comments").insert({ post_id: postId, body });
  if (error) return { error, id: null };

  const { data, error: lookupError } = await service
    .from("comments")
    .select("id")
    .eq("post_id", postId)
    .eq("body", body)
    .single();

  if (lookupError) throw lookupError;

  return { error: null, id: data.id as string };
}

// Service-side fixture comment in a user's name (no rate limit applies).
async function seedComment(key: UserKey, postId: string, body = uniqueBody("Tohum")) {
  const { data, error } = await service
    .from("comments")
    .insert({ post_id: postId, user_id: userIds[key], display_name: "yok", body })
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

async function commentRow(id: string) {
  const { data, error } = await service
    .from("comments")
    .select("user_id, display_name, body, status")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function publicIds(postId: string): Promise<string[]> {
  const { data, error } = await selectVisibleComments(anonymousClient(), postId);
  expect(error).toBeNull();
  return mapPublicComments(data).map((row) => row.id);
}

function moderate(client: SupabaseClient, commentId: string, status: string) {
  return client.rpc("moderate_comment", { p_comment_id: commentId, p_status: status });
}

beforeAll(async () => {
  await Promise.all([
    createReader("reader"),
    createReader("otherReader"),
    createReader("nameless"),
    createReader("burst"),
    createReader("reportBurst"),
    createReader("deleting"),
    createReader("cascading"),
  ]);
  await createEditorialUser("author", "author");
  await createEditorialUser("editor", "editor");
  await createEditorialUser("admin", "admin");

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signIn(key);
  }

  const { data: category, error: categoryError } = await service
    .from("categories")
    .select("id")
    .limit(1)
    .single();

  if (categoryError) throw categoryError;
  fixtures.category = category.id;

  fixtures.published = await insertPost(`comment-published-${runId}`, true);
  fixtures.unpublishing = await insertPost(`comment-unpublishing-${runId}`, true);
  fixtures.draft = await insertPost(`comment-draft-${runId}`, false);
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await service.from("posts").delete().in("id", createdPostIds);
  }

  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("comment writes", () => {
  it("publishes a reader's comment immediately under their profile name", async () => {
    const { error, id } = await comment("reader", fixtures.published, uniqueBody("İlk"));

    expect(error).toBeNull();
    expect(await publicIds(fixtures.published)).toContain(id);

    const row = await commentRow(id!);
    expect(row).toMatchObject({
      user_id: userIds.reader,
      display_name: displayNameFor("reader"),
      status: "visible",
    });
  });

  it("refuses anonymous comments", async () => {
    const { error } = await anonymousClient()
      .from("comments")
      .insert({ post_id: fixtures.published, body: uniqueBody() });

    expect(error?.code).toBe("42501");
  });

  it("refuses impersonation through user_id, display_name, or status", async () => {
    const asOther = await clients.reader.from("comments").insert({
      post_id: fixtures.published,
      user_id: userIds.otherReader,
      body: uniqueBody(),
    });
    const asName = await clients.reader.from("comments").insert({
      post_id: fixtures.published,
      display_name: displayNameFor("otherReader"),
      body: uniqueBody(),
    });
    const hidden = await clients.reader.from("comments").insert({
      post_id: fixtures.published,
      status: "hidden",
      body: uniqueBody(),
    });

    for (const attempt of [asOther, asName, hidden]) {
      expect(attempt.error?.code).toBe("42501");
    }

    const { count } = await service
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userIds.otherReader);
    expect(count).toBe(0);
  });

  it("refuses comments on drafts and missing posts, for every role", async () => {
    for (const key of ["reader", "author", "editor", "admin"] as const) {
      const { error } = await comment(key, fixtures.draft);
      expect(error?.code).toBe("42501");
    }

    const missing = await comment("reader", crypto.randomUUID());
    expect(missing.error).not.toBeNull();

    const { count } = await service
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", fixtures.draft);
    expect(count).toBe(0);
  });

  it("requires a display name", async () => {
    const { error } = await comment("nameless", fixtures.published);
    expect(error?.code).toBe("23502");
  });

  it("enforces the length limit and plain trimmed bodies", async () => {
    for (const body of ["", "   ", " padded ", "x".repeat(2001)]) {
      const { error } = await clients.reader
        .from("comments")
        .insert({ post_id: fixtures.published, body });
      expect(error?.code).toBe("23514");
    }

    const longest = await comment("reader", fixtures.published, `${"y".repeat(1990)}${runId}`);
    expect(longest.error).toBeNull();
  });

  it("refuses the same comment twice in a row", async () => {
    const body = uniqueBody("Tekrar");
    expect((await comment("otherReader", fixtures.published, body)).error).toBeNull();

    const again = await comment("otherReader", fixtures.published, body);
    expect(again.error?.code).toBe("PT409");
  });

  it("rate-limits comments per user", async () => {
    for (let index = 0; index < 10; index += 1) {
      const { error } = await comment("burst", fixtures.published);
      expect(error).toBeNull();
    }

    const { error } = await comment("burst", fixtures.published);
    expect(error?.code).toBe("PT429");

    // Other users keep their own budget.
    expect((await comment("otherReader", fixtures.published)).error).toBeNull();
  });

  it("never exposes user_id to clients", async () => {
    for (const client of [anonymousClient(), clients.reader, clients.admin]) {
      const { error } = await client
        .from("comments")
        .select("user_id")
        .eq("post_id", fixtures.published);
      expect(error?.code).toBe("42501");
    }
  });

  it("lists only the caller's own visible comment ids", async () => {
    const own = await seedComment("reader", fixtures.published);
    const other = await seedComment("otherReader", fixtures.published);

    const { data, error } = await clients.reader.rpc("list_own_comment_ids", {
      p_post_id: fixtures.published,
    });

    expect(error).toBeNull();
    expect(data).toContain(own);
    expect(data).not.toContain(other);

    const anon = await anonymousClient().rpc("list_own_comment_ids", {
      p_post_id: fixtures.published,
    });
    expect(anon.error).not.toBeNull();
  });
});

describe("own deletion and editing", () => {
  it("lets the owner delete their comment, and nobody else", async () => {
    const id = await seedComment("reader", fixtures.published);

    for (const key of ["otherReader", "author", "editor", "admin"] as const) {
      const { data, error } = await clients[key]
        .from("comments")
        .delete()
        .eq("id", id)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }

    const anon = await anonymousClient().from("comments").delete().eq("id", id);
    expect(anon.error).not.toBeNull();
    expect(await commentRow(id)).not.toBeNull();

    const { data, error } = await clients.reader
      .from("comments")
      .delete()
      .eq("id", id)
      .select("post_id");
    expect(error).toBeNull();
    expect(data).toEqual([{ post_id: fixtures.published }]);
    expect(await commentRow(id)).toBeNull();
  });

  it("allows no comment editing, not even by the owner", async () => {
    const id = await seedComment("reader", fixtures.published);

    for (const key of ["reader", "editor", "admin"] as const) {
      const { error } = await clients[key]
        .from("comments")
        .update({ body: "Değiştirildi", status: "hidden" })
        .eq("id", id);
      expect(error?.code).toBe("42501");
    }

    expect(await commentRow(id)).toMatchObject({ status: "visible" });
  });
});

describe("reports", () => {
  it("lets a reader report a visible comment once, and it stays visible", async () => {
    const id = await seedComment("reader", fixtures.published);

    const first = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "spam" });
    expect(first.error).toBeNull();

    const second = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "abuse" });
    expect(second.error?.code).toBe("23505");

    expect(await publicIds(fixtures.published)).toContain(id);
  });

  it("refuses anonymous reports, own-comment reports, and impersonated reporters", async () => {
    const id = await seedComment("reader", fixtures.published);

    const anon = await anonymousClient()
      .from("comment_reports")
      .insert({ comment_id: id, reason: "spam" });
    expect(anon.error?.code).toBe("42501");

    const own = await clients.reader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "spam" });
    expect(own.error?.code).toBe("42501");

    const impersonated = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reporter_id: userIds.editor, reason: "spam" });
    expect(impersonated.error?.code).toBe("42501");

    const invalidReason = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "dislike" });
    expect(invalidReason.error?.code).toBe("23514");
  });

  it("keeps reports private to their reporter and the moderators", async () => {
    const id = await seedComment("reader", fixtures.published);
    const { error } = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "off_topic" });
    expect(error).toBeNull();

    const own = await clients.otherReader
      .from("comment_reports")
      .select("comment_id, reason")
      .eq("comment_id", id);
    expect(own.data).toEqual([{ comment_id: id, reason: "off_topic" }]);

    for (const key of ["reader", "author"] as const) {
      const { data } = await clients[key]
        .from("comment_reports")
        .select("id")
        .eq("comment_id", id);
      expect(data ?? []).toEqual([]);
    }

    const anon = await anonymousClient().from("comment_reports").select("id");
    expect(anon.error).not.toBeNull();

    const editor = await clients.editor
      .from("comment_reports")
      .select("reason")
      .eq("comment_id", id);
    expect(editor.data).toEqual([{ reason: "off_topic" }]);

    // Reporter identity is not selectable, even for moderators.
    const reporter = await clients.admin.from("comment_reports").select("reporter_id");
    expect(reporter.error?.code).toBe("42501");
  });

  it("rate-limits reports per user", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 21; index += 1) {
      ids.push(await seedComment("reader", fixtures.published));
    }

    for (const id of ids.slice(0, 20)) {
      const { error } = await clients.reportBurst
        .from("comment_reports")
        .insert({ comment_id: id, reason: "spam" });
      expect(error).toBeNull();
    }

    const { error } = await clients.reportBurst
      .from("comment_reports")
      .insert({ comment_id: ids[20], reason: "spam" });
    expect(error?.code).toBe("PT429");

    // Reports never hide on their own.
    expect(await publicIds(fixtures.published)).toEqual(expect.arrayContaining(ids));
  });
});

describe("moderation", () => {
  it("denies status changes to anonymous visitors, readers, and authors", async () => {
    const id = await seedComment("reader", fixtures.published);

    const anon = await moderate(anonymousClient(), id, "hidden");
    expect(anon.error).not.toBeNull();

    for (const key of ["reader", "otherReader", "author"] as const) {
      const { error } = await moderate(clients[key], id, "hidden");
      expect(error?.code).toBe("42501");
    }

    expect(await commentRow(id)).toMatchObject({ status: "visible" });
  });

  it("lets an editor hide and restore a reported comment", async () => {
    const id = await seedComment("reader", fixtures.published);
    expect(
      (await clients.otherReader.from("comment_reports").insert({ comment_id: id, reason: "abuse" }))
        .error,
    ).toBeNull();

    const hidden = await moderate(clients.editor, id, "hidden");
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([
      { post_id: fixtures.published, post_slug: `comment-published-${runId}` },
    ]);
    expect(await publicIds(fixtures.published)).not.toContain(id);

    // Signed-in non-moderators do not see it either; the owner still does.
    const other = await clients.otherReader.from("comments").select("id").eq("id", id);
    expect(other.data).toEqual([]);
    const owner = await clients.reader.from("comments").select("status").eq("id", id);
    expect(owner.data).toEqual([{ status: "hidden" }]);

    // A hidden comment cannot be reported any more.
    const report = await clients.author
      .from("comment_reports")
      .insert({ comment_id: id, reason: "spam" });
    expect(report.error?.code).toBe("42501");

    const restored = await moderate(clients.editor, id, "visible");
    expect(restored.error).toBeNull();
    expect(await publicIds(fixtures.published)).toContain(id);

    const { data: audit } = await service
      .from("editorial_audit_log")
      .select("action")
      .eq("actor_profile_id", userIds.editor)
      .contains("details", { comment_id: id });
    expect((audit ?? []).map((row) => row.action).sort()).toEqual([
      "comment.hide",
      "comment.restore",
    ]);
  });

  it("lets an admin soft-delete a comment, which is final", async () => {
    const id = await seedComment("reader", fixtures.published);

    const deleted = await moderate(clients.admin, id, "deleted");
    expect(deleted.error).toBeNull();
    expect(await publicIds(fixtures.published)).not.toContain(id);
    expect(await commentRow(id)).toMatchObject({ status: "deleted" });

    const restore = await moderate(clients.admin, id, "visible");
    expect(restore.error?.code).toBe("23514");

    const unknown = await moderate(clients.admin, id, "published");
    expect(unknown.error?.code).toBe("22023");

    const missing = await moderate(clients.admin, crypto.randomUUID(), "hidden");
    expect(missing.error?.code).toBe("P0002");
  });

  it("lets moderators read every status, and nobody else", async () => {
    const hiddenId = await seedComment("reader", fixtures.published);
    expect((await moderate(clients.editor, hiddenId, "hidden")).error).toBeNull();

    for (const key of ["editor", "admin"] as const) {
      const { data } = await clients[key].from("comments").select("id").eq("id", hiddenId);
      expect(data).toEqual([{ id: hiddenId }]);
    }

    for (const key of ["author", "otherReader"] as const) {
      const { data } = await clients[key].from("comments").select("id").eq("id", hiddenId);
      expect(data).toEqual([]);
    }
  });
});

describe("publication visibility", () => {
  it("hides comments publicly while their post is not published", async () => {
    const id = await seedComment("reader", fixtures.unpublishing);
    expect(await publicIds(fixtures.unpublishing)).toContain(id);

    const { error } = await service
      .from("posts")
      .update({ status: "draft", published_at: null })
      .eq("id", fixtures.unpublishing);
    if (error) throw error;

    expect(await publicIds(fixtures.unpublishing)).toEqual([]);

    const reader = await clients.otherReader
      .from("comments")
      .select("id")
      .eq("post_id", fixtures.unpublishing);
    expect(reader.data).toEqual([]);

    const report = await clients.otherReader
      .from("comment_reports")
      .insert({ comment_id: id, reason: "spam" });
    expect(report.error?.code).toBe("42501");
  });
});

describe("account deletion", () => {
  it("anonymizes the caller's comments in the preflight and keeps the body", async () => {
    const body = uniqueBody("Silinecek hesabın yorumu");
    const { error: commentError, id } = await comment("deleting", fixtures.published, body);
    expect(commentError).toBeNull();
    const othersComment = await seedComment("reader", fixtures.published);

    const { error } = await clients.deleting.rpc("prepare_own_account_deletion");
    expect(error).toBeNull();

    expect(await commentRow(id!)).toEqual({
      user_id: null,
      display_name: anonymizedName,
      body,
      status: "visible",
    });
    expect(await commentRow(othersComment)).toMatchObject({ user_id: userIds.reader });

    const { data } = await selectVisibleComments(anonymousClient(), fixtures.published);
    const publicRow = mapPublicComments(data).find((row) => row.id === id);
    expect(publicRow).toMatchObject({ displayName: anonymizedName, body });
    expect(JSON.stringify(data)).not.toContain(displayNameFor("deleting"));
  });

  it("anonymizes comments through ON DELETE SET NULL when the preflight is skipped", async () => {
    const body = uniqueBody("Doğrudan silinen hesabın yorumu");
    const { error: commentError, id } = await comment("cascading", fixtures.published, body);
    expect(commentError).toBeNull();

    const { error } = await service.auth.admin.deleteUser(userIds.cascading);
    expect(error).toBeNull();

    expect(await commentRow(id!)).toEqual({
      user_id: null,
      display_name: anonymizedName,
      body,
      status: "visible",
    });
  });
});
