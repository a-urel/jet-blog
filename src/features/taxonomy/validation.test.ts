import { describe, expect, it } from "vitest";

import { validateCategoryInput, validateTagInput } from "./validation";

const parentId = "11111111-1111-4111-8111-111111111111";

describe("validateCategoryInput", () => {
  it("normalizes the name and generates a Turkish-aware slug", () => {
    const result = validateCategoryInput({
      name: "  Yazılım   Günlüğü ",
      slug: "",
      description: "  Notlar  ",
      parentId,
      sortOrder: "3",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        name: "Yazılım Günlüğü",
        slug: "yazilim-gunlugu",
        description: "Notlar",
        parentId,
        sortOrder: 3,
      },
    });
  });

  it("treats empty optional fields as null and zero", () => {
    const result = validateCategoryInput({ name: "Tasarım", slug: "tasarim", description: "" });
    expect(result).toEqual({
      ok: true,
      data: { name: "Tasarım", slug: "tasarim", description: null, parentId: null, sortOrder: 0 },
    });
  });

  it("rejects invalid fields", () => {
    const result = validateCategoryInput({
      name: " ",
      slug: "Bad Slug",
      description: "x".repeat(1001),
      parentId: "not-a-uuid",
      sortOrder: "1.5",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(
      ["description", "name", "parentId", "slug", "sortOrder"],
    );
  });

  it("enforces the category length limits", () => {
    expect(validateCategoryInput({ name: "a".repeat(120), slug: "", description: "" }).ok).toBe(true);
    expect(validateCategoryInput({ name: "a".repeat(121), slug: "a", description: "" }).ok).toBe(false);
    expect(validateCategoryInput({ name: "a", slug: "a".repeat(121), description: "" }).ok).toBe(false);
    expect(validateCategoryInput({ name: "a", slug: "", description: "", sortOrder: "1001" }).ok).toBe(false);
  });
});

describe("validateTagInput", () => {
  it("uses the shorter tag limits", () => {
    expect(validateTagInput({ name: "a".repeat(80), slug: "", description: "" }).ok).toBe(true);
    expect(validateTagInput({ name: "a".repeat(81), slug: "a", description: "" }).ok).toBe(false);
    expect(validateTagInput({ name: "a", slug: "a".repeat(81), description: "" }).ok).toBe(false);
  });

  it("generates a slug from the name", () => {
    expect(validateTagInput({ name: "Erişilebilirlik", slug: "", description: "" })).toEqual({
      ok: true,
      data: { name: "Erişilebilirlik", slug: "erisilebilirlik", description: null },
    });
  });

  it("rejects a name that cannot produce a slug", () => {
    const result = validateTagInput({ name: "!!!", slug: "", description: "" });
    expect(result).toEqual({ ok: false, fieldErrors: { slug: "Slug üretilemedi; elle girin." } });
  });
});
