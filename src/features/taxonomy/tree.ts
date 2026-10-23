import { collectCategorySubtree } from "./hierarchy";

export type TreeCategory = {
  id: string;
  parentId: string | null;
};

// Depth-first order (parents before children, siblings in input order) with
// each category's depth, for indented admin lists and parent selects.
export function flattenCategoryTree<T extends TreeCategory>(
  categories: readonly T[],
): Array<T & { depth: number }> {
  const ids = new Set(categories.map((category) => category.id));
  const children = new Map<string | null, T[]>();

  for (const category of categories) {
    // An unknown parent is shown at the root instead of disappearing.
    const parentKey = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    const siblings = children.get(parentKey) ?? [];
    siblings.push(category);
    children.set(parentKey, siblings);
  }

  const result: Array<T & { depth: number }> = [];
  const visited = new Set<string>();

  const visit = (parentId: string | null, depth: number) => {
    for (const category of children.get(parentId) ?? []) {
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      result.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };

  visit(null, 0);
  return result;
}

// Valid parents for a category: every category except itself and its
// descendants. The database cycle trigger enforces the same rule.
export function parentOptions<T extends TreeCategory>(
  categories: readonly T[],
  categoryId: string | null,
): Array<T & { depth: number }> {
  const excluded = new Set(
    categoryId
      ? collectCategorySubtree(
          categories.map(({ id, parentId }) => ({ id, parentId })),
          categoryId,
        )
      : [],
  );

  return flattenCategoryTree(categories).filter((category) => !excluded.has(category.id));
}
