import { describe, expect, it } from "vitest";

import { publicPostsCacheTag } from "@/features/posts/cache";

import { allLocalizedPages, pageCacheInvalidation, publicPagesCacheTag, sitemapRoute } from "./cache";
import { staticPagePath, type PageLink } from "./model";
import {
  footerNavigationLinks,
  isSafeNavigationUrl,
  maxNavigationItems,
  resolveNavigationLinks,
  validateNavigationItems,
} from "./navigation";
import { validatePageFields } from "./validation";
import { pageActionErrorKey, parsePageActionErrorKey } from "./admin/errors";

const page = (kind: PageLink["kind"], slug: string): PageLink => ({
  id: `id-${slug}`,
  title: `Title ${slug}`,
  slug,
  kind,
  updatedAt: "2026-01-05T09:00:00Z",
});

describe("staticPagePath", () => {
  it("prefixes page slugs so they never collide with other routes", () => {
    expect(staticPagePath("gizlilik")).toBe("/pages/gizlilik");
  });
});

describe("validatePageFields", () => {
  it("normalizes the title and derives a slug from it", () => {
    const result = validatePageFields({
      title: "  Gizlilik   Politikası ",
      slug: "",
      metaDescription: "  Kısa açıklama ",
      kind: "privacy",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        title: "Gizlilik Politikası",
        slug: "gizlilik-politikasi",
        metaDescription: "Kısa açıklama",
        kind: "privacy",
      },
    });
  });

  it("defaults the kind and drops an empty meta description", () => {
    const result = validatePageFields({ title: "Hakkında", slug: "hakkinda", metaDescription: " ", kind: "" });
    expect(result.ok && result.data).toMatchObject({ kind: "other", metaDescription: null });
  });

  it("reports every invalid field", () => {
    const result = validatePageFields({
      title: "",
      slug: "Not A Slug",
      metaDescription: "x".repeat(301),
      kind: "blog",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        title: "titleRequired",
        slug: "slugInvalid",
        metaDescription: "metaDescriptionTooLong",
        kind: "kindInvalid",
      },
    });
  });
});

describe("isSafeNavigationUrl", () => {
  it.each([
    "https://example.com",
    "https://example.com/a/b?c=d#e",
    "https://sub.example.co.uk:8443/path",
  ])("accepts %s", (url) => {
    expect(isSafeNavigationUrl(url)).toBe(true);
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "//example.com",
    "/pages/about",
    "https://user:pass@example.com",
    "https://example.com/a b",
    'https://example.com/"onmouseover',
    "https://-bad.example.com",
    `https://example.com/${"a".repeat(2000)}`,
  ])("rejects %s", (url) => {
    expect(isSafeNavigationUrl(url)).toBe(false);
  });
});

describe("resolveNavigationLinks", () => {
  it("renders page items with the current slug and drops hidden pages", () => {
    expect(
      resolveNavigationLinks([
        { id: "1", label: null, url: null, page: { slug: "hakkinda", title: "Hakkında" } },
        { id: "2", label: "Biz", url: null, page: [{ slug: "biz", title: "Ekip" }] },
        { id: "3", label: null, url: null, page: null },
        { id: "4", label: "Kaynak", url: "https://example.com/src", page: null },
        { id: "5", label: "Kötü", url: "javascript:alert(1)", page: null },
      ]),
    ).toEqual([
      { key: "1", label: "Hakkında", href: "/pages/hakkinda", external: false },
      { key: "2", label: "Biz", href: "/pages/biz", external: false },
      { key: "4", label: "Kaynak", href: "https://example.com/src", external: true },
    ]);
  });
});

describe("footerNavigationLinks", () => {
  const legal = [page("terms", "kosullar"), page("cookies", "cerezler"), page("privacy", "gizlilik")];

  it("lists published legal pages in a fixed order while the footer is not configured", () => {
    expect(footerNavigationLinks([], legal).map((link) => link.href)).toEqual([
      "/pages/gizlilik",
      "/pages/kosullar",
      "/pages/cerezler",
    ]);
  });

  it("uses the configured footer items instead", () => {
    const configured = [{ key: "x", label: "X", href: "https://example.com", external: true }];
    expect(footerNavigationLinks(configured, legal)).toEqual(configured);
  });
});

describe("validateNavigationItems", () => {
  const pageId = "7d1f8a52-0c4e-4b8a-9f3e-5a6b7c8d9e01";

  it("builds the save_navigation payload in display order", () => {
    expect(
      validateNavigationItems([
        { type: "page", pageId, label: "" },
        { type: "url", url: " https://example.com ", label: " Örnek  site " },
        { type: "page", pageId, label: "Biz" },
      ]),
    ).toEqual({
      ok: true,
      items: [
        { page_id: pageId },
        { url: "https://example.com", label: "Örnek site" },
        { page_id: pageId, label: "Biz" },
      ],
    });
  });

  it("reports each invalid row", () => {
    expect(
      validateNavigationItems([
        { type: "page", pageId: "", label: "" },
        { type: "url", url: "", label: "A" },
        { type: "url", url: "http://example.com", label: "A" },
        { type: "url", url: "https://example.com", label: " " },
        { type: "url", url: "https://example.com", label: "x".repeat(81) },
      ]),
    ).toEqual({
      ok: false,
      tooMany: false,
      errors: {
        0: "pageMissing",
        1: "urlMissing",
        2: "urlInvalid",
        3: "labelRequired",
        4: "labelTooLong",
      },
    });
  });

  it("refuses more items than a menu holds", () => {
    const items = Array.from({ length: maxNavigationItems + 1 }, () => ({
      type: "page" as const,
      pageId,
      label: "",
    }));
    expect(validateNavigationItems(items)).toEqual({ ok: false, tooMany: true, errors: {} });
  });
});

describe("pageCacheInvalidation", () => {
  it("leaves public caches alone for draft changes", () => {
    expect(pageCacheInvalidation("draft-page-saved")).toEqual({ tags: [], routes: [] });
  });

  it("regenerates every page and the sitemap when published pages change", () => {
    for (const change of ["page-published", "page-unpublished", "published-page-saved"] as const) {
      expect(pageCacheInvalidation(change)).toEqual({
        tags: [publicPagesCacheTag],
        routes: [{ path: "/[locale]", type: "layout" }, sitemapRoute],
      });
    }
  });

  it("regenerates every page for a menu change", () => {
    expect(pageCacheInvalidation("navigation-changed")).toEqual({
      tags: [publicPagesCacheTag],
      routes: [allLocalizedPages],
    });
  });

  it("never expires the post content tag", () => {
    expect(publicPagesCacheTag).not.toBe(publicPostsCacheTag);
  });
});

describe("pageActionErrorKey", () => {
  it.each([
    [{ code: "42501" }, "forbidden"],
    [{ code: "40001" }, "conflict"],
    [{ code: "23505", message: "Slug already in use" }, "slug"],
    [{ code: "23505", message: "A published page of this kind already exists" }, "kind"],
    [{ code: "23503", message: "Page is linked from navigation" }, "linked"],
    [{ code: "55000" }, "state"],
    [{ code: "P0002" }, "missing"],
    [{ code: "PT429" }, "rateLimited"],
    [{ code: "22023", message: "Invalid post body: Unknown media x" }, "body"],
    [{ code: "22023", message: "Title must be 1-200 characters" }, "title"],
    [{ code: "22023", message: "Invalid slug" }, "slug"],
    [{ code: "XX000" }, "failed"],
  ] as const)("maps %o to %s", (error, key) => {
    expect(pageActionErrorKey(error)).toBe(key);
  });

  it("accepts only known ?error= values", () => {
    expect(parsePageActionErrorKey("kind")).toBe("kind");
    expect(parsePageActionErrorKey("<script>")).toBeNull();
    expect(parsePageActionErrorKey(["kind"])).toBeNull();
  });
});
