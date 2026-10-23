import { describe, expect, it } from "vitest";

import {
  mapPublicPost,
  mapPublicPostSummary,
  wasUpdatedAfterPublication,
  type RawPublicPost,
} from "./mapping";

const row: RawPublicPost = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "ornek-yazi",
  title: "Örnek yazı",
  excerpt: null,
  published_at: "2026-10-20T09:00:00+00:00",
  updated_at: "2026-10-20T09:00:00+00:00",
  body: { type: "doc", content: [{ type: "paragraph" }] },
  content_version: 1,
  category: { id: "c1", name: "Yazılım", parent_id: "c0" },
  post_authors: [
    { sort_order: 1, author: { id: "a2", name: "İkinci" } },
    { sort_order: 0, author: [{ id: "a1", name: "Birinci" }] },
    { sort_order: 2, author: null },
  ],
  post_tags: [
    { tag: { id: "t2", name: "Şema" } },
    { tag: { id: "t1", name: "Başlangıç" } },
    { tag: null },
  ],
};

describe("mapPublicPostSummary", () => {
  it("orders credits by sort order and drops unreadable relations", () => {
    const post = mapPublicPostSummary(row);

    expect(post?.authors).toEqual([
      { author: { id: "a1", name: "Birinci" }, sortOrder: 0 },
      { author: { id: "a2", name: "İkinci" }, sortOrder: 1 },
    ]);
    expect(post?.tags.map((tag) => tag.name)).toEqual(["Başlangıç", "Şema"]);
    expect(post?.category).toEqual({ id: "c1", name: "Yazılım", parentId: "c0" });
    expect(post?.publishedAt).toBe(row.published_at);
  });

  it("hides rows without a publication time or category", () => {
    expect(mapPublicPostSummary({ ...row, published_at: null })).toBeNull();
    expect(mapPublicPostSummary({ ...row, category: null })).toBeNull();
    expect(mapPublicPostSummary({ ...row, category: [] })).toBeNull();
  });

  it("does not expose fields outside the public model", () => {
    const post = mapPublicPostSummary({
      ...row,
      ...({ revision: 3, created_by: "u1", status: "draft" } as object),
    });

    expect(post).not.toHaveProperty("revision");
    expect(post).not.toHaveProperty("created_by");
    expect(post).not.toHaveProperty("status");
  });
});

describe("mapPublicPost", () => {
  it("adds the body and content version", () => {
    const post = mapPublicPost(row);

    expect(post?.body).toEqual(row.body);
    expect(post?.contentVersion).toBe(1);
  });

  it("requires a content version", () => {
    expect(mapPublicPost({ ...row, content_version: undefined })).toBeNull();
  });
});

describe("wasUpdatedAfterPublication", () => {
  it("is false when publication set both timestamps", () => {
    expect(
      wasUpdatedAfterPublication({
        publishedAt: "2026-10-20T09:00:00.123456+00:00",
        updatedAt: "2026-10-20T09:00:00.123456+00:00",
      }),
    ).toBe(false);
  });

  it("is true only for a later update", () => {
    expect(
      wasUpdatedAfterPublication({
        publishedAt: "2026-10-20T09:00:00+00:00",
        updatedAt: "2026-10-21T10:30:00+00:00",
      }),
    ).toBe(true);
    expect(
      wasUpdatedAfterPublication({
        publishedAt: "2026-10-21T09:00:00+00:00",
        updatedAt: "2026-10-20T09:00:00+00:00",
      }),
    ).toBe(false);
  });

  it("is false for invalid timestamps", () => {
    expect(
      wasUpdatedAfterPublication({ publishedAt: "nope", updatedAt: "2026-10-20T09:00:00Z" }),
    ).toBe(false);
  });
});
