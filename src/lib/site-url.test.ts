import { describe, expect, it } from "vitest";

import {
  absoluteSiteUrl,
  defaultSiteName,
  getConfiguredSiteUrl,
  getSiteName,
} from "./site-url";

describe("getConfiguredSiteUrl", () => {
  it("returns the origin of an HTTP(S) URL", () => {
    expect(getConfiguredSiteUrl(" https://example.test/blog/ ")?.href).toBe(
      "https://example.test/",
    );
    expect(getConfiguredSiteUrl("http://localhost:3000")?.href).toBe(
      "http://localhost:3000/",
    );
  });

  it("rejects missing, invalid, and non-HTTP values", () => {
    expect(getConfiguredSiteUrl(undefined)).toBeNull();
    expect(getConfiguredSiteUrl("  ")).toBeNull();
    expect(getConfiguredSiteUrl("not a url")).toBeNull();
    expect(getConfiguredSiteUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("absoluteSiteUrl", () => {
  it("resolves a path against the site origin", () => {
    expect(absoluteSiteUrl("/posts/a", new URL("https://example.test"))).toBe(
      "https://example.test/posts/a",
    );
  });

  it("returns null without a site origin", () => {
    expect(absoluteSiteUrl("/posts/a", null)).toBeNull();
  });
});

describe("getSiteName", () => {
  it("uses the configured name or the neutral fallback", () => {
    expect(getSiteName("  Örnek Dergi ")).toBe("Örnek Dergi");
    expect(getSiteName("   ")).toBe(defaultSiteName);
    expect(getSiteName(undefined)).toBe(defaultSiteName);
  });
});
