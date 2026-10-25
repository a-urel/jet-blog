// Cache model for static pages and navigation (Phase 28). Sibling of
// src/features/posts/cache.ts, which describes the post content caches; pages
// never share its tag, so a page change does not regenerate post listings or
// feeds, and a post change does not touch pages.
//
// Public reads of pages, page redirects, and menus go through the anonymous
// client with publicPagesCacheTag on the fetch (./data.ts). They appear in:
//   * /pages/[slug] (ISR, revalidate = 300 as a fallback);
//   * the root layout: header menu and footer links on every page, including
//     the automatic legal links of an unconfigured footer;
//   * the privacy notice of the sign-up form (dynamic) and of the comment form
//     on /posts/[slug] (ISR, below the root layout);
//   * sitemap.xml (a Route Handler outside src/app/[locale]).
//
// Because the header and footer render on every page, a change that can
// alter a menu entry or a legal link invalidates the root layout pattern
// "/[locale]" as a layout: every page below it, in every locale, regenerates
// on its next request. Such changes are rare (publishing a legal text, editing
// a menu), so one call is preferred over tracking which pages show what.
// A change that alters the set or slugs of published pages also revalidates
// sitemap.xml. Like posts, updateTag runs first so regenerated routes read
// fresh rows instead of a stale Data Cache entry.
//
// Pages keep a single copy (no published snapshot): saving a published page
// is a public change; saving a draft is not. Admin pages are dynamic and
// revalidated by path in ./admin/actions.ts.

import { localizedRoutePattern } from "@/lib/localized-paths";

export const publicPagesCacheTag = "public-pages";

export type PageContentChange =
  // draft -> published (new URL, sitemap entry, maybe a legal link)
  | "page-published"
  // published -> draft
  | "page-unpublished"
  // Save of a published page: title, slug (the old slug starts redirecting),
  // meta description, kind, or body, all public at once.
  | "published-page-saved"
  // Save or creation of a draft page, or deletion of a draft. No public
  // effect: drafts are invisible, and a draft linked from a menu stays hidden.
  | "draft-page-saved"
  // Header or footer menu saved.
  | "navigation-changed";

export type PageCacheRoute = { path: string; type?: "page" | "layout" };

export type PageCacheInvalidation = {
  tags: string[];
  routes: PageCacheRoute[];
};

// Every page under src/app/[locale] (header and footer), all locales.
export const allLocalizedPages: PageCacheRoute = {
  path: localizedRoutePattern("/"),
  type: "layout",
};

export const sitemapRoute: PageCacheRoute = { path: "/sitemap.xml" };

export function pageCacheInvalidation(change: PageContentChange): PageCacheInvalidation {
  switch (change) {
    case "draft-page-saved":
      return { tags: [], routes: [] };
    case "navigation-changed":
      return { tags: [publicPagesCacheTag], routes: [allLocalizedPages] };
    case "page-published":
    case "page-unpublished":
    case "published-page-saved":
      return { tags: [publicPagesCacheTag], routes: [allLocalizedPages, sitemapRoute] };
  }
}
