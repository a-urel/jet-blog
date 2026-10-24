import { describe, expect, it } from "vitest";

import { createTranslator } from "next-intl";

import trTaxonomy from "@/messages/tr/adminTaxonomy.json";

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

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: { key: "nameRequired" },
        slug: { key: "slugInvalid" },
        description: { key: "descriptionTooLong", values: { max: 1000 } },
        parentId: { key: "parentInvalid" },
        sortOrder: { key: "sortOrderInvalid", values: { min: 0, max: 1000 } },
      },
    });
  });

  it("enforces the category length limits", () => {
    expect(validateCategoryInput({ name: "a".repeat(120), slug: "", description: "" }).ok).toBe(true);
    expect(validateCategoryInput({ name: "a".repeat(121), slug: "a", description: "" })).toEqual({
      ok: false,
      fieldErrors: { name: { key: "nameTooLong", values: { max: 120 } } },
    });
    expect(validateCategoryInput({ name: "a", slug: "a".repeat(121), description: "" }).ok).toBe(false);
    expect(validateCategoryInput({ name: "a", slug: "", description: "", sortOrder: "1001" }).ok).toBe(false);
  });
});

describe("validateTagInput", () => {
  it("uses the shorter tag limits", () => {
    expect(validateTagInput({ name: "a".repeat(80), slug: "", description: "" }).ok).toBe(true);
    expect(validateTagInput({ name: "a".repeat(81), slug: "a", description: "" })).toEqual({
      ok: false,
      fieldErrors: { name: { key: "nameTooLong", values: { max: 80 } } },
    });
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
    expect(result).toEqual({ ok: false, fieldErrors: { slug: { key: "slugUnavailable" } } });
  });
});

describe("taxonomy validation messages", () => {
  const t = createTranslator({ locale: "tr", messages: { validation: trTaxonomy.validation } });

  it("renders the Turkish source wording", () => {
    const result = validateCategoryInput({
      name: "a".repeat(121),
      slug: "",
      description: "x".repeat(1001),
      sortOrder: "-1",
    });
    if (result.ok) throw new Error("expected errors");

    const text = (issue: { key: keyof typeof trTaxonomy.validation; values?: object }) =>
      t(`validation.${issue.key}`, issue.values as Record<string, number>);

    expect(text(result.fieldErrors.name!)).toBe("Ad 120 karakteri aşamaz.");
    expect(text(result.fieldErrors.description!)).toBe("Açıklama 1000 karakteri aşamaz.");
    expect(text(result.fieldErrors.sortOrder!)).toBe(
      "Sıra 0 ile 1000 arasında bir tam sayı olmalı.",
    );
  });
});
