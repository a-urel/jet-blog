import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { testImages } from "@/features/media/test-images";

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
const slugPrefix = `media-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-media-admin-${runId}@example.com`,
  editor: `rls-media-editor-${runId}@example.com`,
  author: `rls-media-author-${runId}@example.com`,
  otherAuthor: `rls-media-other-${runId}@example.com`,
  busyAuthor: `rls-media-busy-${runId}@example.com`,
  reader: `rls-media-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const uploadedPaths: string[] = [];

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

async function upload(
  client: SupabaseClient,
  path: string = crypto.randomUUID(),
  bytes: Uint8Array = testImages.png,
  contentType = "image/png",
) {
  uploadedPaths.push(path);
  const result = await client.storage
    .from("media")
    .upload(path, bytes, { contentType, upsert: false });

  return { path, error: result.error };
}

// Uploads and registers an image as the given user, the way the Server Action
// does, and returns the media id.
async function uploadAndRegister(key: UserKey): Promise<string> {
  const { path, error } = await upload(clients[key]);
  if (error) throw error;

  const registered = await clients[key].rpc("register_media", {
    p_media_id: path,
    p_width: 3,
    p_height: 2,
  });

  if (registered.error) throw registered.error;

  return path;
}

function imageBody(mediaId: string) {
  return {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: { mediaId, width: 3, height: 2, alt: "Test görseli" },
      },
    ],
  };
}

const emptyBody = { type: "doc", content: [{ type: "paragraph" }] };

async function createDraft(key: UserKey, slug: string, body: unknown) {
  return clients[key].rpc("create_draft_post", {
    p_title: `Medya Taslağı ${runId}`,
    p_slug: `${slugPrefix}-${slug}`,
    p_excerpt: null,
    p_category_id: null,
    p_tag_ids: [],
    p_credits: [],
    p_body: body,
    p_content_version: 1,
  });
}

beforeAll(async () => {
  for (const key of Object.keys(emails) as UserKey[]) {
    const { data, error } = await service.auth.admin.createUser({
      email: emails[key],
      password,
      email_confirm: true,
    });

    if (error) throw error;
    userIds[key] = data.user.id;
  }

  const { error: membershipError } = await service
    .from("editorial_members")
    .insert([
      { profile_id: userIds.admin, role: "admin" },
      { profile_id: userIds.editor, role: "editor" },
      { profile_id: userIds.author, role: "author" },
      { profile_id: userIds.otherAuthor, role: "author" },
      { profile_id: userIds.busyAuthor, role: "author" },
    ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}-%`);
  // Some paths are deliberately not UUIDs; a non-UUID in the filter would
  // fail the whole delete.
  const mediaIds = uploadedPaths.filter((path) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path),
  );
  const cleanup = await service.from("media").delete().in("id", mediaIds);
  if (cleanup.error) throw cleanup.error;
  // Storage forbids direct SQL deletes; remove objects through the API.
  for (let index = 0; index < uploadedPaths.length; index += 100) {
    await service.storage
      .from("media")
      .remove(uploadedPaths.slice(index, index + 100));
  }

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("media bucket", () => {
  it("is public with type and size limits", async () => {
    const { data, error } = await service.storage.getBucket("media");

    expect(error).toBeNull();
    expect(data?.public).toBe(true);
    expect(data?.file_size_limit).toBe(5 * 1024 * 1024);
    expect([...(data?.allowed_mime_types ?? [])].sort()).toEqual([
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("storage upload policies", () => {
  it("denies anonymous uploads", async () => {
    const { error } = await upload(anonymousClient());

    expect(error).not.toBeNull();
  });

  it("denies uploads from a signed-in reader without membership", async () => {
    const { error } = await upload(clients.reader);

    expect(error).not.toBeNull();
  });

  it.each(["admin", "editor", "author"] as const)(
    "allows %s uploads at a UUID path",
    async (key) => {
      const { error } = await upload(clients[key]);

      expect(error).toBeNull();
    },
  );

  it.each([
    ["a file name", "photo.png"],
    ["a folder", "00000000-0000-4000-8000-000000000000/photo.png"],
    ["an uppercase UUID", crypto.randomUUID().toUpperCase()],
    ["a UUID with an extension", `${crypto.randomUUID()}.png`],
  ])("denies uploads at %s", async (_name, path) => {
    const { error } = await upload(clients.author, path);

    expect(error).not.toBeNull();
  });

  it("rejects SVG through the bucket type allowlist", async () => {
    const { error } = await upload(
      clients.author,
      crypto.randomUUID(),
      testImages.svg,
      "image/svg+xml",
    );

    expect(error).not.toBeNull();
  });

  it("rejects files above the bucket size limit", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set(testImages.png);
    const { error } = await upload(clients.author, crypto.randomUUID(), bytes);

    expect(error).not.toBeNull();
  });

  it("does not let members overwrite an existing object", async () => {
    const { path, error } = await upload(clients.author);
    expect(error).toBeNull();

    const overwrite = await clients.author.storage
      .from("media")
      .upload(path, testImages.gif, { contentType: "image/gif", upsert: true });

    expect(overwrite.error).not.toBeNull();
  });

  it("rate-limits uploads per member", async () => {
    for (let index = 0; index < 20; index += 1) {
      const { error } = await upload(clients.busyAuthor);
      expect(error).toBeNull();
    }

    const { error } = await upload(clients.busyAuthor);
    expect(error).not.toBeNull();

    // Other members keep their own budget.
    const other = await upload(clients.otherAuthor);
    expect(other.error).toBeNull();
  });
});

describe("media registration", () => {
  it("registers an uploaded object with Storage type and size", async () => {
    const mediaId = await uploadAndRegister("author");
    const { data, error } = await clients.author
      .from("media")
      .select("object_path, mime_type, size_bytes, width, height, uploaded_by")
      .eq("id", mediaId)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      object_path: mediaId,
      mime_type: "image/png",
      size_bytes: testImages.png.length,
      width: 3,
      height: 2,
      uploaded_by: userIds.author,
    });
  });

  it("refuses to register another member's object", async () => {
    const { path, error } = await upload(clients.author);
    expect(error).toBeNull();

    const result = await clients.otherAuthor.rpc("register_media", {
      p_media_id: path,
      p_width: 3,
      p_height: 2,
    });

    expect(result.error?.code).toBe("P0002");
  });

  it("refuses to register a missing object", async () => {
    const result = await clients.author.rpc("register_media", {
      p_media_id: crypto.randomUUID(),
      p_width: 3,
      p_height: 2,
    });

    expect(result.error?.code).toBe("P0002");
  });

  it("refuses invalid dimensions", async () => {
    const { path, error } = await upload(clients.author);
    expect(error).toBeNull();

    const result = await clients.author.rpc("register_media", {
      p_media_id: path,
      p_width: 0,
      p_height: 2,
    });

    expect(result.error?.code).toBe("22023");
  });

  it("refuses registration from a reader", async () => {
    const result = await clients.reader.rpc("register_media", {
      p_media_id: crypto.randomUUID(),
      p_width: 3,
      p_height: 2,
    });

    expect(result.error?.code).toBe("42501");
  });

  it("denies direct writes to the media table", async () => {
    const insert = await clients.admin.from("media").insert({
      id: crypto.randomUUID(),
      object_path: "x",
      mime_type: "image/png",
      size_bytes: 1,
      width: 1,
      height: 1,
    });

    expect(insert.error).not.toBeNull();
  });
});

describe("media visibility", () => {
  let mediaId = "";

  beforeAll(async () => {
    mediaId = await uploadAndRegister("author");
  });

  it.each(["admin", "editor", "author", "otherAuthor"] as const)(
    "shows media rows to %s",
    async (key) => {
      const { data, error } = await clients[key]
        .from("media")
        .select("id")
        .eq("id", mediaId);

      expect(error).toBeNull();
      expect(data).toEqual([{ id: mediaId }]);
    },
  );

  it("hides media rows from readers and anonymous visitors", async () => {
    for (const client of [clients.reader, anonymousClient()]) {
      const { data } = await client.from("media").select("id").eq("id", mediaId);
      expect(data ?? []).toEqual([]);
    }
  });

  it("does not let readers list bucket objects", async () => {
    const { data } = await clients.reader.storage.from("media").list();

    expect(data ?? []).toEqual([]);
  });

  it("serves the object at its public URL without a session (D4 tradeoff)", async () => {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/public/media/${mediaId}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

describe("post bodies and media references", () => {
  it("rejects a body that references unknown media", async () => {
    const { error } = await createDraft(
      "author",
      "unknown",
      imageBody(crypto.randomUUID()),
    );

    expect(error?.code).toBe("22023");
    expect(error?.message).toContain("Unknown media");
  });

  it("stores a body that references registered media", async () => {
    const mediaId = await uploadAndRegister("author");
    const { error } = await createDraft("author", "known", imageBody(mediaId));

    expect(error).toBeNull();
  });
});

describe("media deletion", () => {
  it("refuses deletion while a post references the media", async () => {
    const mediaId = await uploadAndRegister("author");
    const draft = await createDraft("author", "in-use", imageBody(mediaId));
    expect(draft.error).toBeNull();

    const { error } = await clients.editor.rpc("delete_media", {
      p_media_id: mediaId,
    });

    expect(error?.code).toBe("23503");

    const { data } = await clients.editor.from("media").select("id").eq("id", mediaId);
    expect(data).toEqual([{ id: mediaId }]);
  });

  it("allows deletion after the reference is removed", async () => {
    const mediaId = await uploadAndRegister("author");
    const draft = await createDraft("author", "released", imageBody(mediaId));
    expect(draft.error).toBeNull();

    const { post_id: postId, revision } = (
      draft.data as { post_id: string; revision: number }[]
    )[0];

    const update = await clients.author.rpc("update_post_metadata", {
      p_post_id: postId,
      p_expected_revision: revision,
      p_title: `Medya Taslağı ${runId}`,
      p_slug: `${slugPrefix}-released`,
      p_excerpt: null,
      p_category_id: null,
      p_tag_ids: [],
      p_credits: [],
      p_body: emptyBody,
      p_content_version: 1,
    });
    expect(update.error).toBeNull();

    const { data, error } = await clients.author.rpc("delete_media", {
      p_media_id: mediaId,
    });

    expect(error).toBeNull();
    expect(data).toBe(mediaId);
  });

  it("does not let an author delete another member's media", async () => {
    const mediaId = await uploadAndRegister("author");
    const { error } = await clients.otherAuthor.rpc("delete_media", {
      p_media_id: mediaId,
    });

    expect(error?.code).toBe("42501");
  });

  it.each(["editor", "admin"] as const)(
    "lets %s delete unused media and its object",
    async (key) => {
      const mediaId = await uploadAndRegister("author");
      const { error } = await clients[key].rpc("delete_media", {
        p_media_id: mediaId,
      });
      expect(error).toBeNull();

      const removal = await clients[key].storage.from("media").remove([mediaId]);
      expect(removal.error).toBeNull();
      expect(removal.data?.map((object) => object.name)).toEqual([mediaId]);

      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/public/media/${mediaId}`,
      );
      expect(response.status).toBe(400);
    },
  );

  it("refuses deletion from a reader", async () => {
    const mediaId = await uploadAndRegister("author");
    const { error } = await clients.reader.rpc("delete_media", {
      p_media_id: mediaId,
    });

    expect(error?.code).toBe("42501");
  });

  it("keeps registered objects out of Storage deletes", async () => {
    const mediaId = await uploadAndRegister("author");
    const removal = await clients.editor.storage.from("media").remove([mediaId]);

    expect(removal.data ?? []).toEqual([]);

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/public/media/${mediaId}`,
    );
    expect(response.status).toBe(200);
  });

  it("lets the uploader remove an unregistered object", async () => {
    const { path, error } = await upload(clients.author);
    expect(error).toBeNull();

    const other = await clients.otherAuthor.storage.from("media").remove([path]);
    expect(other.data ?? []).toEqual([]);

    const removal = await clients.author.storage.from("media").remove([path]);
    expect(removal.data?.map((object) => object.name)).toEqual([path]);
  });
});
