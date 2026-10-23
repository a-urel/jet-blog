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
});

describe("noIndexMetadata", () => {
  it("keeps missing content out of indexes", () => {
    expect(noIndexMetadata.robots).toEqual({ index: false, follow: false });
  });
});
