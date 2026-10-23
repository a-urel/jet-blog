import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  fixtureMediaIds,
  invalidBodyFixtures,
  validBodyFixtures,
} from "@/features/posts/content/fixtures";

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
const slugPrefix = `body-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const emails = {
  editor: `rls-body-editor-${runId}@example.com`,
  author: `rls-body-author-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const fixtures = { draft: "", published: "", revision: 1 };

const formattedBody = validBodyFixtures[1].doc;

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

function updatePayload(body: unknown, contentVersion = 1) {
  return {
    p_post_id: fixtures.draft,
    p_expected_revision: fixtures.revision,
    p_title: `Gövde Taslağı ${runId}`,
    p_slug: `${slugPrefix}-draft`,
    p_excerpt: null,
    p_category_id: null,
    p_tag_ids: [],
    p_credits: [],
    p_body: body,
    p_content_version: contentVersion,
  };
}

async function storedDraft() {
  const { data, error } = await service
    .from("posts")
    .select("body, content_version, revision")
    .eq("id", fixtures.draft)
    .single();

  if (error) throw error;

  return data;
}

beforeAll(async () => {
  // Image fixtures reference media rows; the authoring RPCs require them. The
  // rows need no Storage object for body validation.
  const { error: mediaError } = await service.from("media").upsert(
    fixtureMediaIds.map((id) => ({
      id,
      object_path: id,
      mime_type: "image/png",
      size_bytes: 1,
      width: 1,
      height: 1,
    })),
  );

  if (mediaError) throw mediaError;

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
      { profile_id: userIds.editor, role: "editor" },
      { profile_id: userIds.author, role: "author" },
    ]);

  if (membershipError) throw membershipError;

  const author = await signInAs("author");
  const { data, error } = await author.rpc("create_draft_post", {
    p_title: `Gövde Taslağı ${runId}`,
    p_slug: `${slugPrefix}-draft`,
    p_excerpt: null,
    p_category_id: null,
    p_tag_ids: [],
    p_credits: [],
    p_body: formattedBody,
    p_content_version: 1,
  });

  if (error) throw error;
  fixtures.draft = (data as { post_id: string }[])[0].post_id;

  const category = await service
    .from("categories")
    .insert({ name: `Gövde Kategori ${runId}`, slug: `${slugPrefix}-kategori` })
    .select("id")
    .single();

  if (category.error) throw category.error;

  const published = await service
    .from("posts")
    .insert({
      title: `Yayındaki gövde ${runId}`,
      slug: `${slugPrefix}-published`,
      category_id: category.data.id,
      status: "published",
      published_at: new Date().toISOString(),
      body: formattedBody,
    })
    .select("id")
    .single();

  if (published.error) throw published.error;
  fixtures.published = published.data.id;
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}-%`);
  await service.from("categories").delete().like("slug", `${slugPrefix}-%`);
  await service.from("media").delete().in("id", [...fixtureMediaIds]);

  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("post body storage", () => {
  it("stores the created body with content version 1", async () => {
    const stored = await storedDraft();

    expect(stored.body).toEqual(formattedBody);
    expect(stored.content_version).toBe(1);
  });

  it.each(invalidBodyFixtures)(
    "rejects $name without changing the stored body",
    async ({ doc }) => {
      const author = await signInAs("author");
      const { error } = await author.rpc(
        "update_post_metadata",
        updatePayload(doc),
      );

      expect(error?.code).toBe("22023");

      const stored = await storedDraft();
      expect(stored.body).toEqual(formattedBody);
      expect(stored.revision).toBe(fixtures.revision);
    },
  );

  it("rejects an unsupported content version", async () => {
    const author = await signInAs("author");
    const { error } = await author.rpc(
      "update_post_metadata",
      updatePayload(formattedBody, 2),
    );

    expect(error?.code).toBe("22023");
    expect(error?.message).toContain("Unsupported content version");
  });

  it("rejects an invalid body when creating a draft", async () => {
    const author = await signInAs("author");
    const { error } = await author.rpc("create_draft_post", {
      p_title: `Geçersiz gövde ${runId}`,
      p_slug: `${slugPrefix}-invalid-create`,
      p_excerpt: null,
      p_category_id: null,
      p_tag_ids: [],
      p_credits: [],
      p_body: { type: "doc", content: [{ type: "script" }] },
      p_content_version: 1,
    });

    expect(error?.code).toBe("22023");
  });

  it.each(validBodyFixtures)("accepts $name", async ({ doc }) => {
    const author = await signInAs("author");
    const { data, error } = await author.rpc(
      "update_post_metadata",
      updatePayload(doc),
    );

    expect(error).toBeNull();
    fixtures.revision = (data as { revision: number }[])[0].revision;

    const stored = await storedDraft();
    expect(stored.body).toEqual(doc);
  });

  it("enforces the allowlist on direct service-role writes", async () => {
    const { error } = await service
      .from("posts")
      .update({
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "x",
                  marks: [{ type: "link", attrs: { href: "javascript:x" } }],
                },
              ],
            },
          ],
        },
      })
      .eq("id", fixtures.draft);

    expect(error?.code).toBe("23514");
  });

  it("rejects a youtube URL in a direct service-role write", async () => {
    const { error } = await service
      .from("posts")
      .update({
        body: {
          type: "doc",
          content: [
            {
              type: "youtube",
              attrs: {
                videoId: "https://evil.example/embed/dQw4w9WgXcQ",
                title: "x",
              },
            },
          ],
        },
      })
      .eq("id", fixtures.draft);

    expect(error?.code).toBe("23514");
  });

  it("keeps a draft body hidden from anonymous readers", async () => {
    const anon = anonymousClient();
    const { data, error } = await anon
      .from("posts")
      .select("body")
      .eq("id", fixtures.draft);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("returns a published body to anonymous readers", async () => {
    const anon = anonymousClient();
    const { data, error } = await anon
      .from("posts")
      .select("body, content_version")
      .eq("id", fixtures.published)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ body: formattedBody, content_version: 1 });
  });

  it("does not let clients call the validation helpers", async () => {
    const editor = await signInAs("editor");
    const { error } = await editor.rpc("post_body_error", {
      p_body: formattedBody,
    });

    expect(error).not.toBeNull();
  });
});
