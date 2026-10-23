import { describe, expect, it } from "vitest";

import { isPostLanguage, openGraphLocale, postLanguageLabels, postLanguages } from "./language";

describe("post languages", () => {
  it("accepts only the supported primary language subtags", () => {
    for (const language of postLanguages) expect(isPostLanguage(language)).toBe(true);

    for (const value of ["", "fr", "EN", "tr-TR", null, undefined, 1]) {
      expect(isPostLanguage(value)).toBe(false);
    }
  });

  it("has a label and an Open Graph locale for every language", () => {
    expect(postLanguages.map((language) => postLanguageLabels[language])).toEqual([
      "Türkçe",
      "İngilizce",
      "Almanca",
    ]);
    expect(postLanguages.map(openGraphLocale)).toEqual(["tr_TR", "en_US", "de_DE"]);
  });
});
