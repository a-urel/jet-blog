import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PostSummary } from "@/features/posts/types";
import { buildAtomFeed, escapeXml, feedAlternateTypes } from "./feed";
import { coverMediaId, mediaOrigin, postWithCover, publishedPost } from "./fixtures";

const atom = "http://www.w3.org/2005/Atom";
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const mediaRss = "http://search.yahoo.com/mrss/";
const siteUrl = new URL("https://example.test");

// Parses strictly: any well-formedness error or warning fails the test.
function parseXml(xml: string): Document {
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(`XML ${level}: ${message}`);
    },
  }).parseFromString(xml, "application/xml");
}

function feedOf(posts: PostSummary[], now?: Date) {
  return buildAtomFeed({ siteUrl, siteName: "Örnek Site", posts, now });
}

function entries(document: Document): Element[] {
  return Array.from(document.getElementsByTagNameNS(atom, "entry"));
}

function child(parent: Element, name: string, namespace = atom): Element | undefined {
  return Array.from(parent.childNodes).find(
    (node): node is Element =>
      node.nodeType === 1 &&
      (node as Element).localName === name &&
      (node as Element).namespaceURI === namespace,
  );
}

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 && (node as Element).localName === name && (node as Element).namespaceURI === atom,
  );
}

const hostileTitle = 'A <b>bold</b> & "quoted" \'title\' ]]> <![CDATA[x]]> </title><entry>';

describe("escapeXml", () => {
  it("escapes markup characters and breaks the CDATA end marker", () => {
    expect(escapeXml(`<a href="x">&'</a> ]]>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt; ]]&gt;",
    );
  });

  it("drops characters XML 1.0 cannot represent and keeps the rest", () => {
    expect(escapeXml("a\u0000b\u0008c\u001Fd￾e\uD800f")).toBe("abcdef");
    expect(escapeXml("tab\tnew\nline\r Şğü 😀")).toBe("tab\tnew\nline\r Şğü 😀");
  });
});

describe("buildAtomFeed", () => {
  const second: PostSummary = {
    ...publishedPost,
    id: "22222222-2222-4222-8222-222222222222",
    slug: "ikinci-yazi",
    title: hostileTitle,
    excerpt: "Özet & <script>alert(1)</script>",
    language: "en",
    publishedAt: "2026-10-22T09:00:00.123456+00:00",
    updatedAt: "2026-10-23T08:00:00+00:00",
    authors: [
      { author: { id: "a3", name: "Z <Yazar> & Co", slug: "z-yazar", avatarId: null }, sortOrder: 0 },
      { author: { id: "a1", name: "Birinci Yazar", slug: "birinci-yazar", avatarId: null }, sortOrder: 1 },
    ],
    category: { ...publishedPost.category, name: "Kategori \"&\" <x>" },
  };

  const xml = feedOf([second, publishedPost]);
  const document = parseXml(xml);
  const [first, last] = entries(document);

  it("is well-formed Atom with absolute feed links", () => {
    const root = document.documentElement!;
    expect(root.localName).toBe("feed");
    expect(root.namespaceURI).toBe(atom);
    expect(root.getAttributeNS(xmlNamespace, "lang")).toBe("tr");
    expect(child(root, "id")?.textContent).toBe("https://example.test/feed.xml");
    expect(child(root, "title")?.textContent).toBe("Örnek Site");

    const links = children(root, "link").map((link) => [
      link.getAttribute("rel"),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["self", "https://example.test/feed.xml"],
      ["alternate", "https://example.test/"],
    ]);
  });

  it("keeps hostile text as text instead of markup", () => {
    expect(entries(document)).toHaveLength(2);
    expect(child(first, "title")?.textContent).toBe(hostileTitle);
    expect(child(first, "summary")?.textContent).toBe(second.excerpt);
    expect(child(first, "summary")?.getAttribute("type")).toBe("text");
    expect(document.getElementsByTagName("script")).toHaveLength(0);
    expect(document.getElementsByTagName("b")).toHaveLength(0);
    expect(xml).not.toContain("]]>");

    const [authorName] = children(first, "author").map((author) => child(author, "name")?.textContent);
    expect(authorName).toBe("Z <Yazar> & Co");
    expect(children(first, "category")[0].getAttribute("label")).toBe('Kategori "&" <x>');
  });

  it("keeps the input order, newest publication first", () => {
    expect(entries(document).map((entry) => child(entry, "id")?.textContent)).toEqual([
      `urn:uuid:${second.id}`,
      `urn:uuid:${publishedPost.id}`,
    ]);
  });

  it("identifies entries by post id, not by slug", () => {
    const renamed = parseXml(feedOf([{ ...publishedPost, slug: "yeni-adres" }]));
    const [entry] = entries(renamed);

    expect(child(entry, "id")?.textContent).toBe(`urn:uuid:${publishedPost.id}`);
    expect(child(entry, "link")?.getAttribute("href")).toBe("https://example.test/posts/yeni-adres");
  });

  it("sets the per-entry language from posts.language", () => {
    expect(first.getAttributeNS(xmlNamespace, "lang")).toBe("en");
    expect(last.getAttributeNS(xmlNamespace, "lang")).toBe("tr");
  });

  it("uses RFC 3339 times and the newest update as the feed time", () => {
    expect(child(first, "published")?.textContent).toBe("2026-10-22T09:00:00.123Z");
    expect(child(first, "updated")?.textContent).toBe("2026-10-23T08:00:00.000Z");
    expect(child(document.documentElement!, "updated")?.textContent).toBe("2026-10-23T08:00:00.000Z");
  });

  it("lists authors in credit order with absolute archive URLs", () => {
    expect(
      children(first, "author").map((author) => [
        child(author, "name")?.textContent,
        child(author, "uri")?.textContent,
      ]),
    ).toEqual([
      ["Z <Yazar> & Co", "https://example.test/authors/z-yazar"],
      ["Birinci Yazar", "https://example.test/authors/birinci-yazar"],
    ]);
  });

  it("lists the category and the tags with their archive schemes", () => {
    expect(
      children(last, "category").map((category) => [
        category.getAttribute("term"),
        category.getAttribute("label"),
        category.getAttribute("scheme"),
      ]),
    ).toEqual([
      ["yazilim", "Yazılım", "https://example.test/categories/"],
      ["baslangic", "Başlangıç", "https://example.test/tags/"],
      ["sema", "Şema", "https://example.test/tags/"],
    ]);
  });

  it("only emits absolute HTTP(S) URLs", () => {
    const urls = Array.from(xml.matchAll(/(?:href|uri|url|scheme)(?:="|>)([^"<]+)/g), (match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^https:\/\/example\.test\//);
  });

  it("omits the summary of a post without an excerpt", () => {
    const [entry] = entries(parseXml(feedOf([{ ...publishedPost, excerpt: null }])));
    expect(child(entry, "summary")).toBeUndefined();
  });

  it("falls back to the generation time for an empty feed", () => {
    const empty = parseXml(feedOf([], new Date("2026-10-24T12:00:00Z")));
    expect(entries(empty)).toHaveLength(0);
    expect(child(empty.documentElement!, "updated")?.textContent).toBe("2026-10-24T12:00:00.000Z");
  });
});

describe("buildAtomFeed cover image", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", mediaOrigin);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the cover as a Media RSS image with its alt text", () => {
    const [entry] = entries(
      parseXml(feedOf([{ ...postWithCover, cover: { mediaId: coverMediaId, alt: "Vadi <&>" } }])),
    );
    const coverUrl = `${mediaOrigin}/storage/v1/object/public/media/${coverMediaId}`;

    expect(child(entry, "thumbnail", mediaRss)?.getAttribute("url")).toBe(coverUrl);
    const content = child(entry, "content", mediaRss);
    expect(content?.getAttribute("url")).toBe(coverUrl);
    expect(content?.getAttribute("medium")).toBe("image");
    expect(child(content!, "description", mediaRss)?.textContent).toBe("Vadi <&>");
  });

  it("drops a cover whose media origin is not HTTP(S)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "javascript:alert(1)//");
    const xml = feedOf([postWithCover]);

    expect(xml).not.toContain("javascript:");
    expect(child(entries(parseXml(xml))[0], "thumbnail", mediaRss)).toBeUndefined();
  });

  it("has no cover elements for a post without a cover", () => {
    const [entry] = entries(parseXml(feedOf([publishedPost])));
    expect(child(entry, "thumbnail", mediaRss)).toBeUndefined();
  });
});

describe("feedAlternateTypes", () => {
  it("links the feed only with a configured site origin", () => {
    expect(feedAlternateTypes(siteUrl, "S")).toEqual({
      "application/atom+xml": [{ url: "/feed.xml", title: "S" }],
    });
    expect(feedAlternateTypes(null, "S")).toBeUndefined();
  });
});
