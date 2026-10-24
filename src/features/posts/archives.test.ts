import { describe, expect, it } from "vitest";

import { publishedPost } from "@/features/seo/fixtures";
import { derivePublicArchives } from "./archives";

const categories = [
  { id: "c1", slug: "uretim", parentId: null },
  { id: "c2", slug: "yazilim", parentId: "c1" },
  { id: "c3", slug: "bos-kategori", parentId: null },
];

describe("derivePublicArchives", () => {
  it("lists ancestor categories of a post so parent archives include descendants", () => {
    const archives = derivePublicArchives([publishedPost], categories);

    expect(archives.categories.map((entry) => entry.slug)).toEqual(["uretim", "yazilim"]);
    expect(archives.categories.every((entry) => entry.lastModified === publishedPost.updatedAt))
      .toBe(true);
  });

  it("lists tags and authors of published posts only", () => {
    const archives = derivePublicArchives([publishedPost], categories);

    expect(archives.tags.map((entry) => entry.slug)).toEqual(["baslangic", "sema"]);
    expect(archives.authors.map((entry) => entry.slug)).toEqual(["birinci-yazar", "ikinci-yazar"]);
  });

  it("uses the newest post update and counts posts per archive, omitting empty archives", () => {
    const newer = {
      ...publishedPost,
      id: "22222222-2222-4222-8222-222222222222",
      slug: "yeni",
      updatedAt: "2026-10-22T08:00:00+00:00",
      tags: [],
      authors: [publishedPost.authors[1]],
      category: { id: "c1", name: "Üretim", slug: "uretim", parentId: null },
    };
    const archives = derivePublicArchives([publishedPost, newer], categories);

    expect(archives.categories).toEqual([
      // The parent archive lists its own post and its child's.
      { slug: "uretim", lastModified: newer.updatedAt, postCount: 2 },
      { slug: "yazilim", lastModified: publishedPost.updatedAt, postCount: 1 },
    ]);
    expect(archives.authors.find((entry) => entry.slug === "ikinci-yazar")?.lastModified)
      .toBe(newer.updatedAt);
    expect(derivePublicArchives([], categories)).toEqual({ categories: [], tags: [], authors: [] });
  });
});
