import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { testImages } from "@/features/media/test-images";
import { selectPublishedPostSummaries } from "@/features/posts/queries";

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
const slugPrefix = `cover-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-cover-admin-${runId}@example.com`,
  editor: `rls-cover-editor-${runId}@example.com`,
  author: `rls-cover-author-${runId}@example.com`,
  otherAuthor: `rls-cover-other-${runId}@example.com`,
  reader: `rls-cover-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const uploadedPaths: string[] = [];
const fixtures = { category: "", cover: "" };
const body = { type: "doc", content: [{ type: "paragraph" }] };

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

async function uploadObject(client: SupabaseClient): Promise<string> {
  const path = crypto.randomUUID();
  uploadedPaths.push(path);
  const { error } = await client.storage
    .from("media")
    .upload(path, testImages.png, { contentType: "image/png", upsert: false });

  if (error) throw error;

  return path;
}

async function uploadAndRegister(key: UserKey): Promise<string> {
  const path = await uploadObject(clients[key]);
  const { error } = await clients[key].rpc("register_media", {
    p_media_id: path,
    p_width: 3,
    p_height: 2,
  });

  if (error) throw error;

  return path;
}

function draftPayload(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    p_title: `Kapak testi ${slug}`,
    p_slug: `${slugPrefix}-${slug}`,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [],
    p_credits: [],
    p_body: body,
    p_content_version: 1,
    p_language: "tr",
    p_cover_media_id: fixtures.cover,
    p_cover_alt: "Sisli bir vadi",
    ...overrides,
  };
}

async function createDraft(
  key: UserKey,
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return clients[key].rpc("create_draft_post", draftPayload(slug, overrides));
}

async function createDraftId(
  key: UserKey,
  slug: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await createDraft(key, slug, overrides);
  if (error) throw error;

  return (data as { post_id: string }[])[0].post_id;
}

async function currentPost(postId: string) {
  const { data, error } = await service
    .from("posts")
    .select("slug, status, revision, cover_media_id, cover_alt")
    .eq("id", postId)
    .single();

  if (error) throw error;

  return data as {
    slug: string;
    status: string;
    revision: number;
    cover_media_id: string | null;
    cover_alt: string | null;
  };
}

// Saves the post with its current slug and the given cover fields.
async function saveCover(
  client: SupabaseClient,
  postId: string,
  coverMediaId: string | null,
  coverAlt: string | null,
) {
  const post = await currentPost(postId);

  return client.rpc("update_post_metadata", {
    ...draftPayload("unused", {
      p_slug: post.slug,
      p_cover_media_id: coverMediaId,
      p_cover_alt: coverAlt,
    }),
    p_post_id: postId,
    p_expected_revision: post.revision,
  });
}

async function publish(client: SupabaseClient, postId: string) {
  const { revision } = await currentPost(postId);

  return client.rpc("publish_post", {
    p_post_id: postId,
    p_expected_revision: revision,
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
    ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  const category = await service
    .from("categories")
    .insert({ name: `Kapak Kategori ${runId}`, slug: `${slugPrefix}-kategori` })
    .select("id")
    .single();

  if (category.error) throw category.error;
  fixtures.category = category.data.id as string;
  fixtures.cover = await uploadAndRegister("author");
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}-%`);
  await service.from("media").delete().in("id", uploadedPaths);
  await service.storage.from("media").remove(uploadedPaths);
  await service.from("categories").delete().eq("id", fixtures.category);

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("cover parameters by role", () => {
  it("denies anonymous visitors and readers", async () => {
    const anon = await anonymousClient().rpc(
      "create_draft_post",
      draftPayload("anon"),
    );
    expect(anon.error).not.toBeNull();

    const reader = await createDraft("reader", "reader");
    expect(reader.error?.code).toBe("42501");

    const { data } = await service
      .from("posts")
      .select("id")
      .in("slug", [`${slugPrefix}-anon`, `${slugPrefix}-reader`]);
    expect(data).toEqual([]);
  });

  it("lets an author set and change the cover of their own draft", async () => {
    const postId = await createDraftId("author", "author-own", { p_cover_alt: null });

    expect(await currentPost(postId)).toMatchObject({
      cover_media_id: fixtures.cover,
      cover_alt: null,
    });

    const updated = await saveCover(clients.author, postId, fixtures.cover, "  Vadi  ");
    expect(updated.error).toBeNull();
    expect(await currentPost(postId)).toMatchObject({ cover_alt: "Vadi" });

    const removed = await saveCover(clients.author, postId, null, null);
    expect(removed.error).toBeNull();
    expect(await currentPost(postId)).toMatchObject({
      cover_media_id: null,
      cover_alt: null,
    });
  });

  it("lets an author use another member's media as a cover", async () => {
    const otherMedia = await uploadAndRegister("otherAuthor");
    const { error } = await createDraft("author", "shared-media", {
      p_cover_media_id: otherMedia,
    });

    expect(error).toBeNull();
  });

  it("does not let an author change another member's draft cover", async () => {
    const postId = await createDraftId("otherAuthor", "other-draft", {
      p_cover_media_id: null,
      p_cover_alt: null,
    });

    const { error } = await saveCover(clients.author, postId, fixtures.cover, "Vadi");

    expect(error?.code).toBe("42501");
    expect(await currentPost(postId)).toMatchObject({ cover_media_id: null });
  });

  it.each(["editor", "admin"] as const)(
    "lets %s set the cover on any draft",
    async (key) => {
      const postId = await createDraftId("author", `${key}-edit`, {
        p_cover_media_id: null,
        p_cover_alt: null,
      });

      const { error } = await saveCover(clients[key], postId, fixtures.cover, "Vadi");

      expect(error).toBeNull();
      expect(await currentPost(postId)).toMatchObject({
        cover_media_id: fixtures.cover,
        cover_alt: "Vadi",
      });
    },
  );
});

describe("cover validation", () => {
  it("rejects an unknown media id", async () => {
    const { error } = await createDraft("author", "unknown", {
      p_cover_media_id: crypto.randomUUID(),
    });

    expect(error?.code).toBe("22023");
    expect(error?.message).toContain("Unknown cover media");
  });

  it("rejects an uploaded object that was never registered as media", async () => {
    const path = await uploadObject(clients.author);
    const { error } = await createDraft("author", "unregistered", {
      p_cover_media_id: path,
    });

    expect(error?.code).toBe("22023");
  });

  it("cannot reference non-image media because none can be stored", async () => {
    const path = await uploadObject(clients.author);
    const insert = await service.from("media").insert({
      id: path,
      object_path: path,
      uploaded_by: userIds.author,
      mime_type: "application/pdf",
      size_bytes: 10,
      width: 3,
      height: 2,
    });

    expect(insert.error?.code).toBe("23514");

    const { error } = await createDraft("author", "non-image", {
      p_cover_media_id: path,
    });
    expect(error?.code).toBe("22023");
  });

  it.each([
    ["too long", "a".repeat(301)],
    ["with a control character", "Satır\nsonu"],
  ])("rejects cover alt text %s", async (_label, alt) => {
    const { error } = await createDraft("author", "bad-alt", { p_cover_alt: alt });

    expect(error?.code).toBe("22023");
    expect(error?.message).toContain("Invalid cover alt text");
  });

  it("rejects alt text without a cover", async () => {
    const { error } = await createDraft("author", "alt-only", {
      p_cover_media_id: null,
    });

    expect(error?.code).toBe("22023");
  });

  it("keeps direct writes consistent through constraints", async () => {
    const postId = await createDraftId("author", "constraints", {
      p_cover_media_id: null,
      p_cover_alt: null,
    });

    const altOnly = await service
      .from("posts")
      .update({ cover_alt: "Kapak yok" })
      .eq("id", postId);
    expect(altOnly.error?.code).toBe("23514");

    const untrimmed = await service
      .from("posts")
      .update({ cover_media_id: fixtures.cover, cover_alt: " Vadi" })
      .eq("id", postId);
    expect(untrimmed.error?.code).toBe("23514");

    const missingMedia = await service
      .from("posts")
      .update({ cover_media_id: crypto.randomUUID() })
      .eq("id", postId);
    expect(missingMedia.error?.code).toBe("23503");
  });

  it("denies direct cover writes from members", async () => {
    const postId = await createDraftId("author", "direct", {
      p_cover_media_id: null,
      p_cover_alt: null,
    });

    await clients.author
      .from("posts")
      .update({ cover_media_id: fixtures.cover })
      .eq("id", postId);

    expect(await currentPost(postId)).toMatchObject({ cover_media_id: null });
  });
});

describe("publishing with a cover", () => {
  it("refuses to publish a cover without alt text", async () => {
    const postId = await createDraftId("author", "no-alt", { p_cover_alt: null });

    const { error } = await publish(clients.editor, postId);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("Cover alt text is required");
    expect(await currentPost(postId)).toMatchObject({ status: "draft" });
  });

  it("does not let an author publish even with complete cover data", async () => {
    const postId = await createDraftId("author", "author-publish");

    const { error } = await publish(clients.author, postId);

    expect(error?.code).toBe("42501");
  });

  it("publishes with alt text and exposes the cover to public reads", async () => {
    const postId = await createDraftId("author", "published");

    const draftRead = await anonymousClient()
      .from("published_posts")
      .select("post_id")
      .eq("post_id", postId);
    expect(draftRead.data).toEqual([]);

    const { error } = await publish(clients.admin, postId);
    expect(error).toBeNull();

    for (const client of [anonymousClient(), clients.reader]) {
      const { data, error: readError } = await selectPublishedPostSummaries(client).eq(
        "post_id",
        postId,
      );

      expect(readError).toBeNull();
      expect(data).toMatchObject([
        { cover_media_id: fixtures.cover, cover_alt: "Sisli bir vadi" },
      ]);

      // The cover id is public; the media row (uploader, size) is not.
      const media = await client.from("media").select("id").eq("id", fixtures.cover);
      expect(media.data ?? []).toEqual([]);
    }

    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/public/media/${fixtures.cover}`,
    );
    expect(response.status).toBe(200);
  });

  it("keeps alt text required while a post is published", async () => {
    const postId = await createDraftId("author", "published-edit");
    expect((await publish(clients.editor, postId)).error).toBeNull();

    const cleared = await saveCover(clients.editor, postId, fixtures.cover, null);
    expect(cleared.error?.code).toBe("23514");

    const direct = await service
      .from("posts")
      .update({ cover_alt: null })
      .eq("id", postId);
    expect(direct.error?.code).toBe("23514");

    const removed = await saveCover(clients.editor, postId, null, null);
    expect(removed.error).toBeNull();
    expect(await currentPost(postId)).toMatchObject({
      status: "published",
      cover_media_id: null,
    });
  });
});

describe("media deletion and covers", () => {
  it("refuses to delete media used as a cover", async () => {
    const mediaId = await uploadAndRegister("author");
    await createDraftId("author", "delete-blocked", { p_cover_media_id: mediaId });

    for (const key of ["author", "editor", "admin"] as const) {
      const { error } = await clients[key].rpc("delete_media", {
        p_media_id: mediaId,
      });

      expect(error?.code).toBe("23503");
    }

    const { data } = await service.from("media").select("id").eq("id", mediaId);
    expect(data).toEqual([{ id: mediaId }]);
  });

  it("blocks direct media deletion through the foreign key", async () => {
    const mediaId = await uploadAndRegister("author");
    await createDraftId("author", "fk-blocked", { p_cover_media_id: mediaId });

    const { error } = await service.from("media").delete().eq("id", mediaId);

    expect(error?.code).toBe("23503");
  });

  it("allows deletion after the cover is removed", async () => {
    const mediaId = await uploadAndRegister("author");
    const postId = await createDraftId("author", "delete-released", {
      p_cover_media_id: mediaId,
    });

    expect((await saveCover(clients.author, postId, null, null)).error).toBeNull();

    const { data, error } = await clients.author.rpc("delete_media", {
      p_media_id: mediaId,
    });

    expect(error).toBeNull();
    expect(data).toBe(mediaId);
  });
});
