// Public cache model (Next.js 16, no Cache Components).
//
// Public routes are ISR pages with `revalidate = 300` as a fallback: the home
// listing, /posts/[slug], /categories/[slug], /tags/[slug], /authors/[slug],
// the later listing pages under <listing>/page/[page], sitemap.xml, the Atom
// feed.xml, and the archive feeds <archive>/[slug]/feed.xml (robots.txt reads
// no content). Their anonymous Supabase reads
// sit in the Data Cache under publicPostsCacheTag. Posts embed their category,
// tags, and credited authors, and archives, the sitemap, and the feed read
// posts plus taxonomy, so one tag covers all public content; a narrower tag
// per post would not spare a regeneration, because the listing, archives,
// sitemap, and feed change with any published post anyway.
//
// A change to public output must do both:
//   1. updateTag(publicPostsCacheTag): the next request waits for fresh rows
//      instead of a stale Data Cache entry (revalidatePath alone left the
//      listing stale after unpublish in the Phase 8 production test);
//   2. revalidatePath for every public route pattern: the rendered HTML/RSC
//      entries are regenerated. Route patterns cover both slugs of a slug
//      change (the old URL now redirects) without tracking them.
//
// Pages render once per interface locale under the internal [locale] segment
// (src/proxy.ts rewrites /posts/a to /<locale>/posts/a). The routes below are
// public URL patterns; publicCacheInvalidation returns the internal route
// pattern of each page (/[locale]/posts/[slug], "page"), so one revalidatePath
// regenerates every locale's copy. sitemap.xml and the feeds are Route
// Handlers outside [locale], with one copy each. A dynamic Route Handler
// pattern is invalidated as a "layout": Next.js tags a handler's cache entry
// with <route>/route and one <segment>/layout per segment, never <route>/page,
// so a "page" invalidation of /tags/[slug]/feed.xml would match nothing. The
// layout of the feed.xml segment covers that handler only.
//
// Listings are paginated by path (./pagination.ts). A page pattern such as
// /tags/[slug] does not cover the nested /tags/[slug]/page/[page], so the
// later pages are listed as their own patterns. Every page of every listing is
// regenerated: one published or unpublished post shifts all later pages, and
// a page that was past the end (cached 404) may now exist, or the reverse.
//
// Public reads come from the published snapshot (Phase 26). Saving a post,
// draft or published, changes only its working copy, so a save never touches
// public caches; publish, republish, discard, and unpublish do. Member
// previews (the working copy) are force-dynamic and never cached.
//
// Site settings (branding, locales, indexing) are a separate cache with a
// site-wide invalidation: src/features/site-settings/cache.ts.
// Static pages and the header/footer menus (Phase 28) have their own tag and
// invalidation map: src/features/pages/cache.ts.

import { localizedRoutePattern } from "@/lib/localized-paths";

export const publicPostsCacheTag = "public-posts";

export type PublicContentChange =
  // draft -> published
  | "post-published"
  // published -> draft
  | "post-unpublished"
  // The working copy of a published post replaces its snapshot: title, slug
  // (the old slug starts redirecting), excerpt, body (including image and
  // YouTube nodes and their alt text), cover, language, category, tags, or
  // author credits.
  | "post-republished"
  // The working copy of a published post is reset to its snapshot. Public
  // output does not change; the invalidation keeps every publication-state
  // action on one rule, so a snapshot changed by another editor in between
  // cannot linger in a cache.
  | "post-changes-discarded"
  // Save of a working copy (a draft, or a published post's unpublished
  // changes). No public effect.
  | "working-copy-saved"
  // Taxonomy administration (/admin/categories, /admin/tags): create, rename,
  // re-slug, move, or delete a category or tag, including the posts a delete
  // moves or detaches. Names and slugs appear in every post card, archive,
  // breadcrumb, and the sitemap; old slugs start redirecting.
  | "taxonomy-changed"
  // Author identity administration (/admin/authors): create, rename, re-slug,
  // re-describe, link, set or remove the avatar of, or delete an author.
  // Names, slugs, and avatars appear in post bylines and author archives
  // (names and slugs also in the sitemap); old slugs start redirecting.
  | "author-changed";

export type PublicRoute = {
  path: string;
  type?: "page" | "layout";
};

export type CacheInvalidation = {
  tags: string[];
  routes: PublicRoute[];
};

// Every public route that renders or lists published content.
export const publicContentRoutes: readonly PublicRoute[] = [
  { path: "/" },
  { path: "/page/[page]", type: "page" },
  { path: "/posts/[slug]", type: "page" },
  { path: "/categories/[slug]", type: "page" },
  { path: "/categories/[slug]/page/[page]", type: "page" },
  { path: "/tags/[slug]", type: "page" },
  { path: "/tags/[slug]/page/[page]", type: "page" },
  { path: "/authors/[slug]", type: "page" },
  { path: "/authors/[slug]/page/[page]", type: "page" },
  { path: "/sitemap.xml" },
  { path: "/feed.xml" },
  { path: "/categories/[slug]/feed.xml", type: "layout" },
  { path: "/tags/[slug]/feed.xml", type: "layout" },
  { path: "/authors/[slug]/feed.xml", type: "layout" },
];

// Route Handlers outside src/app/[locale]: one copy, no locale.
const unlocalizedRoutes = new Set([
  "/sitemap.xml",
  "/feed.xml",
  "/categories/[slug]/feed.xml",
  "/tags/[slug]/feed.xml",
  "/authors/[slug]/feed.xml",
]);

// The revalidatePath target of a public route: every page is the
// [locale]-prefixed pattern, invalidated as a page for all locales.
export function internalRoute(route: PublicRoute): PublicRoute {
  if (unlocalizedRoutes.has(route.path)) return route;
  return { path: localizedRoutePattern(route.path), type: "page" };
}

const noInvalidation: CacheInvalidation = { tags: [], routes: [] };

export function publicCacheInvalidation(change: PublicContentChange): CacheInvalidation {
  switch (change) {
    case "working-copy-saved":
      return noInvalidation;
    case "post-published":
    case "post-unpublished":
    case "post-republished":
    case "post-changes-discarded":
    case "taxonomy-changed":
    case "author-changed":
      return { tags: [publicPostsCacheTag], routes: publicContentRoutes.map(internalRoute) };
  }
}
