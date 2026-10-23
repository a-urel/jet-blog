// Pure helpers for the category tree. The database prevents cycles; the
// visited set only keeps a corrupted read from looping forever.

export type CategoryNode = {
  id: string;
  parentId: string | null;
};

// Returns the root id followed by every descendant id (breadth first).
export function collectCategorySubtree(
  categories: readonly CategoryNode[],
  rootId: string,
): string[] {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const siblings = children.get(category.parentId) ?? [];
    siblings.push(category.id);
    children.set(category.parentId, siblings);
  }

  const visited = new Set<string>([rootId]);
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const childId of children.get(queue[index]) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return queue;
}

// Returns the category followed by its ancestors up to the root.
export function collectCategoryAncestry(
  categories: readonly CategoryNode[],
  categoryId: string,
): string[] {
  const parents = new Map(categories.map((category) => [category.id, category.parentId]));
  const chain: string[] = [];
  const visited = new Set<string>();

  for (
    let current: string | null | undefined = categoryId;
    current && parents.has(current) && !visited.has(current);
    current = parents.get(current)
  ) {
    visited.add(current);
    chain.push(current);
  }

  return chain;
}
