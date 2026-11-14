import { describe, expect, it } from "vitest";

import { arrangeLibraryItems } from "./media-library-dialog";

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
