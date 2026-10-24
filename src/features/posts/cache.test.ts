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
    // Listing, post page, archives, their later pages, sitemap, and feeds.
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
      "/categories/[slug]/feed.xml",
      "/tags/[slug]/feed.xml",
      "/authors/[slug]/feed.xml",
    ]);
  });

  it("marks dynamic pages as page and dynamic Route Handlers as layout invalidations", () => {
    for (const route of publicContentRoutes) {
      const expected = !route.path.includes("[")
        ? undefined
        : route.path.endsWith(".xml")
          ? "layout"
          : "page";
      expect(route.type).toBe(expected);
    }
  });

  it("covers the feed of every archive", () => {
    const paths = publicContentRoutes.map((route) => route.path);
    for (const archive of ["/categories/[slug]", "/tags/[slug]", "/authors/[slug]"]) {
      expect(paths).toContain(`${archive}/feed.xml`);
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
        { path: "/categories/[slug]/feed.xml", type: "layout" },
        { path: "/tags/[slug]/feed.xml", type: "layout" },
        { path: "/authors/[slug]/feed.xml", type: "layout" },
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
    expect(publicContentRoutes).toHaveLength(14);
  });
});

describe("internalRoute", () => {
  it("maps the home listing to the [locale] root page", () => {
    expect(internalRoute({ path: "/" })).toEqual({ path: "/[locale]", type: "page" });
  });

  it("keeps Route Handlers outside [locale] unchanged", () => {
    expect(internalRoute({ path: "/feed.xml" })).toEqual({ path: "/feed.xml" });
    expect(internalRoute({ path: "/tags/[slug]/feed.xml", type: "layout" })).toEqual({
      path: "/tags/[slug]/feed.xml",
      type: "layout",
    });
  });
});
