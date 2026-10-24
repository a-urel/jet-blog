import type { PostSummary } from "./types";

// Public listings are paginated by path: page 1 lives at the listing's own URL
// (/, /tags/[slug], ...) and later pages at <listing>/page/[page]. Path
// segments keep every page an ISR route; a ?page= search param would make the
// listing render dynamically on every request (searchParams is a request-time
// API in Next.js 16). Pure helpers, shared by the data boundary, the pages,
// and unit tests.

// The first card of a page spans both grid columns, so an odd size fills the
// two-column grid without a lone last card.
export const postsPerPage = 9;

// Upper bound for a parsed page number; anything longer is not a real page and
// would only produce out-of-range database offsets.
const maxPageDigits = 6;

export type PageInfo = {
  page: number;
  pageCount: number;
  total: number;
};

export type PostPage = PageInfo & { posts: PostSummary[] };

// Accepts canonical positive integers only ("2", not "02", "2.0", or "-1").
// Returns null for anything else; the caller answers 404.
export function parsePageParam(value: string): number | null {
  if (!new RegExp(`^[1-9][0-9]{0,${maxPageDigits - 1}}$`).test(value)) return null;
  return Number(value);
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / postsPerPage));
}

// Inclusive row offsets for PostgREST range().
export function pageBounds(page: number) {
  const from = (page - 1) * postsPerPage;
  return { from, to: from + postsPerPage - 1 };
}

// Page 1 has a single URL: the listing itself. /page/1 redirects there.
export function pagePath(basePath: string, page: number) {
  if (page <= 1) return basePath;
  return `${basePath === "/" ? "" : basePath}/page/${page}`;
}

// /page/1 URLs answer a permanent redirect to the listing before any page
// renders (next.config.ts redirects()). A redirect thrown while rendering an
// ISR page sends its Location header twice on the first, uncached response.
// The pages still redirect page 1 themselves as a fallback.
export const firstPageRedirects = [
  { source: "/page/1", destination: "/", permanent: true },
  {
    source: "/:listing(categories|tags|authors)/:slug/page/1",
    destination: "/:listing/:slug",
    permanent: true,
  },
];

// Params for prerendering pages 2..n of a listing with `total` posts.
export function laterPageParams(total: number): { page: string }[] {
  return Array.from({ length: pageCount(total) - 1 }, (_, index) => ({
    page: String(index + 2),
  }));
}

export type PaginationItem = number | "ellipsis";

// First, last, and the pages next to the current one; gaps of more than one
// page collapse into an ellipsis (a gap of exactly one shows that page).
export function paginationItems(page: number, count: number): PaginationItem[] {
  const shown = new Set([1, count, page - 1, page, page + 1]);
  const pages = [...shown].filter((candidate) => candidate >= 1 && candidate <= count);
  pages.sort((left, right) => left - right);

  const items: PaginationItem[] = [];
  for (const candidate of pages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && candidate - previous === 2) items.push(previous + 1);
    else if (typeof previous === "number" && candidate - previous > 2) items.push("ellipsis");
    items.push(candidate);
  }
  return items;
}
