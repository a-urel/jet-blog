import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { coverMediaId, mediaOrigin, postWithCover, publishedPost } from "./fixtures";
import {
  buildArchiveMetadata,
  buildPostMetadata,
  canonicalAlternates,
  noIndexMetadata,
} from "./metadata";

describe("buildPostMetadata", () => {
  const metadata = buildPostMetadata(publishedPost, "Örnek Site");

  it("matches the post", () => {
    expect(metadata.title).toBe(publishedPost.title);
    expect(metadata.description).toBe(publishedPost.excerpt);
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      title: publishedPost.title,
      description: publishedPost.excerpt,
      siteName: "Örnek Site",
      locale: "tr_TR",
      publishedTime: publishedPost.publishedAt,
      modifiedTime: publishedPost.updatedAt,
      authors: ["Birinci Yazar", "İkinci Yazar"],
      section: "Yazılım",
      tags: ["Başlangıç", "Şema"],
    });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: publishedPost.title });
  });

  it("uses the category-independent post URL as canonical", () => {
    expect(metadata.alternates?.canonical).toBe("/posts/ornek-yazi");
    expect(metadata.openGraph?.url).toBe("/posts/ornek-yazi");
    expect(JSON.stringify(metadata)).not.toMatch(/\/(categories|tags|authors)\//);
  });

  it("uses the post language for the Open Graph locale", () => {
    expect(buildPostMetadata({ ...publishedPost, language: "en" }, "S").openGraph).toMatchObject({
      locale: "en_US",
    });
  });

  it("keeps a text-only card without a cover", () => {
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
  });

  it("omits the description when there is no excerpt", () => {
    expect(buildPostMetadata({ ...publishedPost, excerpt: null }, "S").description).toBeUndefined();
  });
});

describe("buildPostMetadata with a cover", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `${mediaOrigin}/`);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const coverUrl = `${mediaOrigin}/storage/v1/object/public/media/${coverMediaId}`;

  it("adds an absolute Open Graph image with the cover alt text", () => {
    const metadata = buildPostMetadata(postWithCover, "S");

    expect(metadata.openGraph).toMatchObject({
      images: [{ url: coverUrl, alt: "Sisli bir vadi" }],
    });
  });

  it("switches Twitter to a large image card", () => {
    expect(buildPostMetadata(postWithCover, "S").twitter).toMatchObject({
      card: "summary_large_image",
      images: [{ url: coverUrl, alt: "Sisli bir vadi" }],
    });
  });

  it("falls back to a text-only card without a media origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const metadata = buildPostMetadata(postWithCover, "S");

    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});

describe("buildArchiveMetadata", () => {
  it("canonicalizes the archive path", () => {
    const metadata = buildArchiveMetadata({
      title: "Yazılım kategorisi",
      description: "Açıklama",
      path: "/categories/yazilim",
      siteName: "S",
    });

    expect(metadata.alternates?.canonical).toBe("/categories/yazilim");
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/categories/yazilim" });
  });

  it("keeps page 1 at the archive path", () => {
    const metadata = buildArchiveMetadata({
      title: "Şema etiketi",
      description: "Açıklama",
      path: "/tags/sema",
      siteName: "S",
      page: 1,
    });

    expect(metadata.title).toBe("Şema etiketi");
    expect(metadata.alternates?.canonical).toBe("/tags/sema");
  });

  it("gives a later page its own canonical URL and title", () => {
    const metadata = buildArchiveMetadata({
      title: "Şema etiketi",
      description: "Açıklama",
      path: "/tags/sema",
      siteName: "S",
      page: 3,
    });

    expect(metadata.title).toBe("Şema etiketi — Sayfa 3");
    expect(metadata.alternates?.canonical).toBe("/tags/sema/page/3");
    expect(metadata.openGraph).toMatchObject({
      url: "/tags/sema/page/3",
      title: "Şema etiketi — Sayfa 3",
    });
  });

  it("nests the home listing's later pages under /page", () => {
    const metadata = buildArchiveMetadata({
      title: "Son yazılar",
      description: "Açıklama",
      path: "/",
      siteName: "S",
      page: 2,
    });

    expect(metadata.alternates?.canonical).toBe("/page/2");
  });
});

describe("noIndexMetadata", () => {
  it("keeps missing content out of indexes", () => {
    expect(noIndexMetadata.robots).toEqual({ index: false, follow: false });
  });
});

// Metadata merges shallowly: a page's alternates replace the root layout's, so
// each canonical URL repeats the feed discovery link.
describe("canonicalAlternates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("repeats the feed link next to the canonical URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_SITE_NAME", "Örnek Site");

    expect(canonicalAlternates("/tags/sema")).toEqual({
      canonical: "/tags/sema",
      types: { "application/atom+xml": [{ url: "/feed.xml", title: "Örnek Site" }] },
    });
    expect(buildPostMetadata(publishedPost, "Örnek Site").alternates?.types).toEqual({
      "application/atom+xml": [{ url: "/feed.xml", title: "Örnek Site" }],
    });
  });

  it("has no feed link without a site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(canonicalAlternates("/")).toEqual({ canonical: "/" });
  });
});
