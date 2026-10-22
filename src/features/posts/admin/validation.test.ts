import { describe, expect, it } from "vitest";

import { validatePostMetadata, type RawPostMetadata } from "./validation";

const authorA = "11111111-1111-4111-8111-111111111111";
const authorB = "22222222-2222-4222-8222-222222222222";
const tagA = "33333333-3333-4333-8333-333333333333";
const category = "55555555-5555-4555-8555-555555555555";

function raw(overrides: Partial<RawPostMetadata> = {}): RawPostMetadata {
  return {
    title: "  Küçük   adımlarla başlamak ",
    slug: "",
    excerpt: "  Kısa bir özet. ",
    categoryId: category,
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

  it("rejects an invalid or empty derived slug", () => {
    const invalid = validatePostMetadata(raw({ slug: "Geçersiz Slug" }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.fieldErrors.slug).toBeTruthy();
    }

    const empty = validatePostMetadata(raw({ title: "!!!", slug: "" }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors.slug).toBeTruthy();
    }
  });

  it("rejects an overlong title and excerpt", () => {
    const longTitle = validatePostMetadata(raw({ title: "a".repeat(201) }));
    expect(longTitle.ok).toBe(false);
    if (!longTitle.ok) {
      expect(longTitle.fieldErrors.title).toBeTruthy();
    }

    const longExcerpt = validatePostMetadata(raw({ excerpt: "a".repeat(501) }));
    expect(longExcerpt.ok).toBe(false);
    if (!longExcerpt.ok) {
      expect(longExcerpt.fieldErrors.excerpt).toBeTruthy();
    }
  });

  it("rejects malformed and duplicate tags", () => {
    const malformed = validatePostMetadata(raw({ tagIds: ["not-a-tag"] }));
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.fieldErrors.tagIds).toBeTruthy();
    }

    const duplicate = validatePostMetadata(raw({ tagIds: [tagA, tagA] }));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.fieldErrors.tagIds).toBeTruthy();
    }
  });

  it("rejects duplicate author credits", () => {
    const duplicate = validatePostMetadata(
      raw({ creditAuthorIds: [authorA, authorA], creditSortOrders: ["0", "1"] }),
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.fieldErrors.credits).toBeTruthy();
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
      expect(nonContiguous.fieldErrors.credits).toBeTruthy();
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
});
