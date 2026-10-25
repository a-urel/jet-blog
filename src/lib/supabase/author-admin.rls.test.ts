import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Author identity administration: admin-only RPCs, stale-form protection,
// slug redirects that stay hidden until the author is public, deletion blocked
// by credits, account links limited to active editorial members, and the
// rate limit around them.

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
  admin: `rls-auth-admin-${runId}@example.com`,
  // A second admin whose author.write budget is exhausted on purpose.
  burst: `rls-auth-burst-${runId}@example.com`,
  editor: `rls-auth-editor-${runId}@example.com`,
  author: `rls-auth-author-${runId}@example.com`,
  retired: `rls-auth-retired-${runId}@example.com`,
  reader: `rls-auth-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const postIds: string[] = [];
let categoryId = "";

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

async function createAuthor(
  label: string,
  profileId: string | null = null,
  client: SupabaseClient = clients.admin,
) {
  const { data, error } = await client.rpc("create_author", {
    p_name: name(label),
    p_slug: slug(label),
    p_bio: null,
    p_profile_id: profileId,
  });
  if (error) throw error;
  return data as string;
}

type AuthorRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  user_id: string | null;
  updated_at: string;
};

async function author(id: string) {
  const { data, error } = await service
    .from("authors")
    .select("id, name, slug, bio, user_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AuthorRow | null;
}

function updateAuthor(
  client: SupabaseClient,
  current: AuthorRow,
  changes: Partial<AuthorRow>,
) {
  const next = { ...current, ...changes };
  return client.rpc("update_author", {
    p_author_id: current.id,
    p_expected_updated_at: next.updated_at,
    p_name: next.name,
    p_slug: next.slug,
    p_bio: next.bio,
    p_profile_id: next.user_id,
  });
}

async function creditOnPost(
  authorId: string,
  status: "draft" | "published",
  label: string,
) {
  const { data, error } = await service
    .from("posts")
    .insert({
      title: `Yazar ${label} ${runId}`,
      slug: slug(`author-post-${label}`),
      body: { type: "doc", content: [{ type: "paragraph" }] },
      content_version: 1,
      category_id: categoryId,
      ...(status === "published"
        ? { status: "published", published_at: new Date().toISOString() }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  postIds.push(data.id as string);

  const { error: creditError } = await service
    .from("post_authors")
    .insert({ post_id: data.id, author_id: authorId, sort_order: 0 });
  if (creditError) throw creditError;

  // Public reads come from the published snapshot.
  if (status === "published") {
    const { error: syncError } = await service.rpc("sync_published_post", { p_post_id: data.id });
    if (syncError) throw syncError;
  }
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

  const { error } = await service.from("editorial_members").insert([
    { profile_id: userIds.admin, role: "admin" },
    { profile_id: userIds.burst, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.author, role: "author" },
    {
      profile_id: userIds.retired,
      role: "author",
      deactivated_at: new Date().toISOString(),
    },
  ]);
  if (error) throw error;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  const { data: category, error: categoryError } = await service
    .from("categories")
    .insert({ name: name("Yazar kategorisi"), slug: slug("author-category") })
    .select("id")
    .single();
  if (categoryError) throw categoryError;
  categoryId = category.id as string;
});

afterAll(async () => {
  if (postIds.length > 0) {
    await service.from("post_authors").delete().in("post_id", postIds);
    await service.from("posts").delete().in("id", postIds);
  }

  await service.from("authors").delete().like("slug", `%-${runId}`);
  if (categoryId) await service.from("categories").delete().eq("id", categoryId);

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("author RPC authorization", () => {
  it("denies anonymous, reader, author, and editor callers", async () => {
    const target = await createAuthor("authz");
    const current = await author(target);

    for (const client of [
      anonymousClient(),
      clients.reader,
      clients.author,
      clients.editor,
    ]) {
      const calls = [
        client.rpc("create_author", {
          p_name: name("denied"),
          p_slug: slug("denied"),
          p_bio: null,
          p_profile_id: null,
        }),
        updateAuthor(client, current!, { name: name("hijacked") }),
        client.rpc("delete_author", {
          p_author_id: target,
          p_expected_updated_at: current!.updated_at,
        }),
        client.rpc("list_author_account_links"),
      ];

      for (const { error } of await Promise.all(calls)) {
        expect(error?.code).toBe("42501");
      }
    }

    expect(await author(target)).toMatchObject({ name: name("authz") });
  });

  it("keeps direct writes closed, admins included", async () => {
    const target = await createAuthor("direct-target");

    for (const client of [clients.admin, clients.editor, clients.reader]) {
      const { error: insertError } = await client
        .from("authors")
        .insert({ name: name("direct"), slug: slug("direct") });
      expect(insertError).not.toBeNull();

      const { data: updated } = await client
        .from("authors")
        .update({ name: name("direct-rename") })
        .eq("id", target)
        .select("id");
      expect(updated ?? []).toHaveLength(0);

      const { data: deleted } = await client
        .from("authors")
        .delete()
        .eq("id", target)
        .select("id");
      expect(deleted ?? []).toHaveLength(0);

      const { error: redirectError } = await client
        .from("author_slug_redirects")
        .insert({ old_slug: slug("direct-redirect"), author_id: target });
      expect(redirectError).not.toBeNull();
    }

    expect(await author(target)).toMatchObject({ name: name("direct-target") });
  });

  it("never exposes user_id through table reads", async () => {
    await createAuthor("hidden-link", userIds.admin);

    for (const client of [clients.admin, clients.editor]) {
      const { error } = await client.from("authors").select("user_id").limit(1);
      expect(error).not.toBeNull();
    }
  });
});

describe("author administration", () => {
  it("rejects a duplicate slug and a stale form", async () => {
    const target = await createAuthor("dupe");

    const { error: slugError } = await clients.admin.rpc("create_author", {
      p_name: name("Other"),
      p_slug: slug("dupe"),
      p_bio: null,
      p_profile_id: null,
    });
    expect(slugError?.code).toBe("23505");

    const current = await author(target);
    const { error: firstError } = await updateAuthor(clients.admin, current!, {
      bio: "İlk düzenleme.",
    });
    expect(firstError).toBeNull();

    const { error: staleError } = await updateAuthor(clients.admin, current!, {
      bio: "Eski formdan düzenleme.",
    });
    expect(staleError?.code).toBe("40001");
    expect(await author(target)).toMatchObject({ bio: "İlk düzenleme." });
  });

  it("records a redirect that is public only while the author is", async () => {
    const target = await createAuthor("rename-old");
    const current = await author(target);

    const { error } = await updateAuthor(clients.admin, current!, {
      slug: slug("rename-new"),
    });
    expect(error).toBeNull();

    const anon = anonymousClient();
    const hidden = await anon
      .from("author_slug_redirects")
      .select("author_id")
      .eq("old_slug", slug("rename-old"));
    expect(hidden.data ?? []).toHaveLength(0);

    await creditOnPost(target, "published", "rename");

    const visible = await anon
      .from("author_slug_redirects")
      .select("target:authors!inner(slug)")
      .eq("old_slug", slug("rename-old"))
      .maybeSingle();
    expect(visible.data?.target).toMatchObject({ slug: slug("rename-new") });

    // Another author cannot take the redirected slug.
    const { error: takenError } = await clients.admin.rpc("create_author", {
      p_name: name("squatter"),
      p_slug: slug("rename-old"),
      p_bio: null,
      p_profile_id: null,
    });
    expect(takenError?.code).toBe("23505");

    // The author may take its old slug back; the redirect goes away.
    const renamed = await author(target);
    const { error: backError } = await updateAuthor(clients.admin, renamed!, {
      slug: slug("rename-old"),
    });
    expect(backError).toBeNull();

    const { data: redirects } = await service
      .from("author_slug_redirects")
      .select("old_slug")
      .eq("author_id", target);
    expect((redirects ?? []).map((row) => row.old_slug)).toEqual([slug("rename-new")]);
  });

  it("refuses to delete a credited author, even on a draft", async () => {
    const target = await createAuthor("credited");
    await creditOnPost(target, "draft", "credited");
    const current = await author(target);

    const { error } = await clients.admin.rpc("delete_author", {
      p_author_id: target,
      p_expected_updated_at: current!.updated_at,
    });
    expect(error?.code).toBe("23503");
    expect(await author(target)).not.toBeNull();
  });

  it("deletes an uncredited author with its redirects", async () => {
    const target = await createAuthor("unused-old");
    const current = await author(target);
    await updateAuthor(clients.admin, current!, { slug: slug("unused-new") });
    const renamed = await author(target);

    const { error } = await clients.admin.rpc("delete_author", {
      p_author_id: target,
      p_expected_updated_at: renamed!.updated_at,
    });
    expect(error).toBeNull();
    expect(await author(target)).toBeNull();

    const { data: redirects } = await service
      .from("author_slug_redirects")
      .select("old_slug")
      .eq("author_id", target);
    expect(redirects ?? []).toHaveLength(0);

    const { data: audit } = await service
      .from("editorial_audit_log")
      .select("action")
      .eq("actor_profile_id", userIds.admin)
      .eq("action", "author.deleted")
      .contains("details", { author_id: target });
    expect(audit ?? []).toHaveLength(1);
  });
});

describe("author account links", () => {
  it("links only active editorial members", async () => {
    for (const profileId of [userIds.reader, userIds.retired, crypto.randomUUID()]) {
      const { error } = await clients.admin.rpc("create_author", {
        p_name: name("bad-link"),
        p_slug: slug("bad-link"),
        p_bio: null,
        p_profile_id: profileId,
      });
      expect(error?.code).toBe("22023");
    }
  });

  it("allows one author per account and lists links for admins", async () => {
    const linked = await createAuthor("linked", userIds.editor);

    const { error: secondError } = await clients.admin.rpc("create_author", {
      p_name: name("linked-twice"),
      p_slug: slug("linked-twice"),
      p_bio: null,
      p_profile_id: userIds.editor,
    });
    expect(secondError?.code).toBe("23505");

    const { data, error } = await clients.admin.rpc("list_author_account_links");
    expect(error).toBeNull();
    expect(data).toContainEqual({ author_id: linked, profile_id: userIds.editor });
  });

  it("keeps a link after deactivation but refuses a new one", async () => {
    const kept = await createAuthor("kept-link", userIds.burst);
    await service
      .from("editorial_members")
      .update({ deactivated_at: new Date().toISOString() })
      .eq("profile_id", userIds.burst);

    try {
      const current = await author(kept);
      const { error: keepError } = await updateAuthor(clients.admin, current!, {
        name: name("kept-link-renamed"),
      });
      expect(keepError).toBeNull();

      const other = await createAuthor("relink");
      const otherCurrent = await author(other);
      const { error: relinkError } = await updateAuthor(clients.admin, otherCurrent!, {
        user_id: userIds.retired,
      });
      expect(relinkError?.code).toBe("22023");

      const updated = await author(kept);
      const { error: unlinkError } = await updateAuthor(clients.admin, updated!, {
        user_id: null,
      });
      expect(unlinkError).toBeNull();
      expect(await author(kept)).toMatchObject({ user_id: null });
    } finally {
      await service
        .from("editorial_members")
        .update({ deactivated_at: null })
        .eq("profile_id", userIds.burst);
    }
  });

  it("grants the linked account no editorial access", async () => {
    // The reader cannot be linked, and linking an author-role member does not
    // let them edit a published post that credits them.
    const linked = await createAuthor("no-access", userIds.author);
    const postId = await creditOnPost(linked, "published", "no-access");

    const { data } = await clients.author
      .from("posts")
      .update({ title: "Ele geçirildi" })
      .eq("id", postId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });
});

describe("author write limit", () => {
  it("rejects the 61st change in ten minutes", async () => {
    for (let index = 0; index < 60; index += 1) {
      await createAuthor(`burst-${index}`, null, clients.burst);
    }

    const { error } = await clients.burst.rpc("create_author", {
      p_name: name("burst-over"),
      p_slug: slug("burst-over"),
      p_bio: null,
      p_profile_id: null,
    });
    expect(error?.code).toBe("PT429");

    // The limit is per admin.
    await expect(createAuthor("after-burst")).resolves.toBeTruthy();
  });
});
