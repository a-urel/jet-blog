import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 27 site settings: everyone reads the public columns, nobody writes
// directly, only active admins write through update_site_settings() with an
// atomic revision check, the table constraints bound every field, media
// references are validated, and referenced media cannot be deleted.

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
  admin: `rls-site-admin-${runId}@example.com`,
  second: `rls-site-second-${runId}@example.com`,
  editor: `rls-site-editor-${runId}@example.com`,
  author: `rls-site-author-${runId}@example.com`,
  retired: `rls-site-retired-${runId}@example.com`,
  reader: `rls-site-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;
const mediaIds = {
  square: crypto.randomUUID(),
  wide: crypto.randomUUID(),
  tiny: crypto.randomUUID(),
};

const publicColumns =
  "revision, site_name, tagline, meta_description, logo_light_media_id, logo_dark_media_id, icon_media_id, og_image_media_id, accent_color, social_links, footer_text, default_locale, enabled_locales, search_indexing";

// The row as the seed (or an earlier run) left it, restored afterwards.
let original: Record<string, unknown> | null = null;

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

type Row = {
  revision: number;
  site_name: string;
  accent_color: string | null;
  enabled_locales: string[];
  default_locale: string;
  icon_media_id: string | null;
};

async function currentRow(): Promise<Row | null> {
  const { data, error } = await service.from("site_settings").select(publicColumns).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function currentRevision(): Promise<number> {
  return (await currentRow())?.revision ?? 0;
}

type Params = {
  p_expected_revision: number;
  p_site_name: string;
  p_tagline: string | null;
  p_meta_description: string | null;
  p_logo_light_media_id: string | null;
  p_logo_dark_media_id: string | null;
  p_icon_media_id: string | null;
  p_og_image_media_id: string | null;
  p_accent_color: string | null;
  p_social_links: Record<string, unknown>;
  p_footer_text: string | null;
  p_default_locale: string;
  p_enabled_locales: string[];
  p_search_indexing: boolean;
};

function params(revision: number, overrides: Partial<Params> = {}): Params {
  return {
    p_expected_revision: revision,
    p_site_name: `Test sitesi ${runId}`,
    p_tagline: "Sentetik slogan",
    p_meta_description: null,
    p_logo_light_media_id: null,
    p_logo_dark_media_id: null,
    p_icon_media_id: null,
    p_og_image_media_id: null,
    p_accent_color: "#1d4ed8",
    p_social_links: { github: "https://github.com/ornek" },
    p_footer_text: null,
    p_default_locale: "tr",
    p_enabled_locales: ["tr", "en", "de"],
    p_search_indexing: true,
    ...overrides,
  };
}

function update(client: SupabaseClient, values: Params) {
  return client.rpc("update_site_settings", values);
}

beforeAll(async () => {
  const { data: snapshot, error: snapshotError } = await service
    .from("site_settings")
    .select("*")
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  original = snapshot;

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
    { profile_id: userIds.second, role: "admin" },
    { profile_id: userIds.editor, role: "editor" },
    { profile_id: userIds.author, role: "author" },
    { profile_id: userIds.retired, role: "admin", deactivated_at: new Date().toISOString() },
  ]);
  if (error) throw error;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  const media = (id: string, width: number, height: number) => ({
    id,
    object_path: id,
    uploaded_by: userIds.admin,
    mime_type: "image/png",
    size_bytes: 100,
    width,
    height,
  });
  const { error: mediaError } = await service
    .from("media")
    .insert([
      media(mediaIds.square, 256, 256),
      media(mediaIds.wide, 1200, 630),
      media(mediaIds.tiny, 32, 32),
    ]);
  if (mediaError) throw mediaError;
});

afterAll(async () => {
  // Restore the settings row exactly (or remove the one the tests created).
  await service.from("site_settings").delete().eq("id", true);
  if (original) {
    const { error } = await service.from("site_settings").insert(original);
    if (error) throw error;
  }

  await service.from("media").delete().in("id", Object.values(mediaIds));
  await service.from("editorial_audit_log").delete().in("actor_profile_id", Object.values(userIds));
  for (const id of Object.values(userIds)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("site settings reads", () => {
  it("lets every role read the public columns", async () => {
    for (const client of [
      anonymousClient(),
      clients.reader,
      clients.author,
      clients.editor,
      clients.admin,
    ]) {
      const { data, error } = await client.from("site_settings").select(publicColumns);
      expect(error).toBeNull();
      expect(data).toHaveLength(original ? 1 : 0);
    }
  });

  it("keeps the editing admin's profile id private", async () => {
    for (const client of [anonymousClient(), clients.reader, clients.admin]) {
      const { error } = await client.from("site_settings").select("updated_by");
      expect(error?.code).toBe("42501");
    }
  });
});

describe("site settings writes", () => {
  it("closes direct writes for every role, admins included", async () => {
    const before = await currentRow();

    for (const client of [anonymousClient(), clients.reader, clients.editor, clients.admin]) {
      const { error: insertError } = await client
        .from("site_settings")
        .insert({ id: true, site_name: "Ele geçirilmiş" });
      expect(insertError).not.toBeNull();

      const { data: updated } = await client
        .from("site_settings")
        .update({ site_name: "Ele geçirilmiş" })
        .eq("id", true)
        .select("revision");
      expect(updated ?? []).toHaveLength(0);

      const { data: deleted } = await client
        .from("site_settings")
        .delete()
        .eq("id", true)
        .select("revision");
      expect(deleted ?? []).toHaveLength(0);
    }

    expect(await currentRow()).toEqual(before);
  });

  it("refuses the RPC for anonymous, reader, author, editor, and deactivated admin callers", async () => {
    const revision = await currentRevision();

    for (const client of [
      anonymousClient(),
      clients.reader,
      clients.author,
      clients.editor,
      clients.retired,
    ]) {
      const { error } = await update(client, params(revision, { p_site_name: "Ele geçirilmiş" }));
      expect(error?.code).toBe("42501");
    }

    expect((await currentRow())?.site_name).not.toBe("Ele geçirilmiş");
  });

  it("lets an admin save, bumps the revision, and records an audit entry", async () => {
    const revision = await currentRevision();
    const { data, error } = await update(clients.admin, params(revision));
    expect(error).toBeNull();
    expect(data).toEqual([{ revision: revision + 1, updated_at: expect.any(String) }]);

    expect(await currentRow()).toMatchObject({
      revision: revision + 1,
      site_name: `Test sitesi ${runId}`,
      accent_color: "#1d4ed8",
    });

    const { data: audit } = await service
      .from("editorial_audit_log")
      .select("action, details")
      .eq("actor_profile_id", userIds.admin)
      .eq("action", "site_settings.updated");
    expect(audit?.length).toBeGreaterThan(0);
  });
});

describe("site settings stale-update protection", () => {
  it("rejects a save based on an older revision and keeps the newer one", async () => {
    const loaded = await currentRevision();
    const first = await update(clients.admin, params(loaded, { p_site_name: `İlk ${runId}` }));
    expect(first.error).toBeNull();

    const stale = await update(clients.second, params(loaded, { p_site_name: `Eski ${runId}` }));
    expect(stale.error?.code).toBe("40001");
    expect(await currentRow()).toMatchObject({ revision: loaded + 1, site_name: `İlk ${runId}` });
  });

  it("lets exactly one of two concurrent saves of the same revision win", async () => {
    const loaded = await currentRevision();
    const results = await Promise.all([
      update(clients.admin, params(loaded, { p_site_name: `A ${runId}` })),
      update(clients.second, params(loaded, { p_site_name: `B ${runId}` })),
    ]);

    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === "40001")).toHaveLength(1);
    expect((await currentRow())?.revision).toBe(loaded + 1);
  });

  it("creates the row only from revision 0", async () => {
    await service.from("site_settings").delete().eq("id", true);

    const wrong = await update(clients.admin, params(1));
    expect(wrong.error?.code).toBe("40001");
    expect(await currentRow()).toBeNull();

    const created = await update(clients.admin, params(0, { p_site_name: `Yeni ${runId}` }));
    expect(created.error).toBeNull();
    expect(await currentRow()).toMatchObject({ revision: 1, site_name: `Yeni ${runId}` });

    const repeated = await update(clients.second, params(0));
    expect(repeated.error?.code).toBe("40001");
  });
});

describe("site settings constraints", () => {
  it("rejects invalid colors, links, text, and locale sets", async () => {
    const revision = await currentRevision();
    const invalid: Partial<Params>[] = [
      { p_accent_color: "#ABCDEF" },
      { p_accent_color: "blue" },
      { p_accent_color: "#12345;}" },
      { p_social_links: { github: "http://github.com/ornek" } },
      { p_social_links: { github: "javascript:alert(1)" } },
      { p_social_links: { myspace: "https://myspace.com/ornek" } },
      { p_social_links: { github: 42 } },
      { p_social_links: [] as unknown as Record<string, unknown> },
      { p_site_name: "" },
      { p_site_name: " boşluklu " },
      { p_site_name: "a".repeat(81) },
      { p_tagline: "" },
      { p_footer_text: "a".repeat(501) },
      { p_enabled_locales: [] },
      { p_enabled_locales: ["tr", "tr"] },
      { p_enabled_locales: ["tr", "fr"] },
      { p_enabled_locales: ["en"], p_default_locale: "tr" },
      { p_default_locale: "fr" },
    ];

    for (const overrides of invalid) {
      const { error } = await update(clients.admin, params(revision, overrides));
      expect(error?.code, JSON.stringify(overrides)).toBe("23514");
    }

    expect(await currentRevision()).toBe(revision);
  });

  it("validates the media references", async () => {
    const revision = await currentRevision();

    const missing = await update(clients.second, params(revision, { p_logo_light_media_id: crypto.randomUUID() }));
    expect(missing.error).toMatchObject({ code: "P0002", details: "logoLight" });

    const wideIcon = await update(clients.second, params(revision, { p_icon_media_id: mediaIds.wide }));
    expect(wideIcon.error).toMatchObject({ code: "22023", details: "icon" });

    const tinyIcon = await update(clients.second, params(revision, { p_icon_media_id: mediaIds.tiny }));
    expect(tinyIcon.error).toMatchObject({ code: "22023", details: "icon" });

    const tinySocial = await update(clients.second, params(revision, { p_og_image_media_id: mediaIds.tiny }));
    expect(tinySocial.error).toMatchObject({ code: "22023", details: "ogImage" });

    const valid = await update(
      clients.second,
      params(revision, {
        p_logo_light_media_id: mediaIds.wide,
        p_logo_dark_media_id: mediaIds.wide,
        p_icon_media_id: mediaIds.square,
        p_og_image_media_id: mediaIds.wide,
      }),
    );
    expect(valid.error).toBeNull();
    expect((await currentRow())?.icon_media_id).toBe(mediaIds.square);
  });

  it("keeps referenced media from being deleted", async () => {
    for (const id of [mediaIds.square, mediaIds.wide]) {
      const { error } = await clients.editor.rpc("delete_media", { p_media_id: id });
      expect(error?.code).toBe("23503");
    }

    const { count } = await service
      .from("media")
      .select("id", { count: "exact", head: true })
      .in("id", [mediaIds.square, mediaIds.wide]);
    expect(count).toBe(2);
  });
});
