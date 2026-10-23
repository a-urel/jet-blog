import { describe, expect, it } from "vitest";

import { publishedPost } from "./fixtures";
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
