import { describe, expect, it } from "vitest";

import type { PostLanguage } from "@/features/posts/language";
import {
  maxSearchPage,
  parseHighlight,
  parseSearchLanguage,
  parseSearchPage,
  parseSearchQuery,
  searchOffset,
  searchPageCount,
  searchUrl,
} from "./query";

describe("parseSearchQuery", () => {
  it("classifies empty, short, long, and valid input", () => {
    expect(parseSearchQuery(undefined)).toEqual({ kind: "empty" });
    expect(parseSearchQuery("   ")).toEqual({ kind: "empty" });
    expect(parseSearchQuery("a")).toEqual({ kind: "too-short", query: "a" });
    expect(parseSearchQuery("ab")).toEqual({ kind: "query", query: "ab" });
    expect(parseSearchQuery("a".repeat(201))).toEqual({ kind: "too-long", query: "a".repeat(201) });
  });

  it("counts code points like char_length, not UTF-16 units", () => {
    expect(parseSearchQuery("ğ".repeat(200)).kind).toBe("query");
    expect(parseSearchQuery("😀".repeat(200)).kind).toBe("query");
    expect(parseSearchQuery("😀").kind).toBe("too-short");
  });

  it("collapses whitespace and control characters, including highlight markers", () => {
    expect(parseSearchQuery("  küçük \n\t adım  ")).toEqual({ kind: "query", query: "küçük adım" });
    expect(parseSearchQuery("a\u0002b\u0003c")).toEqual({ kind: "query", query: "a b c" });
  });

  it("uses the first value of a repeated parameter", () => {
    expect(parseSearchQuery(["ilk", "ikinci"])).toEqual({ kind: "query", query: "ilk" });
  });

  it("keeps query syntax and markup as text for the database to parse", () => {
    expect(parseSearchQuery(`"küçük adım" -taslak or <b>x</b>'); --`)).toEqual({
      kind: "query",
      query: `"küçük adım" -taslak or <b>x</b>'); --`,
    });
  });
});

describe("parseSearchLanguage", () => {
  it("accepts canonical post language tags only", () => {
    expect(parseSearchLanguage("de")).toBe("de");
    expect(parseSearchLanguage("fr")).toBe("fr");
    expect(parseSearchLanguage("pt-BR")).toBe("pt-BR");
    expect(parseSearchLanguage("pt-br")).toBeNull();
    expect(parseSearchLanguage("en_US")).toBeNull();
    expect(parseSearchLanguage("")).toBeNull();
    expect(parseSearchLanguage(undefined)).toBeNull();
  });
});

describe("parseSearchPage", () => {
  it("defaults to page 1 and rejects non-canonical or too-deep pages", () => {
    expect(parseSearchPage(undefined)).toBe(1);
    expect(parseSearchPage("3")).toBe(3);
    expect(parseSearchPage(String(maxSearchPage))).toBe(maxSearchPage);
    expect(parseSearchPage(String(maxSearchPage + 1))).toBeNull();
    for (const value of ["0", "02", "-1", "1.5", "abc", ""]) {
      expect(parseSearchPage(value)).toBeNull();
    }
  });

  it("keeps the deepest page within the database offset cap", () => {
    expect(searchOffset(maxSearchPage)).toBe(1000);
  });

  it("counts pages", () => {
    expect(searchPageCount(0)).toBe(1);
    expect(searchPageCount(10)).toBe(1);
    expect(searchPageCount(11)).toBe(2);
  });
});

describe("searchUrl", () => {
  it("encodes the query and omits defaults", () => {
    expect(searchUrl("küçük adım")).toBe("/search?q=k%C3%BC%C3%A7%C3%BCk+ad%C4%B1m");
    expect(searchUrl("a&b", { page: 1, language: null })).toBe("/search?q=a%26b");
    expect(searchUrl("x", { page: 3, language: "en" as PostLanguage })).toBe("/search?q=x&language=en&page=3");
  });
});

describe("parseHighlight", () => {
  it("splits marked and plain text", () => {
    expect(parseHighlight("Bir \u0002küçük\u0003 adım")).toEqual([
      { text: "Bir ", match: false },
      { text: "küçük", match: true },
      { text: " adım", match: false },
    ]);
  });

  it("returns markup as plain text segments", () => {
    expect(parseHighlight("<img src=x onerror=alert(1)> \u0002x\u0003")).toEqual([
      { text: "<img src=x onerror=alert(1)> ", match: false },
      { text: "x", match: true },
    ]);
  });

  it("reads nested markers (a word matched twice) as one highlight", () => {
    expect(parseHighlight("\u0002\u0002Küçük\u0003\u0003 adım")).toEqual([
      { text: "Küçük", match: true },
      { text: " adım", match: false },
    ]);
  });

  it("ignores stray and unbalanced markers", () => {
    expect(parseHighlight("a\u0003b\u0002\u0002c\u0003\u0003d\u0002e")).toEqual([
      { text: "ab", match: false },
      { text: "c", match: true },
      { text: "de", match: false },
    ]);
    expect(parseHighlight("")).toEqual([]);
    expect(parseHighlight(null)).toEqual([]);
  });
});
