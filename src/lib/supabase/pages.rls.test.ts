import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { testImages } from "@/features/media/test-images";

// Phase 28: static pages and navigation. Anonymous visitors and readers see
// published pages and the menu items that link them; editors and admins
// manage both through RPCs; authors have no page access. Every write uses a
// revision compare-and-swap, and at most one page per legal kind is
// published.

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
const slugPrefix = `page-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  admin: `rls-page-admin-${runId}@example.com`,
  editor: `rls-page-editor-${runId}@example.com`,
  author: `rls-page-author-${runId}@example.com`,
  reader: `rls-page-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;

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

function doc(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function createPage(
  client: SupabaseClient,
  slug: string,
  kind: string = "other",
) {
  return client.rpc("create_page", {
    p_title: `Sayfa ${slug}`,
    p_slug: slug,
    p_meta_description: null,
    p_kind: kind,
    p_body: doc(`Gövde ${slug}`),
    p_content_version: 1,
  });
}

async function pageRow(id: string) {
  const { data, error } = await service
    .from("pages")
    .select("id, slug, status, revision, kind, updated_at, published_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as {
    id: string;
    slug: string;
    status: string;
    revision: number;
    kind: string;
    updated_at: string;
    published_at: string | null;
  };
}

async function updatePage(
  client: SupabaseClient,
  id: string,
  values: { slug: string; title?: string; kind?: string; revision?: number },
) {
  const current = await pageRow(id);
  return client.rpc("update_page", {
    p_page_id: id,
    p_expected_revision: values.revision ?? current.revision,
    p_title: values.title ?? `Sayfa ${values.slug}`,
    p_slug: values.slug,
    p_meta_description: "Açıklama",
    p_kind: values.kind ?? current.kind,
    p_body: doc(`Güncel ${values.slug}`),
    p_content_version: 1,
  });
}

async function stateRpc(
  client: SupabaseClient,
  rpc: "publish_page" | "unpublish_page" | "delete_page",
  id: string,
  revision?: number,
) {
  return client.rpc(rpc, {
    p_page_id: id,
    p_expected_revision: revision ?? (await pageRow(id)).revision,
  });
}

async function menuRevision(location: "header" | "footer") {
  const { data, error } = await service
    .from("navigation_menus")
    .select("revision")
    .eq("location", location)
    .single();
  if (error) throw error;
  return data.revision as number;
}

const pages = { draft: "", published: "", cookiesA: "", cookiesB: "" };
const footerSnapshot: { label: string | null; url: string | null; page_id: string | null }[] = [];

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
  ]);
  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  const { data: footer } = await service
    .from("navigation_items")
    .select("label, url, page_id")
    .eq("location", "footer")
    .order("sort_order");
  footerSnapshot.push(...((footer ?? []) as typeof footerSnapshot));

  const draft = await createPage(clients.editor, `${slugPrefix}-taslak`);
  if (draft.error) throw draft.error;
  pages.draft = draft.data[0].page_id;

  const published = await createPage(clients.admin, `${slugPrefix}-yayin`);
  if (published.error) throw published.error;
  pages.published = published.data[0].page_id;
  const publish = await stateRpc(clients.admin, "publish_page", pages.published);
  if (publish.error) throw publish.error;
});

const mediaIds: string[] = [];

afterAll(async () => {
  // Restore the footer as it was before the run, then drop the run's pages.
  await service.from("navigation_items").delete().eq("location", "footer");
  if (footerSnapshot.length > 0) {
    await service.from("navigation_items").insert(
      footerSnapshot.map((item, sortOrder) => ({ ...item, location: "footer", sort_order: sortOrder })),
    );
  }
  await service.from("navigation_items").delete().in("page_id", Object.values(pages).filter(Boolean));
  await service.from("pages").delete().like("slug", `${slugPrefix}%`);
  if (mediaIds.length > 0) {
    await service.from("media").delete().in("id", mediaIds);
    await service.storage.from("media").remove(mediaIds);
  }

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("page visibility", () => {
  it("shows published pages to anonymous visitors and readers only", async () => {
    for (const client of [anonymousClient(), clients.reader, clients.author]) {
      const { data, error } = await client
        .from("pages")
        .select("id")
        .in("id", [pages.draft, pages.published]);
      expect(error).toBeNull();
      expect((data ?? []).map((row) => row.id)).toEqual([pages.published]);
    }
  });

  it("shows drafts to editors and admins", async () => {
    for (const client of [clients.editor, clients.admin]) {
      const { data } = await client.from("pages").select("id").in("id", [pages.draft, pages.published]);
      expect((data ?? []).map((row) => row.id).sort()).toEqual([pages.draft, pages.published].sort());
    }
  });

  it("keeps the creator column private", async () => {
    const { error } = await anonymousClient().from("pages").select("created_by").limit(1);
    expect(error?.code).toBe("42501");
  });

  it("rejects direct table writes from every client role", async () => {
    for (const client of [anonymousClient(), clients.reader, clients.author, clients.editor, clients.admin]) {
      const insert = await client.from("pages").insert({ title: "X", slug: `${slugPrefix}-direct` });
      expect(insert.error?.code).toBe("42501");

      await client.from("pages").update({ title: "Hacked" }).eq("id", pages.published);
    }
    expect((await service.from("pages").select("title").eq("id", pages.published).single()).data?.title)
      .not.toBe("Hacked");
  });
});

describe("page management", () => {
  it("refuses page RPCs for anonymous visitors, readers, and authors", async () => {
    const anonymous = await createPage(anonymousClient(), `${slugPrefix}-anon`);
    expect(anonymous.error?.code).toBe("42501");

    for (const key of ["reader", "author"] as const) {
      const created = await createPage(clients[key], `${slugPrefix}-${key}`);
      expect(created.error?.code).toBe("42501");

      const updated = await updatePage(clients[key], pages.published, { slug: `${slugPrefix}-yayin` });
      expect(updated.error?.code).toBe("42501");

      const unpublished = await stateRpc(clients[key], "unpublish_page", pages.published);
      expect(unpublished.error?.code).toBe("42501");
    }

    expect((await pageRow(pages.published)).status).toBe("published");
  });

  it("refuses a stale revision", async () => {
    const current = await pageRow(pages.draft);
    const first = await updatePage(clients.editor, pages.draft, {
      slug: `${slugPrefix}-taslak`,
      title: "İlk kayıt",
      revision: current.revision,
    });
    expect(first.error).toBeNull();

    const stale = await updatePage(clients.admin, pages.draft, {
      slug: `${slugPrefix}-taslak`,
      title: "Eski form",
      revision: current.revision,
    });
    expect(stale.error?.code).toBe("40001");

    const publishStale = await stateRpc(clients.editor, "publish_page", pages.draft, current.revision);
    expect(publishStale.error?.code).toBe("40001");
    expect((await pageRow(pages.draft)).status).toBe("draft");
  });

  it("validates the body with the post allowlist", async () => {
    const result = await clients.editor.rpc("create_page", {
      p_title: "Kötü gövde",
      p_slug: `${slugPrefix}-kotu`,
      p_meta_description: null,
      p_kind: "other",
      p_body: { type: "doc", content: [{ type: "script", text: "alert(1)" }] },
      p_content_version: 1,
    });
    expect(result.error?.code).toBe("22023");
    expect(result.error?.message).toContain("post body");
  });

  it("redirects the old slug of a published page while it stays published", async () => {
    const oldSlug = `${slugPrefix}-yayin`;
    const newSlug = `${slugPrefix}-yeni`;
    const renamed = await updatePage(clients.editor, pages.published, { slug: newSlug });
    expect(renamed.error).toBeNull();

    const anon = anonymousClient();
    const redirect = await anon
      .from("page_slug_redirects")
      .select("page:pages!inner(slug)")
      .eq("old_slug", oldSlug)
      .maybeSingle();
    expect(redirect.error).toBeNull();
    expect(redirect.data?.page).toEqual({ slug: newSlug });

    // A draft's slug change records nothing.
    const draftRename = await updatePage(clients.editor, pages.draft, { slug: `${slugPrefix}-taslak-2` });
    expect(draftRename.error).toBeNull();
    const { data: draftRedirects } = await service
      .from("page_slug_redirects")
      .select("old_slug")
      .eq("page_id", pages.draft);
    expect(draftRedirects).toEqual([]);

    // Another page cannot take a slug that still redirects.
    const taken = await updatePage(clients.editor, pages.draft, { slug: oldSlug });
    expect(taken.error?.code).toBe("23505");

    const unpublished = await stateRpc(clients.editor, "unpublish_page", pages.published);
    expect(unpublished.error).toBeNull();
    const hidden = await anon.from("page_slug_redirects").select("old_slug").eq("old_slug", oldSlug);
    expect(hidden.data).toEqual([]);

    const republished = await stateRpc(clients.editor, "publish_page", pages.published);
    expect(republished.error).toBeNull();
  });

  it("publishes at most one page per legal kind", async () => {
    const a = await createPage(clients.editor, `${slugPrefix}-cerez-a`, "cookies");
    const b = await createPage(clients.editor, `${slugPrefix}-cerez-b`, "cookies");
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    pages.cookiesA = a.data![0].page_id;
    pages.cookiesB = b.data![0].page_id;

    expect((await stateRpc(clients.editor, "publish_page", pages.cookiesA)).error).toBeNull();

    const second = await stateRpc(clients.admin, "publish_page", pages.cookiesB);
    expect(second.error?.code).toBe("23505");
    expect(second.error?.message).toContain("kind");
    expect((await pageRow(pages.cookiesB)).status).toBe("draft");

    // Turning another published page into a cookies page is refused as well.
    const retyped = await updatePage(clients.editor, pages.published, {
      slug: `${slugPrefix}-yeni`,
      kind: "cookies",
    });
    expect(retyped.error?.code).toBe("23505");
    expect(retyped.error?.message).toContain("kind");

    // "other" pages are not limited.
    const { count } = await service
      .from("pages")
      .select("id", { count: "exact", head: true })
      .eq("kind", "other")
      .eq("status", "published");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("deletes drafts only", async () => {
    const live = await stateRpc(clients.editor, "delete_page", pages.cookiesA);
    expect(live.error?.code).toBe("55000");

    const draft = await stateRpc(clients.editor, "delete_page", pages.cookiesB);
    expect(draft.error).toBeNull();
    pages.cookiesB = "";
  });
});

describe("navigation", () => {
  it("lets editors replace a menu and refuses stale or invalid saves", async () => {
    const revision = await menuRevision("footer");
    const saved = await clients.editor.rpc("save_navigation", {
      p_location: "footer",
      p_expected_revision: revision,
      p_items: [
        { page_id: pages.published },
        { page_id: pages.draft, label: "Taslak bağlantısı" },
        { url: "https://example.com/kaynak", label: "Kaynak" },
      ],
    });
    expect(saved.error).toBeNull();
    expect(saved.data?.[0]?.revision).toBe(revision + 1);

    const stale = await clients.admin.rpc("save_navigation", {
      p_location: "footer",
      p_expected_revision: revision,
      p_items: [],
    });
    expect(stale.error?.code).toBe("40001");

    for (const items of [
      [{ url: "javascript:alert(1)", label: "X" }],
      [{ url: "http://example.com", label: "X" }],
      [{ url: "https://example.com" }],
      [{ page_id: "00000000-0000-0000-0000-000000000000" }],
      [{ page_id: pages.published, url: "https://example.com", label: "X" }],
      [{ page_id: pages.published, extra: true }],
    ]) {
      const invalid = await clients.admin.rpc("save_navigation", {
        p_location: "footer",
        p_expected_revision: revision + 1,
        p_items: items,
      });
      expect(invalid.error?.code).toBe("22023");
    }
  });

  it("hides items that link a draft from the public", async () => {
    const anon = await anonymousClient()
      .from("navigation_items")
      .select("label, url, page:pages(slug)")
      .eq("location", "footer")
      .order("sort_order");
    expect(anon.error).toBeNull();
    expect(anon.data).toEqual([
      { label: null, url: null, page: { slug: `${slugPrefix}-yeni` } },
      { label: "Kaynak", url: "https://example.com/kaynak", page: null },
    ]);

    const editor = await clients.editor
      .from("navigation_items")
      .select("id")
      .eq("location", "footer");
    expect(editor.data).toHaveLength(3);
  });

  it("refuses menu writes for readers and authors and direct writes for everyone", async () => {
    const revision = await menuRevision("footer");
    for (const key of ["reader", "author"] as const) {
      const result = await clients[key].rpc("save_navigation", {
        p_location: "footer",
        p_expected_revision: revision,
        p_items: [],
      });
      expect(result.error?.code).toBe("42501");
    }

    const direct = await clients.admin
      .from("navigation_items")
      .insert({ location: "header", sort_order: 49, url: "https://example.com", label: "X" });
    expect(direct.error?.code).toBe("42501");
  });

  it("refuses to delete a draft page that a menu links", async () => {
    const linked = await stateRpc(clients.editor, "delete_page", pages.draft);
    expect(linked.error?.code).toBe("23503");
    expect((await pageRow(pages.draft)).status).toBe("draft");
  });
});

describe("page images", () => {
  it("keeps media that a page body references", async () => {
    const path = crypto.randomUUID();
    const uploaded = await clients.editor.storage
      .from("media")
      .upload(path, testImages.png, { contentType: "image/png", upsert: false });
    expect(uploaded.error).toBeNull();
    mediaIds.push(path);
    const registered = await clients.editor.rpc("register_media", {
      p_media_id: path,
      p_width: 3,
      p_height: 2,
    });
    expect(registered.error).toBeNull();

    const created = await clients.editor.rpc("create_page", {
      p_title: "Görselli sayfa",
      p_slug: `${slugPrefix}-gorsel`,
      p_meta_description: null,
      p_kind: "other",
      p_body: {
        type: "doc",
        content: [{ type: "image", attrs: { mediaId: path, width: 3, height: 2, alt: "Test" } }],
      },
      p_content_version: 1,
    });
    expect(created.error).toBeNull();

    const deleted = await clients.editor.rpc("delete_media", { p_media_id: path });
    expect(deleted.error?.code).toBe("23503");
    expect(deleted.error?.message).toContain("page");

    const still = await service.from("media").select("id").eq("id", path);
    expect(still.data).toHaveLength(1);
  });
});
