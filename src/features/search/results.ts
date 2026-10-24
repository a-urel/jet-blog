import type { PostSummary } from "@/features/posts/types";
import { parseHighlight, searchPageCount, type HighlightSegment } from "./query";

// Pure mapping from search_published_posts rows plus the matching public
// post summaries to one page of results. Kept free of server-only imports so
// unit tests can exercise it directly.

export type SearchResult = {
  post: PostSummary;
  title: HighlightSegment[];
  snippet: HighlightSegment[];
};

export type SearchPage = {
  results: SearchResult[];
  page: number;
  pageCount: number;
  total: number;
};

type RawSearchRow = {
  post_id: string;
  title_highlight: string | null;
  snippet: string | null;
  total_count: number | string;
};

function isRawSearchRow(row: unknown): row is RawSearchRow {
  return (
    typeof row === "object" &&
    row !== null &&
    typeof (row as RawSearchRow).post_id === "string"
  );
}

export function searchRowIds(rows: unknown[]): string[] {
  return rows.filter(isRawSearchRow).map((row) => row.post_id);
}

// Keeps the database rank order. A row whose summary is missing (unpublished
// between the two reads, or not mappable) is dropped; the total still comes
// from the search, so it can be one higher than the shown results.
export function mapSearchRows(
  rows: unknown[],
  summaries: PostSummary[],
  page: number,
): SearchPage {
  const searchRows = rows.filter(isRawSearchRow);
  const byId = new Map(summaries.map((post) => [post.id, post]));
  const total = searchRows.length > 0 ? Number(searchRows[0].total_count) || 0 : 0;

  const results = searchRows.flatMap((row) => {
    const post = byId.get(row.post_id);
    if (!post) return [];

    // ts_headline may drop markup-like tokens from the text it returns. The
    // title must read exactly as published, so a highlight that does not
    // spell the current title falls back to the plain title.
    const title = parseHighlight(row.title_highlight);
    const titleMatches = title.map((segment) => segment.text).join("") === post.title;
    return [
      {
        post,
        title: titleMatches ? title : [{ text: post.title, match: false }],
        snippet: parseHighlight(row.snippet),
      },
    ];
  });

  return { results, page, pageCount: searchPageCount(total), total };
}
