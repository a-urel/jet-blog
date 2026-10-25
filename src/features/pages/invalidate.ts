import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { pageCacheInvalidation, type PageContentChange } from "./cache";

// See ./cache.ts. updateTag only works in Server Actions.
export function invalidatePageContent(change: PageContentChange) {
  const { tags, routes } = pageCacheInvalidation(change);
  tags.forEach((tag) => updateTag(tag));
  routes.forEach(({ path, type }) => revalidatePath(path, type));
}
