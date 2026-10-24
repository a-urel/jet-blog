import { describe, expect, it } from "vitest";

import {
  publicationConfirmation,
  publicationErrorKey,
  publicationErrorMessage,
  publicationErrorMessages,
} from "./publication";

describe("publicationErrorKey", () => {
  it("maps RPC error codes to page error keys", () => {
    expect(publicationErrorKey({ code: "42501" })).toBe("forbidden");
    expect(publicationErrorKey({ code: "40001" })).toBe("conflict");
    expect(publicationErrorKey({ code: "23514" })).toBe("category");
    expect(publicationErrorKey({ code: "55000" })).toBe("state");
    expect(publicationErrorKey({ code: "P0002" })).toBe("missing");
    expect(publicationErrorKey({ code: "PT429" })).toBe("rate-limited");
  });

  it("separates body errors from other invalid input", () => {
    expect(
      publicationErrorKey({ code: "22023", message: "Invalid post body: Unknown node" }),
    ).toBe("body");
    expect(
      publicationErrorKey({ code: "22023", message: "Unsupported content version" }),
    ).toBe("body");
    expect(
      publicationErrorKey({ code: "22023", message: "Expected revision is required" }),
    ).toBe("failed");
  });

  it("separates the cover alt rule from the category rule", () => {
    expect(
      publicationErrorKey({ code: "23514", message: "Cover alt text is required to publish" }),
    ).toBe("cover");
    expect(
      publicationErrorKey({ code: "23514", message: "Published post requires a category" }),
    ).toBe("category");
    expect(publicationErrorKey({ code: "22023", message: "Unknown cover media" })).toBe("cover");
  });

  it("falls back for unknown errors", () => {
    expect(publicationErrorKey(null)).toBe("failed");
    expect(publicationErrorKey({ code: "XX000" })).toBe("failed");
  });
});

describe("publicationErrorMessage", () => {
  it("returns copy only for known keys", () => {
    expect(publicationErrorMessage("category")).toBe(publicationErrorMessages.category);
    expect(publicationErrorMessage("toString")).toBeNull();
    expect(publicationErrorMessage(["category"])).toBeNull();
    expect(publicationErrorMessage(undefined)).toBeNull();
  });
});

describe("publicationConfirmation", () => {
  it("asks before publishing a draft and names the post", () => {
    const copy = publicationConfirmation(false, "İlk yazı");

    expect(copy.trigger).toBe("Yayınla");
    expect(copy.confirm).toBe("Yayınla");
    expect(copy.title).toBe("Yazı yayınlansın mı?");
    expect(copy.description).toContain("“İlk yazı”");
    expect(copy.description).toContain("Kaydedilmemiş değişiklikler");
  });

  it("asks before unpublishing a published post", () => {
    const copy = publicationConfirmation(true, "İlk yazı");

    expect(copy.trigger).toBe("Yayından kaldır");
    expect(copy.title).toBe("Yazı yayından kaldırılsın mı?");
    expect(copy.description).toContain("taslağa döner");
  });
});
