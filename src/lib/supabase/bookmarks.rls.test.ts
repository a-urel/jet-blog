import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapSavedRows, selectSavedPosts } from "@/features/bookmarks/queries";

// Phase 12: private bookmarks. Readers sign up through the public Auth API, as
// visitors do; editorial accounts are created by the admin API, as invitations
// do. Every assertion runs with a real user-scoped client, never service-only.

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
  reader: `rls-bookmark-reader-${runId}@example.com`,
  otherReader: `rls-bookmark-other-${runId}@example.com`,
  // Reader whose bookmark budget is exhausted on purpose.
  burst: `rls-bookmark-burst-${runId}@example.com`,
  deleting: `rls-bookmark-deleting-${runId}@example.com`,
  // Deleted by the Auth admin API without the preflight (cascade only).
  cascading: `rls-bookmark-cascading-${runId}@example.com`,
  admin: `rls-bookmark-admin-${runId}@example.com`,
  editor: `rls-bookmark-editor-${runId}@example.com`,
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
  // Published for the whole file.
  published: "",
  // A second published post, unpublished by one test.
  unpublishing: "",
  // Never published.
  draft: "",
  // Published, then deleted by one test.
  removable: "",
};

const draftTitle = `Gizli taslak başlığı ${runId}`;
const unpublishedTitle = `Yayından kalkacak ${runId}`;

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

async function createReader(key: UserKey) {
  const { data, error } = await anonymousClient().auth.signUp({
    email: emails[key],
    password,
    options: { data: { display_name: `Okur ${key}` } },
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

async function createEditorialUser(key: UserKey, role: "admin" | "editor") {
  const { data, error } = await service.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
  });

  if (error) throw error;

  userIds[key] = data.user.id;
  createdUserIds.push(data.user.id);

  const { error: membershipError } = await service
    .from("editorial_members")
    .insert({ profile_id: data.user.id, role });

  if (membershipError) throw membershipError;
}

async function insertPost(slug: string, title: string, published: boolean) {
  const { data, error } = await service
    .from("posts")
    .insert({
      title,
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

  // Public reads and the bookmark policy use the published snapshot.
  if (published) {
    const { error: syncError } = await service.rpc("sync_published_post", { p_post_id: data.id });
    if (syncError) throw syncError;
  }

  return data.id as string;
}

async function bookmarkRows(userId: string) {
  const { data, error } = await service
    .from("bookmarks")
    .select("post_id")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []).map((row) => row.post_id as string);
}

function bookmark(client: SupabaseClient, postId: string) {
  return client.from("bookmarks").insert({ post_id: postId });
}

beforeAll(async () => {
  await Promise.all([
    createReader("reader"),
    createReader("otherReader"),
    createReader("burst"),
    createReader("deleting"),
    createReader("cascading"),
  ]);
  await createEditorialUser("admin", "admin");
  await createEditorialUser("editor", "editor");

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

  fixtures.published = await insertPost(`bookmark-published-${runId}`, `Kaydedilebilir ${runId}`, true);
  fixtures.unpublishing = await insertPost(`bookmark-unpublishing-${runId}`, unpublishedTitle, true);
  fixtures.draft = await insertPost(`bookmark-draft-${runId}`, draftTitle, false);
  fixtures.removable = await insertPost(`bookmark-removable-${runId}`, `Silinecek ${runId}`, true);
});

afterAll(async () => {
  if (createdPostIds.length > 0) {
    await service.from("posts").delete().in("id", createdPostIds);
  }

  for (const id of createdUserIds) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("bookmark writes", () => {
  it("lets a reader bookmark a published post once", async () => {
    const first = await bookmark(clients.reader, fixtures.published);
    expect(first.error).toBeNull();

    const second = await bookmark(clients.reader, fixtures.published);
    expect(second.error?.code).toBe("23505");

    expect(await bookmarkRows(userIds.reader)).toEqual([fixtures.published]);
  });

  it("lets two readers bookmark the same post independently", async () => {
    const { error } = await bookmark(clients.otherReader, fixtures.published);

    expect(error).toBeNull();
    expect(await bookmarkRows(userIds.otherReader)).toEqual([fixtures.published]);
  });

  it("refuses bookmarks for drafts, even for editorial members who can read them", async () => {
    for (const key of ["reader", "editor", "admin"] as const) {
      const { error } = await bookmark(clients[key], fixtures.draft);
      expect(error?.code).toBe("42501");
    }

    const { data } = await clients.editor.from("posts").select("id").eq("id", fixtures.draft);
    expect(data).toHaveLength(1);

    const { count } = await service
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("post_id", fixtures.draft);
    expect(count).toBe(0);
  });

  it("refuses a bookmark for a post that does not exist", async () => {
    const { error } = await bookmark(clients.reader, crypto.randomUUID());
    expect(error).not.toBeNull();
  });

  it("refuses a bookmark in another user's name", async () => {
    const { error } = await clients.reader
      .from("bookmarks")
      .insert({ user_id: userIds.otherReader, post_id: fixtures.unpublishing });

    expect(error?.code).toBe("42501");
    expect(await bookmarkRows(userIds.otherReader)).toEqual([fixtures.published]);
  });

  it("allows no updates", async () => {
    const { data: rows } = await clients.reader
      .from("bookmarks")
      .select("id")
      .eq("post_id", fixtures.published);
    const { error } = await clients.reader
      .from("bookmarks")
      .update({ post_id: fixtures.unpublishing })
      .eq("id", rows![0].id);

    expect(error).not.toBeNull();
    expect(await bookmarkRows(userIds.reader)).toEqual([fixtures.published]);
  });

  it("denies every anonymous request", async () => {
    const anon = anonymousClient();
    const read = await anon.from("bookmarks").select("id");
    const write = await bookmark(anon, fixtures.published);
    const remove = await anon
      .from("bookmarks")
      .delete()
      .eq("post_id", fixtures.published)
      .select("id");

    expect(read.error).not.toBeNull();
    expect(write.error).not.toBeNull();
    expect(remove.error).not.toBeNull();

    const { count } = await service
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("post_id", fixtures.published);
    expect(count).toBe(2);
  });

  it("rate-limits bookmark creation per user", async () => {
    const { error: seedError } = await service.from("rate_limit_events").insert(
      Array.from({ length: 60 }, () => ({
        actor_id: userIds.burst,
        action: "bookmark.create",
      })),
    );
    if (seedError) throw seedError;

    const denied = await bookmark(clients.burst, fixtures.published);

    expect(denied.error?.code).toBe("PT429");
    expect(denied.status).toBe(429);
    expect(await bookmarkRows(userIds.burst)).toEqual([]);

    // Another user's budget is untouched.
    const { error } = await bookmark(clients.editor, fixtures.published);
    expect(error).toBeNull();
    await clients.editor.from("bookmarks").delete().eq("post_id", fixtures.published);
  });
});

describe("bookmark isolation", () => {
  it("shows each reader only their own rows", async () => {
    const { data: own } = await clients.reader.from("bookmarks").select("user_id, post_id");
    const { data: other } = await clients.otherReader.from("bookmarks").select("user_id, post_id");

    expect(own).toEqual([{ user_id: userIds.reader, post_id: fixtures.published }]);
    expect(other).toEqual([{ user_id: userIds.otherReader, post_id: fixtures.published }]);

    const filtered = await clients.otherReader
      .from("bookmarks")
      .select("id")
      .eq("user_id", userIds.reader);
    expect(filtered.data).toEqual([]);
  });

  it("does not let a reader delete another reader's bookmark", async () => {
    const { data } = await clients.otherReader
      .from("bookmarks")
      .delete()
      .eq("user_id", userIds.reader)
      .select("id");

    expect(data ?? []).toEqual([]);
    expect(await bookmarkRows(userIds.reader)).toEqual([fixtures.published]);
  });

  it("gives editors and admins no access to other users' bookmarks", async () => {
    for (const key of ["editor", "admin"] as const) {
      const read = await clients[key]
        .from("bookmarks")
        .select("id")
        .in("user_id", [userIds.reader, userIds.otherReader]);
      const remove = await clients[key]
        .from("bookmarks")
        .delete()
        .eq("user_id", userIds.reader)
        .select("id");

      expect(read.data ?? []).toEqual([]);
      expect(remove.data ?? []).toEqual([]);
    }

    expect(await bookmarkRows(userIds.reader)).toEqual([fixtures.published]);
  });

  it("lets the owner remove a bookmark", async () => {
    await bookmark(clients.otherReader, fixtures.removable);
    const { data, error } = await clients.otherReader
      .from("bookmarks")
      .delete()
      .eq("post_id", fixtures.removable)
      .select("post_id");

    expect(error).toBeNull();
    expect(data).toEqual([{ post_id: fixtures.removable }]);
  });
});

describe("saved list", () => {
  it("lists the reader's published bookmarks, newest first", async () => {
    expect((await bookmark(clients.reader, fixtures.unpublishing)).error).toBeNull();

    const { data, error } = await selectSavedPosts(clients.reader, userIds.reader);

    expect(error).toBeNull();
    expect(mapSavedRows(data).map((post) => post.id)).toEqual([
      fixtures.unpublishing,
      fixtures.published,
    ]);
  });

  it("drops a post that is unpublished later without leaking its content", async () => {
    // The editor also saves it: members can read working copies, so the
    // snapshot embed is what hides it from them.
    expect((await bookmark(clients.editor, fixtures.unpublishing)).error).toBeNull();

    const { data: current, error: currentError } = await service
      .from("posts")
      .select("revision")
      .eq("id", fixtures.unpublishing)
      .single();
    if (currentError) throw currentError;

    const { error: unpublishError } = await clients.editor.rpc("unpublish_post", {
      p_post_id: fixtures.unpublishing,
      p_expected_revision: current.revision,
    });
    if (unpublishError) throw unpublishError;

    const { error: renameError } = await service
      .from("posts")
      .update({ title: `${unpublishedTitle} taslak` })
      .eq("id", fixtures.unpublishing);
    if (renameError) throw renameError;

    for (const key of ["reader", "editor"] as const) {
      const { data, error } = await selectSavedPosts(clients[key], userIds[key]);

      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain(unpublishedTitle);
      expect(mapSavedRows(data).map((post) => post.id)).not.toContain(fixtures.unpublishing);
    }

    // The bookmark row itself stays, so a republished post returns to the list.
    expect(await bookmarkRows(userIds.reader)).toContain(fixtures.unpublishing);
  });

  it("never returns a draft through the embed", async () => {
    // Neither the snapshot nor the private working copy leaks through.
    for (const embed of ["post:published_post(title)", "post:posts(title)"]) {
      const { data, error } = await clients.reader
        .from("bookmarks")
        .select(embed)
        .eq("post_id", fixtures.unpublishing);

      expect(error).toBeNull();
      expect(data).toEqual([{ post: null }]);
      expect(JSON.stringify(data)).not.toContain(unpublishedTitle);
    }
  });
});

describe("deletion", () => {
  it("removes bookmarks when their post is deleted", async () => {
    expect((await bookmark(clients.reader, fixtures.removable)).error).toBeNull();

    const { error } = await service.from("posts").delete().eq("id", fixtures.removable);
    expect(error).toBeNull();

    const { count } = await service
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("post_id", fixtures.removable);
    expect(count).toBe(0);
  });

  it("removes the caller's bookmarks in the account-deletion preflight only", async () => {
    expect((await bookmark(clients.deleting, fixtures.published)).error).toBeNull();

    const { error } = await clients.deleting.rpc("prepare_own_account_deletion");

    expect(error).toBeNull();
    expect(await bookmarkRows(userIds.deleting)).toEqual([]);
    expect(await bookmarkRows(userIds.reader)).toContain(fixtures.published);
    expect(await bookmarkRows(userIds.otherReader)).toEqual([fixtures.published]);
  });

  it("cascades bookmarks when the Auth user is deleted", async () => {
    expect((await bookmark(clients.cascading, fixtures.published)).error).toBeNull();

    const { error } = await service.auth.admin.deleteUser(userIds.cascading);
    expect(error).toBeNull();

    expect(await bookmarkRows(userIds.cascading)).toEqual([]);
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("id", userIds.cascading);
    expect(count).toBe(0);
  });
});
