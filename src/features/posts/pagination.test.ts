import { describe, expect, it } from "vitest";

import {
  firstPageRedirects,
  laterPageParams,
  pageBounds,
  pageCount,
  pagePath,
  paginationItems,
  parsePageParam,
  postsPerPage,
} from "./pagination";

describe("parsePageParam", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["120", 120],
    ["999999", 999999],
  ])("accepts %s", (value, expected) => {
    expect(parsePageParam(value)).toBe(expected);
  });

  it.each(["0", "-1", "02", "2.0", "1e3", "abc", "", " 2", "2 ", "1000000"])(
    "rejects %j",
    (value) => {
      expect(parsePageParam(value)).toBeNull();
    },
  );
});

describe("pageCount and pageBounds", () => {
  it("always has at least one page, so an empty home listing still renders", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("counts full and partial pages", () => {
    expect(pageCount(postsPerPage)).toBe(1);
    expect(pageCount(postsPerPage + 1)).toBe(2);
    expect(pageCount(postsPerPage * 3)).toBe(3);
  });

  it("returns inclusive offsets for each page", () => {
    expect(pageBounds(1)).toEqual({ from: 0, to: postsPerPage - 1 });
    expect(pageBounds(3)).toEqual({ from: postsPerPage * 2, to: postsPerPage * 3 - 1 });
  });
});

describe("pagePath", () => {
  it("keeps page 1 at the listing URL", () => {
    expect(pagePath("/", 1)).toBe("/");
    expect(pagePath("/tags/sema", 1)).toBe("/tags/sema");
  });

  it("nests later pages under /page/[page]", () => {
    expect(pagePath("/", 2)).toBe("/page/2");
    expect(pagePath("/categories/yazilim", 4)).toBe("/categories/yazilim/page/4");
  });
});

describe("laterPageParams", () => {
  it("prerenders pages 2..n only", () => {
    expect(laterPageParams(0)).toEqual([]);
    expect(laterPageParams(postsPerPage)).toEqual([]);
    expect(laterPageParams(postsPerPage * 2 + 1)).toEqual([{ page: "2" }, { page: "3" }]);
  });
});

describe("paginationItems", () => {
  it("lists every page of a short listing", () => {
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(2, 3)).toEqual([1, 2, 3]);
  });

  it("collapses long gaps into an ellipsis", () => {
    expect(paginationItems(1, 10)).toEqual([1, 2, "ellipsis", 10]);
    expect(paginationItems(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
    expect(paginationItems(10, 10)).toEqual([1, "ellipsis", 9, 10]);
  });

  it("shows a single skipped page instead of an ellipsis", () => {
    expect(paginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationItems(1, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe("firstPageRedirects", () => {
  it("permanently redirects every listing's /page/1 to the listing", () => {
    expect(firstPageRedirects).toEqual([
      { source: "/page/1", destination: "/", permanent: true },
      {
        source: "/:listing(categories|tags|authors)/:slug/page/1",
        destination: "/:listing/:slug",
        permanent: true,
      },
    ]);
  });
});
