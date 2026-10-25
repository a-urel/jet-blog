import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapPublicPost, publicPostColumns, type RawPublicPost } from "@/features/posts/mapping";
import {
  selectAuthorBySlug,
  selectPublishedPostsByAuthor,
  selectPublishedPostsInCategories,
  selectPublishedPostsWithTag,
} from "@/features/posts/queries";

// Phase 26: a published post's working copy (posts, post_authors, post_tags)
// is separate from its published snapshot (published_posts and its credits
// and tags). Edits stay private until an editor or admin republishes; every
// publish and republish appends an immutable post_versions row.

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
const slugPrefix = `snap-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-snap-admin-${runId}@example.com`,
  editor: `rls-snap-editor-${runId}@example.com`,
  author: `rls-snap-author-${runId}@example.com`,
  otherAuthor: `rls-snap-other-${runId}@example.com`,
  reader: `rls-snap-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;

const fixtures = {
  categoryA: "",
  categoryB: "",
  tagA: "",
  tagB: "",
  creditedAuthor: "",
  laterAuthor: "",
  post: "",
};

const slugs = {
  original: `${slugPrefix}-ilk`,
  renamed: `${slugPrefix}-yeni`,
};

function paragraph(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

const originalTerm = `ilkkelime${runId}`;
const editedTerm = `yenikelime${runId}`;

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

async function insertOne(table: string, values: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(values).select("id").single();

  if (error) throw error;

  return data.id as string;
}

async function revisionOf(postId: string): Promise<number> {
  const { data, error } = await service
    .from("posts")
    .select("revision")
    .eq("id", postId)
    .single();

  if (error) throw error;

  return data.revision as number;
}

type WorkingCopy = {
  title: string;
  slug: string;
  excerpt: string | null;
  categoryId: string;
  tagIds: string[];
  authorIds: string[];
  body: unknown;
  language: string;
};

const originalCopy = (): WorkingCopy => ({
  title: `Anlık görüntü ${runId}`,
  slug: slugs.original,
  excerpt: "Yayındaki özet",
  categoryId: fixtures.categoryA,
  tagIds: [fixtures.tagA],
  authorIds: [fixtures.creditedAuthor],
  body: paragraph(`Yayındaki gövde ${originalTerm}`),
  language: "tr",
});

const editedCopy = (): WorkingCopy => ({
  title: `Düzenlenmiş başlık ${runId}`,
  slug: slugs.renamed,
  excerpt: "Yayımlanmamış özet",
  categoryId: fixtures.categoryB,
  tagIds: [fixtures.tagB],
  authorIds: [fixtures.laterAuthor, fixtures.creditedAuthor],
  body: paragraph(`Yayımlanmamış gövde ${editedTerm}`),
  language: "en",
});

async function saveWorkingCopy(
  client: SupabaseClient,
  postId: string,
  copy: WorkingCopy,
  revision?: number,
) {
  return client.rpc("update_post_metadata", {
    p_post_id: postId,
    p_expected_revision: revision ?? (await revisionOf(postId)),
    p_title: copy.title,
    p_slug: copy.slug,
    p_excerpt: copy.excerpt,
    p_category_id: copy.categoryId,
    p_tag_ids: copy.tagIds,
    p_credits: copy.authorIds.map((authorId, sortOrder) => ({
      author_id: authorId,
      sort_order: sortOrder,
    })),
    p_body: copy.body,
    p_content_version: 1,
    p_language: copy.language,
    p_cover_media_id: null,
    p_cover_alt: null,
  });
}

async function publicationRpc(
  client: SupabaseClient,
  rpc: "publish_post" | "republish_post" | "discard_post_changes" | "unpublish_post",
  postId: string,
  revision?: number,
) {
  return client.rpc(rpc, {
    p_post_id: postId,
    p_expected_revision: revision ?? (await revisionOf(postId)),
  });
}

// Mirrors findPublishedPost in src/features/posts/data.ts.
async function publicLookup(slug: string) {
  const anon = anonymousClient();
  const direct = await anon
    .from("published_posts")
    .select(publicPostColumns)
    .eq("slug", slug)
    .maybeSingle();

  expect(direct.error).toBeNull();
  if (direct.data) {
    return { kind: "post" as const, post: mapPublicPost(direct.data as unknown as RawPublicPost) };
  }

  const redirect = await anon
    .from("post_slug_redirects")
    .select("post:published_post!inner(slug)")
    .eq("old_slug", slug)
    .maybeSingle();

  expect(redirect.error).toBeNull();
  const target = redirect.data?.post as { slug: string } | undefined;

  return target ? { kind: "redirect" as const, slug: target.slug } : { kind: "missing" as const };
}

async function searchIds(term: string): Promise<string[]> {
  const { data, error } = await service.rpc("search_published_posts", {
    p_query: term,
    p_language: null,
    p_limit: 10,
    p_offset: 0,
  });

  expect(error).toBeNull();

  return ((data ?? []) as { post_id: string }[]).map((row) => row.post_id);
}

async function versionsOf(postId: string) {
  const { data, error } = await service
    .from("post_versions")
    .select("version, published_by, snapshot")
    .eq("post_id", postId)
    .order("version");

  if (error) throw error;

  return data as { version: number; published_by: string | null; snapshot: Record<string, unknown> }[];
}

async function hasUnpublishedChanges(client: SupabaseClient, postId: string) {
  const { data, error } = await client
    .from("posts")
    .select("has_unpublished_changes")
    .eq("id", postId)
    .single();

  expect(error).toBeNull();

  return data?.has_unpublished_changes as boolean;
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

  const { error: membershipError } = await service.from("editorial_members").insert([
    { profile_id: userIds.admin, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.author, role: "author" },
    { profile_id: userIds.otherAuthor, role: "author" },
  ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  fixtures.categoryA = await insertOne("categories", {
    name: `Anlık A ${runId}`,
    slug: `${slugPrefix}-kategori-a`,
  });
  fixtures.categoryB = await insertOne("categories", {
    name: `Anlık B ${runId}`,
    slug: `${slugPrefix}-kategori-b`,
  });
  fixtures.tagA = await insertOne("tags", { name: `Anlık Etiket A ${runId}`, slug: `${slugPrefix}-etiket-a` });
  fixtures.tagB = await insertOne("tags", { name: `Anlık Etiket B ${runId}`, slug: `${slugPrefix}-etiket-b` });
  fixtures.creditedAuthor = await insertOne("authors", {
    name: `Anlık Yazar ${runId}`,
    slug: `${slugPrefix}-yazar`,
  });
  fixtures.laterAuthor = await insertOne("authors", {
    name: `Sonraki Yazar ${runId}`,
    slug: `${slugPrefix}-sonraki-yazar`,
  });

  // The author writes the draft; an editor publishes it (D1).
  const copy = originalCopy();
  const { data, error } = await clients.author.rpc("create_draft_post", {
    p_title: copy.title,
    p_slug: copy.slug,
    p_excerpt: copy.excerpt,
    p_category_id: copy.categoryId,
    p_tag_ids: copy.tagIds,
    p_credits: [{ author_id: fixtures.creditedAuthor, sort_order: 0 }],
    p_body: copy.body,
    p_content_version: 1,
    p_language: copy.language,
    p_cover_media_id: null,
    p_cover_alt: null,
  });

  if (error) throw error;
  fixtures.post = (data as { post_id: string }[])[0].post_id;

  const published = await publicationRpc(clients.editor, "publish_post", fixtures.post);
  if (published.error) throw published.error;
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().in("id", [fixtures.categoryA, fixtures.categoryB]);
  await service.from("tags").delete().in("id", [fixtures.tagA, fixtures.tagB]);
  await service.from("authors").delete().in("id", [fixtures.creditedAuthor, fixtures.laterAuthor]);

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("published snapshots", () => {
  it("publishes a snapshot and version 1 recording the publisher", async () => {
    const lookup = await publicLookup(slugs.original);
    expect(lookup.kind).toBe("post");
    if (lookup.kind !== "post") return;

    expect(lookup.post?.title).toBe(originalCopy().title);
    expect(lookup.post?.publishedAt).toBe(lookup.post?.updatedAt);

    const versions = await versionsOf(fixtures.post);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, published_by: userIds.editor });
    expect(versions[0].snapshot).toMatchObject({
      title: originalCopy().title,
      slug: slugs.original,
      category_id: fixtures.categoryA,
      tag_ids: [fixtures.tagA],
      credits: [{ author_id: fixtures.creditedAuthor, sort_order: 0 }],
    });

    expect(await hasUnpublishedChanges(clients.editor, fixtures.post)).toBe(false);
  });

  it("never lets anonymous visitors or readers read the working copy", async () => {
    const anon = anonymousClient();

    for (const table of ["posts", "post_authors", "post_tags"]) {
      const result = await anon.from(table).select("*").limit(1);
      expect(result.error?.code).toBe("42501");

      const reader = await clients.reader.from(table).select("*").limit(50);
      expect(reader.error).toBeNull();
      expect(reader.data).toEqual([]);
    }
  });

  it("keeps an editor's saved edits of a live post out of every public read", async () => {
    const saved = await saveWorkingCopy(clients.editor, fixtures.post, editedCopy());
    expect(saved.error).toBeNull();
    expect(await hasUnpublishedChanges(clients.editor, fixtures.post)).toBe(true);

    // The public page still shows the published title, slug, excerpt, body,
    // language, category, tags, and credits.
    const lookup = await publicLookup(slugs.original);
    expect(lookup.kind).toBe("post");
    if (lookup.kind === "post") {
      expect(lookup.post).toMatchObject({
        title: originalCopy().title,
        slug: slugs.original,
        excerpt: "Yayındaki özet",
        language: "tr",
        category: { id: fixtures.categoryA },
        tags: [{ id: fixtures.tagA }],
        authors: [{ author: { id: fixtures.creditedAuthor } }],
        body: originalCopy().body,
      });
      expect(lookup.post?.publishedAt).toBe(lookup.post?.updatedAt);
    }

    // The new slug is not public yet, and no redirect exists before a republish.
    expect(await publicLookup(slugs.renamed)).toEqual({ kind: "missing" });

    const anon = anonymousClient();
    for (const client of [anon, clients.reader]) {
      const inNewCategory = await selectPublishedPostsInCategories(client, [fixtures.categoryB]);
      const withNewTag = await selectPublishedPostsWithTag(client, fixtures.tagB);
      const byNewAuthor = await selectPublishedPostsByAuthor(client, fixtures.laterAuthor);
      expect(inNewCategory.data).toEqual([]);
      expect(withNewTag.data).toEqual([]);
      expect(byNewAuthor.data).toEqual([]);

      // An author credited only in the working copy stays private.
      const author = await selectAuthorBySlug(client, `${slugPrefix}-sonraki-yazar`);
      expect(author.error).toBeNull();
      expect(author.data).toBeNull();
    }

    // Search reads the snapshot only.
    expect(await searchIds(editedTerm)).toEqual([]);
    expect(await searchIds(originalTerm)).toEqual([fixtures.post]);
  });

  it("lets the post's own author edit the live working copy but not other authors", async () => {
    const own = await clients.author
      .from("posts")
      .select("title")
      .eq("id", fixtures.post)
      .single();
    expect(own.error).toBeNull();
    expect(own.data?.title).toBe(editedCopy().title);

    const other = await clients.otherAuthor.from("posts").select("id").eq("id", fixtures.post);
    const otherCredits = await clients.otherAuthor
      .from("post_authors")
      .select("post_id")
      .eq("post_id", fixtures.post);
    expect(other.data).toEqual([]);
    expect(otherCredits.data).toEqual([]);

    const denied = await saveWorkingCopy(clients.otherAuthor, fixtures.post, editedCopy());
    expect(denied.error?.code).toBe("42501");

    const allowed = await saveWorkingCopy(clients.author, fixtures.post, {
      ...editedCopy(),
      title: `Yazarın düzenlemesi ${runId}`,
    });
    expect(allowed.error).toBeNull();

    const lookup = await publicLookup(slugs.original);
    expect(lookup.kind === "post" && lookup.post?.title).toBe(originalCopy().title);
  });

  it("refuses republish and unpublish to authors, readers, and anonymous callers", async () => {
    for (const client of [clients.author, clients.otherAuthor, clients.reader]) {
      for (const rpc of ["republish_post", "unpublish_post"] as const) {
        const result = await publicationRpc(client, rpc, fixtures.post);
        expect(result.error?.code).toBe("42501");
      }
    }

    const anon = await publicationRpc(anonymousClient(), "republish_post", fixtures.post);
    expect(anon.error).not.toBeNull();

    // Neither the snapshot nor the version history moved.
    expect(await versionsOf(fixtures.post)).toHaveLength(1);
    const lookup = await publicLookup(slugs.original);
    expect(lookup.kind === "post" && lookup.post?.title).toBe(originalCopy().title);
  });

  it("rejects a stale republish without touching the snapshot", async () => {
    const revision = await revisionOf(fixtures.post);
    const stale = await publicationRpc(clients.editor, "republish_post", fixtures.post, revision - 1);
    expect(stale.error?.code).toBe("40001");
    expect(await versionsOf(fixtures.post)).toHaveLength(1);
  });

  it("refuses a republish of a draft and a working-copy slug owned by a public URL", async () => {
    const { data, error } = await clients.editor.rpc("create_draft_post", {
      p_title: `Başka taslak ${runId}`,
      p_slug: `${slugPrefix}-baska`,
      p_excerpt: null,
      p_category_id: fixtures.categoryA,
      p_tag_ids: [],
      p_credits: [],
      p_body: paragraph("Başka"),
      p_content_version: 1,
      p_language: "tr",
      p_cover_media_id: null,
      p_cover_alt: null,
    });
    expect(error).toBeNull();
    const draftId = (data as { post_id: string }[])[0].post_id;

    const republish = await publicationRpc(clients.editor, "republish_post", draftId);
    expect(republish.error?.code).toBe("55000");

    // The live post's published slug is still public, so no other working
    // copy may take it, even though the live post's own working copy moved on.
    const taken = await saveWorkingCopy(clients.editor, draftId, {
      ...originalCopy(),
      slug: slugs.original,
      title: `Başka taslak ${runId}`,
    });
    expect(taken.error?.code).toBe("23505");
  });

  it("republishes the saved working copy as version 2 and redirects the old slug", async () => {
    const before = await publicLookup(slugs.original);
    const publishedAt = before.kind === "post" ? before.post?.publishedAt : null;
    const revision = await revisionOf(fixtures.post);

    const republished = await publicationRpc(clients.editor, "republish_post", fixtures.post, revision);
    expect(republished.error).toBeNull();
    expect(republished.data).toEqual([
      {
        post_id: fixtures.post,
        revision,
        slug: slugs.renamed,
        previous_slug: slugs.original,
        version: 2,
      },
    ]);
    // The working copy did not change, so the revision stays.
    expect(await revisionOf(fixtures.post)).toBe(revision);
    expect(await hasUnpublishedChanges(clients.editor, fixtures.post)).toBe(false);

    const lookup = await publicLookup(slugs.renamed);
    expect(lookup.kind).toBe("post");
    if (lookup.kind === "post") {
      expect(lookup.post).toMatchObject({
        title: `Yazarın düzenlemesi ${runId}`,
        excerpt: "Yayımlanmamış özet",
        language: "en",
        category: { id: fixtures.categoryB },
        tags: [{ id: fixtures.tagB }],
        body: editedCopy().body,
      });
      expect(lookup.post?.authors.map((credit) => credit.author.id)).toEqual([
        fixtures.laterAuthor,
        fixtures.creditedAuthor,
      ]);
      // Publication time stays; "updated" now shows.
      expect(lookup.post?.publishedAt).toBe(publishedAt);
      expect(Date.parse(lookup.post!.updatedAt)).toBeGreaterThan(Date.parse(publishedAt!));
    }

    expect(await publicLookup(slugs.original)).toEqual({ kind: "redirect", slug: slugs.renamed });

    const author = await selectAuthorBySlug(anonymousClient(), `${slugPrefix}-sonraki-yazar`);
    expect(author.data?.slug).toBe(`${slugPrefix}-sonraki-yazar`);

    expect(await searchIds(editedTerm)).toEqual([fixtures.post]);
    expect(await searchIds(originalTerm)).toEqual([]);

    const versions = await versionsOf(fixtures.post);
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    expect(versions[1].published_by).toBe(userIds.editor);
    expect(versions[1].snapshot).toMatchObject({ slug: slugs.renamed, language: "en" });
    // History keeps what version 1 published.
    expect(versions[0].snapshot).toMatchObject({ slug: slugs.original, language: "tr" });
  });

  it("keeps versions immutable and readable by editors only", async () => {
    for (const key of ["editor", "admin"] as const) {
      const { data, error } = await clients[key]
        .from("post_versions")
        .select("version")
        .eq("post_id", fixtures.post);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    }

    for (const key of ["author", "reader"] as const) {
      const { data } = await clients[key].from("post_versions").select("version").eq("post_id", fixtures.post);
      expect(data).toEqual([]);
    }

    const anon = await anonymousClient().from("post_versions").select("version");
    expect(anon.error?.code).toBe("42501");

    // Not even the secret key may rewrite or delete history.
    const update = await service
      .from("post_versions")
      .update({ snapshot: {} })
      .eq("post_id", fixtures.post);
    expect(update.error?.message).toMatch(/immutable/);

    const removal = await service.from("post_versions").delete().eq("post_id", fixtures.post);
    expect(removal.error?.message).toMatch(/immutable/);

    const editorWrite = await clients.editor
      .from("post_versions")
      .insert({ post_id: fixtures.post, version: 99, snapshot: {} });
    expect(editorWrite.error).not.toBeNull();

    expect(await versionsOf(fixtures.post)).toHaveLength(2);
  });

  it("does not let clients write the snapshot tables or rebuild a snapshot", async () => {
    for (const client of [anonymousClient(), clients.editor, clients.admin]) {
      const update = await client
        .from("published_posts")
        .update({ title: "Sızma" })
        .eq("post_id", fixtures.post)
        .select("post_id");
      expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);

      const sync = await client.rpc("sync_published_post", { p_post_id: fixtures.post });
      expect(sync.error).not.toBeNull();
    }

    const lookup = await publicLookup(slugs.renamed);
    expect(lookup.kind === "post" && lookup.post?.title).toBe(`Yazarın düzenlemesi ${runId}`);
  });

  it("lets the own author discard unpublished changes, with revision checks", async () => {
    const edited = await saveWorkingCopy(clients.editor, fixtures.post, {
      ...editedCopy(),
      slug: slugs.renamed,
      title: `Atılacak başlık ${runId}`,
      tagIds: [fixtures.tagA, fixtures.tagB],
    });
    expect(edited.error).toBeNull();
    expect(await hasUnpublishedChanges(clients.author, fixtures.post)).toBe(true);

    const other = await publicationRpc(clients.otherAuthor, "discard_post_changes", fixtures.post);
    expect(other.error?.code).toBe("42501");

    const revision = await revisionOf(fixtures.post);
    const stale = await publicationRpc(clients.author, "discard_post_changes", fixtures.post, revision - 1);
    expect(stale.error?.code).toBe("40001");

    const discarded = await publicationRpc(clients.author, "discard_post_changes", fixtures.post, revision);
    expect(discarded.error).toBeNull();
    expect(discarded.data).toEqual([{ post_id: fixtures.post, revision: revision + 1 }]);

    expect(await hasUnpublishedChanges(clients.author, fixtures.post)).toBe(false);
    const working = await clients.author
      .from("posts")
      .select("title, slug, post_tags(tag_id)")
      .eq("id", fixtures.post)
      .single();
    expect(working.data).toMatchObject({
      title: `Yazarın düzenlemesi ${runId}`,
      slug: slugs.renamed,
      post_tags: [{ tag_id: fixtures.tagB }],
    });

    // Discarding is not publishing: no new version.
    expect(await versionsOf(fixtures.post)).toHaveLength(2);
  });

  it("unpublishes by removing the snapshot while keeping the versions", async () => {
    const unpublished = await publicationRpc(clients.editor, "unpublish_post", fixtures.post);
    expect(unpublished.error).toBeNull();

    expect(await publicLookup(slugs.renamed)).toEqual({ kind: "missing" });
    expect(await publicLookup(slugs.original)).toEqual({ kind: "missing" });

    const snapshot = await service.from("published_posts").select("post_id").eq("post_id", fixtures.post);
    expect(snapshot.data).toEqual([]);
    expect(await versionsOf(fixtures.post)).toHaveLength(2);

    const discard = await publicationRpc(clients.editor, "discard_post_changes", fixtures.post);
    expect(discard.error?.code).toBe("55000");

    // Publishing again continues the version numbers.
    const republished = await publicationRpc(clients.editor, "publish_post", fixtures.post);
    expect(republished.error).toBeNull();
    expect((await versionsOf(fixtures.post)).map((version) => version.version)).toEqual([1, 2, 3]);
    expect(await publicLookup(slugs.original)).toEqual({ kind: "redirect", slug: slugs.renamed });
  });
});

// The upgrade path: rows published before Phase 26 had no snapshot. The
// migration backfills each through sync_published_post, which this test runs
// on a post inserted the old way (a published posts row plus relations).
describe("snapshot backfill", () => {
  it("copies an existing published post unchanged into version 1", async () => {
    const publishedAt = "2026-10-01T08:00:00+00:00";
    const postId = await insertOne("posts", {
      title: `Eski yayın ${runId}`,
      slug: `${slugPrefix}-eski`,
      excerpt: "Eski özet",
      category_id: fixtures.categoryA,
      status: "published",
      published_at: publishedAt,
      body: paragraph("Eski gövde"),
      language: "de",
    });

    const credits = await service.from("post_authors").insert([
      { post_id: postId, author_id: fixtures.creditedAuthor, sort_order: 0 },
    ]);
    const tags = await service.from("post_tags").insert([{ post_id: postId, tag_id: fixtures.tagA }]);
    expect(credits.error).toBeNull();
    expect(tags.error).toBeNull();

    expect(await publicLookup(`${slugPrefix}-eski`)).toEqual({ kind: "missing" });

    const { data, error } = await service.rpc("sync_published_post", { p_post_id: postId });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const working = await service
      .from("posts")
      .select("updated_at")
      .eq("id", postId)
      .single();
    const lookup = await publicLookup(`${slugPrefix}-eski`);
    expect(lookup.kind).toBe("post");
    if (lookup.kind === "post") {
      expect(lookup.post).toMatchObject({
        title: `Eski yayın ${runId}`,
        excerpt: "Eski özet",
        language: "de",
        category: { id: fixtures.categoryA },
        tags: [{ id: fixtures.tagA }],
        authors: [{ author: { id: fixtures.creditedAuthor } }],
        body: paragraph("Eski gövde"),
      });
      expect(Date.parse(lookup.post!.publishedAt)).toBe(Date.parse(publishedAt));
      expect(Date.parse(lookup.post!.updatedAt)).toBe(Date.parse(working.data!.updated_at));
    }

    const versions = await versionsOf(postId);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, published_by: null });

    const changes = await clients.editor
      .from("posts")
      .select("has_unpublished_changes")
      .eq("id", postId)
      .single();
    expect(changes.data?.has_unpublished_changes).toBe(false);
  });
});
