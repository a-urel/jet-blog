import { describe, expect, it } from "vitest";

import { localizedPaths, localizedRoutePattern } from "./localized-paths";

describe("localizedRoutePattern", () => {
  it("prefixes a public route pattern with the internal locale segment", () => {
    expect(localizedRoutePattern("/posts/[slug]")).toBe("/[locale]/posts/[slug]");
    expect(localizedRoutePattern("/admin")).toBe("/[locale]/admin");
  });

  it("maps the root to the locale segment itself", () => {
    expect(localizedRoutePattern("/")).toBe("/[locale]");
  });
});

describe("localizedPaths", () => {
  it("lists one concrete path per interface locale", () => {
    expect(localizedPaths("/posts/merhaba")).toEqual([
      "/tr/posts/merhaba",
      "/en/posts/merhaba",
      "/de/posts/merhaba",
    ]);
  });

  it("maps the root to each locale root", () => {
    expect(localizedPaths("/")).toEqual(["/tr", "/en", "/de"]);
  });
});
