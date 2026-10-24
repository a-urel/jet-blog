import { describe, expect, it } from "vitest";

import {
  defaultInterfaceLocale,
  interfaceLocaleNames,
  interfaceLocales,
  interfaceOpenGraphLocales,
  isInterfaceLocale,
  negotiateInterfaceLocale,
  resolveInterfaceLocale,
} from "./interface-locales";

describe("interface locales", () => {
  it("supports tr, en, and de with tr as the default", () => {
    expect(interfaceLocales).toEqual(["tr", "en", "de"]);
    expect(defaultInterfaceLocale).toBe("tr");
  });

  it("names and maps every locale", () => {
    for (const locale of interfaceLocales) {
      expect(interfaceLocaleNames[locale]).toBeTruthy();
      expect(interfaceOpenGraphLocales[locale]).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it("accepts only the exact supported values", () => {
    expect(isInterfaceLocale("en")).toBe(true);
    for (const value of ["EN", "en-US", "fr", "", " tr", null, undefined, 1]) {
      expect(isInterfaceLocale(value)).toBe(false);
    }
  });
});

describe("negotiateInterfaceLocale", () => {
  it("picks the highest-quality supported language", () => {
    expect(negotiateInterfaceLocale("fr-FR,fr;q=0.9,de;q=0.8,en;q=0.7")).toBe("de");
    expect(negotiateInterfaceLocale("en;q=0.5, de;q=0.9")).toBe("de");
  });

  it("matches a regional range by its primary subtag", () => {
    expect(negotiateInterfaceLocale("de-AT")).toBe("de");
    expect(negotiateInterfaceLocale("EN-gb")).toBe("en");
  });

  it("keeps header order between equal qualities", () => {
    expect(negotiateInterfaceLocale("en, tr")).toBe("en");
    expect(negotiateInterfaceLocale("tr;q=0.8, en;q=0.8")).toBe("tr");
  });

  it("skips q=0, wildcards, and malformed entries", () => {
    expect(negotiateInterfaceLocale("en;q=0, de")).toBe("de");
    expect(negotiateInterfaceLocale("*")).toBeNull();
    expect(negotiateInterfaceLocale("en;q=abc, ;;, de;q=2")).toBeNull();
    expect(negotiateInterfaceLocale("<script>, en")).toBe("en");
  });

  it("returns null without a supported language", () => {
    expect(negotiateInterfaceLocale("fr, es;q=0.5")).toBeNull();
    expect(negotiateInterfaceLocale("")).toBeNull();
    expect(negotiateInterfaceLocale(null)).toBeNull();
  });
});

describe("resolveInterfaceLocale", () => {
  it("prefers a valid cookie over Accept-Language", () => {
    expect(resolveInterfaceLocale("de", "en")).toBe("de");
  });

  it("falls back to Accept-Language for a missing or invalid cookie", () => {
    expect(resolveInterfaceLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(resolveInterfaceLocale("fr", "de")).toBe("de");
    expect(resolveInterfaceLocale("../../etc", "en")).toBe("en");
  });

  it("falls back to the default when nothing matches", () => {
    expect(resolveInterfaceLocale("xx", "fr")).toBe("tr");
    expect(resolveInterfaceLocale(null, null)).toBe("tr");
  });
});
