import { describe, expect, it } from "vitest";

import { collectCategoryAncestry, collectCategorySubtree } from "./hierarchy";

const tree = [
  { id: "root", parentId: null },
  { id: "child", parentId: "root" },
  { id: "grandchild", parentId: "child" },
  { id: "sibling", parentId: "root" },
  { id: "other", parentId: null },
];

describe("collectCategorySubtree", () => {
  it("includes the category and every descendant", () => {
    expect(collectCategorySubtree(tree, "root").sort()).toEqual(
      ["child", "grandchild", "root", "sibling"],
    );
    expect(collectCategorySubtree(tree, "child")).toEqual(["child", "grandchild"]);
    expect(collectCategorySubtree(tree, "other")).toEqual(["other"]);
  });

  it("terminates on a corrupted cycle", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(collectCategorySubtree(cyclic, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("collectCategoryAncestry", () => {
  it("walks from the category to the root", () => {
    expect(collectCategoryAncestry(tree, "grandchild")).toEqual(["grandchild", "child", "root"]);
    expect(collectCategoryAncestry(tree, "missing")).toEqual([]);
  });

  it("terminates on a corrupted cycle", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(collectCategoryAncestry(cyclic, "a")).toEqual(["a", "b"]);
  });
});
