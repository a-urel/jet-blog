import { describe, expect, it } from "vitest";

import { publishedPost } from "./fixtures";
import { buildArchiveMetadata, buildPostMetadata, noIndexMetadata } from "./metadata";

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

  it("omits the description when there is no excerpt", () => {
    expect(buildPostMetadata({ ...publishedPost, excerpt: null }, "S").description).toBeUndefined();
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
