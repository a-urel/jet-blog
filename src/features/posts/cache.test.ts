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
      // Listing, post page, archives, and sitemap.
      expect(paths).toEqual([
        "/",
        "/posts/[slug]",
        "/categories/[slug]",
        "/tags/[slug]",
        "/authors/[slug]",
        "/sitemap.xml",
      ]);
    },
  );

  it("marks dynamic segments as page invalidations", () => {
    for (const route of publicContentRoutes) {
      expect(route.type).toBe(route.path.includes("[") ? "page" : undefined);
    }
  });

  it("leaves public caches alone for a draft save", () => {
    expect(publicCacheInvalidation("draft-saved")).toEqual({ tags: [], routes: [] });
  });

  it("returns a copy that callers cannot use to change the route list", () => {
    publicCacheInvalidation("post-published").routes.pop();
    expect(publicContentRoutes).toHaveLength(6);
  });
});
