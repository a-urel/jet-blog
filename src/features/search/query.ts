import { isPostLanguage, type PostLanguage } from "@/features/posts/language";
import { parsePageParam } from "@/features/posts/pagination";

// Pure helpers for /search: input normalization, URLs, and highlight parsing.
// Shared by the page, the data boundary, and unit tests.

// Mirrors the 200-character cap in search_published_posts
// (supabase/migrations/20261024180000_post_search.sql).
export const maxSearchQueryLength = 200;
export const minSearchQueryLength = 2;
export const searchResultsPerPage = 10;
// The database refuses offsets past 1000, so at most 101 pages of 10.
export const maxSearchPage = 101;

export const searchPath = "/search";

export type SearchInput =
  | { kind: "empty" }
  | { kind: "too-short"; query: string }
  | { kind: "too-long"; query: string }
  | { kind: "query"; query: string };

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Trims, collapses whitespace (including control characters, which also
// keeps the highlight markers out of user input), and classifies the query.
// Length is counted in code points, like char_length() in Postgres.
export function parseSearchQuery(value: SearchParamValue): SearchInput {
  const query = (firstValue(value) ?? "").replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  const length = [...query].length;

  if (length === 0) return { kind: "empty" };
  if (length < minSearchQueryLength) return { kind: "too-short", query };
  if (length > maxSearchQueryLength) return { kind: "too-long", query };
  return { kind: "query", query };
}

// Optional filter; anything but a supported post language means "all".
export function parseSearchLanguage(value: SearchParamValue): PostLanguage | null {
  const language = firstValue(value);
  return isPostLanguage(language) ? language : null;
}

// Missing means page 1; anything that is not a canonical page number within
// the database's offset cap is null (the page shows an out-of-range state).
export function parseSearchPage(value: SearchParamValue): number | null {
  const raw = firstValue(value);
  if (raw === undefined) return 1;

  const page = parsePageParam(raw);
  return page !== null && page <= maxSearchPage ? page : null;
}

export function searchPageCount(total: number) {
  return Math.max(1, Math.ceil(total / searchResultsPerPage));
}

export function searchOffset(page: number) {
  return (page - 1) * searchResultsPerPage;
}

// /search?q=...&language=...&page=... with page 1 and "all languages" omitted.
export function searchUrl(query: string, options: { page?: number; language?: PostLanguage | null } = {}) {
  const params = new URLSearchParams({ q: query });
  if (options.language) params.set("language", options.language);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  return `${searchPath}?${params.toString()}`;
}

export type HighlightSegment = { text: string; match: boolean };

// search_published_posts marks matches with U+0002 (start) and U+0003 (end)
// and strips those characters from the source text first. The result is
// plain text: segments are rendered as React text nodes, never as HTML.
// Unbalanced or stray markers are dropped rather than trusted.
export function parseHighlight(value: string | null | undefined): HighlightSegment[] {
  if (!value) return [];

  const segments: HighlightSegment[] = [];
  let match = false;
  let text = "";

  const flush = () => {
    if (!text) return;
    const previous = segments.at(-1);
    if (previous && previous.match === match) previous.text += text;
    else segments.push({ text, match });
    text = "";
  };

  for (const character of value) {
    if (character === "\u0002" || character === "\u0003") {
      const opening = character === "\u0002";
      if (opening !== match) {
        flush();
        match = opening;
      }
      continue;
    }
    text += character;
  }

  // An unterminated highlight still shows its text, unmarked.
  if (match) match = false;
  flush();
  return segments;
}
