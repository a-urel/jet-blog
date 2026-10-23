import { describe, expect, it } from "vitest";

import { buildShareLinks } from "./share-links";

describe("buildShareLinks", () => {
  const links = buildShareLinks({
    url: "https://example.test/posts/ornek-yazi",
    title: "Ölçü & denge?",
  });

  it("builds provider links that carry only the encoded URL and title", () => {
    expect(links.map((link) => link.provider)).toEqual([
      "x",
      "facebook",
      "linkedin",
      "whatsapp",
      "email",
    ]);
    for (const link of links) {
      expect(link.href).toContain(encodeURIComponent("https://example.test/posts/ornek-yazi"));
      expect(link.href).not.toContain("Ölçü & denge?");
    }
  });

  it("uses HTTPS provider endpoints or mailto", () => {
    for (const link of links) {
      const { protocol } = new URL(link.href);
      expect(["https:", "mailto:"]).toContain(protocol);
    }
    expect(new URL(links[0].href).searchParams.get("text")).toBe("Ölçü & denge?");
  });
});
