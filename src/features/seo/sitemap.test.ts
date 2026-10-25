import { describe, expect, it } from "vitest";

import { derivePublicArchives } from "@/features/posts/archives";
import { publishedPost } from "./fixtures";
import { buildRobots, buildSitemap } from "./sitemap";

const siteUrl = new URL("https://example.test");
const categories = [
  { id: "c1", slug: "uretim", parentId: null },
  { id: "c2", slug: "yazilim", parentId: "c1" },
];

describe("buildSitemap", () => {
  const archives = derivePublicArchives([publishedPost], categories);
  const sitemap = buildSitemap({ siteUrl, indexing: true, posts: [publishedPost], archives });
  const urls = sitemap.map((entry) => entry.url);

  it("lists the home page, canonical post URLs, and non-empty archives", () => {
    expect(urls).toEqual([
      "https://example.test/",
      "https://example.test/posts/ornek-yazi",
      "https://example.test/categories/uretim",
      "https://example.test/categories/yazilim",
      "https://example.test/tags/baslangic",
      "https://example.test/tags/sema",
      "https://example.test/authors/birinci-yazar",
      "https://example.test/authors/ikinci-yazar",
    ]);
    expect(sitemap[1].lastModified).toBe(publishedPost.updatedAt);
  });

  it("never lists admin, preview, login, or other private routes", () => {
    expect(urls.some((url) => /\/(admin|login|auth)(\/|$)|preview/.test(url))).toBe(false);
  });

  it("returns nothing without a site origin", () => {
    expect(
      buildSitemap({ siteUrl: null, indexing: true, posts: [publishedPost], archives }),
    ).toEqual([]);
  });

  it("returns nothing while search-engine indexing is turned off", () => {
    expect(buildSitemap({ siteUrl, indexing: false, posts: [publishedPost], archives })).toEqual([]);
  });
});

describe("buildRobots", () => {
  it("disallows everything while search-engine indexing is turned off", () => {
    expect(buildRobots(siteUrl, false)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("allows public pages, blocks private routes, and links the sitemap", () => {
    expect(buildRobots(siteUrl)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/auth"] },
      sitemap: "https://example.test/sitemap.xml",
    });
  });

  it("blocks crawling without a site origin", () => {
    expect(buildRobots(null)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
