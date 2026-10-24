import { describe, expect, it } from "vitest";

import { interfaceLocales } from "@/lib/interface-locales";

import {
  internalRoute,
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

describe("publicContentRoutes", () => {
  it("lists every public URL pattern that renders published content", () => {
    // Listing, post page, archives, their later pages, sitemap, and feed.
    expect(publicContentRoutes.map((route) => route.path)).toEqual([
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
      "/feed.xml",
    ]);
  });

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
});

describe("publicCacheInvalidation", () => {
  it.each(publicChanges)(
    "%s expires public data and every locale's copy of every public route",
    (change) => {
      const { tags, routes } = publicCacheInvalidation(change);

      expect(tags).toEqual([publicPostsCacheTag]);
      // Pages are invalidated through their internal [locale] route pattern,
      // which covers the tr, en, and de copies in one call; the Route
      // Handlers outside [locale] keep their single literal path.
      expect(routes).toEqual([
        { path: "/[locale]", type: "page" },
        { path: "/[locale]/page/[page]", type: "page" },
        { path: "/[locale]/posts/[slug]", type: "page" },
        { path: "/[locale]/categories/[slug]", type: "page" },
        { path: "/[locale]/categories/[slug]/page/[page]", type: "page" },
        { path: "/[locale]/tags/[slug]", type: "page" },
        { path: "/[locale]/tags/[slug]/page/[page]", type: "page" },
        { path: "/[locale]/authors/[slug]", type: "page" },
        { path: "/[locale]/authors/[slug]/page/[page]", type: "page" },
        { path: "/sitemap.xml" },
        { path: "/feed.xml" },
      ]);
    },
  );

  it("never targets a single locale", () => {
    const { routes } = publicCacheInvalidation("post-published");
    for (const route of routes) {
      for (const locale of interfaceLocales) {
        expect(route.path.startsWith(`/${locale}/`)).toBe(false);
      }
    }
  });

  it("leaves public caches alone for a draft save", () => {
    expect(publicCacheInvalidation("draft-saved")).toEqual({ tags: [], routes: [] });
  });

  it("returns a copy that callers cannot use to change the route list", () => {
    publicCacheInvalidation("post-published").routes.pop();
    expect(publicContentRoutes).toHaveLength(11);
  });
});

describe("internalRoute", () => {
  it("maps the home listing to the [locale] root page", () => {
    expect(internalRoute({ path: "/" })).toEqual({ path: "/[locale]", type: "page" });
  });

  it("keeps Route Handlers outside [locale] unchanged", () => {
    expect(internalRoute({ path: "/feed.xml" })).toEqual({ path: "/feed.xml" });
  });
});
