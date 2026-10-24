import { describe, expect, it } from "vitest";

import { createTranslator } from "next-intl";

import trAuthors from "@/messages/tr/adminAuthors.json";
import { authorLimits, validateAuthorInput } from "./validation";

const profileId = "11111111-1111-4111-8111-111111111111";

describe("validateAuthorInput", () => {
  it("normalizes the name and generates a Turkish-aware slug", () => {
    const result = validateAuthorInput({
      name: "  Deniz   Örnek ",
      slug: "",
      bio: "  Kısa biyografi.  ",
      profileId,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        name: "Deniz Örnek",
        slug: "deniz-ornek",
        bio: "Kısa biyografi.",
        profileId,
      },
    });
  });

  it("treats an empty bio and account as a guest author without bio", () => {
    const result = validateAuthorInput({
      name: "Misafir Yazar",
      slug: "misafir",
      bio: " ",
      profileId: "",
    });

    expect(result).toEqual({
      ok: true,
      data: { name: "Misafir Yazar", slug: "misafir", bio: null, profileId: null },
    });
  });

  it("rejects invalid fields", () => {
    const result = validateAuthorInput({
      name: " ",
      slug: "Bad Slug",
      bio: "a".repeat(authorLimits.bio + 1),
      profileId: "not-a-uuid",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: { key: "nameRequired" },
        slug: { key: "slugInvalid" },
        bio: { key: "bioTooLong", values: { max: authorLimits.bio } },
        profileId: { key: "profileInvalid" },
      },
    });
  });

  it("rejects a name or slug over the limit", () => {
    const result = validateAuthorInput({
      name: "a".repeat(authorLimits.name + 1),
      slug: "b".repeat(authorLimits.slug + 1),
      bio: "",
      profileId: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.name).toEqual({
        key: "nameTooLong",
        values: { max: authorLimits.name },
      });
      expect(result.fieldErrors.slug).toEqual({
        key: "slugTooLong",
        values: { max: authorLimits.slug },
      });
    }
  });

  it("renders the Turkish source wording", () => {
    const t = createTranslator({ locale: "tr", messages: { validation: trAuthors.validation } });
    const result = validateAuthorInput({
      name: "",
      slug: "",
      bio: "a".repeat(authorLimits.bio + 1),
      profileId: "",
    });
    if (result.ok) throw new Error("expected errors");

    expect(t(`validation.${result.fieldErrors.name!.key}`)).toBe("Ad gerekli.");
    expect(t(`validation.${result.fieldErrors.slug!.key}`)).toBe("Slug üretilemedi; elle girin.");
    expect(
      t(`validation.${result.fieldErrors.bio!.key}`, result.fieldErrors.bio!.values),
    ).toBe("Biyografi 2000 karakteri aşamaz.");
  });
});
