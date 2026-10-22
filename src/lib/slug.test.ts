import { describe, expect, it } from "vitest";

import { isValidSlug, maxSlugLength, normalizeName, slugify } from "./slug";

describe("normalizeName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeName("  Birlikte   üretmek  ")).toBe("Birlikte üretmek");
  });

  it("keeps a single-word name unchanged", () => {
    expect(normalizeName("Üretim")).toBe("Üretim");
  });
});

describe("isValidSlug", () => {
  it("accepts lower-case kebab-case", () => {
    expect(isValidSlug("birlikte-uretmek")).toBe(true);
    expect(isValidSlug("2026")).toBe(true);
  });

  it("rejects uppercase, spaces, and edge dashes", () => {
    expect(isValidSlug("Birlikte")).toBe(false);
    expect(isValidSlug("birlikte uretmek")).toBe(false);
    expect(isValidSlug("-birlikte-")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("slugify", () => {
  it("transliterates Turkish characters", () => {
    expect(slugify("İyi bir başlangıç")).toBe("iyi-bir-baslangic");
    expect(slugify("Çığır açan öğün")).toBe("cigir-acan-ogun");
  });

  it("handles dotless and dotted i", () => {
    expect(slugify("ısı")).toBe("isi");
    expect(slugify("IŞIK")).toBe("isik");
  });

  it("collapses punctuation and whitespace", () => {
    expect(slugify("  A &  B -- C  ")).toBe("a-b-c");
  });

  it("strips combining marks from decomposed input", () => {
    expect(slugify("cafe\u0301")).toBe("cafe");
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("truncates without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(60) + " " + "b".repeat(60) + " c", 120);

    expect(slug.length).toBeLessThanOrEqual(maxSlugLength);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("always returns a valid slug for valid input", () => {
    expect(isValidSlug(slugify("Okumaya alan açan bir arayüz"))).toBe(true);
  });
});
