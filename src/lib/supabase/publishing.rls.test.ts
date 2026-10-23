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
const slugPrefix = `pub-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-pub-admin-${runId}@example.com`,
  editor: `rls-pub-editor-${runId}@example.com`,
  author: `rls-pub-author-${runId}@example.com`,
  reader: `rls-pub-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;

const fixtures = {
  category: "",
  tag: "",
  author: "",
  draft: "",
  uncategorized: "",
  other: "",
};

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

async function insertOne(
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await service
    .from(table)
    .insert(values)
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

async function createDraft(
  client: SupabaseClient,
  slug: string,
  categoryId: string | null,
): Promise<string> {
  const { data, error } = await client.rpc("create_draft_post", {
    p_title: `Yayın testi ${slug}`,
    p_slug: slug,
    p_excerpt: null,
    p_category_id: categoryId,
    p_tag_ids: [fixtures.tag],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: body,
    p_content_version: 1,
  });

  if (error) throw error;

  return (data as { post_id: string }[])[0].post_id;
}

async function currentPost(postId: string) {
  const { data, error } = await service
    .from("posts")
    .select("slug, status, revision, published_at, updated_at")
    .eq("id", postId)
    .single();

  if (error) throw error;

  return data as {
    slug: string;
    status: string;
    revision: number;
    published_at: string | null;
    updated_at: string;
  };
}

async function renamePost(client: SupabaseClient, postId: string, slug: string) {
  const post = await currentPost(postId);

  return client.rpc("update_post_metadata", {
    p_post_id: postId,
    p_expected_revision: post.revision,
    p_title: `Yayın testi ${slug}`,
    p_slug: slug,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [fixtures.tag],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: body,
    p_content_version: 1,
  });
}

// Mirrors findPublishedPost in src/features/posts/data.ts.
async function resolvePublicSlug(slug: string) {
  const anon = anonymousClient();
  const direct = await anon
    .from("posts")
    .select("id, slug")
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();

  expect(direct.error).toBeNull();
  if (direct.data) return { kind: "post" as const, slug: direct.data.slug as string };

  const redirect = await anon
    .from("post_slug_redirects")
    .select("post:posts!inner(slug, status)")
    .eq("old_slug", slug)
    .eq("post.status", "published")
    .maybeSingle();

  expect(redirect.error).toBeNull();
  const target = redirect.data?.post as { slug: string } | undefined;

  return target
    ? { kind: "redirect" as const, slug: target.slug }
    : { kind: "missing" as const };
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
    ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  fixtures.category = await insertOne("categories", {
    name: `Yayın Kategori ${runId}`,
    slug: `${slugPrefix}-kategori`,
  });
  fixtures.tag = await insertOne("tags", {
    name: `Yayın Etiket ${runId}`,
    slug: `${slugPrefix}-etiket`,
  });
  fixtures.author = await insertOne("authors", {
    name: `Yayın Yazar ${runId}`,
    slug: `${slugPrefix}-yazar`,
    user_id: userIds.author,
  });

  fixtures.draft = await createDraft(
    clients.author,
    `${slugPrefix}-taslak`,
    fixtures.category,
  );
  fixtures.uncategorized = await createDraft(
    clients.author,
    `${slugPrefix}-kategorisiz`,
    null,
  );
  fixtures.other = await createDraft(
    clients.editor,
    `${slugPrefix}-diger`,
    fixtures.category,
  );
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service.from("tags").delete().eq("id", fixtures.tag);
  await service.from("authors").delete().eq("id", fixtures.author);

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("publishing RPCs, public reads, and slug redirects", () => {
  it("keeps drafts and their relations out of public reads", async () => {
    for (const client of [anonymousClient(), clients.reader]) {
      const posts = await client
        .from("posts")
        .select("id")
        .like("slug", `${slugPrefix}%`);
      const credits = await client
        .from("post_authors")
        .select("post_id")
        .eq("post_id", fixtures.draft);
      const tags = await client
        .from("post_tags")
        .select("post_id")
        .eq("post_id", fixtures.draft);

      expect(posts.error).toBeNull();
      expect(posts.data).toEqual([]);
      expect(credits.data).toEqual([]);
      expect(tags.data).toEqual([]);
    }

    expect(await resolvePublicSlug(`${slugPrefix}-taslak`)).toEqual({
      kind: "missing",
    });
  });

  it("denies publishing to anonymous users, readers, and authors", async () => {
    const anonResult = await anonymousClient().rpc("publish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: 1,
    });
    expect(anonResult.error).not.toBeNull();

    for (const key of ["reader", "author"] as const) {
      const { error } = await clients[key].rpc("publish_post", {
        p_post_id: fixtures.draft,
        p_expected_revision: 1,
      });
      expect(error?.code).toBe("42501");
    }

    expect((await currentPost(fixtures.draft)).status).toBe("draft");
  });

  it("requires a category before publishing", async () => {
    const { error } = await clients.editor.rpc("publish_post", {
      p_post_id: fixtures.uncategorized,
      p_expected_revision: 1,
    });

    expect(error?.code).toBe("23514");
    expect((await currentPost(fixtures.uncategorized)).status).toBe("draft");
  });

  it("rejects a stale revision", async () => {
    const { error } = await clients.editor.rpc("publish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: 99,
    });

    expect(error?.code).toBe("40001");
    expect((await currentPost(fixtures.draft)).status).toBe("draft");
  });

  it("publishes a draft with a separate publication timestamp", async () => {
    const before = await currentPost(fixtures.draft);
    const { data, error } = await clients.editor.rpc("publish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: before.revision,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const after = await currentPost(fixtures.draft);
    expect(after.status).toBe("published");
    expect(after.revision).toBe(before.revision + 1);
    expect(after.published_at).not.toBeNull();
    // Publishing is not an edit after publication.
    expect(Date.parse(after.updated_at)).toBe(Date.parse(after.published_at!));

    const anon = anonymousClient();
    const publicRow = await anon
      .from("posts")
      .select("id, post_authors(author_id), post_tags(tag_id)")
      .eq("id", fixtures.draft)
      .single();

    expect(publicRow.error).toBeNull();
    expect(publicRow.data?.post_authors).toEqual([
      { author_id: fixtures.author },
    ]);
    expect(publicRow.data?.post_tags).toEqual([{ tag_id: fixtures.tag }]);

    const again = await clients.editor.rpc("publish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: after.revision,
    });
    expect(again.error?.code).toBe("55000");
  });

  it("marks an edit after publication through updated_at", async () => {
    const { error } = await renamePost(
      clients.editor,
      fixtures.draft,
      `${slugPrefix}-taslak`,
    );
    expect(error).toBeNull();

    const post = await currentPost(fixtures.draft);
    expect(Date.parse(post.updated_at)).toBeGreaterThan(
      Date.parse(post.published_at!),
    );
  });

  it("redirects old published slugs to the current slug in one hop", async () => {
    const first = `${slugPrefix}-taslak`;
    const second = `${slugPrefix}-yeni`;
    const third = `${slugPrefix}-son`;

    expect((await renamePost(clients.editor, fixtures.draft, second)).error).toBeNull();
    expect((await renamePost(clients.editor, fixtures.draft, third)).error).toBeNull();

    expect(await resolvePublicSlug(first)).toEqual({ kind: "redirect", slug: third });
    expect(await resolvePublicSlug(second)).toEqual({ kind: "redirect", slug: third });
    expect(await resolvePublicSlug(third)).toEqual({ kind: "post", slug: third });

    const { data } = await service
      .from("post_slug_redirects")
      .select("old_slug")
      .eq("post_id", fixtures.draft)
      .order("old_slug");
    expect(data?.map((row) => row.old_slug)).toEqual([second, first].sort());
  });

  it("reserves an old slug for its post", async () => {
    const taken = await renamePost(
      clients.editor,
      fixtures.other,
      `${slugPrefix}-yeni`,
    );
    expect(taken.error?.code).toBe("23505");

    const created = await clients.editor.rpc("create_draft_post", {
      p_title: "Eski slug denemesi",
      p_slug: `${slugPrefix}-taslak`,
      p_excerpt: null,
      p_category_id: fixtures.category,
      p_tag_ids: [],
      p_credits: [],
      p_body: body,
      p_content_version: 1,
    });
    expect(created.error?.code).toBe("23505");

    // The post itself may take an old slug back; that redirect disappears.
    const reclaimed = await renamePost(
      clients.editor,
      fixtures.draft,
      `${slugPrefix}-yeni`,
    );
    expect(reclaimed.error).toBeNull();
    expect(await resolvePublicSlug(`${slugPrefix}-yeni`)).toEqual({
      kind: "post",
      slug: `${slugPrefix}-yeni`,
    });
    expect(await resolvePublicSlug(`${slugPrefix}-son`)).toEqual({
      kind: "redirect",
      slug: `${slugPrefix}-yeni`,
    });
  });

  it("does not record redirects for draft slug changes", async () => {
    const { error } = await renamePost(
      clients.editor,
      fixtures.other,
      `${slugPrefix}-diger-yeni`,
    );
    expect(error).toBeNull();

    const { data } = await service
      .from("post_slug_redirects")
      .select("old_slug")
      .eq("post_id", fixtures.other);
    expect(data).toEqual([]);
  });

  it("denies unpublishing to authors and readers", async () => {
    const { revision } = await currentPost(fixtures.draft);

    for (const key of ["reader", "author"] as const) {
      const { error } = await clients[key].rpc("unpublish_post", {
        p_post_id: fixtures.draft,
        p_expected_revision: revision,
      });
      expect(error?.code).toBe("42501");
    }

    expect((await currentPost(fixtures.draft)).status).toBe("published");
  });

  it("unpublishes back to draft and hides the post and its redirects", async () => {
    const before = await currentPost(fixtures.draft);
    const stale = await clients.admin.rpc("unpublish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: before.revision - 1,
    });
    expect(stale.error?.code).toBe("40001");

    const { error } = await clients.admin.rpc("unpublish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: before.revision,
    });
    expect(error).toBeNull();

    const after = await currentPost(fixtures.draft);
    expect(after.status).toBe("draft");
    expect(after.published_at).toBeNull();
    expect(after.revision).toBe(before.revision + 1);

    expect(await resolvePublicSlug(`${slugPrefix}-yeni`)).toEqual({ kind: "missing" });
    expect(await resolvePublicSlug(`${slugPrefix}-son`)).toEqual({ kind: "missing" });

    const redirects = await anonymousClient()
      .from("post_slug_redirects")
      .select("old_slug")
      .like("old_slug", `${slugPrefix}%`);
    expect(redirects.data).toEqual([]);

    const again = await clients.admin.rpc("unpublish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: after.revision,
    });
    expect(again.error?.code).toBe("55000");
  });

  it("lets an admin republish with a new publication time", async () => {
    const before = await currentPost(fixtures.draft);
    const { error } = await clients.admin.rpc("publish_post", {
      p_post_id: fixtures.draft,
      p_expected_revision: before.revision,
    });
    expect(error).toBeNull();

    const after = await currentPost(fixtures.draft);
    expect(after.status).toBe("published");
    expect(await resolvePublicSlug(`${slugPrefix}-son`)).toEqual({
      kind: "redirect",
      slug: `${slugPrefix}-yeni`,
    });
  });

  it("keeps direct publication writes closed to clients", async () => {
    const update = await clients.editor
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", fixtures.other)
      .select("id");
    const redirect = await clients.editor
      .from("post_slug_redirects")
      .insert({ old_slug: `${slugPrefix}-sahte`, post_id: fixtures.other });

    expect(update.error).not.toBeNull();
    expect(redirect.error).not.toBeNull();
    expect((await currentPost(fixtures.other)).status).toBe("draft");
  });
});
