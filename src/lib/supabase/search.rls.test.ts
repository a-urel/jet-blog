import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase 19: full-text search over published posts. Visibility by role (drafts
// are never found, not even by their own author), language-specific stemming
// and accent folding, injection-like input, paging, and the search rate limit.

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
const slugPrefix = `search-${runId}`;
const supabaseUrl = url!;
const supabasePublishableKey = publishableKey!;
const supabaseSecretKey = secretKey!;

// Letters only (hex digits mapped to g-p), so every configuration keeps the
// marker as one lexeme.
const marker = `zq${runId.replace(/[0-9]/g, (digit) => "ghijklmnop"[Number(digit)])}`;
// Appears only in the draft (title, excerpt, and body).
const draftTerm = `gizli${marker}`;
// Shared by the draft and one published post.
const sharedTerm = `ortak${marker}`;

const emails = {
  admin: `rls-search-admin-${runId}@example.com`,
  editor: `rls-search-editor-${runId}@example.com`,
  author: `rls-search-author-${runId}@example.com`,
  reader: `rls-search-reader-${runId}@example.com`,
} as const;

type UserKey = keyof typeof emails;
type Role = "anon" | UserKey;

const service = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const userIds = {} as Record<UserKey, string>;
const clients = {} as Record<UserKey, SupabaseClient>;

const fixtures = {
  category: "",
  author: "",
  turkish: "",
  english: "",
  german: "",
  markup: "",
  draft: "",
};

const rateLimitHashes: string[] = [];

type SearchRow = {
  post_id: string;
  search_rank: number;
  title_highlight: string;
  snippet: string;
  total_count: number;
};

function anonymousClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function clientFor(role: Role): SupabaseClient {
  return role === "anon" ? anonymousClient() : clients[role];
}

function doc(...paragraphs: string[]) {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
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

async function createDraft(
  client: SupabaseClient,
  values: { slug: string; title: string; excerpt: string | null; body: unknown; language: string },
): Promise<string> {
  const { data, error } = await client.rpc("create_draft_post", {
    p_title: values.title,
    p_slug: values.slug,
    p_excerpt: values.excerpt,
    p_category_id: fixtures.category,
    p_tag_ids: [],
    p_credits: [{ author_id: fixtures.author, sort_order: 0 }],
    p_body: values.body,
    p_content_version: 1,
    p_language: values.language,
    p_cover_media_id: null,
    p_cover_alt: null,
  });

  if (error) throw error;
  return (data as { post_id: string }[])[0].post_id;
}

async function publish(postId: string) {
  const { data, error } = await service.from("posts").select("revision").eq("id", postId).single();
  if (error) throw error;

  const { error: publishError } = await clients.editor.rpc("publish_post", {
    p_post_id: postId,
    p_expected_revision: data.revision,
  });

  if (publishError) throw publishError;
}

async function createPublished(values: Parameters<typeof createDraft>[1]): Promise<string> {
  const postId = await createDraft(clients.editor, values);
  await publish(postId);
  return postId;
}

function search(
  client: SupabaseClient,
  query: string,
  options: { language?: string | null; limit?: number; offset?: number } = {},
) {
  return client.rpc("search_published_posts", {
    p_query: query,
    p_language: options.language ?? null,
    p_limit: options.limit ?? 10,
    p_offset: options.offset ?? 0,
  });
}

async function searchIds(client: SupabaseClient, query: string, language: string | null = null) {
  const { data, error } = await search(client, query, { language });
  if (error) throw error;
  return (data as SearchRow[]).map((row) => row.post_id);
}

function plain(value: string) {
  return value.replace(/[\u0002\u0003]/g, "");
}

// Highlighted words; a word matched by both configurations carries nested
// markers, which count once.
function marked(value: string) {
  return [...value.matchAll(/\u0002+([^\u0002\u0003]*)\u0003+/g)].map((match) => match[1]);
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
  ]);

  if (membershipError) throw membershipError;

  for (const key of Object.keys(emails) as UserKey[]) {
    clients[key] = await signInAs(key);
  }

  fixtures.category = await insertOne("categories", {
    name: `Arama Kategori ${runId}`,
    slug: `${slugPrefix}-kategori`,
  });
  fixtures.author = await insertOne("authors", {
    name: `Arama Yazar ${runId}`,
    slug: `${slugPrefix}-yazar`,
    user_id: userIds.author,
  });

  fixtures.turkish = await createPublished({
    slug: `${slugPrefix}-tr`,
    title: `Küçük kitapları okumak ${marker}`,
    excerpt: `Uzun akşamlar için ${sharedTerm} bir özet.`,
    body: doc("IŞIK sönünce sayfalar konuşur.", "Bu paragraf gövdede kalır."),
    language: "tr",
  });
  fixtures.english = await createPublished({
    slug: `${slugPrefix}-en`,
    title: `Notes on writing ${marker}`,
    excerpt: null,
    body: doc("She was running through the libraries every morning."),
    language: "en",
  });
  fixtures.german = await createPublished({
    slug: `${slugPrefix}-de`,
    title: `Über alte Häuser ${marker}`,
    excerpt: "Eine kurze Geschichte der Straße.",
    body: doc("Die Gebäude stehen noch."),
    language: "de",
  });
  fixtures.markup = await createPublished({
    slug: `${slugPrefix}-markup`,
    title: `<img src=x onerror=alert(1)> işaretli ${marker}`,
    excerpt: `<script>alert("x")</script> etiketli \u0002sahte\u0003 ${marker}`,
    body: doc("Düz metin."),
    language: "tr",
  });

  // Written by the author and left unpublished.
  fixtures.draft = await createDraft(clients.author, {
    slug: `${slugPrefix}-taslak`,
    title: `${draftTerm} taslak başlık ${sharedTerm}`,
    excerpt: `${draftTerm} özeti`,
    body: doc(`${draftTerm} gövdesi ve ${sharedTerm}`),
    language: "tr",
  });
});

afterAll(async () => {
  await service.from("posts").delete().like("slug", `${slugPrefix}%`);
  await service.from("categories").delete().eq("id", fixtures.category);
  await service.from("authors").delete().eq("id", fixtures.author);

  if (rateLimitHashes.length > 0) {
    await service.from("auth_rate_limit_events").delete().in("subject_hash", rateLimitHashes);
  }

  for (const id of Object.values(userIds).filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
  }
});

describe("search visibility matrix", () => {
  const roles: Role[] = ["anon", "reader", "author", "editor", "admin"];

  it("lets the author read the draft directly, so the search filter is what hides it", async () => {
    const { data, error } = await clients.author
      .from("posts")
      .select("id")
      .eq("id", fixtures.draft);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  for (const role of roles) {
    it(`never finds a draft term as ${role}`, async () => {
      const { data, error } = await search(clientFor(role), draftTerm);

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it(`finds published posts as ${role}, without draft rows in the total or snippets`, async () => {
      const { data, error } = await search(clientFor(role), sharedTerm);
      const rows = data as SearchRow[];

      expect(error).toBeNull();
      expect(rows.map((row) => row.post_id)).toEqual([fixtures.turkish]);
      expect(Number(rows[0].total_count)).toBe(1);
      expect(rows[0].snippet).not.toContain(draftTerm);
      expect(rows[0].title_highlight).not.toContain(draftTerm);
    });
  }

  it("still hides the draft from the search after an editor views it", async () => {
    const { data } = await clients.editor.from("posts").select("id").eq("id", fixtures.draft);
    expect(data).toHaveLength(1);

    expect(await searchIds(clients.editor, `"${draftTerm} taslak"`)).toEqual([]);
  });

  it("drops a post from results as soon as it is unpublished", async () => {
    const postId = await createPublished({
      slug: `${slugPrefix}-gecici`,
      title: `Geçici ${marker} yayını`,
      excerpt: null,
      body: doc("Kısa süre yayında."),
      language: "tr",
    });

    expect(await searchIds(anonymousClient(), `geçici ${marker}`)).toEqual([postId]);

    const { data } = await service.from("posts").select("revision").eq("id", postId).single();
    const { error } = await clients.editor.rpc("unpublish_post", {
      p_post_id: postId,
      p_expected_revision: data!.revision,
    });
    expect(error).toBeNull();

    expect(await searchIds(anonymousClient(), `geçici ${marker}`)).toEqual([]);
  });
});

describe("language-specific stemming and folding", () => {
  it("matches Turkish inflections through the Turkish stemmer", async () => {
    // "kitap" against "kitapları" needs the Turkish stem.
    expect(await searchIds(anonymousClient(), `kitap ${marker}`)).toEqual([fixtures.turkish]);
  });

  it("matches Turkish text without diacritics in either direction", async () => {
    expect(await searchIds(anonymousClient(), `kucuk ${marker}`)).toEqual([fixtures.turkish]);
    expect(await searchIds(anonymousClient(), `küçük ${marker}`)).toEqual([fixtures.turkish]);
    // Dotted/dotless i: the body says "IŞIK".
    expect(await searchIds(anonymousClient(), `ışık ${marker}`)).toEqual([fixtures.turkish]);
    expect(await searchIds(anonymousClient(), `isik ${marker}`)).toEqual([fixtures.turkish]);
  });

  it("matches English inflections only through the English stemmer", async () => {
    expect(await searchIds(anonymousClient(), `runs library ${marker}`)).toEqual([fixtures.english]);
  });

  it("matches German inflections and folded umlauts", async () => {
    expect(await searchIds(anonymousClient(), `Haus ${marker}`)).toEqual([fixtures.german]);
    expect(await searchIds(anonymousClient(), `uber hauser ${marker}`)).toEqual([fixtures.german]);
    expect(await searchIds(anonymousClient(), `Strasse ${marker}`)).toEqual([fixtures.german]);
  });

  it("ranks a title match above a body-only match", async () => {
    const titleHit = await createPublished({
      slug: `${slugPrefix}-baslik`,
      title: `Defter ${marker} başlıkta`,
      excerpt: null,
      body: doc("Başka bir şey."),
      language: "tr",
    });
    const bodyHit = await createPublished({
      slug: `${slugPrefix}-govde`,
      title: `Başka bir başlık ${marker}`,
      excerpt: null,
      body: doc("Gövdede bir defter geçer."),
      language: "tr",
    });

    expect(await searchIds(anonymousClient(), `defter ${marker}`)).toEqual([titleHit, bodyHit]);
  });

  it("filters by post language", async () => {
    expect(await searchIds(anonymousClient(), marker, "de")).toEqual([fixtures.german]);
    expect(await searchIds(anonymousClient(), marker, "en")).toEqual([fixtures.english]);
  });

  it("highlights the matched words with control markers", async () => {
    const { data } = await search(anonymousClient(), `kucuk ${marker}`);
    const [row] = data as SearchRow[];

    expect(plain(row.title_highlight)).toBe(`Küçük kitapları okumak ${marker}`);
    expect(marked(row.title_highlight)).toEqual(["Küçük", marker]);
  });

  it("highlights stemmed and accent-folded matches together", async () => {
    // "kitap" matches "kitapları" through the stemmer, "kucuk" matches
    // "Küçük" through folding.
    const { data } = await search(anonymousClient(), `kucuk kitap ${marker}`);
    const [row] = data as SearchRow[];

    expect(marked(row.title_highlight)).toEqual(["Küçük", "kitapları", marker]);
  });

  it("highlights body text in the snippet", async () => {
    const { data } = await search(anonymousClient(), `ışık ${marker}`);
    const [row] = data as SearchRow[];

    expect(marked(row.snippet)).toContain("IŞIK");
  });
});

describe("injection-like input", () => {
  const inputs = [
    "'); drop table public.posts; --",
    "' or 1=1 --",
    "<script>alert(1)</script>",
    "a:* | !b & (c",
    '"unterminated phrase',
    "\\ % _ * ( ) ! & | : <->",
    "\u0002sahte\u0003",
    "-",
    "or",
    "   ",
  ];

  for (const input of inputs) {
    it(`treats ${JSON.stringify(input)} as plain search text`, async () => {
      const { data, error } = await search(anonymousClient(), input);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      for (const row of data as SearchRow[]) {
        expect([fixtures.draft]).not.toContain(row.post_id);
      }
    });
  }

  it("keeps the posts table intact", async () => {
    const { count, error } = await service
      .from("posts")
      .select("id", { count: "exact", head: true })
      .like("slug", `${slugPrefix}%`);

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("returns markup in titles and excerpts as text, with only its own markers", async () => {
    const { data, error } = await search(anonymousClient(), `işaretli ${marker}`);
    const rows = data as SearchRow[];

    expect(error).toBeNull();
    expect(rows.map((row) => row.post_id)).toEqual([fixtures.markup]);
    // Markers in the stored text were stripped before highlighting, so every
    // marker pair wraps a real match.
    for (const word of [...marked(rows[0].title_highlight), ...marked(rows[0].snippet)]) {
      expect(word.toLocaleLowerCase("tr")).toMatch(new RegExp(`^(işaretli|${marker})$`));
    }
    expect(marked(rows[0].snippet)).not.toContain("sahte");
  });

  it("refuses queries over 200 characters", async () => {
    const { error } = await search(anonymousClient(), "a".repeat(201));
    expect(error?.code).toBe("22023");

    const { error: okError } = await search(anonymousClient(), "ğ".repeat(200));
    expect(okError).toBeNull();
  });

  it("refuses unsupported languages and out-of-range pages", async () => {
    for (const options of [
      { language: "fr" },
      { limit: 0 },
      { limit: 51 },
      { offset: -1 },
      { offset: 1001 },
    ]) {
      const { error } = await search(anonymousClient(), marker, options);
      expect(error?.code, JSON.stringify(options)).toBe("22023");
    }
  });
});

describe("paging", () => {
  it("pages through matches in a stable order with a constant total", async () => {
    const { data: all } = await search(anonymousClient(), marker, { limit: 50 });
    const allRows = all as SearchRow[];
    expect(allRows.length).toBeGreaterThanOrEqual(5);

    const paged: string[] = [];
    for (let offset = 0; offset < allRows.length; offset += 2) {
      const { data, error } = await search(anonymousClient(), marker, { limit: 2, offset });
      expect(error).toBeNull();
      for (const row of data as SearchRow[]) {
        expect(Number(row.total_count)).toBe(allRows.length);
        paged.push(row.post_id);
      }
    }

    expect(paged).toEqual(allRows.map((row) => row.post_id));
  });

  it("returns an empty page past the end", async () => {
    const { data, error } = await search(anonymousClient(), marker, { offset: 1000 });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("search rate limit", () => {
  function ipHash(label: string) {
    const hash = createHash("sha256").update(`ip:${label}-${runId}`).digest("hex");
    rateLimitHashes.push(hash);
    return hash;
  }

  it("is not callable by clients", async () => {
    for (const role of ["anon", "reader", "author", "editor", "admin"] as Role[]) {
      const { error } = await clientFor(role).rpc("consume_auth_rate_limit", {
        p_action: "search.query",
        p_email_hash: null,
        p_ip_hash: ipHash(`client-${role}`),
      });

      expect(error, role).not.toBeNull();
    }
  });

  it("allows 30 searches per IP per minute and refuses the 31st with PT429", async () => {
    const hash = ipHash("burst");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const { error } = await service.rpc("consume_auth_rate_limit", {
        p_action: "search.query",
        p_email_hash: null,
        p_ip_hash: hash,
      });
      expect(error, `attempt ${attempt + 1}`).toBeNull();
    }

    const { error } = await service.rpc("consume_auth_rate_limit", {
      p_action: "search.query",
      p_email_hash: null,
      p_ip_hash: hash,
    });
    expect(error?.code).toBe("PT429");

    // Another address keeps its own budget.
    const { error: otherError } = await service.rpc("consume_auth_rate_limit", {
      p_action: "search.query",
      p_email_hash: null,
      p_ip_hash: ipHash("other"),
    });
    expect(otherError).toBeNull();
  });

  it("refuses an email subject for searches", async () => {
    const { error } = await service.rpc("consume_auth_rate_limit", {
      p_action: "search.query",
      p_email_hash: ipHash("email-subject"),
      p_ip_hash: ipHash("email-ip"),
    });

    expect(error?.code).toBe("22023");
  });
});
