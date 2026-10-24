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
const slugPrefix = `rpc-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-draft-admin-${runId}@example.com`,
  editor: `rls-draft-editor-${runId}@example.com`,
  authorA: `rls-draft-author-a-${runId}@example.com`,
  authorB: `rls-draft-author-b-${runId}@example.com`,
  reader: `rls-draft-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;

const fixtures = {
  category: "",
  tagA: "",
  tagB: "",
  authorA: "",
  guestAuthor: "",
  draftA: "",
  published: "",
};

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

async function insertOne<T extends Record<string, unknown>>(
  table: string,
  values: T,
): Promise<string> {
  const { data, error } = await service
    .from(table)
    .insert(values)
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

const bodyFields = {
  p_body: { type: "doc", content: [{ type: "paragraph" }] },
  p_content_version: 1,
  p_language: "tr",
  p_cover_media_id: null,
  p_cover_alt: null,
};

function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    ...bodyFields,
    p_title: `RPC Taslak ${runId}`,
    p_slug: `${slugPrefix}-draft-a`,
    p_excerpt: "RPC ile oluşturulan taslak.",
    p_category_id: fixtures.category,
    p_tag_ids: [fixtures.tagA, fixtures.tagB],
    p_credits: [
      { author_id: fixtures.authorA, sort_order: 0 },
      { author_id: fixtures.guestAuthor, sort_order: 1 },
    ],
    ...overrides,
  };
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
      { profile_id: userIds.authorA, role: "author" },
      { profile_id: userIds.authorB, role: "author" },
    ]);

  if (membershipError) throw membershipError;

  fixtures.category = await insertOne("categories", {
    name: `RPC Kategori ${runId}`,
    slug: `${slugPrefix}-kategori`,
  });
  fixtures.tagA = await insertOne("tags", {
    name: `RPC Etiket A ${runId}`,
    slug: `${slugPrefix}-etiket-a`,
  });
  fixtures.tagB = await insertOne("tags", {
    name: `RPC Etiket B ${runId}`,
    slug: `${slugPrefix}-etiket-b`,
  });
  fixtures.authorA = await insertOne("authors", {
    name: `RPC Yazar A ${runId}`,
    slug: `${slugPrefix}-yazar-a`,
    user_id: userIds.authorA,
  });
  fixtures.guestAuthor = await insertOne("authors", {
    name: `RPC Konuk ${runId}`,
    slug: `${slugPrefix}-konuk`,
  });

  const authorA = await signInAs("authorA");
  const { data, error } = await authorA.rpc(
    "create_draft_post",
    draftPayload(),
  );

  if (error) throw error;

  fixtures.draftA = (data as { post_id: string }[])[0].post_id;

  fixtures.published = await insertOne("posts", {
    title: `RPC Yayında ${runId}`,
    slug: `${slugPrefix}-yayinda`,
    category_id: fixtures.category,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: userIds.authorA,
  });
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service
    .from("tags")
    .delete()
    .in("id", [fixtures.tagA, fixtures.tagB]);
  await service
    .from("authors")
    .delete()
    .in("id", [fixtures.authorA, fixtures.guestAuthor]);

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("draft authoring RPC and RLS", () => {
  it("creates a draft with category, tags, and ordered credits", async () => {
    const { data } = await service
      .from("posts")
      .select("status, revision, created_by, category_id")
      .eq("id", fixtures.draftA)
      .single();

    expect(data?.status).toBe("draft");
    expect(data?.revision).toBe(1);
    expect(data?.created_by).toBe(userIds.authorA);
    expect(data?.category_id).toBe(fixtures.category);

    const { data: credits } = await service
      .from("post_authors")
      .select("author_id, sort_order")
      .eq("post_id", fixtures.draftA)
      .order("sort_order");

    expect(credits).toEqual([
      { author_id: fixtures.authorA, sort_order: 0 },
      { author_id: fixtures.guestAuthor, sort_order: 1 },
    ]);

    const { data: tags } = await service
      .from("post_tags")
      .select("tag_id")
      .eq("post_id", fixtures.draftA);

    expect(tags?.map((tag) => tag.tag_id).sort()).toEqual(
      [fixtures.tagA, fixtures.tagB].sort(),
    );
  });

  it("denies anonymous and reader calls", async () => {
    const anon = anonymousClient();
    const anonResult = await anon.rpc("create_draft_post", draftPayload());
    expect(anonResult.error).not.toBeNull();

    const reader = await signInAs("reader");
    const readerResult = await reader.rpc(
      "create_draft_post",
      draftPayload({ p_slug: `${slugPrefix}-reader` }),
    );

    expect(readerResult.error?.code).toBe("42501");
  });

  it("denies another author editing the draft", async () => {
    const authorB = await signInAs("authorB");
    const { error } = await authorB.rpc("update_post_metadata", {
      p_post_id: fixtures.draftA,
      ...bodyFields,
      p_expected_revision: 1,
      p_title: "Başka yazar denemesi",
      p_slug: `${slugPrefix}-draft-a`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [],
      p_credits: [],
    });

    expect(error?.code).toBe("42501");

    const { data } = await service
      .from("posts")
      .select("title, revision")
      .eq("id", fixtures.draftA)
      .single();

    expect(data?.title).toBe(`RPC Taslak ${runId}`);
    expect(data?.revision).toBe(1);
  });

  it("lets the owning author update metadata and replace relations", async () => {
    const authorA = await signInAs("authorA");
    const { data, error } = await authorA.rpc("update_post_metadata", {
      p_post_id: fixtures.draftA,
      ...bodyFields,
      p_expected_revision: 1,
      p_title: "Güncellenmiş RPC Taslağı",
      p_slug: `${slugPrefix}-draft-a`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [fixtures.tagB],
      p_credits: [
        { author_id: fixtures.guestAuthor, sort_order: 0 },
        { author_id: fixtures.authorA, sort_order: 1 },
      ],
    });

    expect(error).toBeNull();
    expect((data as { revision: number }[])[0].revision).toBe(2);

    const { data: credits } = await service
      .from("post_authors")
      .select("author_id, sort_order")
      .eq("post_id", fixtures.draftA)
      .order("sort_order");

    expect(credits).toEqual([
      { author_id: fixtures.guestAuthor, sort_order: 0 },
      { author_id: fixtures.authorA, sort_order: 1 },
    ]);

    const { data: tags } = await service
      .from("post_tags")
      .select("tag_id")
      .eq("post_id", fixtures.draftA);

    expect(tags).toEqual([{ tag_id: fixtures.tagB }]);
  });

  it("rejects a stale revision without overwriting the newer edit", async () => {
    const authorA = await signInAs("authorA");
    const { error } = await authorA.rpc("update_post_metadata", {
      p_post_id: fixtures.draftA,
      ...bodyFields,
      p_expected_revision: 1,
      p_title: "Eski form üzerine yazmamalı",
      p_slug: `${slugPrefix}-draft-a`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [],
      p_credits: [],
    });

    expect(error?.code).toBe("40001");

    const { data } = await service
      .from("posts")
      .select("title, revision")
      .eq("id", fixtures.draftA)
      .single();

    expect(data?.title).toBe("Güncellenmiş RPC Taslağı");
    expect(data?.revision).toBe(2);
  });

  it("lets an editor update the author's draft", async () => {
    const editor = await signInAs("editor");
    const { data, error } = await editor.rpc("update_post_metadata", {
      p_post_id: fixtures.draftA,
      ...bodyFields,
      p_expected_revision: 2,
      p_title: "Editör düzenlemesi",
      p_slug: `${slugPrefix}-draft-a`,
      p_excerpt: "Editör özeti.",
      p_category_id: fixtures.category,
      p_tag_ids: [fixtures.tagA],
      p_credits: [{ author_id: fixtures.authorA, sort_order: 0 }],
    });

    expect(error).toBeNull();
    expect((data as { revision: number }[])[0].revision).toBe(3);
  });

  it("rejects an unknown category and unknown tag", async () => {
    const authorA = await signInAs("authorA");
    const unknownId = crypto.randomUUID();

    const categoryResult = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-bad-category`,
        p_category_id: unknownId,
      }),
    );
    expect(categoryResult.error?.code).toBe("22023");

    const tagResult = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-bad-tag`,
        p_tag_ids: [unknownId],
      }),
    );
    expect(tagResult.error?.code).toBe("22023");

    const { data } = await service
      .from("posts")
      .select("id")
      .in("slug", [`${slugPrefix}-bad-category`, `${slugPrefix}-bad-tag`]);

    expect(data).toEqual([]);
  });

  it("rejects a duplicate slug on create and update", async () => {
    const authorA = await signInAs("authorA");
    const duplicateCreate = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-draft-a`,
      }),
    );

    expect(duplicateCreate.error?.code).toBe("23505");

    const second = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-draft-b`,
        p_title: `İkinci Taslak ${runId}`,
      }),
    );

    expect(second.error).toBeNull();

    const duplicateUpdate = await authorA.rpc("update_post_metadata", {
      p_post_id: fixtures.draftA,
      ...bodyFields,
      p_expected_revision: 3,
      p_title: "Slug çakışması",
      p_slug: `${slugPrefix}-draft-b`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [],
      p_credits: [],
    });

    expect(duplicateUpdate.error?.code).toBe("23505");
  });

  it("rejects duplicate credits and invalid sort orders", async () => {
    const authorA = await signInAs("authorA");

    const duplicateCredit = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-duplicate-credit`,
        p_credits: [
          { author_id: fixtures.authorA, sort_order: 0 },
          { author_id: fixtures.authorA, sort_order: 1 },
        ],
      }),
    );
    expect(duplicateCredit.error?.code).toBe("22023");

    const outOfRange = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-out-of-range`,
        p_credits: [
          { author_id: fixtures.authorA, sort_order: 0 },
          { author_id: fixtures.guestAuthor, sort_order: 1000 },
        ],
      }),
    );
    expect(outOfRange.error?.code).toBe("22023");

    const nonContiguous = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-non-contiguous`,
        p_credits: [
          { author_id: fixtures.authorA, sort_order: 0 },
          { author_id: fixtures.guestAuthor, sort_order: 2 },
        ],
      }),
    );
    expect(nonContiguous.error?.code).toBe("22023");
  });

  it("denies an author editing a published post and allows an editor", async () => {
    const authorA = await signInAs("authorA");
    const authorResult = await authorA.rpc("update_post_metadata", {
      p_post_id: fixtures.published,
      ...bodyFields,
      p_expected_revision: 1,
      p_title: "Yazar yayını düzenleyemez",
      p_slug: `${slugPrefix}-yayinda`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [],
      p_credits: [],
    });

    expect(authorResult.error?.code).toBe("42501");

    const editor = await signInAs("editor");
    const editorResult = await editor.rpc("update_post_metadata", {
      p_post_id: fixtures.published,
      ...bodyFields,
      p_expected_revision: 1,
      p_title: "Editör yayını düzenledi",
      p_slug: `${slugPrefix}-yayinda`,
      p_excerpt: "Yayın özeti.",
      p_category_id: fixtures.category,
      p_tag_ids: [fixtures.tagA],
      p_credits: [{ author_id: fixtures.authorA, sort_order: 0 }],
    });

    expect(editorResult.error).toBeNull();
  });

  it("keeps drafts out of public and unrelated author reads", async () => {
    const anon = anonymousClient();
    const anonPosts = await anon.from("posts").select("id").eq("id", fixtures.draftA);
    expect(anonPosts.data).toEqual([]);

    const reader = await signInAs("reader");
    const readerPosts = await reader
      .from("posts")
      .select("id")
      .eq("id", fixtures.draftA);
    expect(readerPosts.data).toEqual([]);

    const authorB = await signInAs("authorB");
    const authorBPosts = await authorB
      .from("posts")
      .select("id")
      .eq("id", fixtures.draftA);
    expect(authorBPosts.data).toEqual([]);

    const authorA = await signInAs("authorA");
    const authorAPosts = await authorA
      .from("posts")
      .select("id")
      .eq("id", fixtures.draftA);
    expect(authorAPosts.data).toEqual([{ id: fixtures.draftA }]);

    const editor = await signInAs("editor");
    const editorPosts = await editor
      .from("posts")
      .select("id")
      .eq("id", fixtures.draftA);
    expect(editorPosts.data).toEqual([{ id: fixtures.draftA }]);
  });

  it("lets active members list authors without exposing the account link", async () => {
    const authorB = await signInAs("authorB");
    const { data, error } = await authorB
      .from("authors")
      .select("id, name")
      .eq("id", fixtures.guestAuthor);

    expect(error).toBeNull();
    expect(data).toEqual([
      { id: fixtures.guestAuthor, name: `RPC Konuk ${runId}` },
    ]);

    const accountLink = await authorB
      .from("authors")
      .select("user_id")
      .eq("id", fixtures.authorA);

    expect(accountLink.error).not.toBeNull();
  });

  it("stores the post language and rejects unsupported values", async () => {
    const authorA = await signInAs("authorA");
    const created = await authorA.rpc(
      "create_draft_post",
      draftPayload({
        p_slug: `${slugPrefix}-language`,
        p_title: `Language Draft ${runId}`,
        p_language: "en",
      }),
    );

    expect(created.error).toBeNull();
    const postId = (created.data as { post_id: string }[])[0].post_id;

    const updated = await authorA.rpc("update_post_metadata", {
      ...draftPayload({ p_slug: `${slugPrefix}-language`, p_language: "de" }),
      p_post_id: postId,
      p_expected_revision: 1,
    });

    expect(updated.error).toBeNull();

    for (const language of ["fr", "EN", "tr-TR", "", null]) {
      const rejectedCreate = await authorA.rpc(
        "create_draft_post",
        draftPayload({
          p_slug: `${slugPrefix}-language-rejected`,
          p_language: language,
        }),
      );
      expect(rejectedCreate.error?.code).toBe("22023");

      const rejectedUpdate = await authorA.rpc("update_post_metadata", {
        ...draftPayload({ p_slug: `${slugPrefix}-language`, p_language: language }),
        p_post_id: postId,
        p_expected_revision: 2,
      });
      expect(rejectedUpdate.error?.code).toBe("22023");
    }

    const { data } = await service
      .from("posts")
      .select("slug, language, revision")
      .in("slug", [`${slugPrefix}-language`, `${slugPrefix}-language-rejected`]);

    expect(data).toEqual([
      { slug: `${slugPrefix}-language`, language: "de", revision: 2 },
    ]);

    // The CHECK constraint also covers writes that bypass the RPCs.
    const direct = await service
      .from("posts")
      .update({ language: "fr" })
      .eq("id", postId);

    expect(direct.error?.code).toBe("23514");
  });

  it("keeps direct content writes closed to clients", async () => {
    const editor = await signInAs("editor");
    const update = await editor
      .from("posts")
      .update({ title: "Doğrudan yazma" })
      .eq("id", fixtures.draftA);
    const relationUpdate = await editor
      .from("post_tags")
      .insert({ post_id: fixtures.draftA, tag_id: fixtures.tagB });

    expect(update.error).not.toBeNull();
    expect(relationUpdate.error).not.toBeNull();
  });
});
