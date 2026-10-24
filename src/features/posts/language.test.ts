import { describe, expect, it } from "vitest";

import {
  canonicalizePostLanguage,
  commonPostLanguages,
  defaultPostLanguage,
  isPostLanguage,
  maxPostLanguageLength,
  openGraphLocale,
  postLanguageLabel,
  postLanguageName,
  postLanguagePattern,
  type PostLanguage,
} from "./language";
import {
  canonicalLanguageFixtures,
  canonicalizedLanguageFixtures,
  invalidLanguageFixtures,
} from "./language-fixtures";
import { interfaceLocales } from "@/lib/interface-locales";

const tag = (value: string) => value as PostLanguage;

describe("post language tags", () => {
  for (const value of canonicalLanguageFixtures) {
    it(`accepts canonical ${JSON.stringify(value)} unchanged`, () => {
      expect(canonicalizePostLanguage(value)).toBe(value);
      expect(isPostLanguage(value)).toBe(true);
      expect(postLanguagePattern.test(value)).toBe(true);
    });
  }

  for (const { input, canonical } of canonicalizedLanguageFixtures) {
    it(`canonicalizes ${JSON.stringify(input)} to ${canonical}`, () => {
      expect(canonicalizePostLanguage(input)).toBe(canonical);
      expect(isPostLanguage(input)).toBe(false);
      expect(isPostLanguage(canonical)).toBe(true);
    });
  }

  for (const value of invalidLanguageFixtures) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      expect(canonicalizePostLanguage(value)).toBeNull();
      expect(isPostLanguage(value)).toBe(false);
    });
  }

  it("rejects non-string values", () => {
    for (const value of [null, undefined, 1, {}, ["en"]]) {
      expect(canonicalizePostLanguage(value)).toBeNull();
      expect(isPostLanguage(value)).toBe(false);
    }
  });

  it("never returns a tag longer than the database allows", () => {
    for (const value of [...canonicalLanguageFixtures, ...canonicalizedLanguageFixtures.map((f) => f.input)]) {
      expect(canonicalizePostLanguage(value)!.length).toBeLessThanOrEqual(maxPostLanguageLength);
    }
    expect("zh-Hant-419".length).toBeLessThanOrEqual(maxPostLanguageLength);
    expect(isPostLanguage("fil-Latn-419")).toBe(true);
    expect("fil-Latn-419".length).toBe(maxPostLanguageLength);
  });

  it("keeps the default and every common language canonical and unique", () => {
    expect(isPostLanguage(defaultPostLanguage)).toBe(true);
    for (const language of commonPostLanguages) expect(isPostLanguage(language), language).toBe(true);
    expect(new Set(commonPostLanguages).size).toBe(commonPostLanguages.length);
  });
});

describe("post language names", () => {
  it("names languages in Turkish by default", () => {
    expect(postLanguageName(tag("fr"))).toBe("Fransızca");
    expect(postLanguageName(tag("tr"))).toBe("Türkçe");
    expect(postLanguageName(tag("pt-BR"))).toBe("Brezilya Portekizcesi");
  });

  it("names languages in another interface locale", () => {
    expect(postLanguageName(tag("fr"), "en")).toBe("French");
    expect(postLanguageName(tag("fr"), "de")).toBe("Französisch");
  });

  it("returns null for a valid tag without a name", () => {
    expect(postLanguageName(tag("xyz"))).toBeNull();
  });

  it("keeps the code visible in labels", () => {
    expect(postLanguageLabel(tag("fr"))).toBe("Fransızca (fr)");
    expect(postLanguageLabel(tag("xyz"))).toBe("xyz");
  });

  it("has a name for every common language", () => {
    for (const language of commonPostLanguages) {
      expect(postLanguageName(language), language).not.toBeNull();
    }
  });
});

describe("Open Graph locale", () => {
  it("derives language_TERRITORY from likely subtags", () => {
    expect(openGraphLocale(tag("tr"))).toBe("tr_TR");
    expect(openGraphLocale(tag("en"))).toBe("en_US");
    expect(openGraphLocale(tag("de"))).toBe("de_DE");
    expect(openGraphLocale(tag("fr"))).toBe("fr_FR");
    expect(openGraphLocale(tag("ja"))).toBe("ja_JP");
    expect(openGraphLocale(tag("pt-BR"))).toBe("pt_BR");
    expect(openGraphLocale(tag("zh-Hant"))).toBe("zh_TW");
  });

  it("retries a numeric region with the language alone", () => {
    expect(openGraphLocale(tag("es-419"))).toBe("es_ES");
  });

  it("returns null when no territory is known", () => {
    expect(openGraphLocale(tag("xyz"))).toBeNull();
    expect(openGraphLocale(tag("qaa"))).toBeNull();
  });
});

describe("interface locales", () => {
  it("stay a separate, small set of canonical tags", () => {
    expect(interfaceLocales).toEqual(["tr", "en", "de"]);
    for (const locale of interfaceLocales) expect(isPostLanguage(locale)).toBe(true);
  });
});
