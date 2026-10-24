import { describe, expect, it, vi } from "vitest";

import { coverMediaId, mediaOrigin, postWithCover, publishedPost } from "./fixtures";
import { buildArticleJsonLd, serializeJsonLd } from "./json-ld";

const siteUrl = new URL("https://example.test");

describe("buildArticleJsonLd", () => {
  it("matches the post with authors in credit order", () => {
    const jsonLd = buildArticleJsonLd(publishedPost, { siteUrl, siteName: "Örnek Site" });

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: publishedPost.title,
      description: publishedPost.excerpt,
      datePublished: publishedPost.publishedAt,
      dateModified: publishedPost.updatedAt,
      articleSection: "Yazılım",
      inLanguage: "tr",
      keywords: ["Başlangıç", "Şema"],
      url: "https://example.test/posts/ornek-yazi",
      mainEntityOfPage: { "@type": "WebPage", "@id": "https://example.test/posts/ornek-yazi" },
      publisher: { "@type": "Organization", name: "Örnek Site" },
    });
    expect(jsonLd.author).toEqual([
      { "@type": "Person", name: "Birinci Yazar", url: "https://example.test/authors/birinci-yazar" },
      { "@type": "Person", name: "İkinci Yazar", url: "https://example.test/authors/ikinci-yazar" },
    ]);
  });

  it("declares the post's own language", () => {
    const jsonLd = buildArticleJsonLd(
      { ...publishedPost, language: "de" },
      { siteUrl, siteName: "S" },
    );

    expect(jsonLd.inLanguage).toBe("de");
  });

  it("lists the cover as an absolute image URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", mediaOrigin);

    try {
      expect(buildArticleJsonLd(postWithCover, { siteUrl, siteName: "S" }).image).toEqual([
        `${mediaOrigin}/storage/v1/object/public/media/${coverMediaId}`,
      ]);
      expect(buildArticleJsonLd(publishedPost, { siteUrl, siteName: "S" })).not.toHaveProperty(
        "image",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("adds an author's avatar as an absolute Person image", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", mediaOrigin);
    const avatarId = "88888888-8888-4888-8888-888888888888";
    const [first, second] = publishedPost.authors;

    try {
      const jsonLd = buildArticleJsonLd(
        {
          ...publishedPost,
          authors: [{ ...first, author: { ...first.author, avatarId } }, second],
        },
        { siteUrl, siteName: "S" },
      );

      expect(jsonLd.author).toEqual([
        {
          "@type": "Person",
          name: "Birinci Yazar",
          url: "https://example.test/authors/birinci-yazar",
          image: `${mediaOrigin}/storage/v1/object/public/avatars/authors/${avatarId}`,
        },
        { "@type": "Person", name: "İkinci Yazar", url: "https://example.test/authors/ikinci-yazar" },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits an author image without a Storage origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const [first] = publishedPost.authors;

    try {
      const jsonLd = buildArticleJsonLd(
        {
          ...publishedPost,
          authors: [{ ...first, author: { ...first.author, avatarId: "88888888-8888-4888-8888-888888888888" } }],
        },
        { siteUrl, siteName: "S" },
      );

      expect((jsonLd.author as object[])[0]).not.toHaveProperty("image");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("omits URLs without a site origin", () => {
    const jsonLd = buildArticleJsonLd(publishedPost, { siteUrl: null, siteName: "S" });

    expect(jsonLd).not.toHaveProperty("url");
    expect(jsonLd).not.toHaveProperty("mainEntityOfPage");
    expect(jsonLd.author).toEqual([
      { "@type": "Person", name: "Birinci Yazar" },
      { "@type": "Person", name: "İkinci Yazar" },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script element or open markup", () => {
    const hostile = {
      ...publishedPost,
      title: "</script><script>alert(1)</script><!-- & \u2028",
    };
    const serialized = serializeJsonLd(
      buildArticleJsonLd(hostile, { siteUrl, siteName: "S" }),
    );

    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(serialized).headline).toBe(hostile.title);
  });
});
