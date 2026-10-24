import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapPublicComments, selectVisibleComments } from "@/features/comments/queries";
import { testImages } from "@/features/media/test-images";

// Avatars: Storage policies, the set_own_avatar/set_author_avatar RPCs, comment
// avatar sync, and account-deletion cleanup across the anonymous, reader,
// author, editor, and admin matrix. Every assertion runs with a real
// user-scoped client; the service client only sets up fixtures and inspects
// rows and objects.

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
const bucket = "avatars";

const emails = {
  reader: `rls-avatar-reader-${runId}@example.com`,
  otherReader: `rls-avatar-other-${runId}@example.com`,
  // Uploads and avatar changes exhausted on purpose.
  busyReader: `rls-avatar-busy-${runId}@example.com`,
  deleting: `rls-avatar-deleting-${runId}@example.com`,
  author: `rls-avatar-author-${runId}@example.com`,
  editor: `rls-avatar-editor-${runId}@example.com`,
  admin: `rls-avatar-admin-${runId}@example.com`,
  // A second admin with a fresh upload budget for the author avatar journey.
  otherAdmin: `rls-avatar-other-admin-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const readerKeys = ["reader", "otherReader", "busyReader", "deleting"] as const;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const uploadedNames: string[] = [];
const createdPostIds: string[] = [];
const createdAuthorIds: string[] = [];

const fixtures = { category: "", post: "", author: "" };

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(key: UserKey): Promise<SupabaseClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({ email: emails[key], password });
  if (error) throw error;
  return client;
}

async function createUser(key: UserKey, role?: "admin" | "editor" | "author") {
  const { data, error } = await service.auth.admin.createUser({
    email: emails[key],
    password,
    email_confirm: true,
    user_metadata: { display_name: `Avatar ${key} ${runId}` },
  });
  if (error) throw error;
  userIds[key] = data.user.id;

  if (role) {
    const { error: membershipError } = await service
      .from("editorial_members")
      .insert({ profile_id: data.user.id, role });
    if (membershipError) throw membershipError;
  }
}

async function upload(
  client: SupabaseClient,
  name: string,
  bytes: Uint8Array = testImages.png,
  contentType = "image/png",
) {
  uploadedNames.push(name);
  const { error } = await client.storage
    .from(bucket)
    .upload(name, bytes, { contentType, upsert: false });
  return error;
}

// Uploads a profile avatar object as the user and returns its UUID.
async function uploadProfileAvatar(key: UserKey): Promise<string> {
  const id = crypto.randomUUID();
  const error = await upload(clients[key], `profiles/${id}`);
  if (error) throw error;
  return id;
}

async function uploadAuthorAvatar(key: UserKey = "admin"): Promise<string> {
  const id = crypto.randomUUID();
  const error = await upload(clients[key], `authors/${id}`);
  if (error) throw error;
  return id;
}

async function objectExists(name: string): Promise<boolean> {
  const [folder, file] = name.split("/");
  const { data, error } = await service.storage.from(bucket).list(folder, { search: file });
  if (error) throw error;
  return (data ?? []).some((entry) => entry.name === file);
}

async function profileAvatar(key: UserKey): Promise<string | null> {
  const { data, error } = await service
    .from("profiles")
    .select("avatar_id")
    .eq("id", userIds[key])
    .single();
  if (error) throw error;
  return data.avatar_id;
}

async function setOwnAvatar(client: SupabaseClient, avatarId: string | null) {
  return client.rpc("set_own_avatar", { p_avatar_id: avatarId }).single<{
    previous_avatar_id: string | null;
    post_ids: string[];
    post_slugs: string[];
  }>();
}

async function authorUpdatedAt(id: string): Promise<string> {
  const { data, error } = await service.from("authors").select("updated_at").eq("id", id).single();
  if (error) throw error;
  return data.updated_at;
}

async function setAuthorAvatar(client: SupabaseClient, authorId: string, avatarId: string | null) {
  return client.rpc("set_author_avatar", {
    p_author_id: authorId,
    p_expected_updated_at: await authorUpdatedAt(authorId),
    p_avatar_id: avatarId,
  });
}

async function publicCommentAvatars(): Promise<(string | null)[]> {
  const { data, error } = await selectVisibleComments(anonymousClient(), fixtures.post);
  expect(error).toBeNull();
  return mapPublicComments(data).map((row) => row.avatarId);
}

beforeAll(async () => {
  await Promise.all(readerKeys.map((key) => createUser(key)));
  await createUser("author", "author");
  await createUser("editor", "editor");
  await createUser("admin", "admin");
  await createUser("otherAdmin", "admin");

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signIn(key);
  }

  const { data: category, error: categoryError } = await service
    .from("categories")
    .insert({ name: `Avatar ${runId}`, slug: `avatar-${runId}` })
    .select("id")
    .single();
  if (categoryError) throw categoryError;
  fixtures.category = category.id;

  const { data: post, error: postError } = await service
    .from("posts")
    .insert({
      title: `Avatar testi ${runId}`,
      slug: `avatar-${runId}`,
      category_id: fixtures.category,
      body: { type: "doc", content: [{ type: "paragraph" }] },
      content_version: 1,
      created_by: userIds.editor,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (postError) throw postError;
  fixtures.post = post.id;
  createdPostIds.push(post.id);

  // A credited author linked to the reader's account, so public reads can be
  // checked for link leaks.
  const { data: author, error: authorError } = await service
    .from("authors")
    .insert({ name: `Avatar Yazarı ${runId}`, slug: `avatar-yazari-${runId}`, user_id: userIds.editor })
    .select("id")
    .single();
  if (authorError) throw authorError;
  fixtures.author = author.id;
  createdAuthorIds.push(author.id);

  const { error: creditError } = await service
    .from("post_authors")
    .insert({ post_id: fixtures.post, author_id: author.id, sort_order: 0 });
  if (creditError) throw creditError;
});

afterAll(async () => {
  await service.from("posts").delete().in("id", createdPostIds);
  await service.from("authors").update({ avatar_id: null }).in("id", createdAuthorIds);
  await service.from("authors").delete().in("id", createdAuthorIds);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service
    .from("profiles")
    .update({ avatar_id: null })
    .in("id", Object.values(userIds));

  // Storage forbids direct SQL deletes; remove objects through the API.
  for (let index = 0; index < uploadedNames.length; index += 100) {
    await service.storage.from(bucket).remove(uploadedNames.slice(index, index + 100));
  }

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("avatars bucket", () => {
  it("is public, separate from media, with type and size limits", async () => {
    const { data, error } = await service.storage.getBucket(bucket);

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
    expect(data?.file_size_limit).toBe(2 * 1024 * 1024);
    expect([...(data?.allowed_mime_types ?? [])].sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("avatar upload policies", () => {
  it("denies anonymous uploads", async () => {
    expect(await upload(anonymousClient(), `profiles/${crypto.randomUUID()}`)).not.toBeNull();
    expect(await upload(anonymousClient(), `authors/${crypto.randomUUID()}`)).not.toBeNull();
  });

  it.each(["reader", "author", "editor", "admin"] as const)(
    "lets a signed-in %s upload a profile avatar",
    async (key) => {
      expect(await upload(clients[key], `profiles/${crypto.randomUUID()}`)).toBeNull();
    },
  );

  it.each(["reader", "author", "editor"] as const)(
    "denies author avatar uploads from a %s",
    async (key) => {
      expect(await upload(clients[key], `authors/${crypto.randomUUID()}`)).not.toBeNull();
    },
  );

  it("lets an admin upload an author avatar", async () => {
    expect(await upload(clients.admin, `authors/${crypto.randomUUID()}`)).toBeNull();
  });

  it.each([
    ["the bucket root", crypto.randomUUID()],
    ["a file name", "profiles/me.png"],
    ["a user-id folder", `profiles/${crypto.randomUUID()}/${crypto.randomUUID()}`],
    ["an uppercase UUID", `profiles/${crypto.randomUUID().toUpperCase()}`],
    ["an extension", `profiles/${crypto.randomUUID()}.png`],
    ["another kind", `media/${crypto.randomUUID()}`],
  ])("denies uploads at %s", async (_name, name) => {
    expect(await upload(clients.reader, name)).not.toBeNull();
  });

  it.each([
    ["SVG", testImages.svg, "image/svg+xml"],
    ["GIF", testImages.gif, "image/gif"],
    ["HTML", testImages.html, "text/html"],
  ])("rejects %s through the bucket type allowlist", async (_name, bytes, contentType) => {
    expect(
      await upload(clients.reader, `profiles/${crypto.randomUUID()}`, bytes, contentType),
    ).not.toBeNull();
  });

  it("rejects files above the bucket size limit", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes.set(testImages.png);
    expect(await upload(clients.reader, `profiles/${crypto.randomUUID()}`, bytes)).not.toBeNull();
  });

  it("does not let anyone overwrite an existing object", async () => {
    const id = await uploadProfileAvatar("reader");
    const { error } = await clients.reader.storage
      .from(bucket)
      .upload(`profiles/${id}`, testImages.webp, { contentType: "image/webp", upsert: true });

    expect(error).not.toBeNull();
  });

  it("rate-limits uploads per user", async () => {
    for (let index = 0; index < 10; index += 1) {
      expect(await upload(clients.busyReader, `profiles/${crypto.randomUUID()}`)).toBeNull();
    }

    expect(await upload(clients.busyReader, `profiles/${crypto.randomUUID()}`)).not.toBeNull();
    // Others keep their own budget.
    expect(await upload(clients.otherReader, `profiles/${crypto.randomUUID()}`)).toBeNull();
  });

  it("lists only the caller's own profile objects", async () => {
    const own = await uploadProfileAvatar("otherReader");
    const others = await uploadProfileAvatar("reader");

    const { data, error } = await clients.otherReader.storage.from(bucket).list("profiles");
    expect(error).toBeNull();
    const names = (data ?? []).map((entry) => entry.name);
    expect(names).toContain(own);
    expect(names).not.toContain(others);

    const anonymous = await anonymousClient().storage.from(bucket).list("profiles");
    expect(anonymous.data ?? []).toEqual([]);
  });
});

describe("set_own_avatar", () => {
  it("is not available anonymously", async () => {
    const { error } = await setOwnAvatar(anonymousClient(), crypto.randomUUID());
    expect(error).not.toBeNull();
  });

  it.each(["reader", "author", "editor", "admin"] as const)(
    "lets a %s attach their own upload",
    async (key) => {
      const id = await uploadProfileAvatar(key);
      const { data, error } = await setOwnAvatar(clients[key], id);

      expect(error).toBeNull();
      expect(data?.previous_avatar_id).toBeNull();
      expect(await profileAvatar(key)).toBe(id);

      // The caller reads it back on their own profile.
      const own = await clients[key]
        .from("profiles")
        .select("avatar_id")
        .eq("id", userIds[key])
        .single();
      expect(own.data?.avatar_id).toBe(id);
    },
  );

  it("refuses another user's upload, an author object, and a missing object", async () => {
    const othersUpload = await uploadProfileAvatar("otherReader");
    const authorObject = await uploadAuthorAvatar();
    const before = await profileAvatar("reader");

    for (const id of [othersUpload, authorObject, crypto.randomUUID()]) {
      const { error } = await setOwnAvatar(clients.reader, id);
      expect(error?.code).toBe("P0002");
    }

    expect(await profileAvatar("reader")).toBe(before);
  });

  it("cannot be bypassed with a direct column update", async () => {
    const id = await uploadProfileAvatar("reader");
    const before = await profileAvatar("reader");

    const own = await clients.reader
      .from("profiles")
      .update({ avatar_id: id })
      .eq("id", userIds.reader)
      .select("avatar_id");
    expect(own.error).not.toBeNull();

    // An admin may edit display names of others, but not their avatars.
    const others = await clients.admin
      .from("profiles")
      .update({ avatar_id: id })
      .eq("id", userIds.reader)
      .select("avatar_id");
    expect(others.error).not.toBeNull();

    expect(await profileAvatar("reader")).toBe(before);
  });

  it("does not let other users read a profile avatar", async () => {
    const { data } = await clients.otherReader
      .from("profiles")
      .select("avatar_id")
      .eq("id", userIds.reader);
    expect(data ?? []).toEqual([]);

    const anonymous = await anonymousClient().from("profiles").select("avatar_id");
    expect(anonymous.data ?? []).toEqual([]);
  });

  it("returns the replaced avatar, which only its owner can then delete", async () => {
    const first = await uploadProfileAvatar("otherReader");
    expect((await setOwnAvatar(clients.otherReader, first)).error).toBeNull();

    // In use: nobody can delete it, not even its owner.
    await clients.otherReader.storage.from(bucket).remove([`profiles/${first}`]);
    expect(await objectExists(`profiles/${first}`)).toBe(true);

    const second = await uploadProfileAvatar("otherReader");
    const { data, error } = await setOwnAvatar(clients.otherReader, second);
    expect(error).toBeNull();
    expect(data?.previous_avatar_id).toBe(first);

    // Detached: another user and an admin still cannot delete it.
    await clients.reader.storage.from(bucket).remove([`profiles/${first}`]);
    await clients.admin.storage.from(bucket).remove([`profiles/${first}`]);
    expect(await objectExists(`profiles/${first}`)).toBe(true);

    const removal = await clients.otherReader.storage.from(bucket).remove([`profiles/${first}`]);
    expect(removal.error).toBeNull();
    expect(removal.data?.length).toBe(1);
    expect(await objectExists(`profiles/${first}`)).toBe(false);

    // Removing returns the current avatar and clears the column.
    const removed = await setOwnAvatar(clients.otherReader, null);
    expect(removed.data?.previous_avatar_id).toBe(second);
    expect(await profileAvatar("otherReader")).toBeNull();
  });

  it("keeps comment avatars in step with the live profile avatar", async () => {
    const first = await uploadProfileAvatar("reader");
    expect((await setOwnAvatar(clients.reader, first)).error).toBeNull();

    const { error: commentError } = await clients.reader
      .from("comments")
      .insert({ post_id: fixtures.post, body: `Avatarlı yorum ${runId}` });
    expect(commentError).toBeNull();
    expect(await publicCommentAvatars()).toEqual([first]);

    const second = await uploadProfileAvatar("reader");
    const { data, error } = await setOwnAvatar(clients.reader, second);
    expect(error).toBeNull();
    expect(data?.post_ids).toEqual([fixtures.post]);
    expect(data?.post_slugs).toEqual([`avatar-${runId}`]);
    expect(await publicCommentAvatars()).toEqual([second]);

    // The client cannot pick a comment avatar on insert.
    const forged = await clients.otherReader
      .from("comments")
      .insert({ post_id: fixtures.post, body: `Sahte ${runId}`, avatar_id: second });
    expect(forged.error).not.toBeNull();

    expect((await setOwnAvatar(clients.reader, null)).error).toBeNull();
    expect(await publicCommentAvatars()).toEqual([null]);

    // Comment user ids stay unreadable alongside the avatar column.
    const leak = await anonymousClient().from("comments").select("avatar_id, user_id");
    expect(leak.error).not.toBeNull();
  });

  it("rate-limits avatar changes per user", async () => {
    // busyReader has no avatar, so each call is a no-op that still counts.
    for (let index = 0; index < 10; index += 1) {
      expect((await setOwnAvatar(clients.busyReader, null)).error).toBeNull();
    }

    const { error } = await setOwnAvatar(clients.busyReader, null);
    expect(error?.code).toBe("PT429");
  });
});

describe("set_author_avatar", () => {
  it.each(["reader", "author", "editor"] as const)("is denied to a %s", async (key) => {
    const id = await uploadAuthorAvatar();
    const { error } = await setAuthorAvatar(clients[key], fixtures.author, id);

    expect(error?.code).toBe("42501");
  });

  it("is denied anonymously", async () => {
    const { error } = await setAuthorAvatar(anonymousClient(), fixtures.author, null);
    expect(error).not.toBeNull();
  });

  it("refuses a stale form and objects that are not author uploads", async () => {
    const id = await uploadAuthorAvatar();
    const stale = await clients.admin.rpc("set_author_avatar", {
      p_author_id: fixtures.author,
      p_expected_updated_at: "2000-01-01T00:00:00Z",
      p_avatar_id: id,
    });
    expect(stale.error?.code).toBe("40001");

    const profileObject = await uploadProfileAvatar("admin");
    const wrongKind = await setAuthorAvatar(clients.admin, fixtures.author, profileObject);
    expect(wrongKind.error?.code).toBe("P0002");
  });

  it("lets an admin set, replace, and remove an author avatar that anyone can read", async () => {
    const first = await uploadAuthorAvatar("otherAdmin");
    const set = await setAuthorAvatar(clients.otherAdmin, fixtures.author, first);
    expect(set.error).toBeNull();
    expect(set.data).toBeNull();

    const publicRow = await anonymousClient()
      .from("authors")
      .select("id, avatar_id")
      .eq("id", fixtures.author)
      .single();
    expect(publicRow.data?.avatar_id).toBe(first);

    // The account link stays unreadable, and the author avatar is not the
    // linked account's profile avatar.
    const link = await anonymousClient().from("authors").select("user_id").eq("id", fixtures.author);
    expect(link.error).not.toBeNull();
    expect(await profileAvatar("editor")).not.toBe(first);

    // Non-admins cannot remove author objects, attached or not.
    await clients.editor.storage.from(bucket).remove([`authors/${first}`]);
    expect(await objectExists(`authors/${first}`)).toBe(true);

    const second = await uploadAuthorAvatar("otherAdmin");
    const replaced = await setAuthorAvatar(clients.otherAdmin, fixtures.author, second);
    expect(replaced.data).toBe(first);

    await clients.editor.storage.from(bucket).remove([`authors/${first}`]);
    expect(await objectExists(`authors/${first}`)).toBe(true);
    const removal = await clients.admin.storage.from(bucket).remove([`authors/${first}`]);
    expect(removal.data?.length).toBe(1);
    expect(await objectExists(`authors/${first}`)).toBe(false);

    // The attached one stays even for admins.
    await clients.admin.storage.from(bucket).remove([`authors/${second}`]);
    expect(await objectExists(`authors/${second}`)).toBe(true);

    const removed = await setAuthorAvatar(clients.otherAdmin, fixtures.author, null);
    expect(removed.data).toBe(second);

    const audit = await service
      .from("editorial_audit_log")
      .select("action")
      .eq("actor_profile_id", userIds.otherAdmin)
      .like("action", "author.avatar_%");
    expect((audit.data ?? []).map((row) => row.action).sort()).toEqual([
      "author.avatar_removed",
      "author.avatar_set",
      "author.avatar_set",
    ]);
  });
});

describe("account deletion", () => {
  it("detaches the avatar and lets the user remove every own avatar object", async () => {
    const current = await uploadProfileAvatar("deleting");
    const pending = await uploadProfileAvatar("deleting");
    expect((await setOwnAvatar(clients.deleting, current)).error).toBeNull();

    const { error: commentError } = await clients.deleting
      .from("comments")
      .insert({ post_id: fixtures.post, body: `Silinecek ${runId}` });
    expect(commentError).toBeNull();
    expect(await publicCommentAvatars()).toContain(current);

    const { error } = await clients.deleting.rpc("prepare_own_account_deletion");
    expect(error).toBeNull();
    expect(await profileAvatar("deleting")).toBeNull();
    expect(await publicCommentAvatars()).not.toContain(current);

    // What the account action does next: list and remove own objects.
    const { data: listed } = await clients.deleting.storage.from(bucket).list("profiles");
    const names = (listed ?? []).map((entry) => entry.name).sort();
    expect(names).toEqual([current, pending].sort());

    const removal = await clients.deleting.storage
      .from(bucket)
      .remove(names.map((name) => `profiles/${name}`));
    expect(removal.data?.length).toBe(2);
    expect(await objectExists(`profiles/${current}`)).toBe(false);
    expect(await objectExists(`profiles/${pending}`)).toBe(false);
  });
});
