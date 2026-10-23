import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Taxonomy administration: admin-only RPCs, stale-form protection, cycle
// protection on moves, slug redirects, deletion with reassignment, and the
// rate limits around them.

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
  admin: `rls-tax-admin-${runId}@example.com`,
  // A second admin whose taxonomy.write budget is exhausted on purpose.
  burst: `rls-tax-burst-${runId}@example.com`,
  editor: `rls-tax-editor-${runId}@example.com`,
  author: `rls-tax-author-${runId}@example.com`,
  reader: `rls-tax-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const categoryIds: string[] = [];
const tagIds: string[] = [];
const postIds: string[] = [];

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

function name(label: string) {
  return `${label} ${runId}`;
}

function slug(label: string) {
  return `${label}-${runId}`;
}

async function createCategory(
  label: string,
  parentId: string | null = null,
  client: SupabaseClient = clients.admin,
) {
  const { data, error } = await client.rpc("create_category", {
    p_name: name(label),
    p_slug: slug(label),
    p_description: null,
    p_parent_id: parentId,
    p_sort_order: 0,
  });
  if (error) throw error;
  categoryIds.push(data as string);
  return data as string;
}

async function createTag(label: string, client: SupabaseClient = clients.admin) {
  const { data, error } = await client.rpc("create_tag", {
    p_name: name(label),
    p_slug: slug(label),
    p_description: null,
  });
  if (error) throw error;
  tagIds.push(data as string);
  return data as string;
}

async function category(id: string) {
  const { data, error } = await service
    .from("categories")
    .select("id, name, slug, parent_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    updated_at: string;
  } | null;
}

async function tag(id: string) {
  const { data, error } = await service
    .from("tags")
    .select("id, slug, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; slug: string; updated_at: string } | null;
}

async function insertPosts(
  count: number,
  values: { category_id?: string | null; status?: "draft" | "published" },
  label: string,
) {
  const rows = Array.from({ length: count }, (_, index) => ({
    title: `Taksonomi ${label} ${index} ${runId}`,
    slug: `${slug(`tax-${label}`)}-${index}`,
    body: { type: "doc", content: [{ type: "paragraph" }] },
    content_version: 1,
    category_id: values.category_id ?? null,
    ...(values.status === "published"
      ? { status: "published", published_at: new Date().toISOString() }
      : {}),
  }));

  const { data, error } = await service.from("posts").insert(rows).select("id");
  if (error) throw error;
  const ids = (data ?? []).map((row) => row.id as string);
  postIds.push(...ids);
  return ids;
}

function updateCategory(
  client: SupabaseClient,
  current: { id: string; name: string; slug: string; parent_id: string | null; updated_at: string },
  changes: Partial<{ name: string; slug: string; parent_id: string | null; updated_at: string }>,
) {
  const next = { ...current, ...changes };
  return client.rpc("update_category", {
    p_category_id: current.id,
    p_expected_updated_at: next.updated_at,
    p_name: next.name,
    p_slug: next.slug,
    p_description: null,
    p_parent_id: next.parent_id,
    p_sort_order: 0,
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

  const { error } = await service.from("editorial_members").insert([
    { profile_id: userIds.admin, role: "admin" },
    { profile_id: userIds.burst, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.author, role: "author" },
  ]);
  if (error) throw error;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }
});

afterAll(async () => {
  if (postIds.length > 0) {
    await service.from("post_tags").delete().in("post_id", postIds);
    await service.from("posts").delete().in("id", postIds);
  }

  const { data: remaining } = await service
    .from("categories")
    .select("id")
    .like("slug", `%-${runId}`);
  const remainingIds = (remaining ?? []).map((row) => row.id as string);
  if (remainingIds.length > 0) {
    await service.from("categories").update({ parent_id: null }).in("id", remainingIds);
    await service.from("categories").delete().in("id", remainingIds);
  }

  await service.from("tags").delete().like("slug", `%-${runId}`);

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("taxonomy RPC authorization", () => {
  it("denies anonymous, reader, author, and editor callers", async () => {
    const target = await createCategory("authz");
    const targetTag = await createTag("authz-tag");
    const current = await category(target);
    const currentTag = await tag(targetTag);

    for (const client of [
      anonymousClient(),
      clients.reader,
      clients.author,
      clients.editor,
    ]) {
      const calls = [
        client.rpc("create_category", {
          p_name: name("denied"),
          p_slug: slug("denied"),
          p_description: null,
          p_parent_id: null,
          p_sort_order: 0,
        }),
        client.rpc("update_category", {
          p_category_id: target,
          p_expected_updated_at: current!.updated_at,
          p_name: name("hijacked"),
          p_slug: slug("hijacked"),
          p_description: null,
          p_parent_id: null,
          p_sort_order: 0,
        }),
        client.rpc("delete_category", {
          p_category_id: target,
          p_expected_updated_at: current!.updated_at,
          p_target_category_id: null,
        }),
        client.rpc("create_tag", {
          p_name: name("denied-tag"),
          p_slug: slug("denied-tag"),
          p_description: null,
        }),
        client.rpc("update_tag", {
          p_tag_id: targetTag,
          p_expected_updated_at: currentTag!.updated_at,
          p_name: name("hijacked-tag"),
          p_slug: slug("hijacked-tag"),
          p_description: null,
        }),
        client.rpc("delete_tag", {
          p_tag_id: targetTag,
          p_expected_updated_at: currentTag!.updated_at,
        }),
      ];

      for (const { error } of await Promise.all(calls)) {
        expect(error?.code).toBe("42501");
      }
    }

    expect(await category(target)).toMatchObject({ name: name("authz") });
    expect(await tag(targetTag)).toMatchObject({ slug: slug("authz-tag") });
  });

  it("keeps direct writes closed for every client", async () => {
    for (const client of [clients.admin, clients.editor, clients.reader]) {
      const { error: categoryError } = await client
        .from("categories")
        .insert({ name: name("direct"), slug: slug("direct") });
      expect(categoryError).not.toBeNull();

      const { error: redirectError } = await client
        .from("category_slug_redirects")
        .insert({ old_slug: slug("direct-redirect"), category_id: categoryIds[0] });
      expect(redirectError).not.toBeNull();

      const { error: tagRedirectError } = await client
        .from("tag_slug_redirects")
        .insert({ old_slug: slug("direct-tag-redirect"), tag_id: tagIds[0] });
      expect(tagRedirectError).not.toBeNull();
    }
  });
});

describe("category administration", () => {
  it("rejects duplicate names and slugs", async () => {
    await createCategory("dupe");

    const { error: nameError } = await clients.admin.rpc("create_category", {
      p_name: name("DUPE"),
      p_slug: slug("dupe-other"),
      p_description: null,
      p_parent_id: null,
      p_sort_order: 0,
    });
    expect(nameError?.code).toBe("23505");
    expect(nameError?.message).toContain("categories_name_key");

    const { error: slugError } = await clients.admin.rpc("create_category", {
      p_name: name("dupe other"),
      p_slug: slug("dupe"),
      p_description: null,
      p_parent_id: null,
      p_sort_order: 0,
    });
    expect(slugError?.code).toBe("23505");
  });

  it("rejects a stale form", async () => {
    const id = await createCategory("stale");
    const loaded = (await category(id))!;

    const { error: firstError } = await updateCategory(clients.admin, loaded, {
      name: name("stale first"),
    });
    expect(firstError).toBeNull();

    const { error } = await updateCategory(clients.admin, loaded, { name: name("stale second") });
    expect(error?.code).toBe("40001");
    expect((await category(id))?.name).toBe(name("stale first"));
  });

  it("moves a subtree but never under itself", async () => {
    const root = await createCategory("move-root");
    const child = await createCategory("move-child", root);
    const grandchild = await createCategory("move-grandchild", child);
    const other = await createCategory("move-other");

    const { error: cycleError } = await updateCategory(clients.admin, (await category(root))!, {
      parent_id: grandchild,
    });
    expect(cycleError?.code).toBe("23514");

    const { error: selfError } = await updateCategory(clients.admin, (await category(root))!, {
      parent_id: root,
    });
    expect(selfError?.code).toBe("23514");

    const { error } = await updateCategory(clients.admin, (await category(child))!, {
      parent_id: other,
    });
    expect(error).toBeNull();
    expect((await category(child))?.parent_id).toBe(other);
    expect((await category(grandchild))?.parent_id).toBe(child);
  });

  it("records a public redirect when the slug changes", async () => {
    const id = await createCategory("rename");
    const { error } = await updateCategory(clients.admin, (await category(id))!, {
      slug: slug("renamed"),
    });
    expect(error).toBeNull();

    for (const client of [anonymousClient(), clients.reader]) {
      const { data } = await client
        .from("category_slug_redirects")
        .select("old_slug, category_id")
        .eq("old_slug", slug("rename"));
      expect(data).toEqual([{ old_slug: slug("rename"), category_id: id }]);
    }

    // Another category cannot take over the old URL...
    const { error: takeoverError } = await clients.admin.rpc("create_category", {
      p_name: name("takeover"),
      p_slug: slug("rename"),
      p_description: null,
      p_parent_id: null,
      p_sort_order: 0,
    });
    expect(takeoverError?.code).toBe("23505");

    // ...but the category may take its own old slug back.
    const { error: reclaimError } = await updateCategory(clients.admin, (await category(id))!, {
      slug: slug("rename"),
    });
    expect(reclaimError).toBeNull();

    const { data: redirects } = await service
      .from("category_slug_redirects")
      .select("old_slug")
      .eq("category_id", id)
      .order("old_slug");
    expect(redirects).toEqual([{ old_slug: slug("renamed") }]);
  });

  it("requires a target when posts use the category", async () => {
    const id = await createCategory("needs-target");
    await insertPosts(1, { category_id: id }, "needs-target");

    const { error } = await clients.admin.rpc("delete_category", {
      p_category_id: id,
      p_expected_updated_at: (await category(id))!.updated_at,
      p_target_category_id: null,
    });
    expect(error?.code).toBe("22023");

    const { error: selfError } = await clients.admin.rpc("delete_category", {
      p_category_id: id,
      p_expected_updated_at: (await category(id))!.updated_at,
      p_target_category_id: id,
    });
    expect(selfError?.code).toBe("22023");

    expect(await category(id)).not.toBeNull();
  });

  it("moves posts, children, and redirects to the target on delete", async () => {
    const parent = await createCategory("delete-parent");
    const doomed = await createCategory("delete-doomed", parent);
    const child = await createCategory("delete-child", doomed);
    const target = await createCategory("delete-target");

    // An older slug of the doomed category must follow it to the target.
    const { error: renameError } = await updateCategory(clients.admin, (await category(doomed))!, {
      slug: slug("delete-doomed-new"),
    });
    expect(renameError).toBeNull();

    const [draftId] = await insertPosts(1, { category_id: doomed }, "delete-draft");
    const [publishedId] = await insertPosts(
      1,
      { category_id: doomed, status: "published" },
      "delete-published",
    );

    const { data: before } = await service
      .from("posts")
      .select("id, revision")
      .in("id", [draftId, publishedId]);

    const { data: moved, error } = await clients.admin.rpc("delete_category", {
      p_category_id: doomed,
      p_expected_updated_at: (await category(doomed))!.updated_at,
      p_target_category_id: target,
    });
    expect(error).toBeNull();
    expect(moved).toBe(2);

    expect(await category(doomed)).toBeNull();
    expect((await category(child))?.parent_id).toBe(parent);

    const { data: after } = await service
      .from("posts")
      .select("id, category_id, revision, status")
      .in("id", [draftId, publishedId]);
    for (const post of after ?? []) {
      const previous = before?.find((row) => row.id === post.id);
      expect(post.category_id).toBe(target);
      expect(post.revision).toBe((previous?.revision ?? 0) + 1);
    }

    const { data: redirects } = await anonymousClient()
      .from("category_slug_redirects")
      .select("old_slug, category_id")
      .in("old_slug", [slug("delete-doomed"), slug("delete-doomed-new")])
      .order("old_slug");
    expect(redirects).toEqual([
      { old_slug: slug("delete-doomed"), category_id: target },
      { old_slug: slug("delete-doomed-new"), category_id: target },
    ]);

    const { data: audit } = await service
      .from("editorial_audit_log")
      .select("details")
      .eq("actor_profile_id", userIds.admin)
      .eq("action", "category.deleted")
      .contains("details", { category_id: doomed });
    expect(audit).toEqual([
      {
        details: expect.objectContaining({
          target_category_id: target,
          moved_posts: 2,
          moved_children: 1,
        }),
      },
    ]);
  });

  it("deletes an unused category without a target", async () => {
    const id = await createCategory("unused");
    const { data, error } = await clients.admin.rpc("delete_category", {
      p_category_id: id,
      p_expected_updated_at: (await category(id))!.updated_at,
      p_target_category_id: null,
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
    expect(await category(id)).toBeNull();
  });

  it("reassigns many posts without spending post write limits", async () => {
    const source = await createCategory("bulk-source");
    const target = await createCategory("bulk-target");
    await insertPosts(130, { category_id: source }, "bulk");

    const { data, error } = await clients.admin.rpc("delete_category", {
      p_category_id: source,
      p_expected_updated_at: (await category(source))!.updated_at,
      p_target_category_id: target,
    });
    expect(error).toBeNull();
    expect(data).toBe(130);

    const { count } = await service
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", userIds.admin)
      .like("action", "post.%");
    expect(count).toBe(0);
  });
});

describe("tag administration", () => {
  it("records a redirect on slug change", async () => {
    const id = await createTag("tag-rename");
    const loaded = (await tag(id))!;

    const { error } = await clients.admin.rpc("update_tag", {
      p_tag_id: id,
      p_expected_updated_at: loaded.updated_at,
      p_name: name("tag renamed"),
      p_slug: slug("tag-renamed"),
      p_description: null,
    });
    expect(error).toBeNull();

    const { data } = await anonymousClient()
      .from("tag_slug_redirects")
      .select("old_slug, tag_id")
      .eq("old_slug", slug("tag-rename"));
    expect(data).toEqual([{ old_slug: slug("tag-rename"), tag_id: id }]);

    const { error: staleError } = await clients.admin.rpc("update_tag", {
      p_tag_id: id,
      p_expected_updated_at: loaded.updated_at,
      p_name: name("tag stale"),
      p_slug: slug("tag-stale"),
      p_description: null,
    });
    expect(staleError?.code).toBe("40001");
  });

  it("removes a deleted tag from every post", async () => {
    const id = await createTag("tag-delete");
    const keep = await createTag("tag-keep");
    const posts = await insertPosts(3, {}, "tag-delete");

    const { error: linkError } = await service.from("post_tags").insert([
      ...posts.map((postId) => ({ post_id: postId, tag_id: id })),
      { post_id: posts[0], tag_id: keep },
    ]);
    expect(linkError).toBeNull();

    const { data: before } = await service.from("posts").select("id, revision").in("id", posts);

    const { data, error } = await clients.admin.rpc("delete_tag", {
      p_tag_id: id,
      p_expected_updated_at: (await tag(id))!.updated_at,
    });
    expect(error).toBeNull();
    expect(data).toBe(3);
    expect(await tag(id)).toBeNull();

    const { data: links } = await service
      .from("post_tags")
      .select("post_id, tag_id")
      .in("post_id", posts);
    expect(links).toEqual([{ post_id: posts[0], tag_id: keep }]);

    const { data: after } = await service.from("posts").select("id, revision").in("id", posts);
    for (const post of after ?? []) {
      const previous = before?.find((row) => row.id === post.id);
      expect(post.revision).toBe((previous?.revision ?? 0) + 1);
    }
  });
});

describe("taxonomy write limit", () => {
  it("rejects the 61st change in ten minutes", async () => {
    for (let index = 0; index < 60; index += 1) {
      await createTag(`burst-${index}`, clients.burst);
    }

    const { error } = await clients.burst.rpc("create_tag", {
      p_name: name("burst-over"),
      p_slug: slug("burst-over"),
      p_description: null,
    });
    expect(error?.code).toBe("PT429");

    // The limit is per admin.
    await expect(createTag("after-burst")).resolves.toBeTruthy();
  });
});
