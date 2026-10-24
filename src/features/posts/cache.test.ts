import { describe, expect, it } from "vitest";

import {
  publicCacheInvalidation,
  publicContentRoutes,
  publicPostsCacheTag,
  type PublicContentChange,
} from "./cache";

const publicChanges: PublicContentChange[] = [
  "post-published",
  "post-unpublished",
  "published-post-updated",
  "taxonomy-changed",
  "author-changed",
];

describe("publicCacheInvalidation", () => {
  it.each(publicChanges)(
    "%s expires public data and every public route",
    (change) => {
      const { tags, routes } = publicCacheInvalidation(change);
      const paths = routes.map((route) => route.path);

      expect(tags).toEqual([publicPostsCacheTag]);
      // Listing, post page, archives, their later pages, and sitemap.
      expect(paths).toEqual([
        "/",
        "/page/[page]",
        "/posts/[slug]",
        "/categories/[slug]",
        "/categories/[slug]/page/[page]",
        "/tags/[slug]",
        "/tags/[slug]/page/[page]",
        "/authors/[slug]",
        "/authors/[slug]/page/[page]",
        "/sitemap.xml",
      ]);
    },
  );

  it("marks dynamic segments as page invalidations", () => {
    for (const route of publicContentRoutes) {
      expect(route.type).toBe(route.path.includes("[") ? "page" : undefined);
    }
  });

  it("covers the later pages of every paginated listing", () => {
    const paths = publicContentRoutes.map((route) => route.path);
    for (const listing of ["", "/categories/[slug]", "/tags/[slug]", "/authors/[slug]"]) {
      expect(paths).toContain(`${listing}/page/[page]`);
    }
  });

  it("leaves public caches alone for a draft save", () => {
    expect(publicCacheInvalidation("draft-saved")).toEqual({ tags: [], routes: [] });
  });

  it("returns a copy that callers cannot use to change the route list", () => {
    publicCacheInvalidation("post-published").routes.pop();
    expect(publicContentRoutes).toHaveLength(10);
  });
});
