import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { derivePublicArchives } from "@/features/posts/archives";
import { mapPublicPostSummary, type RawPublicPost } from "@/features/posts/mapping";
import {
  selectAuthorBySlug,
  selectCategories,
  selectPublishedPostsByAuthor,
  selectPublishedPostsInCategories,
  selectPublishedPostsWithTag,
  selectPublishedPostSummaries,
  selectTagBySlug,
} from "@/features/posts/queries";
import { buildSitemap } from "@/features/seo/sitemap";
import { collectCategorySubtree } from "@/features/taxonomy/hierarchy";

// Phase 9 archive and sitemap reads, run with the same query builders the
// server data boundary uses (src/features/posts/data.ts) against real RLS.

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
const slugPrefix = `arc-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  editor: `rls-arc-editor-${runId}@example.com`,
  reader: `rls-arc-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey | "anon", SupabaseClient>;

const ids = {
  parent: "",
  child: "",
  grandchild: "",
  empty: "",
  tag: "",
  secondTag: "",
  draftOnlyTag: "",
  author: "",
  draftOnlyAuthor: "",
  inChild: "",
  inGrandchild: "",
  draftInParent: "",
  unpublished: "",
  renamed: "",
};

const slugs = {
  inChild: `${slugPrefix}-child-post`,
  inGrandchild: `${slugPrefix}-grandchild-post`,
  draftInParent: `${slugPrefix}-draft`,
  unpublished: `${slugPrefix}-unpublished`,
  renamedOld: `${slugPrefix}-renamed-old`,
  renamedNew: `${slugPrefix}-renamed-new`,
};

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signInAs(key: UserKey): Promise<SupabaseClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({ email: emails[key], password });
  if (error) throw error;
  return client;
}

async function insertOne(table: string, values: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(values).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function insertPost(
  slug: string,
  categoryId: string,
  options: { published: boolean; publishedAt?: string },
): Promise<string> {
  return insertOne("posts", {
    title: `Arşiv testi ${slug}`,
    slug,
    category_id: categoryId,
    status: options.published ? "published" : "draft",
    published_at: options.published ? (options.publishedAt ?? new Date().toISOString()) : null,
  });
}

function slugsOf(rows: unknown[] | null) {
  return ((rows ?? []) as { slug: string }[])
    .map((row) => row.slug)
    .filter((slug) => slug.startsWith(slugPrefix))
    .sort();
}

async function categoryArchiveSlugs(client: SupabaseClient, rootId: string) {
  const categories = await selectCategories(client);
  expect(categories.error).toBeNull();
  const nodes = (categories.data ?? []).map((row) => ({
    id: row.id as string,
    parentId: row.parent_id as string | null,
  }));
  const { data, error } = await selectPublishedPostsInCategories(
    client,
    collectCategorySubtree(nodes, rootId),
  );
  expect(error).toBeNull();
  return slugsOf(data);
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
    .insert({ profile_id: userIds.editor, role: "editor" });
  if (membershipError) throw membershipError;

  clients.anon = anonymousClient();
  clients.editor = await signInAs("editor");
  clients.reader = await signInAs("reader");

  ids.parent = await insertOne("categories", {
    name: `Arşiv Üst ${runId}`,
    slug: `${slugPrefix}-parent`,
  });
  ids.child = await insertOne("categories", {
    name: `Arşiv Alt ${runId}`,
    slug: `${slugPrefix}-child`,
    parent_id: ids.parent,
  });
  ids.grandchild = await insertOne("categories", {
    name: `Arşiv Torun ${runId}`,
    slug: `${slugPrefix}-grandchild`,
    parent_id: ids.child,
  });
  ids.empty = await insertOne("categories", {
    name: `Arşiv Boş ${runId}`,
    slug: `${slugPrefix}-empty`,
  });
  ids.tag = await insertOne("tags", { name: `Arşiv Etiket ${runId}`, slug: `${slugPrefix}-tag` });
  ids.secondTag = await insertOne("tags", {
    name: `Arşiv İkinci Etiket ${runId}`,
    slug: `${slugPrefix}-second-tag`,
  });
  ids.draftOnlyTag = await insertOne("tags", {
    name: `Arşiv Taslak Etiket ${runId}`,
    slug: `${slugPrefix}-draft-tag`,
  });
  ids.author = await insertOne("authors", {
    name: `Arşiv Yazar ${runId}`,
    slug: `${slugPrefix}-author`,
  });
  ids.draftOnlyAuthor = await insertOne("authors", {
    name: `Arşiv Taslak Yazar ${runId}`,
    slug: `${slugPrefix}-draft-author`,
  });

  ids.inChild = await insertPost(slugs.inChild, ids.child, {
    published: true,
    publishedAt: "2026-10-01T09:00:00+00:00",
  });
  ids.inGrandchild = await insertPost(slugs.inGrandchild, ids.grandchild, {
    published: true,
    publishedAt: "2026-10-02T09:00:00+00:00",
  });
  ids.draftInParent = await insertPost(slugs.draftInParent, ids.parent, { published: false });
  ids.unpublished = await insertPost(slugs.unpublished, ids.child, { published: true });
  ids.renamed = await insertPost(slugs.renamedOld, ids.grandchild, { published: true });

  const { error: creditError } = await service.from("post_authors").insert([
    { post_id: ids.inChild, author_id: ids.author, sort_order: 0 },
    { post_id: ids.inGrandchild, author_id: ids.author, sort_order: 0 },
    { post_id: ids.draftInParent, author_id: ids.author, sort_order: 0 },
    { post_id: ids.draftInParent, author_id: ids.draftOnlyAuthor, sort_order: 1 },
    { post_id: ids.unpublished, author_id: ids.draftOnlyAuthor, sort_order: 0 },
    { post_id: ids.renamed, author_id: ids.author, sort_order: 0 },
  ]);
  if (creditError) throw creditError;

  const { error: tagError } = await service.from("post_tags").insert([
    { post_id: ids.inChild, tag_id: ids.tag },
    { post_id: ids.inGrandchild, tag_id: ids.tag },
    { post_id: ids.inGrandchild, tag_id: ids.secondTag },
    { post_id: ids.draftInParent, tag_id: ids.tag },
    { post_id: ids.draftInParent, tag_id: ids.draftOnlyTag },
    { post_id: ids.unpublished, tag_id: ids.tag },
    { post_id: ids.unpublished, tag_id: ids.draftOnlyTag },
  ]);
  if (tagError) throw tagError;

  // Published, then returned to draft: every public trace must disappear.
  const { error: unpublishError } = await service
    .from("posts")
    .update({ status: "draft", published_at: null })
    .eq("id", ids.unpublished);
  if (unpublishError) throw unpublishError;

  // A slug change of a published post records a redirect for the old slug.
  const { error: renameError } = await service
    .from("posts")
    .update({ slug: slugs.renamedNew })
    .eq("id", ids.renamed);
  if (renameError) throw renameError;
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().in("id", [ids.grandchild].filter(Boolean));
  await service.from("categories").delete().in("id", [ids.child].filter(Boolean));
  await service.from("categories").delete().in("id", [ids.parent, ids.empty].filter(Boolean));
  await service.from("tags").delete().in("id", [ids.tag, ids.secondTag, ids.draftOnlyTag].filter(Boolean));
  await service.from("authors").delete().in("id", [ids.author, ids.draftOnlyAuthor].filter(Boolean));

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

const publicReaders = ["anon", "reader"] as const;

describe("category archives", () => {
  it.each(publicReaders)("%s sees published posts of the category and its descendants", async (who) => {
    expect(await categoryArchiveSlugs(clients[who], ids.parent)).toEqual(
      [slugs.inChild, slugs.inGrandchild, slugs.renamedNew].sort(),
    );
    expect(await categoryArchiveSlugs(clients[who], ids.child)).toEqual(
      [slugs.inChild, slugs.inGrandchild, slugs.renamedNew].sort(),
    );
    expect(await categoryArchiveSlugs(clients[who], ids.grandchild)).toEqual(
      [slugs.inGrandchild, slugs.renamedNew].sort(),
    );
  });

  it("excludes drafts even for an editor whose RLS can read them", async () => {
    const all = await clients.editor.from("posts").select("slug").eq("id", ids.draftInParent);
    expect(slugsOf(all.data)).toEqual([slugs.draftInParent]);

    expect(await categoryArchiveSlugs(clients.editor, ids.parent)).not.toContain(
      slugs.draftInParent,
    );
  });

  it("has no posts for an empty category", async () => {
    expect(await categoryArchiveSlugs(clients.anon, ids.empty)).toEqual([]);
  });
});

describe("tag archives", () => {
  it.each(publicReaders)("%s sees only published posts with the tag", async (who) => {
    const tag = await selectTagBySlug(clients[who], `${slugPrefix}-tag`);
    expect(tag.error).toBeNull();
    expect(tag.data?.id).toBe(ids.tag);

    const { data, error } = await selectPublishedPostsWithTag(clients[who], ids.tag);
    expect(error).toBeNull();
    expect(slugsOf(data)).toEqual([slugs.inChild, slugs.inGrandchild].sort());
  });

  it("keeps every tag of a listed post for display", async () => {
    const { data } = await selectPublishedPostsWithTag(clients.anon, ids.tag);
    const post = ((data ?? []) as unknown as RawPublicPost[])
      .map(mapPublicPostSummary)
      .find((row) => row?.slug === slugs.inGrandchild);

    expect(post?.tags.map((tag) => tag.id).sort()).toEqual([ids.tag, ids.secondTag].sort());
  });

  it.each(["anon", "reader", "editor"] as const)(
    "%s gets no published posts for a tag used only on drafts",
    async (who) => {
      const { data, error } = await selectPublishedPostsWithTag(clients[who], ids.draftOnlyTag);
      expect(error).toBeNull();
      expect(slugsOf(data)).toEqual([]);
    },
  );
});

describe("author archives", () => {
  it.each(publicReaders)("%s sees a credited author and their published posts only", async (who) => {
    const author = await selectAuthorBySlug(clients[who], `${slugPrefix}-author`);
    expect(author.error).toBeNull();
    expect(author.data?.id).toBe(ids.author);

    const { data, error } = await selectPublishedPostsByAuthor(clients[who], ids.author);
    expect(error).toBeNull();
    expect(slugsOf(data)).toEqual([slugs.inChild, slugs.inGrandchild, slugs.renamedNew].sort());
  });

  it.each(publicReaders)("%s cannot see an author credited only on drafts", async (who) => {
    const author = await selectAuthorBySlug(clients[who], `${slugPrefix}-draft-author`);
    expect(author.error).toBeNull();
    expect(author.data).toBeNull();

    const posts = await selectPublishedPostsByAuthor(clients[who], ids.draftOnlyAuthor);
    expect(slugsOf(posts.data)).toEqual([]);
  });

  it("never exposes the author account link", async () => {
    const { error } = await clients.anon.from("authors").select("user_id").eq("id", ids.author);
    expect(error).not.toBeNull();
  });
});

describe("sitemap input", () => {
  it.each(publicReaders)("%s lists only current slugs of published posts and non-empty archives", async (who) => {
    const [posts, categories] = await Promise.all([
      selectPublishedPostSummaries(clients[who]),
      selectCategories(clients[who]),
    ]);
    expect(posts.error).toBeNull();
    expect(categories.error).toBeNull();

    const summaries = ((posts.data ?? []) as unknown as RawPublicPost[]).flatMap((row) => {
      const summary = mapPublicPostSummary(row);
      return summary ? [summary] : [];
    });
    const archives = derivePublicArchives(
      summaries,
      (categories.data ?? []).map((row) => ({
        id: row.id as string,
        slug: row.slug as string,
        parentId: row.parent_id as string | null,
      })),
    );
    const urls = buildSitemap({
      siteUrl: new URL("https://example.test"),
      posts: summaries,
      archives,
    }).map((entry) => entry.url);

    const ours = urls.filter((entry) => entry.includes(slugPrefix));
    expect(ours).toEqual(
      expect.arrayContaining([
        `https://example.test/posts/${slugs.inChild}`,
        `https://example.test/posts/${slugs.inGrandchild}`,
        `https://example.test/posts/${slugs.renamedNew}`,
        `https://example.test/categories/${slugPrefix}-parent`,
        `https://example.test/categories/${slugPrefix}-child`,
        `https://example.test/categories/${slugPrefix}-grandchild`,
        `https://example.test/tags/${slugPrefix}-tag`,
        `https://example.test/authors/${slugPrefix}-author`,
      ]),
    );
    for (const absent of [
      slugs.draftInParent,
      slugs.unpublished,
      slugs.renamedOld,
      `${slugPrefix}-empty`,
      `${slugPrefix}-draft-author`,
      `${slugPrefix}-draft-tag`,
    ]) {
      expect(ours.some((entry) => entry.endsWith(`/${absent}`))).toBe(false);
    }
    expect(urls.some((entry) => /\/admin|\/login|preview/.test(entry))).toBe(false);
  });

  it("keeps the old slug as a redirect, not a listed URL", async () => {
    const redirect = await clients.anon
      .from("post_slug_redirects")
      .select("old_slug")
      .eq("post_id", ids.renamed);
    expect(redirect.error).toBeNull();
    expect(redirect.data?.map((row) => row.old_slug)).toEqual([slugs.renamedOld]);
  });
});
