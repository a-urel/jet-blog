import { describe, expect, it } from "vitest";

import type { RawPublicPost } from "@/features/posts/mapping";
import trBookmarks from "@/messages/tr/bookmarks.json";
import { mapSavedRows } from "./queries";
import { bookmarkMessageKeys, insertErrorResult, isPostId } from "./result";

const post: RawPublicPost = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "kaydedilen-yazi",
  title: "Kaydedilen yazı",
  excerpt: null,
  language: "tr",
  published_at: "2026-10-20T09:00:00+00:00",
  updated_at: "2026-10-20T09:00:00+00:00",
  category: { id: "c1", name: "Tasarım", slug: "tasarim", parent_id: null },
  post_authors: [],
  post_tags: [],
};

describe("isPostId", () => {
  it("accepts UUIDs only", () => {
    expect(isPostId(post.id)).toBe(true);
    expect(isPostId("kaydedilen-yazi")).toBe(false);
    expect(isPostId(`${post.id}' or 1=1`)).toBe(false);
    expect(isPostId(42)).toBe(false);
    expect(isPostId(undefined)).toBe(false);
  });
});

describe("insertErrorResult", () => {
  it("treats an existing bookmark as the requested state", () => {
    expect(insertErrorResult({ code: "23505" })).toEqual({ status: "ok", saved: true });
  });

  it("reports drafts and missing posts the same way", () => {
    expect(insertErrorResult({ code: "42501" })).toEqual({ status: "unavailable" });
    expect(insertErrorResult({ code: "23503" })).toEqual({ status: "unavailable" });
  });

  it("maps the rate limit", () => {
    expect(insertErrorResult({ code: "PT429" })).toEqual({ status: "rate-limited" });
  });

  it("falls back to a generic error", () => {
    expect(insertErrorResult({ code: "08006" })).toEqual({ status: "error" });
    expect(insertErrorResult({})).toEqual({ status: "error" });
  });
});

describe("bookmarkMessageKeys", () => {
  it("point at Turkish catalog entries", () => {
    for (const key of Object.values(bookmarkMessageKeys)) {
      expect(trBookmarks.messages[key]).toBeTruthy();
    }
  });
});

describe("mapSavedRows", () => {
  it("keeps the saved order and maps embedded posts", () => {
    const second = { ...post, id: "22222222-2222-4222-8222-222222222222", slug: "ikinci" };
    const posts = mapSavedRows([
      { created_at: "2026-10-22T10:00:00+00:00", post: second },
      { created_at: "2026-10-21T10:00:00+00:00", post: [post] },
    ]);

    expect(posts.map((item) => item.slug)).toEqual(["ikinci", "kaydedilen-yazi"]);
  });

  it("drops rows without a publicly showable post", () => {
    expect(
      mapSavedRows([
        { created_at: "2026-10-22T10:00:00+00:00", post: null },
        { created_at: "2026-10-22T10:00:00+00:00", post: { ...post, published_at: null } },
        { created_at: "2026-10-22T10:00:00+00:00", post: { ...post, category: null } },
      ]),
    ).toEqual([]);
    expect(mapSavedRows(null)).toEqual([]);
  });

  it("exposes no editorial fields", () => {
    const [mapped] = mapSavedRows([
      { created_at: "2026-10-22T10:00:00+00:00", post: { ...post, status: "published" } },
    ]);

    expect(mapped).not.toHaveProperty("status");
    expect(mapped).not.toHaveProperty("created_at");
  });
});
