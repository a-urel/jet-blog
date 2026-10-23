import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 10: concurrent saves, write rate limits, and the final
// anonymous/reader/author/editor/admin matrix over the content surface.

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
const slugPrefix = `launch-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-launch-admin-${runId}@example.com`,
  editor: `rls-launch-editor-${runId}@example.com`,
  // A second editor owns the publication rate-limit test, so exhausting its
  // budget cannot affect other tests in this file.
  burst: `rls-launch-burst-${runId}@example.com`,
  author: `rls-launch-author-${runId}@example.com`,
  // Author whose create budget is exhausted on purpose.
  prolific: `rls-launch-prolific-${runId}@example.com`,
  reader: `rls-launch-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;
type Role = "anon" | "reader" | "author" | "editor" | "admin";

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;

const fixtures = {
  category: "",
  tag: "",
  author: "",
  // Draft created by the author.
  draft: "",
  // Published post created by the editor.
  published: "",
};

const body = { type: "doc", content: [{ type: "paragraph" }] };

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function clientFor(role: Role): SupabaseClient {
  return role === "anon" ? anonymousClient() : clients[role];
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

function createDraft(client: SupabaseClient, slug: string) {
  return client.rpc("create_draft_post", {
    p_title: `Lansman testi ${slug}`,
    p_slug: slug,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [fixtures.tag],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: body,
    p_content_version: 1,
  });
}

async function createDraftId(client: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await createDraft(client, slug);
  if (error) throw error;
  return (data as { post_id: string }[])[0].post_id;
}

async function currentPost(postId: string) {
  const { data, error } = await service
    .from("posts")
    .select("title, slug, status, revision")
    .eq("id", postId)
    .single();

  if (error) throw error;

  return data as { title: string; slug: string; status: string; revision: number };
}

function saveTitle(
  client: SupabaseClient,
  postId: string,
  slug: string,
  revision: number,
  title: string,
) {
  return client.rpc("update_post_metadata", {
    p_post_id: postId,
    p_expected_revision: revision,
    p_title: title,
    p_slug: slug,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [fixtures.tag],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
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

  const { error: membershipError } = await service.from("editorial_members").insert([
    { profile_id: userIds.admin, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.burst, role: "editor" },
    { profile_id: userIds.author, role: "author" },
    { profile_id: userIds.prolific, role: "author" },
  ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  fixtures.category = await insertOne("categories", {
    name: `Lansman Kategori ${runId}`,
    slug: `${slugPrefix}-kategori`,
  });
  fixtures.tag = await insertOne("tags", {
    name: `Lansman Etiket ${runId}`,
    slug: `${slugPrefix}-etiket`,
  });
  fixtures.author = await insertOne("authors", {
    name: `Lansman Yazar ${runId}`,
    slug: `${slugPrefix}-yazar`,
    user_id: userIds.author,
  });

  fixtures.draft = await createDraftId(clients.author, `${slugPrefix}-taslak`);
  fixtures.published = await createDraftId(clients.editor, `${slugPrefix}-yayinda`);

  const { error: publishError } = await clients.editor.rpc("publish_post", {
    p_post_id: fixtures.published,
    p_expected_revision: (await currentPost(fixtures.published)).revision,
  });

  if (publishError) throw publishError;
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service.from("tags").delete().eq("id", fixtures.tag);
  await service.from("authors").delete().eq("id", fixtures.author);

  // Deleting the users cascades to their rate-limit events.
  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("concurrent saves", () => {
  it("lets exactly one of two saves from the same revision win", async () => {
    const postId = await createDraftId(clients.editor, `${slugPrefix}-eszamanli`);
    const { revision, slug } = await currentPost(postId);

    // Two editors opened the same form and save at the same time.
    const [first, second] = await Promise.all([
      saveTitle(clients.editor, postId, slug, revision, "Editörün başlığı"),
      saveTitle(clients.admin, postId, slug, revision, "Adminin başlığı"),
    ]);

    const results = [first, second];
    const succeeded = results.filter((result) => !result.error);
    const conflicted = results.filter((result) => result.error?.code === "40001");

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);

    const after = await currentPost(postId);
    const winnerTitle = first.error ? "Adminin başlığı" : "Editörün başlığı";

    expect(after.revision).toBe(revision + 1);
    expect(after.title).toBe(winnerTitle);
  });

  it("rejects a stale publish after a concurrent edit", async () => {
    const postId = await createDraftId(clients.editor, `${slugPrefix}-bayat-yayin`);
    const { revision, slug } = await currentPost(postId);

    const saved = await saveTitle(clients.admin, postId, slug, revision, "Önce kaydedildi");
    expect(saved.error).toBeNull();

    const stalePublish = await clients.editor.rpc("publish_post", {
      p_post_id: postId,
      p_expected_revision: revision,
    });

    expect(stalePublish.error?.code).toBe("40001");
    expect((await currentPost(postId)).status).toBe("draft");
  });
});

describe("write rate limits", () => {
  it("denies the 31st publication change within an hour with HTTP 429", async () => {
    const postId = await createDraftId(clients.burst, `${slugPrefix}-sinir-yayin`);

    for (let index = 0; index < 30; index += 1) {
      const { revision } = await currentPost(postId);
      const rpc = index % 2 === 0 ? "publish_post" : "unpublish_post";
      const { error } = await clients.burst.rpc(rpc, {
        p_post_id: postId,
        p_expected_revision: revision,
      });

      expect(error).toBeNull();
    }

    const before = await currentPost(postId);
    const denied = await clients.burst.rpc("publish_post", {
      p_post_id: postId,
      p_expected_revision: before.revision,
    });

    expect(denied.error?.code).toBe("PT429");
    expect(denied.status).toBe(429);
    // The rejected publish rolled back completely.
    expect(await currentPost(postId)).toEqual(before);

    // The limit is per actor: another editor may still publish the post.
    const other = await clients.editor.rpc("publish_post", {
      p_post_id: postId,
      p_expected_revision: before.revision,
    });

    expect(other.error).toBeNull();
    expect((await currentPost(postId)).status).toBe("published");

    // Edits are a separate budget from publication changes.
    const after = await currentPost(postId);
    const edit = await saveTitle(clients.burst, postId, after.slug, after.revision, "Sınır sonrası düzenleme");
    expect(edit.error).toBeNull();
  });

  it("denies the 31st draft created within an hour", async () => {
    for (let index = 0; index < 30; index += 1) {
      const { error } = await createDraft(clients.prolific, `${slugPrefix}-seri-${index}`);
      expect(error).toBeNull();
    }

    const denied = await createDraft(clients.prolific, `${slugPrefix}-seri-fazla`);

    expect(denied.error?.code).toBe("PT429");
    expect(denied.status).toBe(429);

    const { data } = await service
      .from("posts")
      .select("id")
      .eq("slug", `${slugPrefix}-seri-fazla`);

    expect(data).toEqual([]);
  });

  it("does not limit service-role maintenance writes", async () => {
    const { error } = await service
      .from("posts")
      .update({ excerpt: "Bakım güncellemesi" })
      .like("slug", `${slugPrefix}-seri-%`);

    expect(error).toBeNull();
  });
});

describe("final role matrix", () => {
  const roles: Role[] = ["anon", "reader", "author", "editor", "admin"];

  // Rows each role must see. `draft` belongs to the author; `published` is live.
  const visibility: Record<Role, { draft: boolean; published: boolean }> = {
    anon: { draft: false, published: true },
    reader: { draft: false, published: true },
    author: { draft: true, published: true },
    editor: { draft: true, published: true },
    admin: { draft: true, published: true },
  };

  it.each(roles)("%s sees exactly the posts allowed by its role", async (role) => {
    const { data, error } = await clientFor(role)
      .from("posts")
      .select("id")
      .in("id", [fixtures.draft, fixtures.published]);

    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((row) => row.id as string));

    expect(ids.has(fixtures.draft)).toBe(visibility[role].draft);
    expect(ids.has(fixtures.published)).toBe(visibility[role].published);
  });

  it.each(roles)("%s has no direct write access to content tables", async (role) => {
    const client = clientFor(role);

    const insert = await client.from("posts").insert({
      title: "Doğrudan",
      slug: `${slugPrefix}-dogrudan-${role}`,
      status: "published",
    });
    const update = await client
      .from("posts")
      .update({ title: "Doğrudan güncelleme" })
      .eq("id", fixtures.published)
      .select("id");
    const remove = await client
      .from("posts")
      .delete()
      .eq("id", fixtures.published)
      .select("id");
    const category = await client
      .from("categories")
      .insert({ name: `Doğrudan ${role}`, slug: `${slugPrefix}-dogrudan-${role}` });

    expect(insert.error).not.toBeNull();
    expect(category.error).not.toBeNull();
    // Without a grant PostgREST rejects the write; RLS would return no rows.
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    expect(remove.error !== null || (remove.data ?? []).length === 0).toBe(true);
    expect((await currentPost(fixtures.published)).status).toBe("published");
  });

  it.each(roles)("%s cannot read or write rate-limit bookkeeping", async (role) => {
    const client = clientFor(role);
    const read = await client.from("rate_limit_events").select("id").limit(1);
    const write = await client
      .from("rate_limit_events")
      .insert({ actor_id: userIds.author, action: "post.create" });
    const reset = await client.rpc("consume_rate_limit", {
      p_action: "post.create",
      p_max_events: 1000,
      p_window: "1 second",
    });

    expect(read.error).not.toBeNull();
    expect(write.error).not.toBeNull();
    expect(reset.error).not.toBeNull();
  });

  // Which roles may run each content RPC on the author's draft.
  const mayEditDraft: Record<Role, boolean> = {
    anon: false,
    reader: false,
    author: true,
    editor: true,
    admin: true,
  };

  it.each(roles)("%s edits the author's draft only when allowed", async (role) => {
    const before = await currentPost(fixtures.draft);
    const result = await saveTitle(
      clientFor(role),
      fixtures.draft,
      before.slug,
      before.revision,
      `Matris ${role}`,
    );
    const after = await currentPost(fixtures.draft);

    if (mayEditDraft[role]) {
      expect(result.error).toBeNull();
      expect(after.title).toBe(`Matris ${role}`);
    } else {
      expect(result.error).not.toBeNull();
      expect(after).toEqual(before);
    }
  });

  it.each(roles)("%s publishes only as editor or admin", async (role) => {
    const postId = await createDraftId(clients.author, `${slugPrefix}-matris-yayin-${role}`);
    const { revision } = await currentPost(postId);
    const result = await clientFor(role).rpc("publish_post", {
      p_post_id: postId,
      p_expected_revision: revision,
    });
    const after = await currentPost(postId);

    if (role === "editor" || role === "admin") {
      expect(result.error).toBeNull();
      expect(after.status).toBe("published");
    } else {
      expect(result.error).not.toBeNull();
      expect(after.status).toBe("draft");
    }
  });

  it.each(roles)("%s reads editorial membership only as allowed", async (role) => {
    const { data } = await clientFor(role)
      .from("editorial_members")
      .select("profile_id")
      .in("profile_id", [userIds.author, userIds.editor]);
    const ids = new Set((data ?? []).map((row) => row.profile_id as string));

    // Members see their own grant; only admins see everyone's.
    expect(ids.has(userIds.editor)).toBe(role === "editor" || role === "admin");
    expect(ids.has(userIds.author)).toBe(role === "author" || role === "admin");
  });
});
