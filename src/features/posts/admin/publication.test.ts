import { describe, expect, it } from "vitest";

import trMessages from "@/messages/tr/adminPosts.json";

import {
  availablePublicationActions,
  publicationErrorKey,
  publicationErrorMessageKey,
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

describe("publicationErrorMessageKey", () => {
  it("returns a catalog key only for known error keys", () => {
    expect(publicationErrorMessageKey("category")).toBe("category");
    expect(publicationErrorMessageKey("rate-limited")).toBe("rateLimited");
    expect(publicationErrorMessageKey("toString")).toBeNull();
    expect(publicationErrorMessageKey(["category"])).toBeNull();
    expect(publicationErrorMessageKey(undefined)).toBeNull();
  });

  it("has catalog copy for every key", () => {
    const errors = trMessages.publication.errors as Record<string, string>;

    for (const key of [
      "forbidden",
      "conflict",
      "category",
      "cover",
      "body",
      "state",
      "missing",
      "rate-limited",
      "failed",
    ]) {
      const messageKey = publicationErrorMessageKey(key);
      expect(messageKey).not.toBeNull();
      expect(errors[messageKey!]).toBeTruthy();
    }

    expect(errors.category).toBe("Yayınlamak için önce bir kategori seçip kaydedin.");
  });
});

describe("availablePublicationActions", () => {
  const editor = { canPublish: true, canDiscard: true };
  const ownAuthor = { canPublish: false, canDiscard: true };

  it("offers publishing a draft to editors only", () => {
    expect(
      availablePublicationActions({ published: false, hasUnpublishedChanges: false, ...editor }),
    ).toEqual(["publish"]);
    expect(
      availablePublicationActions({ published: false, hasUnpublishedChanges: false, ...ownAuthor }),
    ).toEqual([]);
    expect(trMessages.publication.publish.title).toBe("Yazı yayınlansın mı?");
  });

  it("offers republish and discard only while a published post has unpublished changes", () => {
    expect(
      availablePublicationActions({ published: true, hasUnpublishedChanges: true, ...editor }),
    ).toEqual(["republish", "discard", "unpublish"]);
    expect(
      availablePublicationActions({ published: true, hasUnpublishedChanges: false, ...editor }),
    ).toEqual(["unpublish"]);
    expect(trMessages.publication.unpublish.trigger).toBe("Yayından kaldır");
  });

  it("never offers an author republish or unpublish, only discarding own changes", () => {
    expect(
      availablePublicationActions({ published: true, hasUnpublishedChanges: true, ...ownAuthor }),
    ).toEqual(["discard"]);
    expect(
      availablePublicationActions({
        published: true,
        hasUnpublishedChanges: true,
        canPublish: false,
        canDiscard: false,
      }),
    ).toEqual([]);
  });

  it("has confirmation copy for every action", () => {
    for (const action of ["publish", "unpublish", "republish", "discard"] as const) {
      const group = trMessages.publication[action];
      expect(Object.keys(group).sort()).toEqual(["confirm", "description", "title", "trigger"]);
    }
  });
});
