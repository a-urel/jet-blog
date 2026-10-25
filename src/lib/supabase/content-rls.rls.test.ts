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
  admin: `rls-content-admin-${runId}@example.com`,
  editor: `rls-content-editor-${runId}@example.com`,
  authorA: `rls-content-author-a-${runId}@example.com`,
  authorB: `rls-content-author-b-${runId}@example.com`,
  reader: `rls-content-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;

const fixtures = {
  categoryRoot: "",
  categoryChild: "",
  categoryLeaf: "",
  tagA: "",
  tagB: "",
  authorA: "",
  authorB: "",
  guestAuthor: "",
  publishedPost: "",
  draftA: "",
  draftB: "",
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

  const memberships = [
    { profile_id: userIds.admin, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.authorA, role: "author" },
    { profile_id: userIds.authorB, role: "author" },
  ];

  const { error: membershipError } = await service
    .from("editorial_members")
    .insert(memberships);

  if (membershipError) throw membershipError;

  fixtures.categoryRoot = await insertOne("categories", {
    name: `Kök ${runId}`,
    slug: `kok-${runId}`,
  });
  fixtures.categoryChild = await insertOne("categories", {
    name: `Orta ${runId}`,
    slug: `orta-${runId}`,
    parent_id: fixtures.categoryRoot,
  });
  fixtures.categoryLeaf = await insertOne("categories", {
    name: `Yaprak ${runId}`,
    slug: `yaprak-${runId}`,
    parent_id: fixtures.categoryChild,
  });

  fixtures.tagA = await insertOne("tags", {
    name: `Etiket A ${runId}`,
    slug: `etiket-a-${runId}`,
  });
  fixtures.tagB = await insertOne("tags", {
    name: `Etiket B ${runId}`,
    slug: `etiket-b-${runId}`,
  });

  fixtures.authorA = await insertOne("authors", {
    name: `Yazar A ${runId}`,
    slug: `yazar-a-${runId}`,
    user_id: userIds.authorA,
  });
  fixtures.authorB = await insertOne("authors", {
    name: `Yazar B ${runId}`,
    slug: `yazar-b-${runId}`,
    user_id: userIds.authorB,
  });
  fixtures.guestAuthor = await insertOne("authors", {
    name: `Konuk Yazar ${runId}`,
    slug: `konuk-yazar-${runId}`,
  });

  fixtures.publishedPost = await insertOne("posts", {
    title: `Yayında ${runId}`,
    slug: `yayinda-${runId}`,
    category_id: fixtures.categoryRoot,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: userIds.authorA,
  });
  fixtures.draftA = await insertOne("posts", {
    title: `Taslak A ${runId}`,
    slug: `taslak-a-${runId}`,
    created_by: userIds.authorA,
  });
  fixtures.draftB = await insertOne("posts", {
    title: `Taslak B ${runId}`,
    slug: `taslak-b-${runId}`,
    created_by: userIds.authorB,
  });

  const { error: creditsError } = await service.from("post_authors").insert([
    {
      post_id: fixtures.publishedPost,
      author_id: fixtures.authorA,
      sort_order: 0,
    },
    {
      post_id: fixtures.publishedPost,
      author_id: fixtures.authorB,
      sort_order: 1,
    },
    { post_id: fixtures.draftA, author_id: fixtures.authorA, sort_order: 0 },
    { post_id: fixtures.draftB, author_id: fixtures.guestAuthor, sort_order: 0 },
  ]);

  if (creditsError) throw creditsError;

  const { error: tagsError } = await service.from("post_tags").insert([
    { post_id: fixtures.publishedPost, tag_id: fixtures.tagA },
    { post_id: fixtures.publishedPost, tag_id: fixtures.tagB },
    { post_id: fixtures.draftA, tag_id: fixtures.tagA },
    { post_id: fixtures.draftB, tag_id: fixtures.tagB },
  ]);

  if (tagsError) throw tagsError;

  // Public reads come from the published snapshot.
  const { error: syncError } = await service.rpc("sync_published_post", {
    p_post_id: fixtures.publishedPost,
  });

  if (syncError) throw syncError;
});

afterAll(async () => {
  const postIds = Object.values({
    publishedPost: fixtures.publishedPost,
    draftA: fixtures.draftA,
    draftB: fixtures.draftB,
  });

  await service.from("posts").delete().in("id", postIds);
  await service
    .from("categories")
    .delete()
    .in("id", [
      fixtures.categoryLeaf,
      fixtures.categoryChild,
      fixtures.categoryRoot,
    ]);
  await service
    .from("tags")
    .delete()
    .in("id", [fixtures.tagA, fixtures.tagB]);
  await service
    .from("authors")
    .delete()
    .in("id", [fixtures.authorA, fixtures.authorB, fixtures.guestAuthor]);

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("content RLS", () => {
  it("shows anonymous visitors only published posts", async () => {
    const anon = anonymousClient();
    const { data, error } = await anon
      .from("published_posts")
      .select("id:post_id");

    expect(error).toBeNull();

    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(fixtures.publishedPost);
    expect(ids).not.toContain(fixtures.draftA);
    expect(ids).not.toContain(fixtures.draftB);
  });

  it("denies anonymous visitors the working copy", async () => {
    const anon = anonymousClient();

    for (const table of ["posts", "post_authors", "post_tags"]) {
      const { data, error } = await anon.from(table).select("*");

      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    }
  });

  it("hides draft credits and tags from anonymous visitors", async () => {
    const anon = anonymousClient();

    const credits = await anon.from("published_post_authors").select("post_id");
    expect(credits.error).toBeNull();
    const creditPostIds = (credits.data ?? []).map((row) => row.post_id);
    expect(creditPostIds).toContain(fixtures.publishedPost);
    expect(creditPostIds).not.toContain(fixtures.draftA);
    expect(creditPostIds).not.toContain(fixtures.draftB);

    const postTags = await anon.from("published_post_tags").select("post_id");
    expect(postTags.error).toBeNull();
    const tagPostIds = (postTags.data ?? []).map((row) => row.post_id);
    expect(tagPostIds).toContain(fixtures.publishedPost);
    expect(tagPostIds).not.toContain(fixtures.draftA);
    expect(tagPostIds).not.toContain(fixtures.draftB);
  });

  it("exposes only authors credited on a visible post", async () => {
    const anon = anonymousClient();
    const { data, error } = await anon.from("authors").select("id, name");

    expect(error).toBeNull();

    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(fixtures.authorA);
    expect(ids).toContain(fixtures.authorB);
    expect(ids).not.toContain(fixtures.guestAuthor);
  });

  it("does not expose the author account link", async () => {
    const anon = anonymousClient();
    const { error } = await anon.from("authors").select("user_id");

    expect(error).not.toBeNull();
  });

  it("lets anonymous visitors read the public taxonomy", async () => {
    const anon = anonymousClient();

    const categories = await anon.from("categories").select("id");
    const tags = await anon.from("tags").select("id");

    expect(categories.error).toBeNull();
    expect(tags.error).toBeNull();
    expect((categories.data ?? []).map((row) => row.id)).toContain(
      fixtures.categoryRoot,
    );
    expect((tags.data ?? []).map((row) => row.id)).toContain(fixtures.tagA);
  });

  it("treats a signed-in reader without a grant like an anonymous visitor", async () => {
    const reader = await signInAs("reader");
    const { data, error } = await reader
      .from("published_posts")
      .select("id:post_id");

    expect(error).toBeNull();

    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(fixtures.publishedPost);
    expect(ids).not.toContain(fixtures.draftA);
    expect(ids).not.toContain(fixtures.draftB);

    // The working copy returns nothing to a reader, published posts included.
    const posts = await reader.from("posts").select("id");
    const credits = await reader.from("post_authors").select("post_id");
    const postTags = await reader.from("post_tags").select("post_id");

    expect(posts.error).toBeNull();
    expect(posts.data).toEqual([]);
    expect(credits.error).toBeNull();
    expect(credits.data).toEqual([]);
    expect(postTags.error).toBeNull();
    expect(postTags.data).toEqual([]);
  });

  it("lets an author read their own draft and its relations only", async () => {
    const authorA = await signInAs("authorA");

    const posts = await authorA.from("posts").select("id");
    const postIds = (posts.data ?? []).map((row) => row.id);
    expect(postIds).toContain(fixtures.publishedPost);
    expect(postIds).toContain(fixtures.draftA);
    expect(postIds).not.toContain(fixtures.draftB);

    const credits = await authorA.from("post_authors").select("post_id");
    const creditPostIds = (credits.data ?? []).map((row) => row.post_id);
    expect(creditPostIds).toContain(fixtures.draftA);
    expect(creditPostIds).not.toContain(fixtures.draftB);

    const postTags = await authorA.from("post_tags").select("post_id");
    const tagPostIds = (postTags.data ?? []).map((row) => row.post_id);
    expect(tagPostIds).toContain(fixtures.draftA);
    expect(tagPostIds).not.toContain(fixtures.draftB);
  });

  it("lets an editor read every draft and its relations", async () => {
    const editor = await signInAs("editor");

    const posts = await editor.from("posts").select("id");
    const postIds = (posts.data ?? []).map((row) => row.id);
    expect(postIds).toContain(fixtures.draftA);
    expect(postIds).toContain(fixtures.draftB);

    const credits = await editor.from("post_authors").select("post_id");
    const creditPostIds = (credits.data ?? []).map((row) => row.post_id);
    expect(creditPostIds).toContain(fixtures.draftA);
    expect(creditPostIds).toContain(fixtures.draftB);

    const authors = await editor.from("authors").select("id");
    expect((authors.data ?? []).map((row) => row.id)).toContain(
      fixtures.guestAuthor,
    );
  });

  it("lets an admin read every draft", async () => {
    const admin = await signInAs("admin");
    const { data, error } = await admin.from("posts").select("id");

    expect(error).toBeNull();

    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(fixtures.draftA);
    expect(ids).toContain(fixtures.draftB);
  });

  it("starts a post at revision one", async () => {
    const { data } = await service
      .from("posts")
      .select("revision, status")
      .eq("id", fixtures.draftA)
      .single();

    expect(data?.revision).toBe(1);
    expect(data?.status).toBe("draft");
  });

  it("rejects publishing a post without a category", async () => {
    const { error } = await service.from("posts").insert({
      title: `Kategorisiz ${runId}`,
      slug: `kategorisiz-${runId}`,
      status: "published",
      published_at: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it("keeps publication time and status consistent", async () => {
    const draftWithTime = await service.from("posts").insert({
      title: `Tutarsız ${runId}`,
      slug: `tutarsiz-${runId}`,
      status: "draft",
      published_at: new Date().toISOString(),
    });

    expect(draftWithTime.error).not.toBeNull();

    const publishedWithoutTime = await service.from("posts").insert({
      title: `Zamansız ${runId}`,
      slug: `zamansiz-${runId}`,
      status: "published",
      category_id: fixtures.categoryRoot,
    });

    expect(publishedWithoutTime.error).not.toBeNull();
  });

  it("rejects duplicate or unnormalized category and tag names", async () => {
    const duplicateCategoryName = await service.from("categories").insert({
      name: `KÖK ${runId}`,
      slug: `kok-kopya-${runId}`,
    });

    expect(duplicateCategoryName.error).not.toBeNull();

    const duplicateCategorySlug = await service.from("categories").insert({
      name: `Başka ${runId}`,
      slug: `kok-${runId}`,
    });

    expect(duplicateCategorySlug.error).not.toBeNull();

    const unnormalizedTagName = await service.from("tags").insert({
      name: `Etiket   A ${runId}`,
      slug: `etiket-a-kopya-${runId}`,
    });

    expect(unnormalizedTagName.error).not.toBeNull();
  });

  it("rejects a self-parent and a longer category cycle", async () => {
    const selfParent = await service
      .from("categories")
      .update({ parent_id: fixtures.categoryRoot })
      .eq("id", fixtures.categoryRoot);

    expect(selfParent.error).not.toBeNull();

    const longerCycle = await service
      .from("categories")
      .update({ parent_id: fixtures.categoryLeaf })
      .eq("id", fixtures.categoryRoot);

    expect(longerCycle.error).not.toBeNull();

    const middleCycle = await service
      .from("categories")
      .update({ parent_id: fixtures.categoryLeaf })
      .eq("id", fixtures.categoryChild);

    expect(middleCycle.error).not.toBeNull();
  });

  it("rejects duplicate credit pairs and sort orders", async () => {
    const duplicatePair = await service.from("post_authors").insert({
      post_id: fixtures.publishedPost,
      author_id: fixtures.authorA,
      sort_order: 5,
    });

    expect(duplicatePair.error).not.toBeNull();

    const duplicateSortOrder = await service.from("post_authors").insert({
      post_id: fixtures.publishedPost,
      author_id: fixtures.guestAuthor,
      sort_order: 0,
    });

    expect(duplicateSortOrder.error).not.toBeNull();
  });

  it("rejects duplicate post tag pairs", async () => {
    const { error } = await service.from("post_tags").insert({
      post_id: fixtures.publishedPost,
      tag_id: fixtures.tagA,
    });

    expect(error).not.toBeNull();
  });

  it("does not expose direct content writes to clients", async () => {
    const editor = await signInAs("editor");
    const anon = anonymousClient();

    const editorInsert = await editor.from("posts").insert({
      title: `Istemci ${runId}`,
      slug: `istemci-${runId}`,
    });
    const editorUpdate = await editor
      .from("posts")
      .update({ title: `Değişti ${runId}` })
      .eq("id", fixtures.draftA);
    const editorDelete = await editor
      .from("posts")
      .delete()
      .eq("id", fixtures.draftA);
    const editorTaxonomyInsert = await editor.from("categories").insert({
      name: `Istemci ${runId}`,
      slug: `istemci-kategori-${runId}`,
    });
    const anonInsert = await anon.from("posts").insert({
      title: `Anonim ${runId}`,
      slug: `anonim-${runId}`,
    });

    expect(editorInsert.error).not.toBeNull();
    expect(editorUpdate.error).not.toBeNull();
    expect(editorDelete.error).not.toBeNull();
    expect(editorTaxonomyInsert.error).not.toBeNull();
    expect(anonInsert.error).not.toBeNull();
  });

  it("refuses to delete a category or tag that is still referenced", async () => {
    const categoryInUse = await service
      .from("categories")
      .delete()
      .eq("id", fixtures.categoryRoot);

    expect(categoryInUse.error).not.toBeNull();

    const tagInUse = await service
      .from("tags")
      .delete()
      .eq("id", fixtures.tagA);

    expect(tagInUse.error).not.toBeNull();
  });
});
