import { describe, expect, it } from "vitest";

import type { PostSummary } from "@/features/posts/types";
import { mapSearchRows, searchRowIds } from "./results";

function summary(id: string, title: string): PostSummary {
  return {
    id,
    slug: id,
    title,
    excerpt: null,
    language: "tr",
    cover: null,
    publishedAt: "2026-10-20T09:00:00+00:00",
    updatedAt: "2026-10-20T09:00:00+00:00",
    category: { id: "c1", name: "Yazılım", slug: "yazilim", parentId: null },
    authors: [],
    tags: [],
  } as PostSummary;
}

const rows = [
  { post_id: "b", search_rank: 0.5, title_highlight: "\u0002Küçük\u0003 adım", snippet: "bir \u0002küçük\u0003", total_count: "12" },
  { post_id: "a", search_rank: 0.2, title_highlight: "<b>Kalın</b> başlık", snippet: null, total_count: 12 },
  { post_id: "gone", search_rank: 0.1, title_highlight: "Yok", snippet: "", total_count: 12 },
  { nonsense: true },
];

describe("mapSearchRows", () => {
  it("keeps rank order, drops rows without a public summary, and reads the total", () => {
    const page = mapSearchRows(rows, [summary("a", "<b>Kalın</b> başlık"), summary("b", "Küçük adım")], 2);

    expect(searchRowIds(rows)).toEqual(["b", "a", "gone"]);
    expect(page.results.map((result) => result.post.id)).toEqual(["b", "a"]);
    expect(page.total).toBe(12);
    expect(page.pageCount).toBe(2);
    expect(page.page).toBe(2);
    expect(page.results[0].title).toEqual([
      { text: "Küçük", match: true },
      { text: " adım", match: false },
    ]);
    expect(page.results[1].snippet).toEqual([]);
  });

  it("falls back to the plain title when the highlight does not spell it", () => {
    const page = mapSearchRows(
      [{ post_id: "a", title_highlight: "Kalın \u0002başlık\u0003", snippet: null, total_count: 1 }],
      [summary("a", "<b>Kalın</b> başlık")],
      1,
    );

    expect(page.results[0].title).toEqual([{ text: "<b>Kalın</b> başlık", match: false }]);
  });

  it("maps an empty search to an empty first page", () => {
    expect(mapSearchRows([], [], 1)).toEqual({ results: [], page: 1, pageCount: 1, total: 0 });
  });
});
