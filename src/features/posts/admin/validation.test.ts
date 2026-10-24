import { describe, expect, it } from "vitest";

import trMessages from "@/messages/tr/adminPosts.json";

import {
  validatePostMetadata,
  type RawPostMetadata,
} from "./validation";

const authorA = "11111111-1111-4111-8111-111111111111";
const authorB = "22222222-2222-4222-8222-222222222222";
const tagA = "33333333-3333-4333-8333-333333333333";
const category = "55555555-5555-4555-8555-555555555555";
const cover = "66666666-6666-4666-8666-666666666666";

function raw(overrides: Partial<RawPostMetadata> = {}): RawPostMetadata {
  return {
    title: "  Küçük   adımlarla başlamak ",
    slug: "",
    excerpt: "  Kısa bir özet. ",
    categoryId: category,
    language: "en",
    coverMediaId: "",
    coverAlt: "",
    tagIds: [tagA],
    creditAuthorIds: [authorA, authorB],
    creditSortOrders: ["0", "1"],
    ...overrides,
  };
}

describe("validatePostMetadata", () => {
  it("normalizes fields and derives a slug from the title", () => {
    const result = validatePostMetadata(raw());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.title).toBe("Küçük adımlarla başlamak");
    expect(result.data.slug).toBe("kucuk-adimlarla-baslamak");
    expect(result.data.excerpt).toBe("Kısa bir özet.");
    expect(result.data.language).toBe("en");
    expect(result.data.credits).toEqual([
      { authorId: authorA, sortOrder: 0 },
      { authorId: authorB, sortOrder: 1 },
    ]);
  });

  it("accepts an empty excerpt and no category", () => {
    const result = validatePostMetadata(
      raw({ excerpt: "   ", categoryId: "", tagIds: [], creditAuthorIds: [], creditSortOrders: [] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.excerpt).toBeNull();
    expect(result.data.categoryId).toBeNull();
    expect(result.data.credits).toEqual([]);
  });

  it.each(["", "en_US", "xx-", "tr' or '1'='1", "a".repeat(40)])(
    "rejects the invalid language tag %j",
    (language) => {
      const result = validatePostMetadata(raw({ language }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.fieldErrors.language).toBe("languageInvalid");
      }
    },
  );

  it.each([
    ["fr", "fr"],
    ["ja", "ja"],
    ["pt-br", "pt-BR"],
    [" zh-hant ", "zh-Hant"],
    ["iw", "he"],
  ])("accepts the language %j as %j", (language, canonical) => {
    const result = validatePostMetadata(raw({ language }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.language).toBe(canonical);
  });

  it("rejects an invalid or empty derived slug", () => {
    const invalid = validatePostMetadata(raw({ slug: "Geçersiz Slug" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.fieldErrors.slug).toBe("slugInvalid");
    }

    const empty = validatePostMetadata(raw({ title: "!!!", slug: "" }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors.slug).toBe("slugMissing");
    }
  });

  it("rejects an overlong title and excerpt", () => {
    const longTitle = validatePostMetadata(raw({ title: "a".repeat(201) }));
    expect(longTitle.ok).toBe(false);
    if (!longTitle.ok) {
      expect(longTitle.fieldErrors.title).toBe("titleTooLong");
    }

    const longExcerpt = validatePostMetadata(raw({ excerpt: "a".repeat(501) }));
    expect(longExcerpt.ok).toBe(false);
    if (!longExcerpt.ok) {
      expect(longExcerpt.fieldErrors.excerpt).toBe("excerptTooLong");
    }
  });

  it("rejects malformed and duplicate tags", () => {
    const malformed = validatePostMetadata(raw({ tagIds: ["not-a-tag"] }));
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.fieldErrors.tagIds).toBe("tagInvalid");
    }

    const duplicate = validatePostMetadata(raw({ tagIds: [tagA, tagA] }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.fieldErrors.tagIds).toBe("tagDuplicate");
    }
  });

  it("rejects duplicate author credits", () => {
    const duplicate = validatePostMetadata(
      raw({ creditAuthorIds: [authorA, authorA], creditSortOrders: ["0", "1"] }),
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.fieldErrors.credits).toBe("creditDuplicate");
    }
  });

  it("rejects duplicate, out-of-range, and non-contiguous sort orders", () => {
    const duplicate = validatePostMetadata(
      raw({ creditAuthorIds: [authorA, authorB], creditSortOrders: ["1", "1"] }),
    );
    expect(duplicate.ok).toBe(false);

    const outOfRange = validatePostMetadata(
      raw({ creditAuthorIds: [authorA], creditSortOrders: ["1000"] }),
    );
    expect(outOfRange.ok).toBe(false);

    const nonContiguous = validatePostMetadata(
      raw({ creditAuthorIds: [authorA, authorB], creditSortOrders: ["0", "2"] }),
    );
    expect(nonContiguous.ok).toBe(false);
    if (!nonContiguous.ok) {
      expect(nonContiguous.fieldErrors.credits).toBe("creditOrderGap");
    }
  });

  it("rejects mismatched credit arrays and non-numeric order", () => {
    const mismatched = validatePostMetadata(
      raw({ creditAuthorIds: [authorA], creditSortOrders: ["0", "1"] }),
    );
    expect(mismatched.ok).toBe(false);

    const nonNumeric = validatePostMetadata(
      raw({ creditAuthorIds: [authorA], creditSortOrders: ["first"] }),
    );
    expect(nonNumeric.ok).toBe(false);
  });

  it("preserves the form order when sort orders are contiguous", () => {
    const result = validatePostMetadata(
      raw({ creditAuthorIds: [authorB, authorA], creditSortOrders: ["0", "1"] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.credits.map((credit) => credit.authorId)).toEqual([
      authorB,
      authorA,
    ]);
  });

  it("has no cover by default", () => {
    const result = validatePostMetadata(raw());

    expect(result.ok && result.data.coverMediaId).toBeNull();
    expect(result.ok && result.data.coverAlt).toBeNull();
  });

  it("keeps a cover with trimmed alt text", () => {
    const result = validatePostMetadata(
      raw({ coverMediaId: ` ${cover.toUpperCase()} `, coverAlt: "  Sisli bir vadi " }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.coverMediaId).toBe(cover);
    expect(result.data.coverAlt).toBe("Sisli bir vadi");
  });

  it("allows a draft cover without alt text", () => {
    const result = validatePostMetadata(raw({ coverMediaId: cover, coverAlt: "   " }));

    expect(result.ok && result.data.coverAlt).toBeNull();
  });

  it("drops alt text when no cover is selected", () => {
    const result = validatePostMetadata(raw({ coverAlt: "Kapak yok" }));

    expect(result.ok && result.data.coverAlt).toBeNull();
  });

  it.each(["not-a-uuid", "javascript:alert(1)", "../media/x"])(
    "rejects the cover reference %s",
    (coverMediaId) => {
      const result = validatePostMetadata(raw({ coverMediaId }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.fieldErrors.coverMediaId).toBe("coverInvalid");
    },
  );

  it.each([
    ["too long", "a".repeat(301)],
    ["with a control character", "Satır\nsonu"],
  ])("rejects cover alt text %s", (_label, coverAlt) => {
    const result = validatePostMetadata(raw({ coverMediaId: cover, coverAlt: `x${coverAlt}x` }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.coverAlt).toBe("coverAltTooLong");
  });

  it("counts cover alt length in code points like the database", () => {
    const result = validatePostMetadata(raw({ coverMediaId: cover, coverAlt: "😀".repeat(300) }));

    expect(result.ok).toBe(true);
  });

  it("returns keys that exist in the Turkish catalog", () => {
    const result = validatePostMetadata(
      raw({ title: "", language: "", creditSortOrders: ["0", "0"], creditAuthorIds: [authorA, authorB] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const messages: Record<string, string> = trMessages.validation;
    for (const key of Object.values(result.fieldErrors)) {
      expect(messages[key]).toBeTruthy();
    }
    expect(messages[result.fieldErrors.title!]).toBe("Başlık gerekli.");
    expect(messages.creditOrderGap).toBe("Yazar sıraları 0''dan başlayıp kesintisiz olmalı.");
  });
});
