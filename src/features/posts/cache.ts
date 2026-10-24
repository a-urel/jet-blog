// Public cache model (Next.js 16, no Cache Components).
//
// Public routes are ISR pages with `revalidate = 300` as a fallback: the home
// listing, /posts/[slug], /categories/[slug], /tags/[slug], /authors/[slug],
// the later listing pages under <listing>/page/[page], and sitemap.xml
// (robots.txt reads no content). Their anonymous Supabase reads
// sit in the Data Cache under publicPostsCacheTag. Posts embed their category,
// tags, and credited authors, and archives and the sitemap read posts plus
// taxonomy, so one tag covers all public content; a narrower tag per post
// would not spare a regeneration, because the listing, archives, and sitemap
// change with any published post anyway.
//
// A change to public output must do both:
//   1. updateTag(publicPostsCacheTag): the next request waits for fresh rows
//      instead of a stale Data Cache entry (revalidatePath alone left the
//      listing stale after unpublish in the Phase 8 production test);
//   2. revalidatePath for every public route pattern: the rendered HTML/RSC
//      entries are regenerated. Route patterns cover both slugs of a slug
//      change (the old URL now redirects) without tracking them.
//
// Listings are paginated by path (./pagination.ts). A page pattern such as
// /tags/[slug] does not cover the nested /tags/[slug]/page/[page], so the
// later pages are listed as their own patterns. Every page of every listing is
// regenerated: one published or unpublished post shifts all later pages, and
// a page that was past the end (cached 404) may now exist, or the reverse.
//
// Drafts never reach public reads, so saving a draft changes nothing public.
// Member previews are force-dynamic and never cached.

export const publicPostsCacheTag = "public-posts";

export type PublicContentChange =
  // draft -> published
  | "post-published"
  // published -> draft
  | "post-unpublished"
  // Edit of a published post: title, slug (old slug starts redirecting),
  // excerpt, body (including image and YouTube nodes and their alt text),
  // category, tags, or author credits.
  | "published-post-updated"
  // Save of a post that is not published. No public effect.
  | "draft-saved"
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
];

const noInvalidation: CacheInvalidation = { tags: [], routes: [] };

export function publicCacheInvalidation(change: PublicContentChange): CacheInvalidation {
  switch (change) {
    case "draft-saved":
      return noInvalidation;
    case "post-published":
    case "post-unpublished":
    case "published-post-updated":
    case "taxonomy-changed":
    case "author-changed":
      return { tags: [publicPostsCacheTag], routes: [...publicContentRoutes] };
  }
}
