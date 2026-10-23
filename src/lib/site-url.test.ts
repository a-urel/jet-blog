import { describe, expect, it } from "vitest";

import { getConfiguredSiteUrl } from "./site-url";

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
