import "server-only";

import { revalidatePath, updateTag } from "next/cache";

import { publicCacheInvalidation, type PublicContentChange } from "./cache";

// The invalidation for each kind of change is defined in ./cache.ts. updateTag
// runs before revalidatePath so regenerated routes read fresh rows. updateTag
// only works in Server Actions.
export function invalidatePublicContent(change: PublicContentChange) {
  const { tags, routes } = publicCacheInvalidation(change);
  tags.forEach((tag) => updateTag(tag));
  routes.forEach(({ path, type }) => revalidatePath(path, type));
}
