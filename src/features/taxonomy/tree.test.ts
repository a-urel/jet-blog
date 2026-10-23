import { describe, expect, it } from "vitest";

import { flattenCategoryTree, parentOptions } from "./tree";

const categories = [
  { id: "b", parentId: null },
  { id: "a", parentId: null },
  { id: "a1", parentId: "a" },
  { id: "a1x", parentId: "a1" },
  { id: "orphan", parentId: "missing" },
];

describe("flattenCategoryTree", () => {
  it("lists parents before children with depth", () => {
    expect(flattenCategoryTree(categories).map(({ id, depth }) => `${id}:${depth}`)).toEqual([
      "b:0",
      "a:0",
      "a1:1",
      "a1x:2",
      "orphan:0",
    ]);
  });
});

describe("parentOptions", () => {
  it("excludes the category and its descendants", () => {
    expect(parentOptions(categories, "a").map(({ id }) => id)).toEqual(["b", "orphan"]);
    expect(parentOptions(categories, "a1x").map(({ id }) => id)).toEqual([
      "b",
      "a",
      "a1",
      "orphan",
    ]);
  });

  it("offers every category for a new one", () => {
    expect(parentOptions(categories, null)).toHaveLength(5);
  });
});
