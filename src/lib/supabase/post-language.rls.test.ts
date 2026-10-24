import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { canonicalizePostLanguage } from "@/features/posts/language";
import {
  canonicalLanguageFixtures,
  canonicalizedLanguageFixtures,
  invalidLanguageFixtures,
} from "@/features/posts/language-fixtures";

// Phase 21: posts in any language. The database grammar
// (public.is_post_language_tag) must agree with the TypeScript one on the
// shared fixtures, and the authoring RPCs and the CHECK constraint must apply
// it for every caller.

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
const slugPrefix = `language-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `rls-language-author-${runId}@example.com`;
let userId = "";
let author: SupabaseClient;
const fixtures = { category: "", author: "", draft: "", revision: 1 };

const emptyBody = { type: "doc", content: [{ type: "paragraph" }] };

async function isTag(value: string): Promise<boolean> {
  const { data, error } = await service.rpc("is_post_language_tag", { p_language: value });
  if (error) throw error;
  return data as boolean;
}

function createDraft(slug: string, language: string) {
  return author.rpc("create_draft_post", {
    p_title: `Dil denemesi ${slug}`,
    p_slug: `${slugPrefix}-${slug}`,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: emptyBody,
    p_content_version: 1,
    p_language: language,
    p_cover_media_id: null,
    p_cover_alt: null,
  });
}

function updateLanguage(language: string) {
  return author.rpc("update_post_metadata", {
    p_post_id: fixtures.draft,
    p_expected_revision: fixtures.revision,
    p_title: "Dil denemesi",
    p_slug: `${slugPrefix}-draft`,
    p_excerpt: null,
    p_category_id: fixtures.category,
    p_tag_ids: [],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: emptyBody,
    p_content_version: 1,
    p_language: language,
    p_cover_media_id: null,
    p_cover_alt: null,
  });
}

beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { error: memberError } = await service
    .from("editorial_members")
    .insert({ profile_id: userId, role: "author" });
  if (memberError) throw memberError;

  author = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await author.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const category = await service
    .from("categories")
    .insert({ name: `Dil Kategori ${runId}`, slug: `${slugPrefix}-kategori` })
    .select("id")
    .single();
  if (category.error) throw category.error;
  fixtures.category = category.data.id;

  const credit = await service
    .from("authors")
    .insert({ name: `Dil Yazar ${runId}`, slug: `${slugPrefix}-yazar`, user_id: userId })
    .select("id")
    .single();
  if (credit.error) throw credit.error;
  fixtures.author = credit.data.id;

  const draft = await createDraft("draft", "fr");
  if (draft.error) throw draft.error;
  const [row] = draft.data as { post_id: string; revision: number }[];
  fixtures.draft = row.post_id;
  fixtures.revision = row.revision;
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service.from("authors").delete().eq("id", fixtures.author);
  if (userId) await service.auth.admin.deleteUser(userId);
});

describe("language tag parity with the TypeScript grammar", () => {
  for (const value of canonicalLanguageFixtures) {
    it(`accepts canonical ${JSON.stringify(value)}`, async () => {
      expect(canonicalizePostLanguage(value)).toBe(value);
      expect(await isTag(value)).toBe(true);
    });
  }

  for (const { input, canonical, databaseAcceptsInput } of canonicalizedLanguageFixtures) {
    it(`stores ${JSON.stringify(input)} as ${canonical}`, async () => {
      expect(canonicalizePostLanguage(input)).toBe(canonical);
      expect(await isTag(canonical)).toBe(true);
      expect(await isTag(input)).toBe(databaseAcceptsInput);
    });
  }

  for (const value of invalidLanguageFixtures) {
    it(`rejects ${JSON.stringify(value)}`, async () => {
      expect(canonicalizePostLanguage(value)).toBeNull();

      if (value.includes("\u0000")) {
        // Postgres text cannot hold NUL, so the value never reaches the check.
        const { error } = await service.rpc("is_post_language_tag", { p_language: value });
        expect(error).not.toBeNull();
      } else {
        expect(await isTag(value)).toBe(false);
      }
    });
  }
});

describe("authoring RPCs", () => {
  it("stores a language outside the former tr/en/de set", async () => {
    const { data, error } = await service
      .from("posts")
      .select("language")
      .eq("id", fixtures.draft)
      .single();

    expect(error).toBeNull();
    expect(data?.language).toBe("fr");
  });

  it("accepts a regional tag on update", async () => {
    const { data, error } = await updateLanguage("pt-BR");

    expect(error).toBeNull();
    fixtures.revision = (data as { revision: number }[])[0].revision;

    const { data: stored } = await service
      .from("posts")
      .select("language")
      .eq("id", fixtures.draft)
      .single();
    expect(stored?.language).toBe("pt-BR");
  });

  for (const value of ["en_US", "pt-br", "xx-", "tr'; drop table public.posts; --", "a".repeat(64)]) {
    it(`refuses ${JSON.stringify(value)} on create and update`, async () => {
      const created = await createDraft(`invalid-${crypto.randomUUID().slice(0, 6)}`, value);
      expect(created.error?.code).toBe("22023");
      expect(created.error?.message).toContain("Invalid language");

      const updated = await updateLanguage(value);
      expect(updated.error?.code).toBe("22023");
    });
  }

  it("keeps the stored language after refused updates", async () => {
    const { data } = await service
      .from("posts")
      .select("language, revision")
      .eq("id", fixtures.draft)
      .single();

    expect(data).toEqual({ language: "pt-BR", revision: fixtures.revision });
  });

  it("enforces the grammar in the CHECK constraint for direct writes", async () => {
    const { error } = await service
      .from("posts")
      .update({ language: "fr_FR" })
      .eq("id", fixtures.draft);

    expect(error?.code).toBe("23514");
  });
});
