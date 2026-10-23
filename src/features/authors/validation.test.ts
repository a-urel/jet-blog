import { describe, expect, it } from "vitest";

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
        name: "Ad gerekli.",
        slug: "Slug yalnızca küçük harf, rakam ve tek tire içerebilir.",
        bio: `Biyografi ${authorLimits.bio} karakteri aşamaz.`,
        profileId: "Geçerli bir hesap seçin.",
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
      expect(result.fieldErrors.name).toBe(`Ad ${authorLimits.name} karakteri aşamaz.`);
      expect(result.fieldErrors.slug).toBe(`Slug ${authorLimits.slug} karakteri aşamaz.`);
    }
  });
});
