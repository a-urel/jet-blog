import { describe, expect, it } from "vitest";

import { arrangeLibraryItems, foldMediaSearchText, matchesMediaQuery } from "./media-library-dialog";

const items = [
  { id: "a", width: 627, height: 158 },
  { id: "b", width: 512, height: 512 },
  { id: "c", width: 1600, height: 1200 },
  { id: "d", width: 1200, height: 1600 },
];

describe("arrangeLibraryItems", () => {
  it("keeps the library order for newest first and numbers positions from 1", () => {
    const entries = arrangeLibraryItems(items, "newest");

    expect(entries.map((entry) => entry.item.id)).toEqual(["a", "b", "c", "d"]);
    expect(entries.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(entries.every((entry) => entry.problem === null)).toBe(true);
  });

  it("sorts by pixel area for largest first, stable between equal areas", () => {
    const entries = arrangeLibraryItems(items, "largest");

    expect(entries.map((entry) => entry.item.id)).toEqual(["c", "d", "b", "a"]);
    // Positions still refer to the library order.
    expect(entries.map((entry) => entry.position)).toEqual([3, 4, 2, 1]);
  });

  it("marks images the field cannot use with the validator's reason", () => {
    const square = (size: { width: number; height: number }) =>
      size.width === size.height ? null : "Must be square";

    const entries = arrangeLibraryItems(items, "newest", square);

    expect(entries.map((entry) => entry.problem)).toEqual([
      "Must be square",
      null,
      "Must be square",
      "Must be square",
    ]);
  });
});

describe("file name search", () => {
  it("folds case, accents, Turkish i, and separators", () => {
    expect(foldMediaSearchText("Örnek-Blog_LOGO.Açık.png")).toBe("ornek blog logo acik png");
    expect(foldMediaSearchText("İSTANBUL ışık")).toBe("istanbul isik");
  });

  it.each([
    ["sete", true],
    ["Sète", true],
    ["gray sea", true],
    ["sea gray", true],
    ["mediterranean-sea", true],
    ["1857", true],
    ["bridge", false],
    ["", true],
    ["   ", true],
  ])("matches %j against le-gray-mediterranean-sea-sete-1857.jpg: %s", (query, expected) => {
    expect(matchesMediaQuery("le-gray-mediterranean-sea-sete-1857.jpg", query)).toBe(expected);
  });

  it("matches unnamed images only for an empty query", () => {
    expect(matchesMediaQuery(null, "")).toBe(true);
    expect(matchesMediaQuery(null, "logo")).toBe(false);
  });

  it("filters before sorting and keeps library positions", () => {
    const named = [
      { id: "a", width: 627, height: 158, originalName: "ornek-blog-logo-acik.png" },
      { id: "b", width: 512, height: 512, originalName: "ornek-blog-simge.png" },
      { id: "c", width: 1600, height: 1200, originalName: "watkins-geyser-road-1870.jpg" },
      { id: "d", width: 900, height: 900, originalName: null },
    ];

    const entries = arrangeLibraryItems(named, "largest", undefined, "örnek blog");

    expect(entries.map((entry) => entry.item.id)).toEqual(["b", "a"]);
    expect(entries.map((entry) => entry.position)).toEqual([2, 1]);
  });
});
